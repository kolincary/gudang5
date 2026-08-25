import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Toast } from './ui/Toast';
import { Modal } from './ui/Modal';
import { Download, Upload, FileText, CheckCircle, X, Trash2, Edit2, Lock, ChevronDown, Calendar, Building2, User, Package, Trash, ArrowUpDown, ArrowUp, ArrowDown, Calculator, Search, AlertCircle, RefreshCw, Tag, Database, RotateCcw, ArrowRightLeft, History } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { saveExportHistory } from '../lib/exportHistoryService';
import { ExportHistoryModal } from './ExportHistoryModal';

export interface DatabaseLogEntry {
  id: string;
  tgl: string;
  waktu: string;
  sku: string;
  jumlah: number;
  type: 'IN' | 'OUT' | 'MOVE';
  gudang: string;
  rak: string;
  tgl_scan: string;
  user: string;
  sub_rak: string;
  log_update_user: string;
  is_adjustment?: boolean;
  created_at?: string;
  tgl_normalized?: string;
}

interface ImportProgress {
  isImporting: boolean;
  progress: number;
  total: number;
  current: number;
  message: string;
}

// --- Hook: useDebounce ---
function useDebounce<T>(value: T, delay: number): T {
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
}

export interface DatabaseLogProps {
  initialGudangFilter?: string;
  bypassPin?: boolean;
}

export function DatabaseLog({ initialGudangFilter = '', bypassPin = false }: DatabaseLogProps = {}) {

  const [totalCount, setTotalCount] = useState(0);
  const [filteredEntries, setFilteredEntries] = useState<DatabaseLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress>({ isImporting: false, progress: 0, total: 0, current: 0, message: '' });
  const [exportProgress, setExportProgress] = useState({
    isExporting: false,
    progress: 0,
    total: 0,
    current: 0,
    message: ''
  });
  
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  // DevMode State - uses global devmode key from Layout
  const [showFixDates, setShowFixDates] = useState(() => {
    return localStorage.getItem('devmode') === 'true';
  });

  // Sync showFixDates with global devmode (from Layout)
  useEffect(() => {
    const syncDevMode = () => {
      const isDevMode = localStorage.getItem('devmode') === 'true';
      setShowFixDates(isDevMode);
    };
    // Check periodically in case devmode is toggled from Layout
    const interval = setInterval(syncDevMode, 1000);
    window.addEventListener('storage', syncDevMode);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', syncDevMode);
    };
  }, []);

  const [editingEntry, setEditingEntry] = useState<DatabaseLogEntry | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(100);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [isSyncingSubRak, setIsSyncingSubRak] = useState(false);
  const [isFixingTransferDates, setIsFixingTransferDates] = useState(false);

  const { userPermissions, userName } = useAuth();
  
  const [isPinModalOpen, setIsPinModalOpen] = useState(() => {
    if (bypassPin) return false;
    return !userPermissions?.includes('bypass_pin_log');
  });
  const [isAccessGranted, setIsAccessGranted] = useState(() => {
    if (bypassPin) return true;
    return !!userPermissions?.includes('bypass_pin_log');
  });
  const [pin, setPin] = useState('');

  useEffect(() => {
      if (bypassPin || userPermissions?.includes('bypass_pin_log')) {
          setIsPinModalOpen(false);
          setIsAccessGranted(true);
      }
  }, [userPermissions, bypassPin]);

  const [pinMessage, setPinMessage] = useState({ text: '', type: '' });
  const correctPin = '8888';

  const pinInputRef = useRef<HTMLInputElement>(null); // Ref untuk input PIN
  const tanggalInputRef = useRef<HTMLInputElement>(null);
  const tglScanInputRef = useRef<HTMLInputElement>(null);


  const [filters, setFilters] = useState({
    sku: '',
    type: '',
    gudang: initialGudangFilter || '',
    rak: '',
    subRak: '',
    waktu: '',
    logUpdateUser: '',
    tanggal: '',
    tglScan: '',
    isAdjustment: '',
    onlySelected: false
  });

  useEffect(() => {
    if (initialGudangFilter) {
      setFilters(prev => ({ ...prev, gudang: initialGudangFilter }));
    }
  }, [initialGudangFilter]);

  // DevMode typing trigger: if user types "devmode" in any filter field, activate devMode
  useEffect(() => {
    const term = (filters.sku || filters.gudang || filters.rak || '').toLowerCase().trim();
    if (term === 'devmode') {
      localStorage.setItem('devmode', 'true');
      setShowFixDates(true);
      setFilters(prev => ({
        ...prev,
        sku: prev.sku === 'devmode' ? '' : prev.sku,
        gudang: prev.gudang === 'devmode' ? '' : prev.gudang,
        rak: prev.rak === 'devmode' ? '' : prev.rak
      }));
      showToast('DevMode Aktif! Filter Waktu, Sub Rak, dan Log Update User telah dibuka.', 'success');
    }
  }, [filters.sku, filters.gudang, filters.rak]);

  // Debounce filter changes to prevent lag when typing dates
  const debouncedFilters = useDebounce(filters, 500);

  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  const [allSkus, setAllSkus] = useState<string[]>([]);
  const [allGudangs, setAllGudangs] = useState<string[]>([]);
  const [allRaks, setAllRaks] = useState<string[]>([]);
  const [dropdownsLoading, setDropdownsLoading] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isAllPageSelected, setIsAllPageSelected] = useState(false);
  const [bulkEditMode, setBulkEditMode] = useState<'tanggal' | 'gudang' | 'user' | 'rak' | 'tgl_scan' | null>(null);
  const [bulkEditValue, setBulkEditValue] = useState('');
  const [isBulkOperationLoading, setIsBulkOperationLoading] = useState(false);

  // --- MANUAL DATE / TIME FILTER STATE ---
  const [isManualDateModalOpen, setIsManualDateModalOpen] = useState(false);
  const [manualDateValue, setManualDateValue] = useState('');
  const [manualDateTarget, setManualDateTarget] = useState<'tanggal' | 'tglScan' | 'waktu' | 'bulk_tanggal' | 'bulk_tgl_scan' | null>(null);

  const handleOpenManualFilter = (target: 'tanggal' | 'tglScan' | 'waktu') => {
    setManualDateTarget(target);
    setManualDateValue(filters[target]);
    setIsManualDateModalOpen(true);
  };

  const handleManualFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualDateTarget === 'bulk_tanggal' || manualDateTarget === 'bulk_tgl_scan') {
      const normalizedDate = formatDateDisplay(manualDateValue);
      setBulkEditValue(normalizedDate || manualDateValue);
    } else if (manualDateTarget) {
      setFilters(prev => ({ ...prev, [manualDateTarget]: manualDateValue }));
      setCurrentPage(1);
    }
    setIsManualDateModalOpen(false);
  };

  // --- STOCK BALANCE ANALYSIS STATE ---
  interface BalanceAnalysisResult {
    sku: string;
    rak: string;
    subRaks: Set<string>;
    tglScan: string;
    totalIn: number;
    totalOut: number;
    balance: number;
  }
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<BalanceAnalysisResult[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisSearchTerm, setAnalysisSearchTerm] = useState('');
  const [analysisSku, setAnalysisSku] = useState('');

  // --- REDISTRIBUTION (FIX LEBIH POTONG) STATE ---
  const [isRedistributeModalOpen, setIsRedistributeModalOpen] = useState(false);
  const [redistributeMoves, setRedistributeMoves] = useState<any[]>([]);
  const [isProcessingRedistribution, setIsProcessingRedistribution] = useState(false);
  const [excludedScanDates, setExcludedScanDates] = useState('');

  const handleAnalyzeStockBalance = async (skuToAnalyze: string) => {
    if (!skuToAnalyze) {
      showToast('Silakan pilih atau cari SKU terlebih dahulu untuk melakukan analisis.', 'warning');
      return;
    }

    try {
      setIsAnalyzing(true);
      setAnalysisResults([]);

      showToast('Memulai analisis saldo stok... Ini mungkin memakan waktu untuk data yang besar.', 'info');

      // 1. Fetch relevant logs based on current filters (SKU and Rak if applicable)
      let query = supabase
        .from('database_log')
        .select('sku, rak, sub_rak, tgl_scan, type, jumlah')
        .or('type.ilike.%IN%,type.ilike.%OUT%') // Support variations like "IN ", " in", etc.
        .order('id', { ascending: true });

      // Target filters to optimize analysis if possible
      if (skuToAnalyze) {
        query = query.ilike('sku', skuToAnalyze.trim());
      }
      if (filters.rak) query = query.ilike('rak', `%${filters.rak.trim()}%`);

      const batchSize = 1000;
      let from = 0;
      let hasMore = true;
      let allLogs: any[] = [];

      while (hasMore) {
        const { data, error } = await query.range(from, from + batchSize - 1);
        if (error) throw error;

        if (data && data.length > 0) {
          allLogs = [...allLogs, ...data];
          from += batchSize;
          if (data.length < batchSize) hasMore = false;
        } else {
          hasMore = false;
        }

        // Safety break to prevent browser hang on massive data (adjust as needed)
        if (allLogs.length > 50000) {
          showToast('Data terlalu besar (>50.000). Hasil dibatasi untuk performa.', 'warning');
          hasMore = false;
        }
      }

      // 2. Aggregate logs: key = `${sku}|${rak}|${tgl_scan}`
      const balanceMap = new Map<string, BalanceAnalysisResult>();

      allLogs.forEach(log => {
        // Normalize values to ensure consistent grouping
        const normSku = (log.sku || '').trim().toUpperCase();
        const normRak = (log.rak || '').trim().toUpperCase();
        const normSubRak = (log.sub_rak || '').trim().toUpperCase();
        const normTglScan = formatDateDisplay(log.tgl_scan) || 'No Date';
        const normType = (log.type || '').trim().toUpperCase();

        // Cek tipe: kita hanya ingin IN dan OUT murni
        if (!normType.includes('IN') && !normType.includes('OUT')) return;
        const finalType = normType.includes('IN') ? 'IN' : 'OUT';

        const key = `${normSku}|${normRak}|${normTglScan}`;

        if (!balanceMap.has(key)) {
          balanceMap.set(key, {
            sku: normSku,
            rak: normRak,
            subRaks: new Set<string>(),
            tglScan: normTglScan,
            totalIn: 0,
            totalOut: 0,
            balance: 0
          });
        }

        const result = balanceMap.get(key)!;
        if (normSubRak) result.subRaks.add(normSubRak);

        const jumlah = Number(log.jumlah || 0);

        if (finalType === 'IN') {
          result.totalIn += jumlah;
        } else {
          result.totalOut += jumlah;
        }
        result.balance = result.totalIn - result.totalOut;
      });

      // 3. Convert to array and filter
      const resultsArray = Array.from(balanceMap.values());

      resultsArray.sort((a, b) => {
        if (a.balance === 0 && b.balance !== 0) return 1;
        if (b.balance === 0 && a.balance !== 0) return -1;
        return a.sku.localeCompare(b.sku);
      });

      setAnalysisResults(resultsArray);
      showToast(`Analisis selesai! Menampilkan ${resultsArray.length} kombinasi SKU/Rak/Tgl Scan.`, 'success');

    } catch (error) {
      console.error('Analysis failed:', error);
      showToast('Gagal melakukan analisis saldo stok.', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePrepareRedistribute = async () => {
    if (!analysisSku) return;

    try {
      setIsAnalyzing(true);
      showToast('Menghitung rekomendasi pemindahan data...', 'info');

      // 1. Fetch ALL relevant logs for this specific SKU to get the full picture
      const { data: allLogs, error } = await supabase
        .from('database_log')
        .select('id, sku, rak, sub_rak, tgl_scan, type, jumlah')
        .ilike('sku', analysisSku.trim())
        .or('type.ilike.%IN%,type.ilike.%OUT%')
        .order('id', { ascending: true });

      if (error) throw error;
      if (!allLogs || allLogs.length === 0) {
        showToast('Tidak ada data untuk diperbaiki.', 'warning');
        return;
      }

      // 2. Group into balances and collect OUT rows by group
      const groups = new Map<string, {
        balance: number,
        tglScanRaw: string,
        normalizedTglScan: string,
        rak: string,
        outRows: any[]
      }>();

      const excludedList = excludedScanDates.split(',').map(d => d.trim().toUpperCase()).filter(Boolean);

      allLogs.forEach(log => {
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
            tglScan: log.tgl_scan || ''
          });
        }
      });

      // 3. Logic Redistribution
      const moves: any[] = [];
      const rakKeys = Array.from(new Set(Array.from(groups.values()).map(g => g.rak.toUpperCase())));

      // Helper function to check if a group is excluded
      const checkIfExcluded = (g: any) => {
        const normTgl = g.normalizedTglScan.toUpperCase();
        // Strict normalization check: compare formatted versions
        return excludedList.some(excluded => {
          const normExcluded = formatDateDisplay(excluded).toUpperCase();
          return normTgl === normExcluded || normTgl === excluded.toUpperCase();
        });
      };

      rakKeys.forEach(rakName => {
        const rakGroups = Array.from(groups.entries())
          .filter(([, g]) => g.rak.toUpperCase() === rakName);

        // Surplus groups that are NOT excluded
        const surpluses = rakGroups.filter(([, g]) => {
          if (g.balance <= 0) return false;
          return !checkIfExcluded(g);
        }).sort((a, b) => b[1].balance - a[1].balance);

        // Deficit groups that are NOT excluded
        const deficits = rakGroups.filter(([, g]) => {
          if (g.balance >= 0) return false;
          return !checkIfExcluded(g);
        });

        deficits.forEach(([, negG]) => {
          // Try to move OUT rows from this deficit group to surplus groups
          const rows = [...negG.outRows].sort((a, b) => b.jumlah - a.jumlah);

          for (const row of rows) {
            if (negG.balance >= 0) break;

            const targetEntry = surpluses.find(([, tg]) => tg.balance > 0);

            if (targetEntry) {
              const [, targetG] = targetEntry;

              moves.push({
                id: row.id,
                sku: analysisSku,
                rak: negG.rak,
                fromTgl: negG.tglScanRaw,
                toTgl: targetG.tglScanRaw,
                jumlah: row.jumlah
              });

              negG.balance += row.jumlah;
              targetG.balance -= row.jumlah;

              surpluses.sort((a, b) => b[1].balance - a[1].balance);
            }
          }
        });
      });

      if (moves.length === 0) {
        showToast('Semua saldo sudah optimal atau tidak ada kapasitas untuk memindahkan lebih potong.', 'info');
      } else {
        setRedistributeMoves(moves);
        setIsRedistributeModalOpen(true);
      }

    } catch (error) {
      console.error('Error preparing redistribution:', error);
      showToast('Gagal menyiapkan perbaikan saldo.', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleExecuteRedistribute = async () => {
    if (redistributeMoves.length === 0) return;

    try {
      setIsProcessingRedistribution(true);
      showToast(`Memproses ${redistributeMoves.length} pembaruan data...`, 'info');

      // Process in batches
      const batchSize = 50;
      let successCount = 0;

      for (let i = 0; i < redistributeMoves.length; i += batchSize) {
        const batch = redistributeMoves.slice(i, i + batchSize);

        // Update each record individually (or use a stored procedure if available)
        // Since we are changing different IDs to different values, bulk .update([])
        // only works for multiple IDs to SAME value.
        // We'll use Promise.all for the batch.
        const promises = batch.map(move =>
          supabase
            .from('database_log')
            .update({ tgl_scan: move.toTgl })
            .eq('id', move.id)
        );

        const results = await Promise.all(promises);
        results.forEach(res => {
          if (!res.error) successCount++;
        });
      }

      showToast(`Sukses memperbarui ${successCount} data log!`, 'success');
      setIsRedistributeModalOpen(false);
      setRedistributeMoves([]);
      // Refresh analysis
      handleAnalyzeStockBalance(analysisSku);

    } catch (error) {
      console.error('Error executing redistribution:', error);
      showToast('Terjadi kesalahan saat mengeksekusi perbaikan.', 'error');
    } finally {
      setIsProcessingRedistribution(false);
    }
  };

  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
  }>({
    show: false,
    message: '',
    type: 'info'
  });

  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    setToast({
      show: true,
      message,
      type
    });
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 5000);
  };

  const hideToast = () => {
    setToast(prev => ({ ...prev, show: false }));
  };

  useEffect(() => {
    if (isAccessGranted) {
      loadTotalCount();
      loadDropdownOptions();
      if (initialGudangFilter) {
        handleLoadData();
      }
    }
  }, [isAccessGranted, initialGudangFilter]);

  useEffect(() => {
    // Memberikan fokus ke input PIN saat modal terbuka
    if (isPinModalOpen && pinInputRef.current) {
      pinInputRef.current.focus();
    }
  }, [isPinModalOpen]);

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === correctPin) {
      setPinMessage({ text: 'PIN Benar! Memuat data...', type: 'success' });
      setIsAccessGranted(true);
      setTimeout(() => {
        setIsPinModalOpen(false);
        setPinMessage({ text: '', type: '' });
      }, 500); // Durasi 500ms agar lebih cepat
    } else {
      setPinMessage({ text: 'PIN Salah. Coba lagi.', type: 'error' });
      if (pinInputRef.current) {
        pinInputRef.current.focus(); // Mengembalikan fokus ke input
      }
    }
    setPin('');
  };

  const handleClosePinModal = () => {
    setIsPinModalOpen(false);
  };

  const loadDropdownOptions = async () => {
    try {
      setDropdownsLoading(true);

      const fetchAllData = async (table: string, column: string) => {
        let allData: string[] = [];
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from(table)
            .select(column)
            .eq('status', 'Aktif')
            .order(column)
            .range(from, from + pageSize - 1);

          if (error) {
            console.error(`Error loading ${table}:`, error);
            break;
          }

          if (data && data.length > 0) {
            const values = data.map((item: any) => item[column]).filter(Boolean);
            allData = [...allData, ...values];
            from += pageSize;
            hasMore = data.length === pageSize;
          } else {
            hasMore = false;
          }
        }

        return allData;
      };

      const [skuList, gudangList, rakList] = await Promise.all([
        fetchAllData('products', 'nama'),
        fetchAllData('warehouses', 'nama'),
        fetchAllData('rack_locations', 'nama')
      ]);

      // Make unique and sort
      const uniqueSkus = [...new Set(skuList)].sort();
      const uniqueGudangs = [...new Set(gudangList)].sort();
      const uniqueRaks = [...new Set(rakList)].sort();

      setAllSkus(uniqueSkus);
      setAllGudangs(uniqueGudangs);
      setAllRaks(uniqueRaks);

      console.log('Dropdown data loaded:', {
        skus: uniqueSkus.length,
        gudangs: uniqueGudangs.length,
        raks: uniqueRaks.length
      });

      if (uniqueSkus.length > 0) {
        showToast(`Data dropdown dimuat: ${uniqueSkus.length} produk, ${uniqueGudangs.length} gudang, ${uniqueRaks.length} rak`, 'success');
      }

    } catch (error) {
      console.error('Error loading dropdown options:', error);
      showToast('Gagal memuat data dropdown', 'error');
    } finally {
      setDropdownsLoading(false);
    }
  };

  const loadTotalCount = async () => {
    try {
      setLoading(true);

      const { count, error } = await supabase
        .from('database_log')
        .select('*', { count: 'exact', head: true })
        .not('gudang', 'in', '("VERIFY","UNVERIFY")');

      if (error) {
        console.error('Error loading count:', error);
        showToast('Gagal memuat informasi data', 'error');
        return;
      }

      setTotalCount(count || 0);
      showToast(`Database memiliki ${(count || 0).toLocaleString()} data log. Gunakan filter untuk memuat data.`, 'info');

    } catch (error) {
      console.error('Error loading count:', error);
      showToast('Terjadi kesalahan saat memuat informasi data', 'error');
    } finally {
      setLoading(false);
    }
  };

  // --- Helper: Format Date Display ---
  // Ensure strict YYYY-MM-DD display regardless of stored format
  const formatDateDisplay = (dateStr: string): string => {
    if (!dateStr) return '';
    let cleanStr = dateStr.trim();

    // Jika string berisi jam (ada spasi atau T), ambil hanya tanggalnya
    if (cleanStr.includes(' ') || cleanStr.includes('T')) {
      cleanStr = cleanStr.split(/[ T]/)[0];
    }

    // New: Check for YYYY-MM-DD or YYYY-M-D and normalize to YYYY-MM-DD
    if (/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.test(cleanStr)) {
      const match = cleanStr.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
      if (match) {
        return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
      }
    }

    // Check for DD/MM/YYYY or DD-MM-YYYY
    if (/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.test(cleanStr)) {
      const match = cleanStr.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
      if (match) {
        let day = match[1];
        let month = match[2];
        const year = match[3];
        // Simple heuristic: if month part is > 12, it must be the day (US format MM/DD/YYYY)
        if (parseInt(month) > 12 && parseInt(day) <= 12) {
          [day, month] = [month, day];
        }
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }

    return cleanStr;
  };

  // --- Helper: Normalize Date Filter ---
  const normalizeFilterDate = (dateStr: string): string => {
    if (!dateStr) return '';
    const cleanStr = dateStr.trim();
    // Check DD/MM/YYYY or MM/DD/YYYY
    if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(cleanStr)) {
      const parts = cleanStr.split(/[\/-]/);
      let day = parseInt(parts[0]);
      let month = parseInt(parts[1]);
      const year = parts[2];

      // If month is > 12, it must be the day (so input was MM-DD-YYYY)
      if (month > 12 && day <= 12) {
        // Swap
        const temp = day;
        day = month;
        month = temp;
      }
      // If first part > 12, it must be day (DD-MM-YYYY) - already handled by default assignment but good to be explicit mentally
      // Default assumption is DD-MM-YYYY, so if parts[1] is valid month, we accept it.
      // If both <= 12, we assume DD-MM-YYYY as per Indonesian standard.

      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return cleanStr;
  };

  const [isMigrating, setIsMigrating] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState({ current: 0, total: 0 });

  const handleFixDates = async () => {
    if (!window.confirm('Apakah Anda yakin ingin menstandarisasi semua format tanggal (Tgl & Tgl Scan) menjadi YYYY-MM-DD? Proses ini akan mengubah data di database.')) {
      return;
    }

    try {
      setIsMigrating(true);
      showToast('Memulai standarisasi format tanggal...', 'info');

      const { runDateMigration } = await import('../lib/dateMigration');

      const updatedCount = await runDateMigration((current, total) => {
        setMigrationProgress({ current, total });
      });

      showToast(`Sukses! ${updatedCount} data telah diperbaiki formatnya.`, 'success');
      handleLoadData();
    } catch (error) {
      console.error('Migration failed:', error);
      showToast('Gagal melakukan standarisasi tanggal.', 'error');
    } finally {
      setIsMigrating(false);
    }
  };

  const handleFixScanDates = async () => {
    if (!window.confirm('Apakah Anda yakin ingin memperbaiki Tgl Scan pada barang MASUK? Fitur ini akan menyamakan Tgl Scan dengan Tgl Transaksi untuk data yang tidak konsisten akibat migrasi.')) {
      return;
    }

    try {
      setIsRepairing(true);
      showToast('Memulai perbaikan Tgl Scan...', 'info');

      const { runScanDateRepair } = await import('../lib/dateMigration');

      const repairedCount = await runScanDateRepair((current, total) => {
        setMigrationProgress({ current, total });
      });

      showToast(`Sukses! ${repairedCount} Tgl Scan telah disinkronkan.`, 'success');
      handleLoadData();
    } catch (error) {
      console.error('Repair failed:', error);
      showToast('Gagal memperbaiki Tgl Scan.', 'error');
    } finally {
      setIsRepairing(false);
    }
  };

  const loadLogEntries = async (page = 1, perPage = itemsPerPage, currentFilters = filters, specificSelectedIds?: Set<string>) => {
    if (!isAccessGranted) return;

    try {
      setLoading(true);

      let safePage = Number(page);
      if (isNaN(safePage) || safePage < 1) safePage = 1;
      let safePerPage = Number(perPage);
      if (isNaN(safePerPage) || safePerPage < 1) safePerPage = 100;

      let query = supabase
        .from('database_log')
        .select('*', { count: 'exact' })
        .not('gudang', 'in', '("VERIFY","UNVERIFY")');

      if (sortConfig) {
        if (sortConfig.key === 'tgl') {
          query = query.order('tgl_normalized', { ascending: sortConfig.direction === 'asc' });
        } else {
          query = query.order(sortConfig.key, { ascending: sortConfig.direction === 'asc' });
        }
        // Always add secondary sort to ensure stable pagination
        query = query.order('id', { ascending: false });
      } else {
        query = query
          .order('tgl_normalized', { ascending: false })
          .order('waktu', { ascending: false })
          .order('id', { ascending: false });
      }

      if (currentFilters.sku) {
        query = query.eq('sku', currentFilters.sku);
      }
      if (currentFilters.type) {
        query = query.eq('type', currentFilters.type);
      }
      if (currentFilters.gudang) {
        query = query.ilike('gudang', `%${currentFilters.gudang}%`);
      }
      if (currentFilters.rak) {
        query = query.ilike('rak', `%${currentFilters.rak}%`);
      }
      if (currentFilters.subRak) {
        query = query.ilike('sub_rak', `%${currentFilters.subRak}%`);
      }
      if (currentFilters.waktu) {
        const rawWaktu = currentFilters.waktu.trim();
        const colonWaktu = rawWaktu.replace(/\./g, ':');
        const dotWaktu = rawWaktu.replace(/:/g, '.');
        query = query.or(`waktu.ilike.%${rawWaktu}%,waktu.ilike.%${colonWaktu}%,waktu.ilike.%${dotWaktu}%`);
      }
      if (currentFilters.logUpdateUser) {
        query = query.ilike('log_update_user', `%${currentFilters.logUpdateUser}%`);
      }
      if (currentFilters.tanggal) {
        const isoDate = normalizeFilterDate(currentFilters.tanggal);
        if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
          const [y, m, d] = isoDate.split('-');
          const ddmmyyyySlash = `${d}/${m}/${y}`;
          const ddmmyyyyDash = `${d}-${m}-${y}`;
          // Search for any of the 3 formats
          query = query.or(`tgl.ilike.%${isoDate}%,tgl.ilike.%${ddmmyyyySlash}%,tgl.ilike.%${ddmmyyyyDash}%`);
        } else {
          // Fallback if normalization failed or raw text search is desired
          query = query.ilike('tgl', `%${currentFilters.tanggal}%`);
        }
      }
      if (currentFilters.tglScan) {
        const isoDate = normalizeFilterDate(currentFilters.tglScan);
        if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
          const [y, m, d] = isoDate.split('-');
          const ddmmyyyySlash = `${d}/${m}/${y}`;
          const ddmmyyyyDash = `${d}-${m}-${y}`;
          // Search for any of the 3 formats
          query = query.or(`tgl_scan.ilike.%${isoDate}%,tgl_scan.ilike.%${ddmmyyyySlash}%,tgl_scan.ilike.%${ddmmyyyyDash}%`);
        } else {
          query = query.ilike('tgl_scan', `%${currentFilters.tglScan}%`);
        }
      }
      if (currentFilters.isAdjustment) {
        query = query.eq('is_adjustment', currentFilters.isAdjustment === 'true');
      }
      
      if (currentFilters.onlySelected) {
        const targetIds = specificSelectedIds || selectedIds;
        const targetIdsArray = Array.from(targetIds);
        
        if (targetIdsArray.length === 0) {
          setFilteredEntries([]);
          setTotalCount(0);
          setDataLoaded(true);
          setLoading(false);
          return;
        }

        let allSelectedData: any[] = [];
        const batchSize = 100;
        
        for (let i = 0; i < targetIdsArray.length; i += batchSize) {
          const batch = targetIdsArray.slice(i, i + batchSize);
          const { data, error } = await supabase
            .from('database_log')
            .select('*')
            .in('id', batch);
            
          if (error) {
            console.error('Error loading selected entries:', error);
            showToast('Gagal memuat data terpilih', 'error');
            setLoading(false);
            return;
          }
          if (data) {
            allSelectedData = [...allSelectedData, ...data];
          }
        }
        
        // Sorting manual di client
        allSelectedData.sort((a, b) => {
          let aVal, bVal;
          if (sortConfig) {
            const key = sortConfig.key === 'tgl' ? 'tgl_normalized' : sortConfig.key;
            aVal = a[key];
            bVal = b[key];
          } else {
            // Default sort: tgl_normalized DESC, waktu DESC, id DESC
            if (a.tgl_normalized !== b.tgl_normalized) {
              return a.tgl_normalized > b.tgl_normalized ? -1 : 1;
            }
            if (a.waktu !== b.waktu) {
              return a.waktu > b.waktu ? -1 : 1;
            }
            return a.id > b.id ? -1 : 1;
          }
          
          if (aVal === bVal) {
             return a.id > b.id ? -1 : 1;
          }
          
          const ascending = sortConfig ? sortConfig.direction === 'asc' : false;
          if (aVal < bVal) return ascending ? -1 : 1;
          if (aVal > bVal) return ascending ? 1 : -1;
          return 0;
        });
        
        // Pagination manual di client
        const count = allSelectedData.length;
        const from = (safePage - 1) * safePerPage;
        const to = from + safePerPage;
        const pagedData = allSelectedData.slice(from, to);
        
        const mappedData = pagedData.map((item: any) => ({
          ...item,
          user: item.user_name
        }));
        
        setFilteredEntries(mappedData);
        setTotalCount(count);
        setDataLoaded(true);
        setLoading(false);
        return;
      }

      const from = (safePage - 1) * safePerPage;
      const to = from + safePerPage - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) {
        console.error('Error loading log entries:', error);
        showToast('Gagal memuat data log', 'error');
        return;
      }

      const mappedData = (data || []).map((item: any) => ({
        ...item,
        user: item.user_name
      }));

      setFilteredEntries(mappedData);
      setTotalCount(count || 0);
      setDataLoaded(true);

      showToast(`Berhasil memuat ${(data || []).length} dari ${(count || 0).toLocaleString()} data log`, 'success');

    } catch (error) {
      console.error('Error loading log entries:', error);
      showToast('Terjadi kesalahan saat memuat data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (dataLoaded) {
      loadLogEntries(currentPage, itemsPerPage, debouncedFilters);
    }
  }, [debouncedFilters, currentPage, itemsPerPage, sortConfig]);

  useEffect(() => {
    // Jangan reset seleksi jika mode 'onlySelected' sedang aktif,
    // karena akan menghapus hasil otomatis dari tombol Self-Transfer atau saat user memfilter pilihan
    if (!filters.onlySelected) {
      setSelectedIds(new Set());
      setIsAllPageSelected(false);
    }
  }, [currentPage, filters]);

  const handleCheckboxChange = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);

    if (newSelected.size === filteredEntries.length && filteredEntries.length > 0) {
      setIsAllPageSelected(true);
    } else {
      setIsAllPageSelected(false);
    }
  };

  const handleSelectAll = () => {
    if (isAllPageSelected) {
      // Unselect current page
      const newSelected = new Set(selectedIds);
      filteredEntries.forEach(entry => newSelected.delete(entry.id));
      setSelectedIds(newSelected);
      setIsAllPageSelected(false);
    } else {
      // Select current page
      const newSelected = new Set(selectedIds);
      filteredEntries.forEach(entry => newSelected.add(entry.id));
      setSelectedIds(newSelected);
      setIsAllPageSelected(true);
    }
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setIsAllPageSelected(false);
    if (filters.onlySelected) {
      setFilters(prev => ({ ...prev, onlySelected: false }));
    }
  };

  const handleLoadData = () => {
    setCurrentPage(1);
    loadLogEntries(1, itemsPerPage, debouncedFilters);
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleEdit = async (entry: DatabaseLogEntry) => {
    setEditingEntry(entry);
    setIsEditModalOpen(true);
    await loadDropdownOptions();
  };

  const handleUpdateEntry = async () => {
    if (!editingEntry) return;

    // Simplified: Just take values as is or simple validation
    const tglRaw = editingEntry.tgl?.trim() || '';
    const tglScanRaw = editingEntry.tgl_scan?.trim() || '';

    // Since we are standardizing, we assume user enters correct format or we rely on input type="date"
    // If input is text, we can do basic regex check if needed, but for now just pass through
    // effectively making "Fix Dates" the authority.
    const trimmedEntry = {
      tgl: tglRaw,
      waktu: editingEntry.waktu?.trim() || '',
      sku: editingEntry.sku?.trim() || '',
      jumlah: editingEntry.jumlah,
      type: editingEntry.type,
      gudang: editingEntry.gudang?.trim() || '',
      rak: editingEntry.rak?.trim() || '',
      tgl_scan: tglScanRaw,
      user: editingEntry.user?.trim() || '',
      sub_rak: editingEntry.sub_rak?.trim() || '',
      log_update_user: editingEntry.log_update_user?.trim() || ''
    };

    if (!trimmedEntry.sku || !trimmedEntry.gudang || !trimmedEntry.rak) {
      showToast('SKU, Gudang, dan Rak tidak boleh kosong', 'error');
      return;
    }

    // Optional basic validation warning
    if (trimmedEntry.tgl && !/^\d{4}-\d{2}-\d{2}$/.test(trimmedEntry.tgl)) {
      showToast('Format Tanggal sebaiknya YYYY-MM-DD', 'warning');
    }

    try {
      const { error } = await supabase
        .from('database_log')
        .update({
          tgl: trimmedEntry.tgl,
          waktu: trimmedEntry.waktu,
          sku: trimmedEntry.sku,
          jumlah: trimmedEntry.jumlah,
          type: trimmedEntry.type,
          gudang: trimmedEntry.gudang,
          rak: trimmedEntry.rak,
          tgl_scan: trimmedEntry.tgl_scan,
          user_name: trimmedEntry.user,
          sub_rak: trimmedEntry.sub_rak,
          log_update_user: trimmedEntry.log_update_user
        })
        .eq('id', editingEntry.id);

      if (error) {
        console.error('Error updating log entry:', error);
        showToast('Gagal mengupdate data log', 'error');
        return;
      }

      showToast('Data log berhasil diupdate!', 'success');
      setIsEditModalOpen(false);
      loadLogEntries(currentPage, itemsPerPage);
    } catch (error) {
      console.error('Error updating log entry:', error);
      showToast('Terjadi kesalahan saat mengupdate data', 'error');
    }
  };

  const handleBulkUpdate = async (field: 'tgl' | 'gudang' | 'user' | 'rak' | 'sub_rak' | 'tgl_scan' | 'is_adjustment', value: string | boolean) => {
    if (selectedIds.size === 0) return;

    try {
      setIsBulkOperationLoading(true);
      const ids = Array.from(selectedIds);
      const batchSize = 50;
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);

        const updateData: any = {};
        if (field === 'tgl') {
          // Simply assign value, maybe warn if invalid format?
          updateData.tgl = value;
        } else if (field === 'rak') {
          updateData.rak = value;
          updateData.sub_rak = value;
        } else if (field === 'tgl_scan') {
          updateData.tgl_scan = value;
        } else if (field === 'is_adjustment') {
          updateData.is_adjustment = value;
        } else {
          updateData[field === 'user' ? 'user_name' : field] = value;
        }

        const { error } = await supabase
          .from('database_log')
          .update(updateData)
          .in('id', batch);

        if (error) {
          console.error('Error updating batch:', error);
          errorCount += batch.length;
        } else {
          successCount += batch.length;
        }
      }

      if (errorCount === 0) {
        showToast(`Berhasil mengupdate ${successCount} data!`, 'success');
      } else {
        showToast(`Berhasil mengupdate ${successCount} data, ${errorCount} gagal`, 'warning');
      }

      setBulkEditMode(null);
      setBulkEditValue('');
      clearSelection();
      loadLogEntries(currentPage, itemsPerPage);
    } catch (error) {
      console.error('Error bulk updating:', error);
      showToast('Terjadi kesalahan saat bulk update', 'error');
    } finally {
      setIsBulkOperationLoading(false);
    }
  };

  const handleSelectSelfTransfers = async () => {
    try {
      setLoading(true);
      showToast('Mencari data Self-Transfer (TRANSFER pada rak yang sama)...', 'info');

      // Ambil total count terlebih dahulu agar bisa concurrent fetching
      const { count, error: countError } = await supabase
        .from('database_log')
        .select('*', { count: 'exact', head: true })
        .eq('gudang', 'TRANSFER');
        
      if (countError) throw countError;
      
      if (!count || count === 0) {
        showToast('Tidak ada data TRANSFER sama sekali di database.', 'info');
        setLoading(false);
        return;
      }

      let allData: any[] = [];
      const batchSize = 1000;
      const totalPages = Math.ceil(count / batchSize);
      
      const queries = [];
      for (let p = 0; p < totalPages; p++) {
        const from = p * batchSize;
        const to = from + batchSize - 1;
        queries.push(
          supabase
            .from('database_log')
            .select('id, sku, type, rak, tgl, waktu, jumlah')
            .eq('gudang', 'TRANSFER')
            .range(from, to)
        );
      }
      
      // Batch requests dengan limit 15 concurrency
      const concurrency = 15;
      for (let i = 0; i < queries.length; i += concurrency) {
        const batchPromises = queries.slice(i, i + concurrency);
        const results = await Promise.all(batchPromises);
        
        for (const res of results) {
          if (res.error) throw res.error;
          if (res.data && res.data.length > 0) {
            allData = [...allData, ...res.data];
          }
        }
      }

      if (allData.length === 0) {
        showToast('Tidak ada data TRANSFER sama sekali di database.', 'info');
        setLoading(false);
        return;
      }

      const groups = new Map<string, any[]>();
      allData.forEach(entry => {
        // Gabungkan tgl, waktu, sku, rak, jumlah sebagai unique key transaksi transfer
        const normTgl = (entry.tgl || '').trim();
        const normWaktu = (entry.waktu || '').trim();
        const normSku = (entry.sku || '').trim().toUpperCase();
        const normRak = (entry.rak || '').trim().toUpperCase();
        const normJumlah = Math.abs(Number(entry.jumlah || 0));
        const key = `${normTgl}_${normWaktu}_${normSku}_${normRak}_${normJumlah}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(entry);
      });

      const selfTransfers = new Set<string>();
      groups.forEach((entries) => {
        if (entries.length > 1) {
          const hasIn = entries.some(e => e.type === 'IN');
          const hasOut = entries.some(e => e.type === 'OUT');
          if (hasIn && hasOut) {
            entries.forEach(e => selfTransfers.add(e.id));
          }
        }
      });

      if (selfTransfers.size === 0) {
        showToast('Ternyata tidak ditemukan Self-Transfer (Transfer ke rak yang sama).', 'success');
      } else {
        setSelectedIds(selfTransfers);
        const nextFilters = { ...filters, gudang: 'TRANSFER', onlySelected: true } as any;
        setFilters(nextFilters);
        setTimeout(() => {
          loadLogEntries(1, itemsPerPage, nextFilters, selfTransfers);
        }, 100);
        showToast(`Ditemukan ${selfTransfers.size} baris Self-Transfer! Data telah ditampilkan dan otomatis terpilih, silakan periksa & hapus.`, 'warning');
      }

    } catch (e) {
      console.error(e);
      showToast('Gagal mencari Self-Transfer', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    if (!confirm(`Apakah Anda yakin ingin menghapus ${selectedIds.size} data log ini?`)) {
      return;
    }

    try {
      setIsBulkOperationLoading(true);
      const ids = Array.from(selectedIds);
      const batchSize = 50;
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);

        const { error } = await supabase
          .from('database_log')
          .delete()
          .in('id', batch);

        if (error) {
          console.error('Error deleting batch:', error);
          errorCount += batch.length;
        } else {
          successCount += batch.length;
        }
      }

      if (errorCount === 0) {
        showToast(`Berhasil menghapus ${successCount} data!`, 'success');
      } else {
        showToast(`Berhasil menghapus ${successCount} data, ${errorCount} gagal`, 'warning');
      }

      if (filters.onlySelected) {
        const newSelectedIds = new Set(selectedIds);
        ids.forEach(id => newSelectedIds.delete(id));
        setSelectedIds(newSelectedIds);
        setIsAllPageSelected(false);
        
        // Langsung panggil loadLogEntries dengan next state agar tabel langsung terupdate
        loadLogEntries(currentPage, itemsPerPage, filters, newSelectedIds);
      } else {
        clearSelection();
        loadLogEntries(currentPage, itemsPerPage);
      }
    } catch (error) {
      console.error('Error bulk deleting:', error);
      showToast('Terjadi kesalahan saat bulk delete', 'error');
    } finally {
      setIsBulkOperationLoading(false);
    }
  };

  const handleSyncTglScanWithTgl = async () => {
    if (selectedIds.size === 0) return;

    if (!confirm(`Apakah Anda yakin ingin menyamakan Tgl Scan = Tgl untuk ${selectedIds.size} data terpilih?`)) {
      return;
    }

    try {
      setIsBulkOperationLoading(true);
      const selectedArray = Array.from(selectedIds);
      const batchSize = 100;
      let totalSuccess = 0;
      let totalError = 0;

      for (let i = 0; i < selectedArray.length; i += batchSize) {
        const batchIds = selectedArray.slice(i, i + batchSize);
        const { data: records, error: fetchError } = await supabase
          .from('database_log')
          .select('id, tgl')
          .in('id', batchIds);

        if (fetchError) {
          console.error('Error fetching records for sync:', fetchError);
          totalError += batchIds.length;
          continue;
        }

        if (records && records.length > 0) {
          // Group IDs by their own row's tgl value
          const tglGroups: Record<string, string[]> = {};
          records.forEach((row: any) => {
            if (row.tgl) {
              if (!tglGroups[row.tgl]) tglGroups[row.tgl] = [];
              tglGroups[row.tgl].push(row.id);
            }
          });

          // Perform batch updates for each distinct tgl value
          for (const [tglVal, ids] of Object.entries(tglGroups)) {
            const { error: updateError } = await supabase
              .from('database_log')
              .update({
                tgl_scan: tglVal,
                log_update_user: `DEVMODE: Sync Tgl Scan = Tgl`
              })
              .in('id', ids);

            if (updateError) {
              console.error('Error updating tgl_scan:', updateError);
              totalError += ids.length;
            } else {
              totalSuccess += ids.length;
            }
          }
        }
      }

      if (totalError === 0) {
        showToast(`Berhasil menyamakan Tgl Scan dengan Tgl untuk ${totalSuccess} data!`, 'success');
      } else {
        showToast(`Berhasil menyamakan ${totalSuccess} data, ${totalError} gagal.`, 'warning');
      }

      clearSelection();
      loadLogEntries(currentPage, itemsPerPage);
    } catch (error) {
      console.error('Error syncing tgl_scan with tgl:', error);
      showToast('Terjadi kesalahan saat menyamakan Tgl Scan', 'error');
    } finally {
      setIsBulkOperationLoading(false);
    }
  };

  const handleSyncSubRakWithRak = async () => {
    if (selectedIds.size === 0) return;

    if (!confirm(`Apakah Anda yakin ingin menyamakan Sub Rak = Rak untuk ${selectedIds.size} data terpilih?`)) {
      return;
    }

    try {
      setIsBulkOperationLoading(true);
      const selectedArray = Array.from(selectedIds);
      const batchSize = 100;
      let totalSuccess = 0;
      let totalError = 0;

      for (let i = 0; i < selectedArray.length; i += batchSize) {
        const batchIds = selectedArray.slice(i, i + batchSize);
        const { data: records, error: fetchError } = await supabase
          .from('database_log')
          .select('id, rak')
          .in('id', batchIds);

        if (fetchError) {
          console.error('Error fetching records for sub_rak sync:', fetchError);
          totalError += batchIds.length;
          continue;
        }

        if (records && records.length > 0) {
          const rakGroups: Record<string, string[]> = {};
          records.forEach((row: any) => {
            if (row.rak) {
              if (!rakGroups[row.rak]) rakGroups[row.rak] = [];
              rakGroups[row.rak].push(row.id);
            }
          });

          for (const [rakVal, ids] of Object.entries(rakGroups)) {
            const { error: updateError } = await supabase
              .from('database_log')
              .update({
                sub_rak: rakVal,
                log_update_user: `DEVMODE: Sync Sub Rak = Rak`
              })
              .in('id', ids);

            if (updateError) {
              console.error('Error updating sub_rak:', updateError);
              totalError += ids.length;
            } else {
              totalSuccess += ids.length;
            }
          }
        }
      }

      if (totalError === 0) {
        showToast(`Berhasil menyamakan Sub Rak dengan Rak untuk ${totalSuccess} data!`, 'success');
      } else {
        showToast(`Berhasil menyamakan ${totalSuccess} data, ${totalError} gagal.`, 'warning');
      }

      clearSelection();
      loadLogEntries(currentPage, itemsPerPage);
    } catch (error) {
      console.error('Error syncing sub_rak with rak:', error);
      showToast('Terjadi kesalahan saat menyamakan Sub Rak', 'error');
    } finally {
      setIsBulkOperationLoading(false);
    }
  };

  const handleSyncAllSubRakWithRak = async () => {
    if (!confirm('Apakah Anda yakin ingin menyamakan Sub Rak = Rak untuk SELURUH DATA di database_log?')) {
      return;
    }

    try {
      setIsSyncingSubRak(true);
      let totalUpdated = 0;
      let hasMore = true;

      while (hasMore) {
        const { data: records, error: fetchError } = await supabase
          .from('database_log')
          .select('id, rak, sub_rak')
          .not('rak', 'is', null)
          .neq('rak', '')
          .or('sub_rak.is.null,sub_rak.eq.UTAMA,sub_rak.neq.rak')
          .limit(200);

        if (fetchError) {
          console.error('Error fetching records for all sub_rak sync:', fetchError);
          showToast(`Gagal memuat data: ${fetchError.message}`, 'error');
          break;
        }

        if (!records || records.length === 0) {
          hasMore = false;
          break;
        }

        const rowsToSync = records.filter(r => r.rak && r.sub_rak !== r.rak);
        if (rowsToSync.length === 0) {
          hasMore = false;
          break;
        }

        const rakGroups: Record<string, string[]> = {};
        rowsToSync.forEach((row: any) => {
          if (!rakGroups[row.rak]) rakGroups[row.rak] = [];
          rakGroups[row.rak].push(row.id);
        });

        let batchSuccess = 0;
        for (const [rakVal, ids] of Object.entries(rakGroups)) {
          const { error: updateError } = await supabase
            .from('database_log')
            .update({
              sub_rak: rakVal,
              log_update_user: `DEVMODE: Sync All Sub Rak = Rak`
            })
            .in('id', ids);

          if (!updateError) {
            batchSuccess += ids.length;
          }
        }

        totalUpdated += batchSuccess;
        if (batchSuccess === 0) {
          break;
        }
      }

      if (totalUpdated > 0) {
        showToast(`Berhasil menyamakan Sub Rak = Rak untuk ${totalUpdated} data secara keseluruhan!`, 'success');
      } else {
        showToast(`Semua data Sub Rak sudah sesuai dengan Rak!`, 'info');
      }

      fetchLogs(); // refresh table
    } catch (err: any) {
      console.error('Error in handleSyncAllSubRakWithRak:', err);
      showToast(`Gagal menyamakan Sub Rak: ${err.message || 'unknown error'}`, 'error');
    } finally {
      setIsSyncingSubRak(false);
    }
  };

  const handleFixAllTransferDates = async () => {
    if (!confirm('Apakah Anda yakin ingin memperhitungkan & menyamakan tgl & tgl_scan SELURUH log TRANSFER (OUT & IN berpasangan) secara otomatis di database_log?')) {
      return;
    }

    try {
      setIsFixingTransferDates(true);
      showToast('Memuat seluruh data log TRANSFER...', 'info');

      // 1. Fetch ALL TRANSFER logs in bulk
      let allTransferLogs: any[] = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('database_log')
          .select('id, sku, tgl, tgl_scan, type, gudang, waktu, jumlah, created_at')
          .eq('gudang', 'TRANSFER')
          .order('id', { ascending: true })
          .range(from, from + batchSize - 1);

        if (error) {
          console.error('Error loading TRANSFER logs:', error);
          showToast(`Gagal memuat log transfer: ${error.message}`, 'error');
          break;
        }

        if (data && data.length > 0) {
          allTransferLogs.push(...data);
          from += batchSize;
          if (data.length < batchSize) hasMore = false;
        } else {
          hasMore = false;
        }
      }

      if (allTransferLogs.length === 0) {
        showToast('Tidak ditemukan data log TRANSFER di database.', 'info');
        return;
      }

      // Extract unique SKUs present in TRANSFER logs
      const uniqueSkusMap = new Map<string, string>();
      allTransferLogs.forEach(l => {
        const rawSku = (l.sku || '').trim();
        if (rawSku) uniqueSkusMap.set(rawSku.toUpperCase(), rawSku);
      });

      const uniqueSkus = Array.from(uniqueSkusMap.values());
      showToast(`Mencari data penerimaan bon asli untuk ${uniqueSkus.length} SKU unik...`, 'info');

      // 2. Fetch original IN receipt logs per unique SKU
      const inReceiptsBySku = new Map<string, any[]>();
      const skuChunkSize = 20;

      for (let i = 0; i < uniqueSkus.length; i += skuChunkSize) {
        const chunkSkus = uniqueSkus.slice(i, i + skuChunkSize);
        await Promise.all(
          chunkSkus.map(async (sku) => {
            const { data } = await supabase
              .from('database_log')
              .select('tgl, tgl_scan, created_at')
              .ilike('sku', sku)
              .eq('type', 'IN')
              .neq('gudang', 'TRANSFER')
              .order('created_at', { ascending: true });

            if (data && data.length > 0) {
              const formatted = data.map(d => ({
                tgl: d.tgl,
                tgl_scan: d.tgl_scan || d.tgl,
                createdAt: new Date(d.created_at).getTime()
              }));
              inReceiptsBySku.set(sku.toUpperCase(), formatted);
            }
          })
        );
      }

      // Helper to find chronological IN date for a given SKU at/before transferTimestamp
      const findCorrectDate = (normSku: string, transferTimestamp: number) => {
        const list = inReceiptsBySku.get(normSku);
        if (!list || list.length === 0) return null;
        for (let i = list.length - 1; i >= 0; i--) {
          if (list[i].createdAt <= transferTimestamp) {
            return list[i];
          }
        }
        return list[0];
      };

      // 3. Process TRANSFER OUT logs and match pairs
      const updatesMap = new Map<string, { tgl: string; tgl_scan: string }>();
      const outPairs = new Map<string, { tgl: string; tgl_scan: string }>();

      const outLogs = allTransferLogs.filter(l => (l.type || '').trim().toUpperCase() === 'OUT');
      const inLogs = allTransferLogs.filter(l => (l.type || '').trim().toUpperCase() === 'IN');

      outLogs.forEach(outRow => {
        const normSku = (outRow.sku || '').trim().toUpperCase();
        const transferTime = new Date(outRow.created_at).getTime();
        const matched = findCorrectDate(normSku, transferTime);

        if (matched) {
          const correctTgl = matched.tgl;
          const correctTglScan = matched.tgl_scan;

          if (outRow.tgl !== correctTgl || outRow.tgl_scan !== correctTglScan) {
            updatesMap.set(outRow.id, { tgl: correctTgl, tgl_scan: correctTglScan });
          }

          const pairKey = `${normSku}|${(outRow.waktu || '').trim()}|${outRow.jumlah}`;
          outPairs.set(pairKey, { tgl: correctTgl, tgl_scan: correctTglScan });
        }
      });

      // Match IN logs with their corresponding OUT pair
      inLogs.forEach(inRow => {
        const normSku = (inRow.sku || '').trim().toUpperCase();
        const pairKey = `${normSku}|${(inRow.waktu || '').trim()}|${inRow.jumlah}`;
        const pairMatched = outPairs.get(pairKey);

        if (pairMatched) {
          if (inRow.tgl !== pairMatched.tgl || inRow.tgl_scan !== pairMatched.tgl_scan) {
            updatesMap.set(inRow.id, { tgl: pairMatched.tgl, tgl_scan: pairMatched.tgl_scan });
          }
        }
      });

      const totalToUpdate = updatesMap.size;
      if (totalToUpdate === 0) {
        showToast('Seluruh data log TRANSFER sudah 100% cocok & akurat!', 'success');
        return;
      }

      showToast(`Memperbarui ${totalToUpdate} baris log TRANSFER yang belum sesuai...`, 'info');

      // 4. Batch update updatesMap in parallel chunks of 50
      const entries = Array.from(updatesMap.entries());
      let updatedCount = 0;
      const updateBatchSize = 50;

      for (let i = 0; i < entries.length; i += updateBatchSize) {
        const chunk = entries.slice(i, i + updateBatchSize);
        await Promise.all(
          chunk.map(([id, val]) =>
            supabase
              .from('database_log')
              .update({
                tgl: val.tgl,
                tgl_scan: val.tgl_scan,
                log_update_user: 'DEVMODE: Fix Transfer Date'
              })
              .eq('id', id)
          )
        );
        updatedCount += chunk.length;
        showToast(`Memperbarui data: ${updatedCount} / ${totalToUpdate}...`, 'info');
      }

      showToast(`Selesai! Berhasil memperbarui ${totalToUpdate} baris log TRANSFER!`, 'success');
      loadLogEntries(currentPage, itemsPerPage, debouncedFilters);
    } catch (err: any) {
      console.error('Error in handleFixAllTransferDates:', err);
      showToast(`Gagal memperbaiki tanggal transfer: ${err.message || 'unknown error'}`, 'error');
    } finally {
      setIsFixingTransferDates(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus data log ini?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('database_log')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting log entry:', error);
        showToast('Gagal menghapus data log', 'error');
        return;
      }

      showToast('Data log berhasil dihapus!', 'success');
      loadLogEntries(currentPage, itemsPerPage);
    } catch (error) {
      console.error('Error deleting log entry:', error);
      showToast('Terjadi kesalahan saat menghapus data', 'error');
    }
  };

  const clearAllFilters = () => {
    setFilters({
      sku: '',
      type: '',
      gudang: initialGudangFilter || '',
      rak: '',
      tanggal: '',
      tglScan: '',
      isAdjustment: ''
    });
    setCurrentPage(1);
  };

  const handleExport = async () => {
    if (!isAccessGranted) return;

    try {
      setExportProgress({
        isExporting: true,
        progress: 0,
        total: 0,
        current: 0,
        message: 'Menghitung total data...'
      });

      let allExportData: any[] = [];
      const batchSize = 1000;

      // --- CASE 1: EXPORT SELECTED ONLY ---
      if (selectedIds.size > 0) {
        const ids = Array.from(selectedIds);
        const total = ids.length;
        setExportProgress(prev => ({ ...prev, total, message: `Mempersiapkan ${total} data terpilih...` }));

        for (let i = 0; i < total; i += batchSize) {
          const batchIds = ids.slice(i, i + batchSize);

          const { data, error } = await supabase
            .from('database_log')
            .select('*')
            .in('id', batchIds)
            .order('tgl_normalized', { ascending: false });

          if (error) throw error;

          if (data) {
            allExportData = [...allExportData, ...data];
          }

          const currentCount = Math.min(i + batchSize, total);
          const progress = Math.round((currentCount / total) * 80);
          setExportProgress(prev => ({
            ...prev,
            current: currentCount,
            progress,
            message: `Mengunduh ${currentCount} dari ${total} data...`
          }));
        }

      } else {
        // --- CASE 2: EXPORT ALL MATCHING FILTERS ---

        // 1. Get Total Count First
        let countQuery = supabase
          .from('database_log')
          .select('*', { count: 'exact', head: true })
          .not('gudang', 'in', '("VERIFY","UNVERIFY")');

        // Apply Filters to Count Query
        if (filters.sku) countQuery = countQuery.eq('sku', filters.sku);
        if (filters.type) countQuery = countQuery.eq('type', filters.type);
        if (filters.gudang) countQuery = countQuery.ilike('gudang', `%${filters.gudang}%`);
        if (filters.rak) countQuery = countQuery.ilike('rak', `%${filters.rak}%`);
        if (filters.subRak) countQuery = countQuery.ilike('sub_rak', `%${filters.subRak}%`);
        if (filters.waktu) {
          const rawW = filters.waktu.trim();
          const colonW = rawW.replace(/\./g, ':');
          const dotW = rawW.replace(/:/g, '.');
          countQuery = countQuery.or(`waktu.ilike.%${rawW}%,waktu.ilike.%${colonW}%,waktu.ilike.%${dotW}%`);
        }
        if (filters.logUpdateUser) countQuery = countQuery.ilike('log_update_user', `%${filters.logUpdateUser}%`);
        if (filters.tanggal) countQuery = countQuery.eq('tgl', filters.tanggal);
        if (filters.tglScan) countQuery = countQuery.eq('tgl_scan', filters.tglScan);
        if (filters.isAdjustment) countQuery = countQuery.eq('is_adjustment', filters.isAdjustment === 'true');

        const { count, error: countError } = await countQuery;
        if (countError) throw countError;

        const total = count || 0;
        if (total === 0) {
          showToast('Tidak ada data untuk diekspor', 'warning');
          setExportProgress({ isExporting: false, progress: 0, total: 0, current: 0, message: '' });
          return;
        }

        setExportProgress(prev => ({ ...prev, total, message: `Mempersiapkan ${total} data...` }));

        let from = 0;
        let hasMore = true;

        while (hasMore) {
          let batchQuery = supabase.from('database_log').select('*').not('gudang', 'in', '("VERIFY","UNVERIFY")');

          // Apply Filters to Data Query
          if (filters.sku) batchQuery = batchQuery.eq('sku', filters.sku);
          if (filters.type) batchQuery = batchQuery.eq('type', filters.type);
          if (filters.gudang) batchQuery = batchQuery.ilike('gudang', `%${filters.gudang}%`);
          if (filters.rak) batchQuery = batchQuery.ilike('rak', `%${filters.rak}%`);
          if (filters.subRak) batchQuery = batchQuery.ilike('sub_rak', `%${filters.subRak}%`);
          if (filters.waktu) {
            const rawW = filters.waktu.trim();
            const colonW = rawW.replace(/\./g, ':');
            const dotW = rawW.replace(/:/g, '.');
            batchQuery = batchQuery.or(`waktu.ilike.%${rawW}%,waktu.ilike.%${colonW}%,waktu.ilike.%${dotW}%`);
          }
          if (filters.logUpdateUser) batchQuery = batchQuery.ilike('log_update_user', `%${filters.logUpdateUser}%`);
          if (filters.tanggal) batchQuery = batchQuery.eq('tgl', filters.tanggal);
          if (filters.tglScan) batchQuery = batchQuery.eq('tgl_scan', filters.tglScan);
          if (filters.isAdjustment) batchQuery = batchQuery.eq('is_adjustment', filters.isAdjustment === 'true');

          // Apply Sort
          if (sortConfig) {
            if (sortConfig.key === 'tgl') {
              batchQuery = batchQuery.order('tgl_normalized', { ascending: sortConfig.direction === 'asc' });
            } else {
              batchQuery = batchQuery.order(sortConfig.key, { ascending: sortConfig.direction === 'asc' });
            }
            batchQuery = batchQuery.order('id', { ascending: false });
          } else {
            batchQuery = batchQuery
              .order('tgl_normalized', { ascending: false })
              .order('waktu', { ascending: false })
              .order('id', { ascending: false });
          }

          const { data: batchData, error } = await batchQuery.range(from, from + batchSize - 1);
          if (error) throw error;

          if (batchData && batchData.length > 0) {
            allExportData = [...allExportData, ...batchData];
            from += batchSize;
            const currentCount = Math.min(from, total);
            const progress = Math.round((currentCount / total) * 80);

            setExportProgress(prev => ({
              ...prev,
              current: currentCount,
              progress,
              message: `Mengunduh ${currentCount} dari ${total} data...`
            }));

            if (batchData.length < batchSize) hasMore = false;
          } else {
            hasMore = false;
          }
        }
      }

      // --- GENERATE EXCEL ---
      setExportProgress(prev => ({ ...prev, message: 'Menghasilkan file Excel...', progress: 90 }));

      const ExcelJS = (await import('exceljs')).default;
      const { saveAs } = await import('file-saver');

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Database Log');

      // Define columns with widths
      worksheet.columns = [
        { header: 'Tanggal', key: 'tgl', width: 15 },
        { header: 'Waktu', key: 'waktu', width: 10 },
        { header: 'SKU', key: 'sku', width: 45 },
        { header: 'Jumlah', key: 'jumlah', width: 10 },
        { header: 'Type', key: 'type', width: 10 },
        { header: 'Gudang', key: 'gudang', width: 25 },
        { header: 'Rak', key: 'rak', width: 15 },
        { header: 'Tgl Scan', key: 'tgl_scan', width: 15 },
        { header: 'User', key: 'user_name', width: 20 },
        { header: 'Sub Rak', key: 'sub_rak', width: 15 },
        { header: 'Log Update User', key: 'log_update_user', width: 20 },
        { header: 'Created At', key: 'created_at', width: 25 },
        { header: 'Tgl Normalized', key: 'tgl_normalized', width: 15 },
        { header: 'Adjustment', key: 'is_adjustment', width: 12 }
      ];

      // Styling Header
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      headerRow.height = 25;
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF2563EB' }
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // Add rows
      allExportData.forEach((entry: any) => {
        const row = worksheet.addRow({
          tgl: formatDateDisplay(entry.tgl),
          waktu: entry.waktu || '',
          sku: entry.sku || '',
          jumlah: entry.jumlah || 0,
          type: entry.type || '',
          gudang: entry.gudang || '',
          rak: entry.rak || '',
          tgl_scan: formatDateDisplay(entry.tgl_scan),
          user_name: entry.user_name || '',
          sub_rak: entry.sub_rak || '',
          log_update_user: entry.log_update_user || '',
          created_at: entry.created_at ? new Date(entry.created_at).toLocaleString('id-ID') : '',
          tgl_normalized: entry.tgl_normalized || '',
          is_adjustment: entry.is_adjustment ? 'YA' : 'TIDAK'
        });

        row.eachCell((cell, colNumber) => {
          const borderColor = { argb: 'FFD1D5DB' };
          cell.border = {
            top: { style: 'thin', color: borderColor },
            left: { style: 'thin', color: borderColor },
            bottom: { style: 'thin', color: borderColor },
            right: { style: 'thin', color: borderColor }
          };

          if (colNumber === 3) {
            cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
          } else {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          }
        });
      });

      setExportProgress(prev => ({ ...prev, message: 'Menyimpan file...', progress: 100 }));
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

      let exportDateStr = '';
      if (filters.tanggal) {
        exportDateStr = filters.tanggal;
      } else if (filters.tglScan) {
        exportDateStr = filters.tglScan;
      } else {
        exportDateStr = new Date().toISOString().split('T')[0];
      }

      const fileName = `database-log-${exportDateStr}.xlsx`;
      saveAs(blob, fileName);

      // Async background task for history
      saveExportHistory(
        blob,
        userName || 'Unknown',
        exportDateStr,
        new Date().toLocaleTimeString('id-ID', { hour12: false }).replace(/:/g, '.'),
        fileName
      ).catch(console.error);

      showToast(`Export Excel berhasil! ${allExportData.length} data telah diunduh.`, 'success');

    } catch (error) {
      console.error('Error exporting data:', error);
      showToast('Terjadi kesalahan saat export data Excel', 'error');
    } finally {
      setExportProgress({ isExporting: false, progress: 0, total: 0, current: 0, message: '' });
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(totalCount / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalCount);

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
  };

  const handleImport = () => {
    setIsImportModalOpen(true);
  };

  const handleFileSelect = (file: File) => {
    if (file && (file.type === 'text/csv' || file.name.endsWith('.csv'))) {
      processCSVFile(file);
    } else {
      showToast('Silakan pilih file CSV yang valid', 'error');
    }
  };

  const processCSVFile = async (file: File) => {
    try {
      setImportProgress({
        isImporting: true,
        progress: 0,
        total: 0,
        current: 0,
        message: 'Membaca file CSV...'
      });

      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());

      const dataLines = lines.length > 0 && (
        lines[0].toLowerCase().includes('tgl') ||
        lines[0].toLowerCase().includes('waktu') ||
        lines[0].toLowerCase().includes('sku')
      ) ? lines.slice(1) : lines;

      const total = dataLines.length;

      setImportProgress(prev => ({
        ...prev,
        total,
        message: `Memproses ${total} baris data...`
      }));

      const importData: any[] = [];
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < dataLines.length; i++) {
        const line = dataLines[i];

        let columns: string[];
        if (line.includes('\t')) {
          columns = line.split('\t');
        } else if (line.includes(';')) {
          columns = line.split(';');
        } else {
          columns = line.split(',');
        }

        columns = columns.map(col => col.trim().replace(/^["']|["']$/g, ''));
        while (columns.length < 12) {
          columns.push('');
        }

        let tglRaw = columns[0]?.trim() || '';
        const waktu = columns[1]?.trim() || '';
        const sku = columns[2]?.trim() || '';
        const jumlah = parseInt(columns[3]?.trim()) || 0;
        const type = columns[4]?.trim() || '';
        const gudang = columns[5]?.trim() || '';
        const rak = columns[6]?.trim() || '';
        let tgl_scanRaw = columns[7]?.trim() || '';
        const user_name = columns[8]?.trim() || '';
        const sub_rak = columns[9]?.trim() || '';
        const log_update_user = columns[10]?.trim() || '';

        // For import, we might still want flexible parsing if CSV is messy?
        // But for now let's stick to simple pass-through or simple heuristic for DD/MM/YYYY support during import
        let tgl = tglRaw;
        // Simple heuristic: if likely DD/MM/YYYY, convert. 
        if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(tglRaw)) {
          const parts = tglRaw.split(/[\/-]/);
          if (parts.length === 3) tgl = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }

        let tgl_scan = tgl_scanRaw;
        if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(tgl_scanRaw)) {
          const parts = tgl_scanRaw.split(/[\/-]/);
          if (parts.length === 3) tgl_scan = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }

        if (tgl && waktu && sku && type && gudang && rak) {
          if (['IN', 'OUT', 'MOVE'].includes(type.toUpperCase())) {
            importData.push({
              tgl,
              waktu,
              sku,
              jumlah,
              type: type.toUpperCase(),
              gudang,
              rak,
              tgl_scan,
              user_name,
              sub_rak,
              log_update_user
            });
            successCount++;
          } else {
            errorCount++;
          }
        } else {
          errorCount++;
        }

        const progress = Math.round(((i + 1) / total) * 50);
        setImportProgress(prev => ({
          ...prev,
          progress,
          current: i + 1,
          message: `Memproses baris ${i + 1} dari ${total}... (${successCount} valid, ${errorCount} error)`
        }));

        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      setImportProgress(prev => ({
        ...prev,
        progress: 50,
        message: 'Menyimpan data ke database...'
      }));

      if (importData.length > 0) {
        const batchSize = 50;
        let insertedCount = 0;
        let totalErrors = 0;

        for (let i = 0; i < importData.length; i += batchSize) {
          const batch = importData.slice(i, i + batchSize);

          const { error } = await supabase
            .from('database_log')
            .insert(batch)
            .select();

          if (error) {
            console.error('Error inserting batch:', error);
            totalErrors += batch.length;

            for (const item of batch) {
              const { error: singleError } = await supabase
                .from('database_log')
                .insert([item])
                .select();

              if (singleError) {
                console.error('Single item error:', singleError, item);
              } else {
                insertedCount++;
              }
            }
          } else {
            insertedCount += batch.length;
          }

          const progress = 50 + Math.round((insertedCount / importData.length) * 50);
          setImportProgress(prev => ({
            ...prev,
            progress,
            message: `Menyimpan ${insertedCount} dari ${importData.length} data...`
          }));

          await new Promise(resolve => setTimeout(resolve, 100));
        }

        const finalMessage = totalErrors > 0
          ? `Import selesai! ${insertedCount} data berhasil, ${totalErrors} gagal.`
          : `Import selesai! ${insertedCount} data berhasil diimpor.`;

        setImportProgress(prev => ({
          ...prev,
          progress: 100,
          message: finalMessage
        }));

        setTimeout(() => {
          setImportProgress({
            isImporting: false,
            progress: 0,
            total: 0,
            current: 0,
            message: ''
          });
          setIsImportModalOpen(false);
          setIsImportModalOpen(false);
          loadLogEntries(currentPage, itemsPerPage, debouncedFilters);

          if (totalErrors > 0) {
            showToast(`Import selesai! ${insertedCount} berhasil, ${totalErrors} gagal. Periksa console untuk detail.`, 'warning');
          } else {
            showToast(`Import berhasil! ${insertedCount} log entry ditambahkan.`, 'success');
          }
        }, 2000);
      } else {
        setImportProgress({
          isImporting: false,
          progress: 0,
          total: 0,
          current: 0,
          message: ''
        });
        showToast(`Tidak ada data valid untuk diimpor. ${errorCount} baris bermasalah.`, 'error');
      }

    } catch (error) {
      console.error('Error processing CSV:', error);
      setImportProgress({
        isImporting: false,
        progress: 0,
        total: 0,
        current: 0,
        message: ''
      });
      showToast('Terjadi kesalahan saat memproses file CSV', 'error');
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  return (
    <>
      <ExportHistoryModal 
        isOpen={isHistoryModalOpen} 
        onClose={() => setIsHistoryModalOpen(false)} 
      />

      {isPinModalOpen && (
        <Modal isOpen={isPinModalOpen} onClose={handleClosePinModal} title="Akses Database Log" size="sm">
          <div className="flex flex-col items-center p-4">
            <Lock className="h-12 w-12 text-blue-600 mb-4" />
            <h2 className="text-xl font-bold mb-2">Masukkan PIN</h2>
            <p className="text-sm text-center mb-4 text-red-600 font-bold">
              PIN sama dengan web Label QR dan Tanggal
            </p>
            <form onSubmit={handlePinSubmit} className="w-full max-w-xs">
              <input
                ref={pinInputRef} // Mengaitkan ref dengan elemen input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                maxLength={4}
                className="w-full px-4 py-2 text-center text-lg font-mono border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••"
              />
              {pinMessage.text && (
                <div className={`mt-2 text-sm text-center font-medium ${pinMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                  {pinMessage.text}
                </div>
              )}
              <Button
                type="submit"
                className="w-full h-11 mt-6 bg-gradient-to-br from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white font-bold rounded-xl shadow-[0_4px_12px_rgba(37,99,235,0.35)] transition-all duration-300 transform hover:scale-[1.02] active:scale-95 border border-white/20 backdrop-blur-md"
              >
                Masuk
              </Button>
            </form>
          </div>
        </Modal>
      )}

      {isAccessGranted ? (
        <div className="space-y-6">
          {/* PREMIUM IMMERSIVE HEADER (310px) */}
          <div className="flex flex-col mb-8 lg:mb-12 uppercase">
            <div className="bg-gradient-to-br from-blue-700 via-indigo-800 to-slate-900 -mx-3 lg:-mx-8 pt-[90px] lg:pt-0 lg:h-[310px] pb-[75px] lg:pb-0 px-6 lg:px-12 rounded-b-[40px] lg:rounded-b-[55px] shadow-2xl shadow-blue-900/40 relative overflow-hidden transition-all duration-500 flex flex-col justify-center">

              {/* Decorative Background Icon */}
              <div className="absolute -top-12 -right-12 text-white opacity-5">
                <Database className="w-72 h-72 lg:w-[480px] lg:h-[480px]" />
              </div>

              {/* Decorative Floating Elements */}
              <div className="absolute top-1/4 right-1/3 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl animate-pulse"></div>
              <div className="absolute bottom-10 left-10 w-20 h-20 bg-indigo-500/10 rounded-3xl rotate-12 blur-xl"></div>

              {/* Text Content */}
              <div className="relative z-10 w-full flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 uppercase">
                <div className="max-w-2xl">
                  <div className="flex items-center gap-2 mb-3 lg:mb-4 opacity-90">
                    <div className="w-10 h-[2px] bg-blue-400 rounded-full"></div>
                    <span className="text-[10px] lg:text-[12px] font-black tracking-[0.4em] text-blue-100">System Activity Repository</span>
                  </div>
                  <h1 className="text-[36px] lg:text-[62px] font-black text-white tracking-tighter leading-[1] mb-3 uppercase">
                    Database <span className="text-blue-400">Log</span>
                  </h1>
                  <div className="text-blue-100/80 font-medium text-[14px] lg:text-[18px] leading-relaxed max-w-[90%] normal-case flex items-center gap-3">
                    <div className="px-3 py-1 bg-white/10 rounded-full backdrop-blur-sm border border-white/10 flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                      </span>
                      <span className="text-[11px] font-bold tracking-widest uppercase">Live Monitoring</span>
                    </div>
                    <span className="opacity-60 hidden sm:inline">|</span>
                    <span className="text-[13px] lg:text-[16px]">Pantau dan kelola riwayat transaksi data secara transparan</span>
                  </div>
                </div>

                {/* Global Actions Container - Desktop */}
                <div className="relative z-10 flex flex-wrap gap-2 lg:gap-3 lg:mb-2 items-center">
                  {(loading || exportProgress.isExporting || importProgress.isImporting || isMigrating || isRepairing) && (
                    <div className="px-5 py-2.5 bg-blue-500/20 backdrop-blur-md border border-white/20 rounded-2xl flex items-center gap-3 mr-2">
                      <RefreshCw className="w-4 h-4 text-white animate-spin" />
                      <span className="text-[11px] font-black text-white tracking-[0.2em] uppercase">Processing</span>
                    </div>
                  )}

                  {showFixDates && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={handleFixDates}
                        disabled={isMigrating || isRepairing}
                        className="h-12 px-5 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 border border-amber-400/50 disabled:opacity-50"
                      >
                        <ArrowUpDown className="h-4 w-4" />
                        <span className="uppercase text-[10px] font-black">
                          {isMigrating ? 'Fixing...' : 'Fix Date'}
                        </span>
                      </button>
                      <button
                        onClick={handleFixScanDates}
                        disabled={isMigrating || isRepairing}
                        className="h-12 px-5 bg-indigo-500 hover:bg-indigo-600 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 border border-indigo-400/50 disabled:opacity-50"
                      >
                        <Calendar className="h-4 w-4" />
                        <span className="uppercase text-[10px] font-black">
                          {isRepairing ? 'Repairing...' : 'Fix Scan'}
                        </span>
                      </button>
                      <button
                        onClick={handleSyncAllSubRakWithRak}
                        disabled={isMigrating || isRepairing || isSyncingSubRak || isFixingTransferDates}
                        className="h-12 px-5 bg-teal-600 hover:bg-teal-700 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 border border-teal-400/50 disabled:opacity-50"
                        title="Samakan SEMUA Sub Rak = Rak di database_log"
                      >
                        <RefreshCw className={`h-4 w-4 ${isSyncingSubRak ? 'animate-spin' : ''}`} />
                        <span className="uppercase text-[10px] font-black">
                          {isSyncingSubRak ? 'Syncing...' : 'Fix Sub Rak'}
                        </span>
                      </button>
                      <button
                        onClick={handleFixAllTransferDates}
                        disabled={isMigrating || isRepairing || isSyncingSubRak || isFixingTransferDates}
                        className="h-12 px-5 bg-purple-600 hover:bg-purple-700 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 border border-purple-400/50 disabled:opacity-50"
                        title="Perbaiki Tanggal Log TRANSFER (OUT & IN Berpasangan) Sesuai Tanggal Barang Masuk Asli"
                      >
                        <Calendar className={`h-4 w-4 ${isFixingTransferDates ? 'animate-spin' : ''}`} />
                        <span className="uppercase text-[10px] font-black">
                          {isFixingTransferDates ? 'Fixing...' : 'Fix Transfer Date'}
                        </span>
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => { setIsAnalysisModalOpen(true); setAnalysisResults([]); }}
                    className="h-12 px-5 bg-teal-600 hover:bg-teal-500 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 border border-teal-400/30"
                  >
                    <Calculator className="h-4 w-4" />
                    <span className="uppercase text-[10px] font-black">Cek Saldo</span>
                  </button>

                  <button
                    onClick={handleImport}
                    className="h-12 px-5 bg-white/10 hover:bg-white/20 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 border border-white/30 backdrop-blur-xl"
                  >
                    <Upload className="h-4 w-4" />
                    <span className="uppercase text-[10px] font-black">Import</span>
                  </button>

                  <button
                    onClick={() => setIsHistoryModalOpen(true)}
                    className="h-12 px-5 bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-black rounded-2xl shadow-[0_8px_25px_rgba(192,38,211,0.4)] transition-all active:scale-95 flex items-center justify-center gap-2 border border-fuchsia-400/50"
                  >
                    <History className="h-4 w-4" />
                    <span className="uppercase text-[10px] font-black">Riwayat Export</span>
                  </button>

                  <button
                    onClick={handleExport}
                    className="h-12 px-5 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-2xl shadow-[0_8px_25px_rgba(37,99,235,0.4)] transition-all active:scale-95 flex items-center justify-center gap-2 border border-blue-400/50"
                  >
                    <Download className="h-4 w-4" />
                    <span className="uppercase text-[10px] font-black">Export</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:px-10 pb-12 -mt-6 lg:-mt-8">

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="text-yellow-800">
                  <strong className="text-base">Database memiliki {totalCount.toLocaleString()} data log.</strong>
                  <p className="text-xs sm:text-sm mt-1">Gunakan filter untuk memuat data yang spesifik, atau klik tombol di bawah untuk memuat data terbaru.</p>
                </div>
                <Button
                  onClick={handleLoadData}
                  disabled={loading}
                  className="w-full sm:w-auto h-10 px-6 bg-gradient-to-br from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white font-bold rounded-xl shadow-[0_4px_12px_rgba(37,99,235,0.3)] transition-all duration-300 flex items-center justify-center border border-white/20 backdrop-blur-md disabled:opacity-50 shrink-0"
                >
                  <span className="tracking-wide uppercase text-sm">
                    {loading ? 'Memuat...' : 'Muat Data'}
                  </span>
                </Button>
              </div>
            </div>

            <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 ${showFixDates ? 'xl:grid-cols-5' : 'xl:grid-cols-7'} gap-4`}>
              <div>
                <div className="bg-blue-600 text-white px-3 py-2 rounded-t-md">
                  <span className="font-medium">SKU</span>
                </div>
                <FilterDropdown
                  value={filters.sku}
                  onChange={(value) => setFilters({ ...filters, sku: value })}
                  options={allSkus}
                  placeholder="Cari SKU..."
                  loading={dropdownsLoading}
                />
              </div>

              <div>
                <div className="bg-blue-600 text-white px-3 py-2 rounded-t-md">
                  <span className="font-medium">Type</span>
                </div>
                <select
                  value={filters.type}
                  onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 border-t-0 rounded-b-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">Semua Type</option>
                  <option value="IN">IN</option>
                  <option value="OUT">OUT</option>
                  <option value="MOVE">MOVE</option>
                </select>
              </div>

              <div>
                <div className="bg-blue-600 text-white px-3 py-2 rounded-t-md">
                  <span className="font-medium">Gudang</span>
                </div>
                <FilterDropdown
                  value={filters.gudang}
                  onChange={(value) => setFilters({ ...filters, gudang: value })}
                  options={allGudangs}
                  placeholder="Cari gudang..."
                  loading={dropdownsLoading}
                />
              </div>

              <div>
                <div className="bg-blue-600 text-white px-3 py-2 rounded-t-md">
                  <span className="font-medium">Rak</span>
                </div>
                <FilterDropdown
                  value={filters.rak}
                  onChange={(value) => setFilters({ ...filters, rak: value })}
                  options={allRaks}
                  placeholder="Cari rak..."
                  loading={dropdownsLoading}
                />
              </div>

              <div>
                <div className="bg-blue-600 text-white px-3 py-2 rounded-t-md">
                  <span className="font-medium">Tanggal</span>
                </div>
                <div className="relative" onClick={() => tanggalInputRef.current?.showPicker()}>
                  <input
                    type="text"
                    value={filters.tanggal}
                    onChange={(e) => setFilters({ ...filters, tanggal: e.target.value })}
                    placeholder="dd/mm/yyyy"
                    className="w-full px-3 py-2 border border-gray-300 border-t-0 rounded-b-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10 cursor-pointer"
                  />
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenManualFilter('tanggal');
                      }}
                      className="p-1 px-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 hover:text-blue-700 rounded-md transition-all border border-blue-200 shadow-sm"
                      title="Input Manual"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    {filters.tanggal ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFilters({ ...filters, tanggal: '' });
                          if (tanggalInputRef.current) tanggalInputRef.current.value = '';
                        }}
                        className="p-1 px-1.5 bg-gray-100/50 hover:bg-gray-200 text-gray-500 hover:text-gray-700 rounded-md transition-all backdrop-blur-sm border border-gray-200"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : (
                      <Calendar className="h-4 w-4 text-gray-400 pointer-events-none" />
                    )}
                  </div>
                  <input
                    ref={tanggalInputRef}
                    type="date"
                    value={normalizeFilterDate(filters.tanggal)} // Bind value so it clears when state clears
                    className="absolute bottom-0 left-0 w-0 h-0 opacity-0"
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val) {
                        setFilters({ ...filters, tanggal: val });
                      } else {
                        // Handle clear from picker if possible (usually picker only sets value)
                        setFilters({ ...filters, tanggal: '' });
                      }
                    }}
                  />
                </div>

              </div>

              <div>
                <div className="bg-blue-600 text-white px-3 py-2 rounded-t-md">
                  <span className="font-medium">Tgl Scan</span>
                </div>
                <div className="relative" onClick={() => tglScanInputRef.current?.showPicker()}>
                  <input
                    type="text"
                    value={filters.tglScan}
                    onChange={(e) => setFilters({ ...filters, tglScan: e.target.value })}
                    placeholder="dd/mm/yyyy"
                    className="w-full px-3 py-2 border border-gray-300 border-t-0 rounded-b-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10 cursor-pointer"
                  />
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenManualFilter('tglScan');
                      }}
                      className="p-1 px-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 hover:text-blue-700 rounded-md transition-all border border-blue-200 shadow-sm"
                      title="Input Manual"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    {filters.tglScan ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFilters({ ...filters, tglScan: '' });
                          if (tglScanInputRef.current) tglScanInputRef.current.value = '';
                        }}
                        className="p-1 px-1.5 bg-gray-100/50 hover:bg-gray-200 text-gray-500 hover:text-gray-700 rounded-md transition-all backdrop-blur-sm border border-gray-200"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : (
                      <Calendar className="h-4 w-4 text-gray-400 pointer-events-none" />
                    )}
                  </div>
                  <input
                    ref={tglScanInputRef}
                    type="date"
                    value={normalizeFilterDate(filters.tglScan)} // Bind value
                    className="absolute bottom-0 left-0 w-0 h-0 opacity-0"
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val) {
                        setFilters({ ...filters, tglScan: val });
                      } else {
                        setFilters({ ...filters, tglScan: '' });
                      }
                    }}
                  />
                </div>

              </div>

              {/* DEVMODE EXTRA FILTERS */}
              {showFixDates && (
                <>
                  {/* FILTER WAKTU */}
                  <div>
                    <div className="bg-indigo-700 text-white px-3 py-2 rounded-t-md flex items-center justify-between">
                      <span className="font-bold text-xs uppercase tracking-wider">Waktu (Jam.Menit.Detik)</span>
                      <span className="text-[9px] bg-indigo-900/80 px-1.5 py-0.5 rounded font-mono font-bold">DEV</span>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        value={filters.waktu}
                        onChange={(e) => setFilters({ ...filters, waktu: e.target.value })}
                        placeholder="HH.MM.SS (14.30.45)"
                        className="w-full px-3 py-2 border border-indigo-200 border-t-0 rounded-b-md focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-14 bg-indigo-50/20 text-gray-900 text-sm font-semibold"
                      />
                      <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center space-x-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenManualFilter('waktu');
                          }}
                          className="p-1 px-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-md transition-all border border-indigo-300 shadow-sm"
                          title="Input Manual Waktu"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        {filters.waktu && (
                          <button
                            type="button"
                            onClick={() => setFilters({ ...filters, waktu: '' })}
                            className="p-1 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-md"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* FILTER SUB RAK */}
                  <div>
                    <div className="bg-indigo-700 text-white px-3 py-2 rounded-t-md flex items-center justify-between">
                      <span className="font-bold text-xs uppercase tracking-wider">Sub Rak</span>
                      <span className="text-[9px] bg-indigo-900/80 px-1.5 py-0.5 rounded font-mono font-bold">DEV</span>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        value={filters.subRak}
                        onChange={(e) => setFilters({ ...filters, subRak: e.target.value })}
                        placeholder="Cari Sub Rak..."
                        className="w-full px-3 py-2 border border-indigo-200 border-t-0 rounded-b-md focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-8 bg-indigo-50/20 text-gray-900 text-sm font-semibold"
                      />
                      {filters.subRak && (
                        <button
                          type="button"
                          onClick={() => setFilters({ ...filters, subRak: '' })}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-md"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* FILTER LOG UPDATE USER */}
                  <div>
                    <div className="bg-indigo-700 text-white px-3 py-2 rounded-t-md flex items-center justify-between">
                      <span className="font-bold text-xs uppercase tracking-wider">Update User</span>
                      <span className="text-[9px] bg-indigo-900/80 px-1.5 py-0.5 rounded font-mono font-bold">DEV</span>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        value={filters.logUpdateUser}
                        onChange={(e) => setFilters({ ...filters, logUpdateUser: e.target.value })}
                        placeholder="Log Update User..."
                        className="w-full px-3 py-2 border border-indigo-200 border-t-0 rounded-b-md focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-8 bg-indigo-50/20 text-gray-900 text-sm font-semibold"
                      />
                      {filters.logUpdateUser && (
                        <button
                          type="button"
                          onClick={() => setFilters({ ...filters, logUpdateUser: '' })}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-md"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}

              <div>
                <div className="bg-amber-600 text-white px-3 py-2 rounded-t-md">
                  <span className="font-medium text-sm">Status Penyesuaian</span>
                </div>
                <select
                  value={filters.isAdjustment}
                  onChange={(e) => setFilters({ ...filters, isAdjustment: e.target.value })}
                  className="w-full px-3 py-2 border border-amber-300 border-t-0 rounded-b-md focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white text-sm"
                >
                  <option value="">Semua Data</option>
                  <option value="true">Penyesuaian (Adjustment)</option>
                  <option value="false">Normal (Bukan Penyesuaian)</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  onClick={clearAllFilters}
                  disabled={!dataLoaded}
                  className="w-full h-[42px] bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 font-black rounded-xl shadow-sm transition-all duration-200 transform hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 border border-rose-300 disabled:opacity-50"
                  title="Bersihkan Semua Filter"
                >
                  <RotateCcw className="w-4 h-4 text-rose-600" />
                  <span className="tracking-wider uppercase text-xs font-black">Clear Filters</span>
                </button>
              </div>
            </div>

            {/* Spacing container between filter bar & data table */}
            <div className="mb-6"></div>

            {filters.gudang === 'TRANSFER' && (
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl mb-6 flex flex-col md:flex-row justify-between items-start md:items-center shadow-sm gap-4">
                 <div>
                    <h3 className="font-bold text-blue-900 flex items-center gap-2">
                      <ArrowRightLeft className="w-5 h-5"/> Mode Gudang: TRANSFER
                    </h3>
                    <p className="text-blue-700 text-sm mt-1 max-w-2xl">
                      Anda sedang melihat data transfer. Gunakan tombol di samping untuk memindai otomatis seluruh riwayat dan mendeteksi data transfer ganda/sia-sia (<em>Self-Transfer</em>) yang tidak memindahkan barang ke rak berbeda.
                    </p>
                 </div>
                 <Button onClick={handleSelectSelfTransfers} className="bg-blue-600 hover:bg-blue-700 text-white shadow-md flex-shrink-0 w-full md:w-auto h-11 px-5 rounded-lg border border-blue-700/50 flex items-center justify-center font-bold tracking-wide">
                   <Search className="w-4 h-4 mr-2" /> Cari & Pilih Self-Transfer
                 </Button>
              </div>
            )}

            {selectedIds.size > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 shadow-sm sticky top-0 md:relative z-20">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b border-blue-100 pb-2">
                    <span className="text-sm font-bold text-blue-900 bg-blue-100 px-3 py-1 rounded-full">
                      {selectedIds.size} data terpilih
                    </span>
                    <Button
                      onClick={clearSelection}
                      className="h-8 px-3 bg-white hover:bg-gray-50 text-gray-600 font-bold rounded-lg text-[10px] uppercase tracking-wider border border-gray-200 shadow-sm transition-all"
                    >
                      Batal
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:flex lg:flex-wrap items-center gap-2">
                    <Button
                      onClick={() => { setBulkEditMode('tanggal'); setBulkEditValue(''); }}
                      className="h-9 px-3 bg-white hover:bg-blue-50 text-blue-700 font-bold rounded-lg border border-blue-200 shadow-sm transition-all flex items-center justify-center"
                      disabled={isBulkOperationLoading}
                    >
                      <Calendar className="h-3.5 w-3.5 mr-1.5" />
                      <span className="text-[10px] uppercase tracking-wider">Tgl Nota</span>
                    </Button>
                    <Button
                      onClick={() => { setBulkEditMode('tgl_scan'); setBulkEditValue(''); }}
                      className="h-9 px-3 bg-white hover:bg-indigo-50 text-indigo-700 font-bold rounded-lg border border-indigo-200 shadow-sm transition-all flex items-center justify-center"
                      disabled={isBulkOperationLoading}
                    >
                      <Calendar className="h-3.5 w-3.5 mr-1.5" />
                      <span className="text-[10px] uppercase tracking-wider">Tgl Scan</span>
                    </Button>
                    {showFixDates && (
                      <Button
                        onClick={handleSyncTglScanWithTgl}
                        className="h-9 px-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold rounded-lg shadow-md transition-all flex items-center justify-center border border-purple-400/30"
                        disabled={isBulkOperationLoading}
                        title="Samakan Tanggal Scan dengan Tanggal (per baris data)"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isBulkOperationLoading ? 'animate-spin' : ''}`} />
                        <span className="text-[10px] uppercase tracking-wider font-extrabold">Tgl Scan = Tgl</span>
                      </Button>
                    )}
                    <Button
                      onClick={handleSyncSubRakWithRak}
                      className="h-9 px-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-lg shadow-md transition-all flex items-center justify-center border border-emerald-400/30"
                      disabled={isBulkOperationLoading}
                      title="Samakan Sub Rak dengan Rak (per baris data terpilih)"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isBulkOperationLoading ? 'animate-spin' : ''}`} />
                      <span className="text-[10px] uppercase tracking-wider font-extrabold">Sub Rak = Rak</span>
                    </Button>
                    <Button
                      onClick={() => { setBulkEditMode('gudang'); setBulkEditValue(''); }}
                      className="h-9 px-3 bg-white hover:bg-blue-50 text-blue-700 font-bold rounded-lg border border-blue-200 shadow-sm transition-all flex items-center justify-center"
                      disabled={isBulkOperationLoading}
                    >
                      <Building2 className="h-3.5 w-3.5 mr-1.5" />
                      <span className="text-[10px] uppercase tracking-wider">Gudang</span>
                    </Button>
                    <Button
                      onClick={() => { setBulkEditMode('user'); setBulkEditValue(''); }}
                      className="h-9 px-3 bg-white hover:bg-blue-50 text-blue-700 font-bold rounded-lg border border-blue-200 shadow-sm transition-all flex items-center justify-center"
                      disabled={isBulkOperationLoading}
                    >
                      <User className="h-3.5 w-3.5 mr-1.5" />
                      <span className="text-[10px] uppercase tracking-wider">User</span>
                    </Button>
                    <Button
                      onClick={() => { setBulkEditMode('rak'); setBulkEditValue(''); }}
                      className="h-9 px-3 bg-white hover:bg-blue-50 text-blue-700 font-bold rounded-lg border border-blue-200 shadow-sm transition-all flex items-center justify-center"
                      disabled={isBulkOperationLoading}
                    >
                      <Package className="h-3.5 w-3.5 mr-1.5" />
                      <span className="text-[10px] uppercase tracking-wider">Rak</span>
                    </Button>
                    <Button
                      onClick={() => handleBulkUpdate('is_adjustment', true)}
                      className="h-9 px-3 bg-white hover:bg-amber-50 text-amber-700 font-bold rounded-lg border border-amber-200 shadow-sm transition-all flex items-center justify-center"
                      disabled={isBulkOperationLoading}
                    >
                      <Tag className="h-3.5 w-3.5 mr-1.5" />
                      <span className="text-[10px] uppercase tracking-wider">Adjust</span>
                    </Button>
                    <Button
                      onClick={handleBulkDelete}
                      className="h-9 px-3 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-lg border border-red-200 shadow-sm transition-all flex items-center justify-center col-span-2 sm:col-span-1"
                      disabled={isBulkOperationLoading}
                    >
                      <Trash className="h-3.5 w-3.5 mr-1.5" />
                      <span className="text-[10px] uppercase tracking-wider">Hapus</span>
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <Modal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} title="Import Database Log dari CSV" size="lg">
              <div className="space-y-6">
                {!importProgress.isImporting ? (
                  <>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-center space-x-2 mb-3">
                        <FileText className="h-5 w-5 text-blue-600" />
                        <h4 className="font-semibold text-blue-800">Format File CSV</h4>
                      </div>
                      <div className="text-sm text-blue-700 space-y-2">
                        <div className="bg-white p-3 rounded border border-blue-200 font-mono text-xs">
                          <div className="font-bold text-blue-800 mb-1">Contoh format CSV:</div>
                          <div>Tgl,Waktu,SKU,Jumlah,Type,Gudang,Rak,Tgl Scan,User,Sub Rak,Log Update User</div>
                          <div>01/01/25,10:30,BRG001,10,IN,UTAMA,A1,01/01/25,Admin,A1-1,Admin</div>
                          <div>01/01/25,11:15,BRG002,5,OUT,UTAMA,B2,01/01/25,User1,B2-3,User1</div>
                        </div>
                        <p className="text-xs text-blue-600 mt-2">
                          * <strong>Kolom Wajib:</strong> Tgl, Waktu, SKU, Type (IN/OUT/MOVE), Gudang, Rak<br />
                          * <strong>Kolom Opsional:</strong> Jumlah (default: 0), Tgl Scan, User, Sub Rak, Log Update User<br />
                          * <strong>Format Type:</strong> Harus IN, OUT, atau MOVE<br />
                          * <strong>Format Tanggal:</strong> DD/MM/YYYY, DD-MM-YYYY, atau YYYY-MM-DD<br />
                          * Baris pertama akan diabaikan jika berisi header<br />
                          * Mendukung format CSV dengan koma (,), titik koma (;), atau tab
                        </p>
                      </div>
                    </div>

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
                      <div className="flex justify-center">
                        <Button
                          type="button"
                          onClick={() => document.getElementById('csv-file-input')?.click()}
                          className="h-10 px-8 bg-gradient-to-br from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white font-bold rounded-xl shadow-md transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center border border-white/20 backdrop-blur-md mx-auto"
                        >
                          <Upload className="h-5 w-5 mr-2" />
                          Pilih File CSV
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="text-center">
                      <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Upload className="h-8 w-8 text-blue-600" />
                      </div>
                      <h4 className="text-lg font-semibold text-gray-800 mb-2">
                        Mengimpor Database Log
                      </h4>
                      <p className="text-sm text-gray-600">
                        {importProgress.message}
                      </p>
                    </div>

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

            {/* Export Progress Modal */}
            <Modal isOpen={exportProgress.isExporting} onClose={() => { }} title="Mengexport Data Log" size="md">
              <div className="space-y-6 py-4">
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4 animate-pulse">
                    <Download className="h-8 w-8 text-blue-600" />
                  </div>
                  <h4 className="text-xl font-semibold text-gray-800 mb-2">
                    Sedang Mengunduh Data
                  </h4>
                  <p className="text-gray-600 mb-6">
                    {exportProgress.message}
                  </p>
                </div>

                <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                  <div
                    className="bg-blue-600 h-full transition-all duration-300 ease-out flex items-center justify-center text-[10px] text-white font-bold"
                    style={{ width: `${exportProgress.progress}%` }}
                  >
                    {exportProgress.progress}%
                  </div>
                </div>

                <div className="flex justify-between text-sm text-gray-500 font-medium">
                  <span>Proses: {exportProgress.current.toLocaleString()} / {exportProgress.total.toLocaleString()}</span>
                  <span>{exportProgress.progress}% Selesai</span>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800 flex items-start">
                  <div className="mr-2 mt-0.5">ℹ️</div>
                  <div>
                    Mohon jangan tutup halaman ini hingga proses selesai.
                    {exportProgress.total > 5000 && ' Export data dalam jumlah besar mungkin memakan waktu beberapa saat.'}
                  </div>
                </div>
              </div>
            </Modal>

            <Card>
              <CardContent className="p-0">
                {loading && dataLoaded && (
                  <div className="flex items-center justify-center p-8">
                    <div className="text-blue-600 font-medium">Memuat data...</div>
                  </div>
                )}
                <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 300px)' }}>
                  {/* Desktop View Table */}
                  <div className="hidden md:block">
                    <table className="w-full text-sm">
                      <thead className="bg-blue-600 text-white sticky top-0 z-10">
                        <tr>
                          <th className="px-3 py-3 text-center font-medium border-r border-blue-500 w-12">
                            <input
                              type="checkbox"
                              checked={isAllPageSelected}
                              onChange={handleSelectAll}
                              className="w-4 h-4 cursor-pointer"
                            />
                          </th>
                          <th
                            className="px-4 py-3 text-left font-medium border-r border-blue-500 cursor-pointer hover:bg-blue-700 transition-colors group"
                            onClick={() => handleSort('tgl')}
                          >
                            <div className="flex items-center space-x-1">
                              <span>Tgl</span>
                              {sortConfig?.key === 'tgl' ? (
                                sortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                              ) : (
                                <ArrowUpDown className="w-4 h-4 opacity-50 group-hover:opacity-100" />
                              )}
                            </div>
                          </th>
                          <th
                            className="px-4 py-3 text-left font-medium border-r border-blue-500 cursor-pointer hover:bg-blue-700 transition-colors group"
                            onClick={() => handleSort('waktu')}
                          >
                            <div className="flex items-center space-x-1">
                              <span>Waktu</span>
                              {sortConfig?.key === 'waktu' ? (
                                sortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                              ) : (
                                <ArrowUpDown className="w-4 h-4 opacity-50 group-hover:opacity-100" />
                              )}
                            </div>
                          </th>
                          <th className="px-4 py-3 text-left font-medium border-r border-blue-500">SKU</th>
                          <th className="px-4 py-3 text-center font-medium border-r border-blue-500">Jumlah</th>
                          <th className="px-4 py-3 text-center font-medium border-r border-blue-500">Type</th>
                          <th className="px-4 py-3 text-left font-medium border-r border-blue-500">Gudang</th>
                          <th className="px-4 py-3 text-left font-medium border-r border-blue-500">Rak</th>
                          <th className="px-4 py-3 text-left font-medium border-r border-blue-500">Tgl Scan</th>
                          <th className="px-4 py-3 text-left font-medium border-r border-blue-500">User</th>
                          <th className="px-4 py-3 text-left font-medium border-r border-blue-500">Sub Rak</th>
                          <th className="px-4 py-3 text-left font-medium border-r border-blue-500">Log Update User</th>
                          <th className="px-4 py-3 text-center font-medium">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dataLoaded && filteredEntries.map((entry, index) => (
                          <tr key={entry.id} className={`${selectedIds.has(entry.id) ? 'bg-blue-200' : entry.is_adjustment ? 'bg-amber-50' : index % 2 === 0 ? 'bg-blue-50' : 'bg-white'} hover:bg-blue-100 border-b border-gray-200 transition-colors`}>
                            <td className="px-3 py-2 text-center border-r border-gray-200 w-12">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(entry.id)}
                                onChange={() => handleCheckboxChange(entry.id)}
                                className="w-4 h-4 cursor-pointer"
                              />
                            </td>
                            <td className="px-4 py-2 text-sm text-center border-r border-gray-200">{formatDateDisplay(entry.tgl)}</td>
                            <td className="px-4 py-2 text-sm text-center border-r border-gray-200">{entry.waktu}</td>
                            <td className="px-4 py-2 text-sm border-r border-gray-200">
                              <div className="flex items-center justify-between">
                                <span className={entry.is_adjustment ? 'font-bold text-amber-800' : ''}>{entry.sku}</span>
                                {entry.is_adjustment && (
                                  <span className="flex items-center gap-1 bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-2 shadow-sm border border-amber-200 shrink-0">
                                    <Tag className="h-2.5 w-2.5" />
                                    PENYESUAIAN
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2 text-sm text-center border-r border-gray-200">{entry.jumlah}</td>
                            <td className="px-4 py-2 text-center border-r border-gray-200">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${entry.type === 'IN' ? 'bg-green-100 text-green-800' :
                                entry.type === 'OUT' ? 'bg-red-100 text-red-800' :
                                  'bg-blue-100 text-blue-800'
                                }`}>
                                {entry.type}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-sm border-r border-gray-200">{entry.gudang}</td>
                            <td className="px-4 py-2 text-sm border-r border-gray-200">{entry.rak}</td>
                            <td
                              className="px-4 py-2 text-sm border-r border-gray-200 cursor-pointer hover:bg-blue-200 transition-colors"
                              onClick={() => setFilters({ ...filters, tglScan: entry.tgl_scan || '' })}
                              title="Klik untuk filter Tgl Scan"
                            >
                              {formatDateDisplay(entry.tgl_scan)}
                            </td>
                            <td className="px-4 py-2 text-sm border-r border-gray-200">{entry.user}</td>
                            <td className="px-4 py-2 text-sm border-r border-gray-200">{entry.sub_rak}</td>
                            <td className="px-4 py-2 text-sm border-r border-gray-200">{entry.log_update_user}</td>
                            <td className="px-4 py-2 text-center">
                              <div className="flex justify-center space-x-2">
                                <Button
                                  onClick={() => handleEdit(entry)}
                                  className="h-8 w-8 p-0 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 rounded-lg transition-all border border-blue-200 backdrop-blur-sm flex items-center justify-center"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  onClick={() => handleDelete(entry.id)}
                                  className="h-8 w-8 p-0 bg-red-500/10 hover:bg-red-500/20 text-red-600 rounded-lg transition-all border border-red-200 backdrop-blur-sm flex items-center justify-center"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile View Cards */}
                  <div className="md:hidden">
                    <div className="bg-blue-600 text-white p-3 flex items-center gap-3 sticky top-0 z-10 border-b border-blue-500">
                      <input
                        type="checkbox"
                        checked={isAllPageSelected}
                        onChange={handleSelectAll}
                        className="w-5 h-5 cursor-pointer rounded"
                      />
                      <span className="font-bold text-sm">Pilih Semua di Halaman Ini</span>
                    </div>
                    <div className="divide-y divide-gray-200">
                      {dataLoaded && filteredEntries.map((entry, index) => (
                        <div
                          key={entry.id}
                          className={`p-4 ${selectedIds.has(entry.id) ? 'bg-blue-100' : entry.is_adjustment ? 'bg-amber-50' : 'bg-white'} active:bg-blue-50 transition-colors relative`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="pt-1">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(entry.id)}
                                onChange={() => handleCheckboxChange(entry.id)}
                                className="w-5 h-5 cursor-pointer rounded"
                              />
                            </div>
                            <div className="flex-1 space-y-3">
                              {/* Baris 1: SKU dan Type */}
                              <div className="flex justify-between items-start">
                                <div>
                                  <h4 className={`text-base font-bold text-gray-900 ${entry.is_adjustment ? 'text-amber-900' : ''}`}>
                                    {entry.sku}
                                  </h4>
                                  {entry.is_adjustment && (
                                    <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 rounded-full font-bold mt-1 border border-amber-200 shadow-sm">
                                      <Tag className="h-2.5 w-2.5" />
                                      PENYESUAIAN
                                    </span>
                                  )}
                                </div>
                                <span className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm ${entry.type === 'IN' ? 'bg-green-100 text-green-800 border border-green-200' :
                                  entry.type === 'OUT' ? 'bg-red-100 text-red-800 border border-red-200' :
                                    'bg-blue-100 text-blue-800 border border-blue-200'
                                  }`}>
                                  {entry.type}
                                </span>
                              </div>

                              {/* Baris 2: Qty, Rak, Gudang */}
                              <div className="grid grid-cols-2 gap-4 bg-gray-50/80 p-3 rounded-lg border border-gray-100">
                                <div>
                                  <p className="text-[10px] uppercase font-bold text-gray-400 mb-0.5">Jumlah</p>
                                  <p className="text-sm font-bold text-gray-800">{entry.jumlah} Unit</p>
                                </div>
                                <div>
                                  <p className="text-[10px] uppercase font-bold text-gray-400 mb-0.5">Lokasi Rak</p>
                                  <p className="text-sm font-bold text-blue-600">{entry.rak}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] uppercase font-bold text-gray-400 mb-0.5">Gudang</p>
                                  <p className="text-sm font-medium text-gray-700">{entry.gudang}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] uppercase font-bold text-gray-400 mb-0.5">Sub Rak</p>
                                  <p className="text-sm font-medium text-gray-700">{entry.sub_rak || '-'}</p>
                                </div>
                              </div>

                              {/* Baris 3: Tanggal & User */}
                              <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
                                <div className="flex items-center text-gray-500">
                                  <Calendar className="h-3 w-3 mr-1" />
                                  <span>{formatDateDisplay(entry.tgl)} ({entry.waktu})</span>
                                </div>
                                <div className="flex items-center text-indigo-600 font-medium">
                                  <RefreshCw className="h-3 w-3 mr-1" />
                                  <span>Scan: {formatDateDisplay(entry.tgl_scan)}</span>
                                </div>
                                <div className="flex items-center text-gray-500">
                                  <User className="h-3 w-3 mr-1" />
                                  <span>By: {entry.user}</span>
                                </div>
                              </div>

                              {/* Tombol Aksi Mobile */}
                              <div className="flex justify-end gap-2 pt-2">
                                <Button
                                  onClick={() => handleEdit(entry)}
                                  className="h-9 px-4 bg-blue-50 text-blue-600 rounded-lg font-bold text-xs flex items-center justify-center border border-blue-100 flex-1"
                                >
                                  <Edit2 className="h-3.5 w-3.5 mr-1.5" />
                                  Edit
                                </Button>
                                <Button
                                  onClick={() => handleDelete(entry.id)}
                                  className="h-9 px-4 bg-red-50 text-red-600 rounded-lg font-bold text-xs flex items-center justify-center border border-red-100 flex-1"
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                                  Hapus
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {dataLoaded && filteredEntries.length === 0 && !loading && (
                    <div className="px-4 py-8 text-center text-gray-500">
                      Tidak ada data yang sesuai dengan filter
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-5 rounded-xl shadow-md border border-blue-200">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <span className="text-xs font-semibold text-gray-500 uppercase block mb-1">Total Data</span>
                  <span className="text-2xl font-bold text-blue-600">{totalCount.toLocaleString()}</span>
                </div>
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <span className="text-xs font-semibold text-gray-500 uppercase block mb-1">Data Ditampilkan</span>
                  <span className="text-2xl font-bold text-green-600">{filteredEntries.length.toLocaleString()}</span>
                </div>
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <span className="text-xs font-semibold text-gray-500 uppercase block mb-1">Total Qty (Halaman Ini)</span>
                  <span className="text-2xl font-bold text-orange-600">
                    {filteredEntries.reduce((sum, item) => sum + (item.jumlah || 0), 0).toLocaleString()}
                  </span>
                </div>
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <span className="text-xs font-semibold text-gray-500 uppercase block mb-1">Total Qty OUT (Halaman Ini)</span>
                  <span className="text-2xl font-bold text-rose-600">
                    {filteredEntries
                      .filter(item => item.type === 'OUT')
                      .reduce((sum, item) => sum + (item.jumlah || 0), 0)
                      .toLocaleString()
                    }
                  </span>
                </div>
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <span className="text-xs font-semibold text-gray-500 uppercase block mb-1">Halaman</span>
                  <span className="text-2xl font-bold text-purple-600">{currentPage} / {totalPages || 1}</span>
                </div>
              </div>

              {totalCount > itemsPerPage && (
                <div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div className="text-xs sm:text-sm text-gray-600 order-2 sm:order-1 flex items-center gap-4">
                    <span>Menampilkan {startIndex + 1} - {endIndex} dari {totalCount.toLocaleString()} data</span>
                    <div className="relative">
                      <select
                        value={itemsPerPage}
                        onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                        className="appearance-none pl-4 pr-10 py-2 text-sm font-medium bg-white border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 cursor-pointer hover:bg-gray-50 transition-colors"
                      >
                        <option value={100}>100 per halaman</option>
                        <option value={200}>200 per halaman</option>
                        <option value={500}>500 per halaman</option>
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-400">
                        <ChevronDown className="h-4 w-4" />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-center sm:justify-end items-center gap-1 sm:gap-2 order-1 sm:order-2">
                    <button
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                      className="h-9 px-4 bg-white/10 hover:bg-white/20 text-slate-700 font-bold rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center border border-slate-200 backdrop-blur-xl disabled:opacity-30 disabled:scale-100"
                    >
                      <span className="tracking-wide uppercase text-xs">Awal</span>
                    </button>

                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="h-9 px-4 bg-white/10 hover:bg-white/20 text-slate-700 font-bold rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center border border-slate-200 backdrop-blur-xl disabled:opacity-30 disabled:scale-100"
                    >
                      <span className="tracking-wide uppercase text-xs">Prev</span>
                    </button>

                    <div className="flex gap-1.5 flex-wrap justify-center items-center mx-2">
                      {(() => {
                        const pages = [];

                        if (totalPages <= 7) {
                          for (let i = 1; i <= totalPages; i++) {
                            pages.push(
                              <button
                                key={i}
                                onClick={() => setCurrentPage(i)}
                                className={`h-9 min-w-[36px] px-2 text-xs font-bold rounded-xl border transition-all duration-300 transform hover:scale-105 active:scale-95 ${currentPage === i
                                  ? 'bg-gradient-to-br from-blue-500 to-blue-700 border-blue-600 text-white shadow-md'
                                  : 'bg-white/50 hover:bg-white/80 border-slate-200 text-slate-700 backdrop-blur-sm'
                                  }`}
                              >
                                {i}
                              </button>
                            );
                          }
                        } else {
                          pages.push(
                            <button
                              key={1}
                              onClick={() => setCurrentPage(1)}
                              className={`h-9 min-w-[36px] px-2 text-xs font-bold rounded-xl border transition-all duration-300 transform hover:scale-105 active:scale-95 ${currentPage === 1
                                ? 'bg-gradient-to-br from-blue-500 to-blue-700 border-blue-600 text-white shadow-md'
                                : 'bg-white/50 hover:bg-white/80 border-slate-200 text-slate-700 backdrop-blur-sm'
                                }`}
                            >
                              1
                            </button>
                          );

                          if (currentPage > 3) {
                            pages.push(
                              <span key="dots1" className="text-slate-400 font-bold px-1">...</span>
                            );
                          }

                          let startPage = Math.max(2, currentPage - 1);
                          let endPage = Math.min(totalPages - 1, currentPage + 1);

                          if (currentPage <= 3) {
                            startPage = 2;
                            endPage = Math.min(4, totalPages - 1);
                          } else if (currentPage >= totalPages - 2) {
                            startPage = Math.max(2, totalPages - 3);
                            endPage = totalPages - 1;
                          }

                          for (let i = startPage; i <= endPage; i++) {
                            pages.push(
                              <button
                                key={i}
                                onClick={() => setCurrentPage(i)}
                                className={`h-9 min-w-[36px] px-2 text-xs font-bold rounded-xl border transition-all duration-300 transform hover:scale-105 active:scale-95 ${currentPage === i
                                  ? 'bg-gradient-to-br from-blue-500 to-blue-700 border-blue-600 text-white shadow-md'
                                  : 'bg-white/50 hover:bg-white/80 border-slate-200 text-slate-700 backdrop-blur-sm'
                                  }`}
                              >
                                {i}
                              </button>
                            );
                          }

                          if (currentPage < totalPages - 2) {
                            pages.push(
                              <span key="dots2" className="text-slate-400 font-bold px-1">...</span>
                            );
                          }

                          pages.push(
                            <button
                              key={totalPages}
                              onClick={() => setCurrentPage(totalPages)}
                              className={`h-9 min-w-[36px] px-2 text-xs font-bold rounded-xl border transition-all duration-300 transform hover:scale-105 active:scale-95 ${currentPage === totalPages
                                ? 'bg-gradient-to-br from-blue-500 to-blue-700 border-blue-600 text-white shadow-md'
                                : 'bg-white/50 hover:bg-white/80 border-slate-200 text-slate-700 backdrop-blur-sm'
                                }`}
                            >
                              {totalPages}
                            </button>
                          );
                        }

                        return pages;
                      })()}
                    </div>

                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="h-9 px-4 bg-white/10 hover:bg-white/20 text-slate-700 font-bold rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center border border-slate-200 backdrop-blur-xl disabled:opacity-30 disabled:scale-100"
                    >
                      <span className="tracking-wide uppercase text-xs">Next</span>
                    </button>

                    <button
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages}
                      className="h-9 px-4 bg-white/10 hover:bg-white/20 text-slate-700 font-bold rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center border border-slate-200 backdrop-blur-xl disabled:opacity-30 disabled:scale-100"
                    >
                      <span className="tracking-wide uppercase text-xs">Akhir</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <Modal isOpen={bulkEditMode === 'tanggal'} onClose={() => { setBulkEditMode(null); setBulkEditValue(''); }} title="Bulk Edit Tanggal">
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-900">
                    Mengubah tanggal untuk <strong>{selectedIds.size} data</strong>
                  </p>
                </div>
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tanggal Baru</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="date"
                      value={bulkEditValue.includes('-') && bulkEditValue.length === 10 ? bulkEditValue : ''}
                      onChange={(e) => setBulkEditValue(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => {
                        setManualDateTarget('bulk_tanggal');
                        setManualDateValue(bulkEditValue);
                        setIsManualDateModalOpen(true);
                      }}
                      className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-all border border-blue-200"
                      title="Bulk Edit Manual (Support formats: DD/MM/YYYY, etc.)"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                  </div>
                  {bulkEditValue && !bulkEditValue.includes('-') && (
                    <div className="mt-1 text-xs text-blue-600 font-medium">
                      Nilai Manual: {bulkEditValue}
                    </div>
                  )}
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <Button
                    onClick={() => { setBulkEditMode(null); setBulkEditValue(''); }}
                    className="h-10 px-6 bg-white/10 hover:bg-white/20 text-slate-600 font-bold rounded-xl shadow-sm transition-all border border-slate-200 backdrop-blur-xl"
                  >
                    Batal
                  </Button>
                  <Button
                    onClick={() => handleBulkUpdate('tgl', bulkEditValue)}
                    disabled={!bulkEditValue || isBulkOperationLoading}
                    className="h-10 px-6 bg-gradient-to-br from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white font-bold rounded-xl shadow-[0_4px_12px_rgba(37,99,235,0.3)] transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center border border-white/20 backdrop-blur-md disabled:opacity-50"
                  >
                    {isBulkOperationLoading ? 'Menyimpan...' : 'Update'}
                  </Button>
                </div>
              </div>
            </Modal>

            <Modal isOpen={bulkEditMode === 'tgl_scan'} onClose={() => { setBulkEditMode(null); setBulkEditValue(''); }} title="Bulk Edit Tanggal Scan">
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-900">
                    Mengubah <strong>Tanggal Scan</strong> untuk <strong>{selectedIds.size} data terpilih</strong>
                  </p>
                </div>
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tanggal Scan Baru</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="date"
                      value={bulkEditValue.includes('-') && bulkEditValue.length === 10 ? bulkEditValue : ''}
                      onChange={(e) => setBulkEditValue(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => {
                        setManualDateTarget('bulk_tgl_scan');
                        setManualDateValue(bulkEditValue);
                        setIsManualDateModalOpen(true);
                      }}
                      className="p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg transition-all border border-indigo-200"
                      title="Bulk Edit Manual (Support formats: DD/MM/YYYY, etc.)"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                  </div>
                  {bulkEditValue && !bulkEditValue.includes('-') && (
                    <div className="mt-1 text-xs text-indigo-600 font-medium">
                      Nilai Manual: {bulkEditValue}
                    </div>
                  )}
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <Button
                    onClick={() => { setBulkEditMode(null); setBulkEditValue(''); }}
                    className="h-10 px-6 bg-white/10 hover:bg-white/20 text-slate-600 font-bold rounded-xl shadow-sm transition-all border border-slate-200 backdrop-blur-xl"
                  >
                    Batal
                  </Button>
                  <Button
                    onClick={() => handleBulkUpdate('tgl_scan', bulkEditValue)}
                    disabled={!bulkEditValue || isBulkOperationLoading}
                    className="h-10 px-6 bg-gradient-to-br from-indigo-500 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800 text-white font-bold rounded-xl shadow-[0_4px_12px_rgba(99,102,241,0.3)] transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center border border-white/20 backdrop-blur-md disabled:opacity-50"
                  >
                    {isBulkOperationLoading ? 'Menyimpan...' : 'Update'}
                  </Button>
                </div>
              </div>
            </Modal>

            <Modal isOpen={bulkEditMode === 'gudang'} onClose={() => { setBulkEditMode(null); setBulkEditValue(''); }} title="Bulk Edit Gudang">
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-900">
                    Mengubah gudang untuk <strong>{selectedIds.size} data</strong>
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Gudang Baru</label>
                  <EditDropdown
                    value={bulkEditValue}
                    onChange={(value) => setBulkEditValue(value.trim())}
                    options={allGudangs}
                    placeholder="Pilih atau ketik gudang..."
                    loading={dropdownsLoading}
                  />
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <Button onClick={() => { setBulkEditMode(null); setBulkEditValue(''); }} variant="secondary">
                    Batal
                  </Button>
                  <Button
                    onClick={() => handleBulkUpdate('gudang', bulkEditValue)}
                    variant="primary"
                    disabled={!bulkEditValue || isBulkOperationLoading}
                  >
                    {isBulkOperationLoading ? 'Menyimpan...' : 'Update'}
                  </Button>
                </div>
              </div>
            </Modal>

            <Modal isOpen={bulkEditMode === 'user'} onClose={() => { setBulkEditMode(null); setBulkEditValue(''); }} title="Bulk Edit User">
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-900">
                    Mengubah user untuk <strong>{selectedIds.size} data</strong>
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">User Baru</label>
                  <input
                    type="text"
                    value={bulkEditValue}
                    onChange={(e) => setBulkEditValue(e.target.value.trimEnd())}
                    placeholder="Masukkan nama user..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <Button onClick={() => { setBulkEditMode(null); setBulkEditValue(''); }} variant="secondary">
                    Batal
                  </Button>
                  <Button
                    onClick={() => handleBulkUpdate('user', bulkEditValue)}
                    variant="primary"
                    disabled={!bulkEditValue || isBulkOperationLoading}
                  >
                    {isBulkOperationLoading ? 'Menyimpan...' : 'Update'}
                  </Button>
                </div>
              </div>
            </Modal>

            <Modal isOpen={bulkEditMode === 'rak'} onClose={() => { setBulkEditMode(null); setBulkEditValue(''); }} title="Bulk Edit Rak & Sub Rak">
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-900">
                    Mengubah rak dan sub rak untuk <strong>{selectedIds.size} data</strong>
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Rak Baru (Sub Rak akan sama)</label>
                  <EditDropdown
                    value={bulkEditValue}
                    onChange={(value) => setBulkEditValue(value.trimEnd())}
                    options={allRaks}
                    placeholder="Pilih atau ketik rak..."
                    loading={dropdownsLoading}
                  />
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <Button
                    onClick={() => { setBulkEditMode(null); setBulkEditValue(''); }}
                    className="h-10 px-6 bg-white/10 hover:bg-white/20 text-slate-600 font-bold rounded-xl shadow-sm transition-all border border-slate-200 backdrop-blur-xl"
                  >
                    Batal
                  </Button>
                  <Button
                    onClick={() => handleBulkUpdate('rak', bulkEditValue)}
                    disabled={!bulkEditValue || isBulkOperationLoading}
                    className="h-10 px-6 bg-gradient-to-br from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white font-bold rounded-xl shadow-[0_4px_12px_rgba(37,99,235,0.3)] transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center border border-white/20 backdrop-blur-md disabled:opacity-50"
                  >
                    {isBulkOperationLoading ? 'Menyimpan...' : 'Update'}
                  </Button>
                </div>
              </div>
            </Modal>

            {editingEntry && (
              <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Database Log Entry">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Tanggal</label>
                      <input
                        type="date"
                        value={editingEntry.tgl}
                        onChange={(e) => setEditingEntry({ ...editingEntry, tgl: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Waktu {showFixDates && <span className="text-xs text-indigo-600 font-bold ml-1">(Edit Dev)</span>}
                      </label>
                      <input
                        type="text"
                        value={editingEntry.waktu}
                        readOnly={!showFixDates}
                        onChange={(e) => setEditingEntry({ ...editingEntry, waktu: e.target.value })}
                        placeholder="HH:MM:SS"
                        className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${!showFixDates ? 'bg-gray-100 cursor-not-allowed' : 'bg-white font-semibold text-indigo-900'}`}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">SKU</label>
                      <EditDropdown
                        value={editingEntry.sku}
                        onChange={(value) => setEditingEntry({ ...editingEntry, sku: value.trimEnd() })}
                        options={allSkus}
                        placeholder="Pilih atau ketik SKU..."
                        loading={dropdownsLoading}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Jumlah</label>
                      <input
                        type="number"
                        value={editingEntry.jumlah}
                        onChange={(e) => setEditingEntry({ ...editingEntry, jumlah: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                      <select
                        value={editingEntry.type}
                        onChange={(e) => setEditingEntry({ ...editingEntry, type: e.target.value as 'IN' | 'OUT' | 'MOVE' })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="IN">IN</option>
                        <option value="OUT">OUT</option>
                        <option value="MOVE">MOVE</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Gudang</label>
                      <EditDropdown
                        value={editingEntry.gudang}
                        onChange={(value) => setEditingEntry({ ...editingEntry, gudang: value.trim() })}
                        options={allGudangs}
                        placeholder="Pilih atau ketik gudang..."
                        loading={dropdownsLoading}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Rak</label>
                      <EditDropdown
                        value={editingEntry.rak}
                        onChange={(value) => {
                          const trimmedValue = value.trimEnd();
                          setEditingEntry({ ...editingEntry, rak: trimmedValue, sub_rak: trimmedValue });
                        }}
                        options={allRaks}
                        placeholder="Pilih atau ketik rak..."
                        loading={dropdownsLoading}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Tanggal Scan</label>
                      <input
                        type="date"
                        value={editingEntry.tgl_scan}
                        onChange={(e) => setEditingEntry({ ...editingEntry, tgl_scan: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">User</label>
                      <input
                        type="text"
                        value={editingEntry.user}
                        onChange={(e) => setEditingEntry({ ...editingEntry, user: e.target.value.trimEnd() })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Sub Rak</label>
                      <input
                        type="text"
                        value={editingEntry.sub_rak}
                        onChange={(e) => {
                          const trimmedValue = e.target.value.trimEnd();
                          setEditingEntry({ ...editingEntry, sub_rak: trimmedValue, rak: trimmedValue });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Log Update User</label>
                      <input
                        type="text"
                        value={editingEntry.log_update_user}
                        onChange={(e) => setEditingEntry({ ...editingEntry, log_update_user: e.target.value.trimEnd() })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end space-x-3 pt-4">
                    <Button
                      onClick={() => setIsEditModalOpen(false)}
                      className="h-10 px-6 bg-white/10 hover:bg-white/20 text-slate-600 font-bold rounded-xl shadow-sm transition-all border border-slate-200 backdrop-blur-xl"
                    >
                      Batal
                    </Button>
                    <Button
                      onClick={handleUpdateEntry}
                      className="h-10 px-6 bg-gradient-to-br from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white font-bold rounded-xl shadow-[0_4px_12px_rgba(37,99,235,0.3)] transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center border border-white/20 backdrop-blur-md disabled:opacity-50"
                    >
                      Update
                    </Button>
                  </div>
                </div>
              </Modal>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 w-full bg-white"></div>
      )}
      {/* Modal Manual Date/Time Filter */}
      <Modal
        isOpen={isManualDateModalOpen}
        onClose={() => setIsManualDateModalOpen(false)}
        title={`Filter Manual: ${manualDateTarget === 'tanggal' ? 'Tanggal' : manualDateTarget === 'tglScan' ? 'Tgl Scan' : manualDateTarget === 'waktu' ? 'Waktu' : 'Tanggal'}`}
        size="sm"
      >
        <form onSubmit={handleManualFilterSubmit} className="space-y-4">
          <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 text-xs text-blue-700 mb-2">
            <p className="font-semibold mb-1 italic">Format yang didukung:</p>
            {manualDateTarget === 'waktu' ? (
              <ul className="list-disc list-inside space-y-0.5">
                <li>HH:MM (Contoh: 14:30)</li>
                <li>HH:MM:SS (Contoh: 14:30:45)</li>
                <li>Ketik sebagian jam/menit (Contoh: 14: atau 30)</li>
              </ul>
            ) : (
              <ul className="list-disc list-inside space-y-0.5">
                <li>YYYY-MM-DD (Contoh: 2026-03-06)</li>
                <li>DD-MM-YYYY (Contoh: 06-03-2026)</li>
                <li>DD/MM/YYYY (Contoh: 06/03/2026)</li>
              </ul>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {manualDateTarget === 'waktu' ? 'Masukkan Waktu:' : 'Masukkan Tanggal:'}
            </label>
            <input
              type="text"
              value={manualDateValue}
              onChange={(e) => setManualDateValue(e.target.value)}
              placeholder={manualDateTarget === 'waktu' ? "Ketik jam/waktu (HH:MM)..." : "Ketik atau paste tanggal..."}
              className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-all shadow-sm"
              autoFocus
            />
          </div>
          <div className="flex space-x-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              className="w-full h-11"
              onClick={() => setIsManualDateModalOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="w-full h-11 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold"
            >
              Terapkan Filter
            </Button>
          </div>
        </form>
      </Modal>
      {/* Modal Penjelasan Analisis Saldo */}
      <Modal
        isOpen={isAnalysisModalOpen}
        onClose={() => setIsAnalysisModalOpen(false)}
        title="Analisis Saldo Per Tgl Scan"
        size="lg"
      >
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="text-sm text-blue-700">
              <p className="font-semibold mb-1">Cara Kerja Analisis:</p>
              <p>Sistem merangkum data IN dan OUT berdasarkan kombinasi <strong>SKU + Rak + Tgl Scan</strong>.
                Saldo yang ideal adalah 0 (habis potong). Saldo negatif berarti <strong>Lebih Potong</strong>, saldo positif berarti <strong>Sisa Stok</strong>.</p>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-4 shadow-inner">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2 ml-1">Cari / Pilih SKU</label>
                <FilterDropdown
                  value={analysisSku}
                  onChange={(val) => setAnalysisSku(val)}
                  options={allSkus}
                  placeholder="Ketik nama produk..."
                  loading={dropdownsLoading}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => handleAnalyzeStockBalance(analysisSku)}
                  disabled={isAnalyzing}
                  className="h-10 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center space-x-2"
                >
                  {isAnalyzing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                  <span>{isAnalyzing ? 'Menganalisis...' : 'Mulai Analisis'}</span>
                </Button>
                {analysisResults.some(r => r.balance < 0) && (
                  <Button
                    onClick={handlePrepareRedistribute}
                    disabled={isAnalyzing}
                    className="h-10 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center space-x-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Perbaiki Lebih Potong</span>
                  </Button>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2 ml-1">Kecualikan Tgl Scan (Pisahkan dengan koma)</label>
                <div className="relative">
                  <input
                    type="text"
                    value={excludedScanDates}
                    onChange={(e) => setExcludedScanDates(e.target.value)}
                    placeholder="Contoh: 2025-12-06, No Date, 06-03-2026"
                    className="w-full px-4 py-2 pr-12 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm bg-white text-sm"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    {excludedScanDates && (
                      <button
                        onClick={() => setExcludedScanDates('')}
                        className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-red-500 transition-colors"
                        title="Bersihkan pengecualian"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    <Calendar className="h-4 w-4 text-gray-400" />
                  </div>
                </div>
                <p className="text-[10px] text-gray-500 mt-1 ml-1 italic">
                  * Data pada Tgl Scan ini tidak akan diikutkan dalam pemindahan perbaikan saldo.
                </p>
              </div>
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="Cari dalam hasil (Rak, Tgl Scan)..."
                value={analysisSearchTerm}
                onChange={(e) => setAnalysisSearchTerm(e.target.value)}
                className="w-full px-4 py-2 pl-10 pr-10 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm bg-white"
              />
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              {analysisSearchTerm && (
                <button
                  onClick={() => setAnalysisSearchTerm('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                  title="Hapus pencarian"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-auto" style={{ maxHeight: '480px' }}>
              <table className="w-full text-sm">
                <thead className="bg-gray-100 border-b border-gray-200 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">SKU</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Rak / Sub</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-700">Tgl Scan</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-700">IN</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-700">OUT</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-700">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {isAnalyzing ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-gray-500 italic">
                        <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-3 text-blue-500" />
                        Menganalisis data, mohon tunggu...
                      </td>
                    </tr>
                  ) : analysisResults.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-gray-500 italic">
                        {analysisSku ? 'Klik "Mulai Analisis" untuk memproses data.' : 'Silakan pilih SKU di atas dan klik "Mulai Analisis".'}
                      </td>
                    </tr>
                  ) : (
                    (() => {
                      const excludedList = excludedScanDates.split(',').map(d => d.trim().toUpperCase()).filter(Boolean);

                      return analysisResults
                        .filter(res =>
                          res.sku.toLowerCase().includes(analysisSearchTerm.toLowerCase()) ||
                          res.rak.toLowerCase().includes(analysisSearchTerm.toLowerCase()) ||
                          res.tglScan.toLowerCase().includes(analysisSearchTerm.toLowerCase())
                        )
                        .map((res, idx) => {
                          const normResTgl = res.tglScan.toUpperCase();
                          const isExcluded = excludedList.some(excluded => {
                            const normExcluded = formatDateDisplay(excluded).toUpperCase();
                            return normResTgl === normExcluded || normResTgl === excluded.toUpperCase();
                          });

                          return (
                            <tr
                              key={idx}
                              className={`hover:bg-gray-50 transition-colors ${isExcluded
                                ? 'bg-amber-100/70 border-l-4 border-amber-500'
                                : res.balance < 0
                                  ? 'bg-red-50'
                                  : res.balance > 0
                                    ? 'bg-green-50/30'
                                    : ''
                                }`}
                            >
                              <td className="px-4 py-3 font-medium text-gray-900">{res.sku}</td>
                              <td className="px-4 py-3 text-gray-700">
                                <div>{res.rak}</div>
                                {res.subRaks.size > 0 && !(res.subRaks.size === 1 && res.subRaks.has(res.rak)) && (
                                  <div className="text-[10px] text-gray-500 italic mt-0.5">
                                    Sub: {Array.from(res.subRaks).join(', ')}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center text-gray-600 font-mono text-xs">
                                {formatDateDisplay(res.tglScan)}
                                {isExcluded && (
                                  <div className="text-[9px] font-black text-amber-700 mt-1 uppercase tracking-tighter bg-amber-200/50 px-1 py-0.5 rounded">
                                    Dikecualikan
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center text-green-700 font-bold">{res.totalIn.toLocaleString()}</td>
                              <td className="px-4 py-3 text-center text-red-700 font-bold">{res.totalOut.toLocaleString()}</td>
                              <td className={`px-4 py-3 text-center font-black ${res.balance < 0 ? 'text-red-600 underline' : res.balance > 0 ? 'text-green-600' : 'text-gray-400 opacity-50'}`}>
                                {res.balance.toLocaleString()}
                                {res.balance < 0 && (
                                  <div className="text-[10px] no-underline font-semibold leading-tight">LEBIH POTONG</div>
                                )}
                              </td>
                            </tr>
                          );
                        });
                    })()
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-between items-center text-xs text-gray-500 px-1 py-2 italic font-medium">
            <span>* Saldo Negatif = Stok tidak cukup saat dipotong (Kurang akurat di masa lalu).</span>
            <span>* Tabel menampilkan data yang dimuat berdasarkan filter saat ini.</span>
          </div>

          <div className="flex justify-end pt-4">
            <Button
              onClick={() => setIsAnalysisModalOpen(false)}
              className="h-11 px-8 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all"
            >
              Selesai
            </Button>
          </div>
        </div>
      </Modal>
      <RedistributionPreviewModal
        isOpen={isRedistributeModalOpen}
        onClose={() => setIsRedistributeModalOpen(false)}
        moves={redistributeMoves}
        isProcessing={isProcessingRedistribution}
        onConfirm={handleExecuteRedistribute}
      />
      <Toast
        isOpen={toast.show}
        message={toast.message}
        type={toast.type}
        onClose={hideToast}
      />
    </>
  );
}

// --- REDISTRIBUTION PREVIEW MODAL ---
function RedistributionPreviewModal({ isOpen, onClose, moves, isProcessing, onConfirm }: {
  isOpen: boolean,
  onClose: () => void,
  moves: any[],
  isProcessing: boolean,
  onConfirm: () => void
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Preview Perbaikan Saldo (Lebih Potong)" size="xl">
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-bold mb-1">Peringatan Migrasi Data:</p>
            <p>Sistem akan memindahkan data <strong>OUT</strong> yang menyebabkan saldo negatif ke baris data yang memiliki saldo sisa (Surplus).
              Ini dilakukan dengan memperbarui kolom <strong>Tgl Scan</strong> pada baris transaksi OUT tersebut.</p>
          </div>
        </div>

        <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="max-h-[400px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left">SKU / Rak</th>
                  <th className="px-4 py-2 text-center text-red-600">Dari Tgl Scan</th>
                  <th className="px-4 py-2 text-center text-green-600">Ke Tgl Scan</th>
                  <th className="px-4 py-2 text-center">Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 italic">
                {moves.map((m, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <div className="font-bold">{m.sku}</div>
                      <div className="text-xs text-gray-500">{m.rak}</div>
                    </td>
                    <td className="px-4 py-2 text-center text-red-500 font-mono text-xs">
                      {m.fromTgl || '(KOSONG)'}
                    </td>
                    <td className="px-4 py-2 text-center text-green-600 font-mono text-xs font-bold">
                      {m.toTgl || '(KOSONG)'}
                    </td>
                    <td className="px-4 py-2 text-center font-bold">{m.jumlah}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-200">
          <div className="text-sm font-medium text-gray-700">
            Total Rekomendasi: <span className="text-blue-600 font-bold">{moves.length} baris</span>
          </div>
          <div className="flex space-x-3">
            <Button onClick={onClose} variant="secondary" disabled={isProcessing}>
              Batal
            </Button>
            <Button
              onClick={onConfirm}
              disabled={isProcessing}
              className="px-8 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold rounded-xl shadow-lg flex items-center space-x-2"
            >
              {isProcessing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              <span>{isProcessing ? 'Memproses...' : 'Terapkan Perbaikan'}</span>
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

interface FilterDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  loading?: boolean;
}

function FilterDropdown({ value, onChange, options, placeholder, loading = false }: FilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filteredOptions, setFilteredOptions] = useState<string[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (value && value.trim() !== '') {
      const searchTerm = value.toLowerCase().trim();
      const filtered = options.filter(option =>
        String(option).toLowerCase().includes(searchTerm)
      );
      // Limit to 100 to avoid performance issues and display noise
      setFilteredOptions(filtered.slice(0, 100));
    } else {
      setFilteredOptions(options.slice(0, 100));
    }
    setHighlightedIndex(0);
  }, [value, options]);

  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && highlightedIndex < itemRefs.current.length) {
      const highlightedElement = itemRefs.current[highlightedIndex];
      if (highlightedElement && listRef.current) {
        const listRect = listRef.current.getBoundingClientRect();
        const itemRect = highlightedElement.getBoundingClientRect();

        if (itemRect.bottom > listRect.bottom) {
          highlightedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else if (itemRect.top < listRect.top) {
          highlightedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleFocus = () => {
    if (loading) return;
    console.log('FilterDropdown focused, options:', options.length, 'filtered:', filteredOptions.length);
    setIsOpen(true);
    setHighlightedIndex(0);
  };

  const handleClick = () => {
    if (loading) return;
    console.log('FilterDropdown clicked, options:', options.length, 'filtered:', filteredOptions.length);
    setIsOpen(true);
    setHighlightedIndex(0);
  };

  const handleOptionSelect = (option: string) => {
    onChange(option);
    setIsOpen(false);
  };

  const handleClearClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onChange('');
    setIsOpen(false);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    if (!isOpen && !loading) {
      setIsOpen(true);
      setHighlightedIndex(0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (loading) return;
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setIsOpen(true);
        setHighlightedIndex(0);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => {
          const nextIndex = prev < filteredOptions.length - 1 ? prev + 1 : 0;
          return nextIndex;
        });
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => {
          const nextIndex = prev > 0 ? prev - 1 : filteredOptions.length - 1;
          return nextIndex;
        });
        break;
      case 'Enter':
      case 'Tab':
        e.preventDefault();
        if (filteredOptions[highlightedIndex]) {
          handleOptionSelect(filteredOptions[highlightedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const showButton = value && value.trim() !== '';

  return (
    <div ref={dropdownRef} className="relative w-full">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          className={`w-full px-3 py-2 pr-8 border border-gray-300 border-t-0 rounded-b-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${loading ? 'opacity-50 cursor-wait' : ''}`}
          placeholder={loading ? 'Memuat data...' : placeholder}
          autoComplete="off"
          disabled={loading}
        />
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center space-x-1">
          {showButton && (
            <button
              onClick={handleClearClick}
              className="text-gray-400 hover:text-gray-600 pointer-events-auto"
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <ChevronDown className="h-4 w-4 text-gray-400 pointer-events-none" />
        </div>
      </div>
      {isOpen && filteredOptions.length > 0 && (
        <div
          ref={listRef}
          className="absolute z-[100] w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto"
        >
          {filteredOptions.map((option, index) => (
            <div
              key={`${option}-${index}`}
              ref={el => itemRefs.current[index] = el}
              onClick={() => handleOptionSelect(option)}
              className={`px-3 py-2 cursor-pointer text-sm ${index === highlightedIndex
                ? 'bg-blue-100 text-blue-900'
                : 'hover:bg-gray-100'
                }`}
            >
              {option}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface EditDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  loading?: boolean;
}

function EditDropdown({ value, onChange, options, placeholder, loading = false }: EditDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filteredOptions, setFilteredOptions] = useState<string[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (value && value.trim() !== '') {
      const searchTerm = value.toLowerCase().trim();
      const filtered = options.filter(option =>
        String(option).toLowerCase().includes(searchTerm)
      );

      // Limit to 100 for performance
      const limited = filtered.slice(0, 100);
      setFilteredOptions(limited);

      const exactMatchIndex = limited.findIndex(option =>
        option.toLowerCase() === searchTerm
      );
      if (exactMatchIndex !== -1) {
        setHighlightedIndex(exactMatchIndex);
      } else {
        const startsWithIndex = limited.findIndex(option =>
          option.toLowerCase().startsWith(searchTerm)
        );
        setHighlightedIndex(startsWithIndex !== -1 ? startsWithIndex : 0);
      }
    } else {
      setFilteredOptions(options.slice(0, 100));
      setHighlightedIndex(0);
    }
  }, [value, options]);

  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && highlightedIndex < itemRefs.current.length) {
      const highlightedElement = itemRefs.current[highlightedIndex];
      if (highlightedElement && listRef.current) {
        const listRect = listRef.current.getBoundingClientRect();
        const itemRect = highlightedElement.getBoundingClientRect();

        if (itemRect.bottom > listRect.bottom) {
          highlightedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else if (itemRect.top < listRect.top) {
          highlightedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleFocus = () => {
    if (loading) return;
    setIsOpen(true);
    setHighlightedIndex(0);
  };

  const handleClick = () => {
    if (loading) return;
    setIsOpen(true);
    setHighlightedIndex(0);
  };

  const handleOptionSelect = (option: string) => {
    onChange(option);
    setIsOpen(false);
  };

  const handleClearClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onChange('');
    setIsOpen(false);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    if (!loading) {
      setIsOpen(true);
      setHighlightedIndex(0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (loading) return;
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setIsOpen(true);
        setHighlightedIndex(0);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => {
          const nextIndex = prev < filteredOptions.length - 1 ? prev + 1 : 0;
          return nextIndex;
        });
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => {
          const nextIndex = prev > 0 ? prev - 1 : filteredOptions.length - 1;
          return nextIndex;
        });
        break;
      case 'Enter':
      case 'Tab':
        e.preventDefault();
        if (filteredOptions[highlightedIndex]) {
          handleOptionSelect(filteredOptions[highlightedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const showButton = value && value.trim() !== '';

  return (
    <div ref={dropdownRef} className="relative w-full">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          className={`w-full px-3 py-2 pr-8 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${loading ? 'opacity-50 cursor-wait' : ''}`}
          placeholder={loading ? 'Memuat data...' : placeholder}
          autoComplete="off"
          disabled={loading}
        />
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center space-x-1">
          {showButton && (
            <button
              onClick={handleClearClick}
              className="text-gray-400 hover:text-gray-600 pointer-events-auto"
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <ChevronDown className="h-4 w-4 text-gray-400 pointer-events-none" />
        </div>
      </div>
      {isOpen && filteredOptions.length > 0 && (
        <div
          ref={listRef}
          className="absolute z-[100] w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto"
        >
          {filteredOptions.map((option, index) => (
            <div
              key={`${option}-${index}`}
              ref={el => itemRefs.current[index] = el}
              onClick={() => handleOptionSelect(option)}
              className={`px-3 py-2 cursor-pointer text-sm ${index === highlightedIndex
                ? 'bg-blue-100 text-blue-900'
                : 'hover:bg-gray-100'
                }`}
            >
              {option}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}