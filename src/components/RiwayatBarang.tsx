import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Toast } from './ui/Toast';
import { Modal } from './ui/Modal';
import { Download, X, RefreshCw, QrCode, ChevronDown, Filter, Calendar, Package, Building, Layers, ArrowRightLeft, List, Tag, Calculator, AlertCircle, Search, Edit2, ArrowRight, CheckCircle, ArrowUpDown, Database, History } from 'lucide-react';
import { supabase, fetchAllProducts } from '../lib/supabase';
import { runDateMigration } from '../lib/dateMigration';
import { realtimeManager } from '../lib/realtimeManager';
import { useAuth } from '../lib/AuthContext';
import { saveExportHistory } from '../lib/exportHistoryService';
import { ExportHistoryModal } from './ExportHistoryModal';
import { subscribeAppSettingsChange } from '../lib/settingsSync';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

// --- Konstanta Cache ---
const CACHE_KEY_PRODUCTS = 'riwayat_barang_products_cache';
const CACHE_KEY_WAREHOUSES = 'riwayat_barang_warehouses_cache';
const CACHE_KEY_RACKS = 'riwayat_barang_racks_cache';
const CACHE_KEY_TIMESTAMP = 'riwayat_barang_metadata_timestamp';
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 jam (Too old, must block and refresh)

// --- Interface dan Tipe Data ---
interface HistoryItem {
  id: string;
  tgl: string;
  waktu: string;
  sku: string;
  jumlah: number;
  type: 'IN' | 'OUT' | 'MOVE';
  gudang: string;
  rak: string;
  tgl_scan: string;
  user_name: string;
  is_adjustment?: boolean;
}

interface Warehouse {
  id: string;
  nama: string;
  status: string;
}

interface RackLocation {
  id: string;
  nama: string;
  status: string;
}

interface Product {
  id: string;
  nama: string;
  status: string;
}

interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

// --- Custom Dropdown Component ---
interface CustomDropdownProps {
  value: string;
  onChange: (event: { target: { value: string } }) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  isInTable?: boolean;
  loading?: boolean;
  showClearButton?: boolean;
}

function CustomDropdown({ value, onChange, options, placeholder, className, isInTable = false, loading = false, showClearButton = false }: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [dropdownPosition, setDropdownPosition] = useState<'bottom' | 'top'>('bottom');
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const filteredOptions = React.useMemo(() => {
    if (!value) return options.slice(0, 50);
    const lowerValue = value.toLowerCase();
    return options.filter(option =>
      option.toLowerCase().includes(lowerValue)
    ).slice(0, 50);
  }, [value, options]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredOptions]);

  useEffect(() => {
    if (isOpen && optionRefs.current[highlightedIndex] && filteredOptions.length > 0) {
      optionRefs.current[highlightedIndex]?.scrollIntoView({
        behavior: 'instant',
        block: 'nearest'
      });
    }
  }, [highlightedIndex, isOpen]);

  const calculatePosition = () => {
    if (dropdownRef.current && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const dropdownHeight = Math.min(200, filteredOptions.length * 36);

      if (isInTable) {
        const style: React.CSSProperties = {
          position: 'fixed',
          left: rect.left,
          top: rect.bottom + 4,
          width: rect.width,
          zIndex: 9999,
          maxHeight: '200px'
        };

        if (spaceBelow < dropdownHeight + 10 && spaceAbove > dropdownHeight + 10) {
          style.top = 'unset';
          style.bottom = window.innerHeight - rect.top + 4;
          setDropdownPosition('top');
        } else {
          setDropdownPosition('bottom');
        }

        setDropdownStyle(style);
      } else {
        setDropdownStyle({});
        if (spaceBelow < 150 && spaceAbove > 150) {
          setDropdownPosition('top');
        } else {
          setDropdownPosition('bottom');
        }
      }
    }
  };

  const handleFocus = () => {
    if (loading) return;
    setIsOpen(true);
    setHighlightedIndex(0);
    calculatePosition();
  };

  const handleOptionSelect = (option: string) => {
    onChange({ target: { value: option } });
    setIsOpen(false);
  };

  const handleClearClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onChange({ target: { value: '' } });
    setIsOpen(false);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ target: { value: e.target.value } });
    if (!isOpen && !loading) {
      setIsOpen(true);
      setHighlightedIndex(0);
      calculatePosition();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (loading) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setIsOpen(true);
        setHighlightedIndex(0);
        calculatePosition();
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
        e.preventDefault();
        if (filteredOptions[highlightedIndex]) {
          handleOptionSelect(filteredOptions[highlightedIndex]);
        }
        break;

      case 'Tab':
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

  useEffect(() => {
    const handleResizeOrScroll = () => {
      if (isOpen) {
        calculatePosition();
      }
    };

    window.addEventListener('resize', handleResizeOrScroll);
    window.addEventListener('scroll', handleResizeOrScroll, true);
    return () => {
      window.removeEventListener('resize', handleResizeOrScroll);
      window.removeEventListener('scroll', handleResizeOrScroll, true);
    };
  }, [isOpen]);

  useEffect(() => {
    optionRefs.current = optionRefs.current.slice(0, filteredOptions.length);
  }, [filteredOptions.length]);

  const showButton = showClearButton && value.trim() !== '';

  return (
    <div ref={dropdownRef} className="relative w-full">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          className={`w-full px-4 py-2.5 pr-${showButton ? '14' : '10'} border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 ${className} ${loading ? 'opacity-50 cursor-wait' : ''}`}
          placeholder={loading ? 'Memuat data...' : placeholder}
          autoComplete="off"
          disabled={loading}
        />
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center space-x-1 pointer-events-none">
          {showButton && (
            <button
              onClick={handleClearClick}
              className="p-1 px-1.5 bg-gray-100/50 hover:bg-gray-200 text-gray-500 hover:text-gray-700 rounded-md transition-all backdrop-blur-sm border border-gray-200 pointer-events-auto"
              aria-label="Hapus input"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {loading ? (
            <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full ml-1"></div>
          ) : (
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''} pointer-events-auto`} />
          )}
        </div>
      </div>

      {isOpen && !loading && filteredOptions.length > 0 && (
        <div
          className={`bg-white border border-gray-200 rounded-lg shadow-xl overflow-y-scroll scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent ${isInTable
            ? ''
            : `absolute left-0 right-0 z-50 max-h-60 ${dropdownPosition === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'}`
            }`}
          style={isInTable ? { ...dropdownStyle, maxHeight: '240px', overflowY: 'scroll' } : { zIndex: 9999 }}
        >
          {filteredOptions.map((option, index) => (
            <div
              ref={el => optionRefs.current[index] = el}
              key={index}
              onClick={() => handleOptionSelect(option)}
              className={`px-3 py-2 text-sm cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors ${index === highlightedIndex
                ? 'bg-blue-500 text-white font-medium'
                : 'hover:bg-blue-50 hover:text-blue-700'
                }`}
            >
              {option}
            </div>
          ))}
          {options.length > 50 && (
            <div className="px-3 py-2 text-xs text-gray-500 bg-gray-50 border-t">
              Menampilkan 50 dari {options.length.toLocaleString()} opsi
            </div>
          )}
        </div>
      )}

      {isOpen && !loading && filteredOptions.length === 0 && value && (
        <div
          className={`bg-white border border-gray-300 rounded-md shadow-xl ${isInTable
            ? ''
            : `absolute left-0 right-0 z-50 ${dropdownPosition === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'}`
            }`}
          style={isInTable ? dropdownStyle : { zIndex: 9999 }}
        >
          <div className="px-3 py-2 text-sm text-gray-500">
            Tidak ada data yang cocok dengan "{value}"
          </div>
        </div>
      )}
    </div>
  );
}

// --- Komponen Utama ---

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

export function RiwayatBarang() {
  // --- State Komponen ---
  const [historyData, setHistoryData] = useState<HistoryItem[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [rackLocations, setRackLocations] = useState<RackLocation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(500);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [isUpdatingInBackground, setIsUpdatingInBackground] = useState(false);
  const [hideRiwayatStats, setHideRiwayatStats] = useState<boolean>(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const { userName, userRole, userEmail } = useAuth();

  useEffect(() => {
    const fetchStatsSetting = async () => {
      try {
        const { data: settingsData } = await supabase
          .from('app_settings')
          .select('key, value')
          .in('key', ['hide_riwayat_stats', 'riwayat_stats_target_mode', 'riwayat_stats_allowed_roles']);

        if (settingsData && settingsData.length > 0) {
          const map = new Map(settingsData.map((s: any) => [s.key, s.value]));
          const isGloballyHidden = map.get('hide_riwayat_stats') === 'true';
          const targetMode = map.get('riwayat_stats_target_mode') || 'all';
          const allowedRolesRaw = map.get('riwayat_stats_allowed_roles');
          
          let allowedRoles: string[] = ['developer', 'staf_admin', 'staf_gudang'];
          if (allowedRolesRaw) {
            try {
              allowedRoles = JSON.parse(allowedRolesRaw);
            } catch (e) {
              allowedRoles = ['developer', 'staf_admin', 'staf_gudang'];
            }
          }

          if (isGloballyHidden) {
            setHideRiwayatStats(true);
          } else if (targetMode === 'roles') {
            const currentRole = userRole || localStorage.getItem('cached_user_role') || '';
            const isDev = userEmail === 'rianambong@gmail.com' || userEmail === 'kepin@gmail.com' || userEmail === 'admin@gmail.com' || localStorage.getItem('devmode') === 'true' || currentRole === 'developer';
            
            if (isDev && allowedRoles.includes('developer')) {
              setHideRiwayatStats(false);
            } else if (currentRole && allowedRoles.includes(currentRole)) {
              setHideRiwayatStats(false);
            } else {
              setHideRiwayatStats(true);
            }
          } else {
            setHideRiwayatStats(false);
          }
        }
      } catch (err) {
        console.error('Error loading riwayat stats setting:', err);
      }
    };

    fetchStatsSetting();

    // Subscribe to unified zero-delay real-time sync across local tabs, broadcast channel, and Supabase
    const unsubscribeSettings = subscribeAppSettingsChange(() => {
      fetchStatsSetting();
    });

    const subId = realtimeManager.subscribe('app_settings', () => {
      fetchStatsSetting();
    });

    return () => {
      unsubscribeSettings();
      realtimeManager.unsubscribe(subId);
    };
  }, [userRole, userEmail]);
  const [qrModalData, setQrModalData] = useState<{ sku: string; tgl: string; tgl_scan: string } | null>(null);
  const [filters, setFilters] = useState({
    barang: '',
    tanggal_awal: '',
    tanggal_akhir: '',
    type: '',
    inisial_gudang: '',
    rak: '',
    tanggal_scan: '',
    hanya_penyesuaian: false
  });
  const [paginationInfo, setPaginationInfo] = useState<PaginationInfo>({
    currentPage: 1,
    totalPages: 0,
    totalCount: 0,
    hasNextPage: false,
    hasPrevPage: false
  });
  const [showGudangDropdown, setShowGudangDropdown] = useState(false);
  const [barangSearchTerm, setBarangSearchTerm] = useState('');
  const [gudangSearchTerm, setGudangSearchTerm] = useState('');
  const [rakSearchTerm, setRakSearchTerm] = useState('');
  const gudangInputRef = useRef<HTMLInputElement>(null);
  const gudangDropdownRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<{
    isOpen: boolean;
    message: string;
    type: 'success' | 'info' | 'warning' | 'error';
  }>({
    isOpen: false,
    message: '',
    type: 'info'
  });
  const [isDevMode, setIsDevMode] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);

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
  const [limitBeforeDate, setLimitBeforeDate] = useState('');
  const [limitAfterDate, setLimitAfterDate] = useState('');

  // --- RAK MISMATCH ANALYSIS STATE ---
  interface RakMismatchResult {
    sku: string;
    tglScanRaw: string;
    normalizedTglScan: string;
    inRak: string;
    inSubRak: string;
    outRak: string;
    outSubRak: string;
    inTotal: number;
    outTotal: number;
    outRowIds: string[];
    status: 'mismatch' | 'overcut';
  }
  const [rakMismatchResults, setRakMismatchResults] = useState<RakMismatchResult[]>([]);
  const [isRakMismatchAnalyzing, setIsRakMismatchAnalyzing] = useState(false);
  const [isRakMismatchFixing, setIsRakMismatchFixing] = useState(false);
  const [activeAnalysisTab, setActiveAnalysisTab] = useState<'balance' | 'mismatch'>('balance');



  const handleAnalyzeRakMismatch = async (skuToAnalyze?: string) => {
    if (!skuToAnalyze) {
      showToast('Silakan pilih atau cari SKU terlebih dahulu untuk melakukan analisis.', 'warning');
      return;
    }

    try {
      setIsRakMismatchAnalyzing(true);
      setRakMismatchResults([]);
      showToast('Memulai analisis rak beda antara IN & OUT...', 'info');

      let query = supabase
        .from('database_log')
        .select('id, sku, rak, sub_rak, tgl_scan, type, jumlah')
        .or('type.ilike.%IN%,type.ilike.%OUT%')
        .order('id', { ascending: true });

      if (skuToAnalyze) {
        query = query.ilike('sku', skuToAnalyze.trim());
      }

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
      }

      // Group by SKU + TglScan
      const groups = new Map<string, any[]>();
      allLogs.forEach(log => {
        const normSku = (log.sku || '').trim().toUpperCase();
        const normTglScan = formatDateDisplay(log.tgl_scan) || 'No Date';
        const key = `${normSku}|${normTglScan}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(log);
      });

      const results: RakMismatchResult[] = [];

      groups.forEach((logs, key) => {
        const [sku, tglScan] = key.split('|');

        // Calculate balance per Rak|SubRak
        const rakBalances = new Map<string, { rak: string, subRak: string, balance: number, outRows: any[], inTotal: number, outTotal: number }>();

        logs.forEach(log => {
          const normType = (log.type || '').trim().toUpperCase();
          const finalType = normType.includes('IN') ? 'IN' : 'OUT';
          const r = (log.rak || '').trim();
          const sr = (log.sub_rak || '').trim();
          const rakKey = `${r}|${sr}`;

          if (!rakBalances.has(rakKey)) {
            rakBalances.set(rakKey, { rak: r, subRak: sr, balance: 0, outRows: [], inTotal: 0, outTotal: 0 });
          }

          const rb = rakBalances.get(rakKey)!;
          const qty = Number(log.jumlah || 0);

          if (finalType === 'IN') {
            rb.balance += qty;
            rb.inTotal += qty;
          } else {
            rb.balance -= qty;
            rb.outTotal += qty;
            rb.outRows.push({ id: log.id, jumlah: qty });
          }
        });

        const surpluses = Array.from(rakBalances.values()).filter(rb => rb.balance > 0);
        const deficits = Array.from(rakBalances.values()).filter(rb => rb.balance < 0);

        deficits.forEach(def => {
          // Sort out rows by largest first
          const outRows = [...def.outRows].sort((a, b) => b.jumlah - a.jumlah);
          let currentDeficit = Math.abs(def.balance);

          for (const row of outRows) {
            if (currentDeficit <= 0) break;

            // Find a surplus rak to move this OUT row to (prioritize exact fit, or just any surplus)
            const targetSurplus = surpluses.find(s => s.balance >= row.jumlah) || surpluses.find(s => s.balance > 0);

            if (targetSurplus) {
              results.push({
                sku,
                tglScanRaw: tglScan,
                normalizedTglScan: tglScan,
                inRak: targetSurplus.rak,
                inSubRak: targetSurplus.subRak,
                outRak: def.rak,
                outSubRak: def.subRak,
                inTotal: targetSurplus.inTotal,
                outTotal: row.jumlah,
                outRowIds: [row.id],
                status: def.inTotal === 0 ? 'mismatch' : 'overcut'
              });

              targetSurplus.balance -= row.jumlah;
              currentDeficit -= row.jumlah;
            }
          }
        });
      });

      setRakMismatchResults(results);
      if (results.length > 0) {
        showToast(`Analisis selesai! Menemukan ${results.length} rekomendasi perbaikan rak.`, 'success');
      } else {
        showToast('Analisis selesai! Tidak ditemukan ketidakcocokan rak.', 'success');
      }

    } catch (error: any) {
      console.error('Analysis mismatch failed:', error);
      const isNetworkError = !navigator.onLine || (error?.message || '').includes('Failed to fetch');
      if (isNetworkError) {
        showToast('❌ Koneksi terputus (Network Offline). Periksa internet Anda lalu coba lagi.', 'error');
      } else {
        showToast(`❌ Gagal melakukan analisis rak: ${error?.message || 'Terjadi kesalahan sistem'}`, 'error');
      }
    } finally {
      setIsRakMismatchAnalyzing(false);
    }
  };

  const handleFixRakMismatch = async () => {
    if (rakMismatchResults.length === 0) return;

    try {
      setIsRakMismatchFixing(true);
      showToast(`Memproses ${rakMismatchResults.length} perbaikan rak...`, 'info');

      let successCount = 0;
      for (const res of rakMismatchResults) {
        for (const rowId of res.outRowIds) {
          const { error } = await supabase
            .from('database_log')
            .update({ rak: res.inRak, sub_rak: res.inSubRak })
            .eq('id', rowId);
          if (!error) successCount++;
        }
      }

      showToast(`Sukses memperbarui rak/sub_rak pada ${successCount} data log!`, 'success');
      setRakMismatchResults([]);
      if (analysisSku) {
        handleAnalyzeRakMismatch(analysisSku);
      } else {
        handleAnalyzeRakMismatch();
      }

    } catch (error) {
      console.error('Error fixing rak mismatch:', error);
      showToast('Terjadi kesalahan saat mengeksekusi perbaikan rak.', 'error');
    } finally {
      setIsRakMismatchFixing(false);
    }
  };


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
        if (excludedList.some(excluded => {
          const normExcluded = formatDateDisplay(excluded).toUpperCase();
          return normTgl === normExcluded || normTgl === excluded.toUpperCase();
        })) return true;

        if (limitBeforeDate || limitAfterDate) {
          const targetDate = new Date(g.normalizedTglScan);
          if (isNaN(targetDate.getTime())) return true;

          if (limitBeforeDate) {
            const limitBefore = new Date(limitBeforeDate);
            if (targetDate > limitBefore) return true;
          }
          if (limitAfterDate) {
            const limitAfter = new Date(limitAfterDate);
            if (targetDate < limitAfter) return true;
          }
        }

        return false;
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

  const handleRunMigration = async () => {
    if (!window.confirm('PERINGATAN: Memperbaiki format tanggal akan mengubah data di database. Pastikan Anda tahu apa yang Anda lakukan. Lanjutkan?')) {
      return;
    }

    setIsMigrating(true);
    showToast('Memulai perbaikan format tanggal...', 'info');

    try {
      const updatedCount = await runDateMigration((current) => {
        if (current % 100 === 0) {
          // Optional: update toast or UI with progress if needed
        }
      });
      showToast(`Berhasil memperbaiki ${updatedCount} data tanggal!`, 'success');
      loadHistoryData(); // Refresh data
    } catch (error) {
      console.error('Migration failed:', error);
      showToast('Gagal memperbaiki data tanggal', 'error');
    } finally {
      setIsMigrating(false);
    }
  };

  // --- Fungsi dan Hooks ---
  const showToast = useCallback((message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') => {
    setToast({ isOpen: true, message, type });
    setTimeout(() => {
      setToast({ isOpen: false, message: '', type: 'info' });
    }, 4000);
  }, []);

  // --- PERUBAHAN LOGIKA TOGGLE ADA DI SINI ---
  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('devModeEnabled') === 'true') {
      setIsDevMode(true);
    }
    let keySequence = '';
    const targetSequence = 'DEVMODE';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      keySequence += event.key.toUpperCase();
      if (keySequence.length > targetSequence.length) {
        keySequence = keySequence.slice(-targetSequence.length);
      }
      if (keySequence === targetSequence) {
        // Logika Toggle
        setIsDevMode(prevIsDevMode => {
          const newIsDevMode = !prevIsDevMode;
          if (newIsDevMode) {
            localStorage.setItem('devmode', 'true');
            showToast('Developer mode diaktifkan!', 'success');
          } else {
            localStorage.removeItem('devmode');
            showToast('Developer mode dinonaktifkan.', 'warning');
          }
          return newIsDevMode;
        });
        keySequence = '';
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', handleKeyDown);
      }
    };
  }, [showToast]);

  useEffect(() => {
    loadInitialMetadata();
  }, []);



  useEffect(() => {
    setBarangSearchTerm(filters.barang);
  }, [filters.barang]);

  useEffect(() => {
    setGudangSearchTerm(filters.inisial_gudang);
  }, [filters.inisial_gudang]);

  useEffect(() => {
    setRakSearchTerm(filters.rak);
  }, [filters.rak]);

  const loadInitialMetadata = async (forceRefresh = false) => {
    try {
      // 1. Cek Cacahe terlebih dahulu
      const cachedTimestamp = localStorage.getItem(CACHE_KEY_TIMESTAMP);
      const cachedProducts = localStorage.getItem(CACHE_KEY_PRODUCTS);
      const cachedWarehouses = localStorage.getItem(CACHE_KEY_WAREHOUSES);
      const cachedRacks = localStorage.getItem(CACHE_KEY_RACKS);

      const now = Date.now();
      const isExpired = !cachedTimestamp || (now - parseInt(cachedTimestamp)) > CACHE_EXPIRY_MS;

      // Jika ada cache dan tidak expired (dan tidak force refresh), gunakan dulu agar UI instan
      if (!forceRefresh && !isExpired && cachedProducts && cachedWarehouses && cachedRacks) {
        setProducts(JSON.parse(cachedProducts));
        setWarehouses(JSON.parse(cachedWarehouses));
        setRackLocations(JSON.parse(cachedRacks));
        setDataLoaded(true);
        setInitialLoading(false);

        // Langsung sync di background agar pilihan dropdown selalu update
        updateMetadataInBackground();
        return;
      }

      // 2. Jika tidak ada cache, expired, atau force refresh: Lakukan fetch penuh dengan loader
      setInitialLoading(true);
      setLoadingProgress(0);
      setLoadingMessage('Mempersiapkan data...');

      await performFullMetadataFetch();

    } catch (error) {
      console.error('Error loading metadata:', error);
      showToast('Gagal memuat metadata', 'error');
    } finally {
      setInitialLoading(false);
      setLoadingProgress(0);
      setLoadingMessage('');
    }
  };

  const performFullMetadataFetch = async () => {
    setLoadingMessage('Mengambil data produk...');

    // Fetch Products with progress
    const productsResult = await fetchAllProducts((current, total) => {
      const percent = Math.round((current / total) * 100);
      setLoadingProgress(percent);
      setLoadingMessage(`Mengambil data produk... (${percent}%)`);
    });

    if (!productsResult.success) {
      throw new Error('Failed to load products');
    }

    const productsData = productsResult.data
      .filter(item => item.status === 'Aktif')
      .map(item => ({
        id: item.id,
        nama: item.nama,
        status: item.status
      }))
      .sort((a, b) => a.nama.localeCompare(b.nama));

    setLoadingMessage('Mengambil data gudang & rak...');
    const [warehouseData, rackData] = await Promise.all([
      fetchWarehouses(),
      fetchRackLocations()
    ]);

    // Update States
    setProducts(productsData);
    setWarehouses(warehouseData);
    setRackLocations(rackData);
    setDataLoaded(true);

    // Save to Cache
    localStorage.setItem(CACHE_KEY_PRODUCTS, JSON.stringify(productsData));
    localStorage.setItem(CACHE_KEY_WAREHOUSES, JSON.stringify(warehouseData));
    localStorage.setItem(CACHE_KEY_RACKS, JSON.stringify(rackData));
    localStorage.setItem(CACHE_KEY_TIMESTAMP, Date.now().toString());
  };

  const updateMetadataInBackground = async () => {
    if (isUpdatingInBackground) return;
    setIsUpdatingInBackground(true);

    try {
      console.log('🔄 Syncing metadata in background...');
      const productsResult = await fetchAllProducts();

      if (productsResult.success) {
        const productsData = productsResult.data
          .filter(item => item.status === 'Aktif')
          .map(item => ({
            id: item.id,
            nama: item.nama,
            status: item.status
          }))
          .sort((a, b) => a.nama.localeCompare(b.nama));

        const [warehouseData, rackData] = await Promise.all([
          fetchWarehouses(),
          fetchRackLocations()
        ]);

        // Silent update to state and cache
        setProducts(productsData);
        setWarehouses(warehouseData);
        setRackLocations(rackData);

        localStorage.setItem(CACHE_KEY_PRODUCTS, JSON.stringify(productsData));
        localStorage.setItem(CACHE_KEY_WAREHOUSES, JSON.stringify(warehouseData));
        localStorage.setItem(CACHE_KEY_RACKS, JSON.stringify(rackData));
        localStorage.setItem(CACHE_KEY_TIMESTAMP, Date.now().toString());
        console.log('✅ Background sync complete.');
      }
    } catch (err) {
      console.error('Background sync failed:', err);
    } finally {
      setIsUpdatingInBackground(false);
    }
  };

  const fetchWarehouses = async (): Promise<Warehouse[]> => {
    const { data, error } = await supabase
      .from('warehouses')
      .select('id, nama, status')
      .eq('status', 'Aktif')
      .order('nama', { ascending: true });
    if (error) throw error;
    return data || [];
  };

  const fetchRackLocations = async (): Promise<RackLocation[]> => {
    const { data, error } = await supabase
      .from('rack_locations')
      .select('id, nama, status')
      .eq('status', 'Aktif')
      .order('nama', { ascending: true });
    if (error) throw error;
    return data || [];
  };

  // Re-define loadWarehouses and loadRackLocations to use the new fetchers
  const handleManualRefresh = () => {
    loadInitialMetadata(true);
  };

  const parseDateFlexible = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    const cleanStr = dateStr.trim();
    const formats = [
      /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/,
      /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/,
      /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/,
      /^(\d{1,2})[\/\-](\d{1,2})$/
    ];
    for (let i = 0; i < formats.length; i++) {
      const match = cleanStr.match(formats[i]);
      if (match) {
        let day = 0, month = 0, year = 0;
        if (i === 0 || i === 1) {
          day = parseInt(match[1]);
          month = parseInt(match[2]) - 1;
          year = parseInt(match[3]);
          if (i === 1 && year < 100) {
            year += 2000;
          }
        } else if (i === 2) {
          year = parseInt(match[1]);
          month = parseInt(match[2]) - 1;
          day = parseInt(match[3]);
        } else if (i === 3) {
          day = parseInt(match[1]);
          month = parseInt(match[2]) - 1;
          year = new Date().getFullYear();
        }
        const date = new Date(year, month, day);
        if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) {
          return date;
        }
      }
    }
    return null;
  };

  const formatDateToIndonesian = (dateStr: string): string => {
    const parsedDateVal = parseDateFlexible(dateStr);
    if (!parsedDateVal) return dateStr;
    const day = String(parsedDateVal.getDate()).padStart(2, '0');
    const month = String(parsedDateVal.getMonth() + 1).padStart(2, '0');
    const year = parsedDateVal.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const formatDateToISO = (dateStr: string): string => {
    const parsedDateVal = parseDateFlexible(dateStr);
    if (!parsedDateVal) return dateStr;
    const year = parsedDateVal.getFullYear();
    const month = String(parsedDateVal.getMonth() + 1).padStart(2, '0');
    const day = String(parsedDateVal.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDateForSearch = (date: Date): string[] => {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const year2 = year.toString().slice(-2);
    return [
      `${day}/${month}/${year}`,
      `${day}/${month}/${year2}`,
      `${day}-${month}-${year}`,
      `${day}-${month}-${year2}`,
      `${year}-${month}-${day}`,
      `${day}/${month}`,
      `${day}-${month}`
    ];
  };

  const getDatesInRange = (startDate: Date, endDate: Date): string[] => {
    const dates: string[] = [];
    const currentDate = new Date(startDate);
    currentDate.setHours(12, 0, 0, 0); // Avoid timezone issues

    const end = new Date(endDate);
    end.setHours(12, 0, 0, 0);

    while (currentDate <= end) {
      const day = String(currentDate.getDate()).padStart(2, '0');
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const year = currentDate.getFullYear();

      // Push ALL potential formats that might constitute "this date" in the DB
      dates.push(`${day}/${month}/${year}`); // Legacy format
      dates.push(`${year}-${month}-${day}`); // New format (InputBarangMasuk)

      currentDate.setDate(currentDate.getDate() + 1);
    }
    return dates;
  };

  const loadHistoryData = useCallback(async () => {
    if (!filters.tanggal_awal || !filters.tanggal_akhir) {
      return;
    }
    try {
      setLoading(true);
      const startDate = parseDateFlexible(filters.tanggal_awal);
      const endDate = parseDateFlexible(filters.tanggal_akhir);
      if (!startDate || !endDate) {
        showToast('Format tanggal tidak valid. Gunakan format DD/MM/YYYY, DD-MM-YYYY, atau YYYY-MM-DD', 'error');
        return;
      }
      // Generate list of dates to filter by 'tgl' column
      const dateList = getDatesInRange(startDate, endDate);

      // Calculate range for pagination
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase
        .from('database_log')
        .select('*', { count: 'exact' })
        .not('gudang', 'in', '("VERIFY","UNVERIFY")')
        .in('tgl', dateList); // Base filter

      // Apply conditional filters BEFORE sorting/pagination
      if (filters.barang) {
        query = query.eq('sku', filters.barang);
      }
      if (filters.type) {
        query = query.eq('type', filters.type);
      }
      if (filters.inisial_gudang) {
        query = query.eq('gudang', filters.inisial_gudang);
      }
      if (filters.rak) {
        query = query.eq('rak', filters.rak);
      }
      if (filters.tanggal_scan) {
        const scanDate = parseDateFlexible(filters.tanggal_scan);
        if (scanDate) {
          const scanFormats = formatDateForSearch(scanDate);
          query = query.or(scanFormats.map(format => `tgl_scan.like.%${format}%`).join(','));
        }
      }
      if (filters.hanya_penyesuaian) {
        query = query.eq('is_adjustment', true);
      }

      // Apply sorting and pagination AFTER all filters
      query = query
        .order('tgl', { ascending: false })
        .order('waktu', { ascending: false })
        .order('id', { ascending: false }) // Tie-breaker for stability
        .range(from, to);

      const { data, error, count } = await query;

      if (error) {
        console.error('Error loading history data:', error);
        showToast('Gagal memuat data riwayat', 'error');
        return;
      }

      const historyItems: HistoryItem[] = (data || []).map(item => ({
        id: item.id,
        tgl: item.tgl,
        waktu: item.waktu,
        sku: item.sku,
        jumlah: item.jumlah,
        type: item.type as 'IN' | 'OUT' | 'MOVE',
        gudang: item.gudang,
        rak: item.rak,
        tgl_scan: item.tgl_scan || '',
        user_name: item.user_name || ''
      }));

      setHistoryData(historyItems);
      setPaginationInfo({
        currentPage: currentPage,
        totalPages: Math.ceil((count || 0) / itemsPerPage),
        totalCount: count || 0,
        hasNextPage: (count || 0) > to + 1,
        hasPrevPage: currentPage > 1
      });

    } catch (error) {
      console.error('Error loading history data:', error);
      showToast('Terjadi kesalahan saat memuat data', 'error');
    } finally {
      setLoading(false);
    }
  }, [filters, currentPage, itemsPerPage]);

  const fetchAllHistoryData = useCallback(async () => {
    if (!filters.tanggal_awal || !filters.tanggal_akhir) {
      return [];
    }

    // Show toast for transparency
    showToast('Sedang menyiapkan data export...', 'info');

    const startDate = parseDateFlexible(filters.tanggal_awal);
    const endDate = parseDateFlexible(filters.tanggal_akhir);
    if (!startDate || !endDate) return [];

    const dateList = getDatesInRange(startDate, endDate);

    let allData: any[] = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      let query = supabase
        .from('database_log')
        .select('*')
        .not('gudang', 'in', '("VERIFY","UNVERIFY")')
        .in('tgl', dateList); // Base filter

      // Apply conditional filters BEFORE sorting/pagination
      if (filters.barang) query = query.eq('sku', filters.barang);
      if (filters.type) query = query.eq('type', filters.type);
      if (filters.inisial_gudang) query = query.eq('gudang', filters.inisial_gudang);
      if (filters.rak) query = query.eq('rak', filters.rak);
      if (filters.tanggal_scan) {
        const scanDate = parseDateFlexible(filters.tanggal_scan);
        if (scanDate) {
          const scanFormats = formatDateForSearch(scanDate);
          query = query.or(scanFormats.map(format => `tgl_scan.like.%${format}%`).join(','));
        }
      }
      if (filters.hanya_penyesuaian) query = query.eq('is_adjustment', true);

      // Apply sorting and pagination AFTER all filters
      query = query
        .order('tgl', { ascending: false })
        .order('waktu', { ascending: false })
        .order('id', { ascending: false }) // Tie-breaker
        .range(from, from + pageSize - 1);

      const { data, error } = await query;
      if (error) throw error;

      if (data && data.length > 0) {
        allData = [...allData, ...data];
        from += pageSize;
        if (data.length < pageSize) hasMore = false;

        // Update toast occasionally
        if (allData.length % 5000 === 0) {
          showToast(`Mengambil ${allData.length} data...`, 'info');
        }
      } else {
        hasMore = false;
      }
    }

    return allData.map(item => ({
      id: item.id,
      tgl: item.tgl,
      waktu: item.waktu,
      sku: item.sku,
      jumlah: item.jumlah,
      type: item.type as 'IN' | 'OUT' | 'MOVE',
      gudang: item.gudang,
      rak: item.rak,
      tgl_scan: item.tgl_scan || '',
      user_name: item.user_name || ''
    }));
  }, [filters]);

  const refreshData = useCallback(() => {
    if (currentPage !== 1) {
      setCurrentPage(1);
    } else {
      loadHistoryData();
    }
  }, [currentPage, loadHistoryData]);

  useEffect(() => {
    if (filters.tanggal_awal && filters.tanggal_akhir) {
      loadHistoryData();
    } else {
      setHistoryData([]);
      setPaginationInfo({
        currentPage: 1,
        totalPages: 0,
        totalCount: 0,
        hasNextPage: false,
        hasPrevPage: false
      });
    }
  }, [loadHistoryData, filters.tanggal_awal, filters.tanggal_akhir]);

  const exportDataDev = async () => {
    try {
      const dataToExport = await fetchAllHistoryData();

      if (dataToExport.length === 0) {
        showToast('Tidak ada data untuk diekspor', 'warning');
        return;
      }
      const headers = ['Tanggal', 'Waktu', 'SKU/Nama Barang', 'Jumlah', 'Type', 'Gudang', 'Rak', 'Tgl Scan', 'User'];
      const csvContent = [
        headers.join(','),
        ...dataToExport.map(item => {
          const rawRak = item.rak || '';
          const upperRak = rawRak.trim().toUpperCase();
          const displayRak = (upperRak.startsWith('TEMP') || upperRak.startsWith('LORONG-')) ? 'UTAMA' : rawRak;
          return [
            `"${item.tgl}"`,
            `"${item.waktu}"`,
            `"${item.sku}"`,
            item.jumlah,
            `"${item.type}"`,
            `"${item.gudang}"`,
            `"${displayRak}"`,
            `"${item.tgl_scan}"`,
            `"${item.user_name}"`
          ].join(',');
        })
      ].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `riwayat-barang-dev-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast(`Export (DEV) berhasil! ${dataToExport.length} data telah diunduh.`, 'success');
    } catch (error) {
      console.error('Error exporting dev data:', error);
      showToast('Terjadi kesalahan saat export data (DEV)', 'error');
    }
  };

  const exportDataStandard = async () => {
    try {
      const fullData = await fetchAllHistoryData();
      const filteredData = fullData.filter(item => item.gudang !== 'TRANSFER');

      if (filteredData.length === 0) {
        showToast('Tidak ada data yang valid untuk diekspor (setelah filter TRANSFER)', 'warning');
        return;
      }

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Riwayat Barang');

      // Define columns with widths
      worksheet.columns = [
        { header: 'Tanggal', key: 'tgl', width: 15 },
        { header: 'Waktu', key: 'waktu', width: 10 },
        { header: 'SKU/Nama Barang', key: 'sku', width: 40 },
        { header: 'Jumlah', key: 'jumlah', width: 10 },
        { header: 'Type', key: 'type', width: 10 },
        { header: 'Gudang', key: 'gudang', width: 25 },
        { header: 'Rak', key: 'rak', width: 15 },
        { header: 'Tgl Scan', key: 'tgl_scan', width: 15 },
        { header: 'User', key: 'user_name', width: 20 },
        { header: 'Rak (Extra)', key: 'rak_extra', width: 15 } // Match existing CSV logic if needed
      ];

      // Styling Header
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      headerRow.eachCell((cell) => {
        // Optional: Add background color to header
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0E0E0' }
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      const isUtamaPattern = (rakValue: string) => {
        if (!rakValue) return false;
        const match = rakValue.match(/^([A-L])(\d{1,2})$/i);
        if (!match) return false;
        const num = parseInt(match[2], 10);
        return num >= 1 && num <= 50;
      };

      const forbiddenRakValues = new Set(['BLOK-I', 'ECER-M', 'ECER-N', 'ECER-O', 'LANTAI 2', 'LANTAI 4', 'UTAMA']);

      filteredData.forEach(item => {
        const rawRak = item.rak || '';
        const upperRak = rawRak.trim().toUpperCase();
        const isTempRak = upperRak.startsWith('TEMP');
        const isLorongRak = upperRak.startsWith('LORONG-');
        const rakColumn1 = (isTempRak || isLorongRak || isUtamaPattern(rawRak)) ? 'UTAMA' : rawRak;
        const rakColumn2 = forbiddenRakValues.has(rawRak) ? '' : rawRak;

        // Parse date for proper Excel formatting
        // item.tgl is likely string YYYY-MM-DD or similar from DB. 
        // We use our existing parser to be safe, then convert to JS Date.
        const dateObj = parseDateFlexible(item.tgl);

        // FIX: Set time to noon to avoid timezone rollover issues (e.g. 00:00 -> Previous Day 17:00 UTC)
        if (dateObj) {
          dateObj.setHours(12, 0, 0, 0);
        }

        const row = worksheet.addRow({
          tgl: dateObj || item.tgl,
          waktu: item.waktu,
          sku: item.sku,
          jumlah: item.jumlah,
          type: item.type,
          gudang: item.gudang,
          rak: rakColumn1,
          tgl_scan: item.tgl_scan,
          user_name: item.user_name,
          rak_extra: rakColumn2
        });

        // Apply specific format to Date column (Column A / 1)
        if (dateObj) {
          const dateCell = row.getCell(1);
          dateCell.numFmt = 'dd/mm/yyyy'; // Forces display like 25/12/2025
        }

        // Center align most columns for neatness
        [1, 2, 4, 5, 6, 7, 8, 9, 10].forEach(colIdx => {
          const cell = row.getCell(colIdx);
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });

        // Left align SKU but keep border
        const skuCell = row.getCell(3);
        skuCell.alignment = { vertical: 'middle', horizontal: 'left' };
        skuCell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // Generate buffer & blob
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

      // Save file with dynamic date range filename
      let exportDateRange = '';
      const { tanggal_awal, tanggal_akhir, tanggal_scan } = filters;

      if (tanggal_awal && tanggal_akhir) {
        if (tanggal_awal === tanggal_akhir) {
          exportDateRange = tanggal_awal;
        } else {
          exportDateRange = `${tanggal_awal}~${tanggal_akhir}`;
        }
      } else if (tanggal_awal) {
        exportDateRange = tanggal_awal;
      } else if (tanggal_akhir) {
        exportDateRange = tanggal_akhir;
      } else if (tanggal_scan) {
        exportDateRange = tanggal_scan;
      } else {
        exportDateRange = new Date().toISOString().split('T')[0];
      }

      const exportFileName = `riwayat-barang-${exportDateRange}.xlsx`;
      saveAs(blob, exportFileName);

      // Async background task for history
      saveExportHistory(
        blob,
        userName || 'Unknown',
        exportDateRange,
        new Date().toLocaleTimeString('id-ID', { hour12: false }).replace(/:/g, '.'),
        exportFileName
      ).then(() => {
        console.log('Riwayat export berhasil disimpan.');
      }).catch((error) => {
        console.error('Gagal menyimpan riwayat:', error);
        showToast(`Gagal menyimpan riwayat export: ${error.message}`, 'error');
      });

      showToast(`Export Excel berhasil! ${filteredData.length} data telah diunduh.`, 'success');
    } catch (error) {
      console.error('Error exporting standard data:', error);
      showToast('Terjadi kesalahan saat export data Excel', 'error');
    }
  };

  const clearAll = () => {
    setFilters({
      barang: '',
      tanggal_awal: '',
      tanggal_akhir: '',
      type: '',
      inisial_gudang: '',
      rak: '',
      tanggal_scan: '',
      hanya_penyesuaian: false
    });
    setBarangSearchTerm('');
    setGudangSearchTerm('');
    setRakSearchTerm('');
    setCurrentPage(1);
  };

  const handleBarangInputChange = useCallback((value: string) => {
    // Menghapus spasi hanya di akhir string saat pengguna mengetik atau paste.
    const trimmedValue = value.trimEnd();

    setBarangSearchTerm(trimmedValue); // Gunakan nilai yang sudah di-trim
    setFilters(prev => ({ ...prev, barang: trimmedValue })); // Gunakan juga di sini
    setCurrentPage(1);
  }, []);



  const handleGudangInputChange = useCallback((value: string) => {
    setGudangSearchTerm(value);
    setFilters(prev => ({ ...prev, inisial_gudang: value }));
    setShowGudangDropdown(true);
    setCurrentPage(1);
  }, []);

  const handleGudangSelect = useCallback((nama: string) => {
    setGudangSearchTerm(nama);
    setFilters(prev => ({ ...prev, inisial_gudang: nama }));
    setShowGudangDropdown(false);
    setCurrentPage(1);
  }, []);

  const clearGudang = useCallback(() => {
    setGudangSearchTerm('');
    setFilters(prev => ({ ...prev, inisial_gudang: '' }));
    setShowGudangDropdown(false);
    setCurrentPage(1);
  }, []);

  const handleRakInputChange = useCallback((value: string) => {
    const trimmedValue = value.trimEnd();
    setRakSearchTerm(trimmedValue);
    setFilters(prev => ({ ...prev, rak: trimmedValue }));
    setCurrentPage(1);
  }, []);



  const filteredWarehouses = gudangSearchTerm
    ? warehouses.filter(warehouse =>
      warehouse.nama.toLowerCase() === gudangSearchTerm.toLowerCase()
    )
    : warehouses.slice(0, 50);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (gudangDropdownRef.current && !gudangDropdownRef.current.contains(target) &&
        gudangInputRef.current && !gudangInputRef.current.contains(target)) {
        setShowGudangDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative">
      {/* PREMIUM IMMERSIVE HEADER (310px) */}
      <div className="flex flex-col mb-8 lg:mb-12 uppercase">
        <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 pt-[90px] lg:pt-0 lg:h-[310px] pb-[75px] lg:pb-0 px-6 lg:px-12 rounded-b-[40px] lg:rounded-b-[55px] shadow-2xl shadow-blue-900/20 relative overflow-hidden transition-all duration-500 flex flex-col justify-center">

          {/* Decorative Background Icon */}
          <div className="absolute -top-6 -right-6 text-white opacity-5">
            <RefreshCw className="w-64 h-64 lg:w-96 lg:h-96" />
          </div>

          {/* Decorative Floating Shapes */}
          <div className="absolute top-10 right-10 w-32 h-32 bg-white/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute top-24 left-1/4 w-16 h-16 bg-white/5 border border-white/10 rounded-2xl rotate-[35deg] backdrop-blur-sm hidden lg:block"></div>

          {/* Text Content */}
          <div className="relative z-10 w-full flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 uppercase">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 mb-2 lg:mb-3 opacity-90">
                <div className="w-8 h-[2px] bg-white rounded-full"></div>
                <span className="text-[10px] lg:text-[12px] font-black tracking-[0.3em] text-white">Activity Log v2</span>
              </div>
              <h1 className="text-[34px] lg:text-[54px] font-black text-white tracking-tight leading-[1.1] mb-2 uppercase">
                Riwayat <span className="text-blue-200">Barang</span>
              </h1>
              <div className="text-blue-100/90 font-medium text-[14px] lg:text-[18px] leading-relaxed max-w-[90%] normal-case flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                  </span>
                  <span>Menampilkan alur logistik barang secara real-time</span>
                </div>
              </div>
            </div>

            {/* Sync Status / Dev Actions */}
            <div className="relative z-10 flex flex-wrap gap-2 animate-in zoom-in duration-500">
              {(isUpdatingInBackground || initialLoading) && (
                <div className="px-4 py-2 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl flex items-center gap-3">
                  <RefreshCw className="w-4 h-4 text-white animate-spin" />
                  <span className="text-[10px] font-black text-white tracking-widest uppercase">SYNCING</span>
                </div>
              )}
              {isDevMode && (
                <button
                  onClick={handleRunMigration}
                  disabled={isMigrating}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-black rounded-xl shadow-lg transition-all border border-amber-400/50 flex items-center gap-2 tracking-widest disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${isMigrating ? 'animate-spin' : ''}`} />
                  FIX DATE FORMAT
                </button>
              )}

              <button
                onClick={() => setIsHistoryModalOpen(true)}
                className="px-5 py-2.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-[10px] font-black rounded-xl shadow-[0_8px_25px_rgba(192,38,211,0.4)] transition-all flex items-center gap-2 tracking-widest active:scale-95 border border-fuchsia-400/50"
              >
                <History className="w-4 h-4" />
                RIWAYAT EXPORT
              </button>

              <button
                onClick={exportDataStandard}
                className="px-5 py-2.5 bg-white hover:bg-blue-50 text-blue-700 text-[10px] font-black rounded-xl shadow-[0_8px_25px_rgba(37,99,235,0.2)] transition-all border-none flex items-center gap-2 tracking-widest active:scale-95"
              >
                <Download className="w-4 h-4" />
                EXPORT
              </button>
            </div>
            
          </div>
        </div>
      </div>

      <Toast
        isOpen={toast.isOpen}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ isOpen: false, message: '', type: 'info' })}
      />

      <ExportHistoryModal 
        isOpen={isHistoryModalOpen} 
        onClose={() => setIsHistoryModalOpen(false)} 
      />

      <div className="space-y-6 lg:px-10 pb-12">
        {(!filters.tanggal_awal || !filters.tanggal_akhir) && (
          <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border-l-4 border-yellow-400 rounded-lg p-5 shadow-sm">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3 text-yellow-700 normal-case">
                <p className="font-semibold mb-1 uppercase tracking-wider text-xs">Perhatian</p>
                <p className="text-sm">Silakan pilih Tanggal Awal dan Tanggal Akhir untuk menampilkan data riwayat barang.</p>
                <p className="text-[10px] mt-1 italic opacity-75 font-medium">Format: DD/MM/YYYY, DD-MM-YYYY, atau YYYY-MM-DD</p>
              </div>
            </div>
          </div>
        )}

        {/* Mobile Header - COMPACT (ONLY ON MOBILE) */}
        <div className="lg:hidden bg-white border-b border-gray-100 px-4 py-3 -mx-4 -mt-6 mb-4 flex items-center justify-between shadow-sm sticky top-0 z-30">
          <div>
            <h1 className="text-lg font-black tracking-tighter text-blue-700 uppercase leading-none">Riwayat</h1>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none">
                Activity Log
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={refreshData}
              variant="secondary"
              size="sm"
              className="h-9 w-9 p-0 rounded-lg bg-blue-50 text-blue-600 border-none shadow-none"
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <Card className="shadow-lg">
              <CardContent className="p-0">
                {loading && (
                  <div className="flex items-center justify-center p-12 bg-gradient-to-br from-blue-50 to-white">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
                      <div className="text-blue-600 font-semibold text-lg">Memuat data...</div>
                    </div>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-blue-600 border-b border-blue-700">
                      <tr>
                        <th className="px-6 py-3 text-center text-xs font-extrabold text-white uppercase tracking-wider">Tanggal</th>
                        <th className="px-6 py-3 text-center text-xs font-extrabold text-white uppercase tracking-wider">Waktu</th>
                        <th className="px-6 py-3 text-left text-xs font-extrabold text-white uppercase tracking-wider">SKU/Nama Barang</th>
                        <th className="px-6 py-3 text-center text-xs font-extrabold text-white uppercase tracking-wider">Jumlah</th>
                        <th className="px-6 py-3 text-center text-xs font-extrabold text-white uppercase tracking-wider">Type</th>
                        <th className="px-6 py-3 text-center text-xs font-extrabold text-white uppercase tracking-wider">Gudang</th>
                        <th className="px-6 py-3 text-center text-xs font-extrabold text-white uppercase tracking-wider">Rak</th>
                        <th className="px-6 py-3 text-center text-xs font-extrabold text-white uppercase tracking-wider">Tgl Scan</th>
                        <th className="px-6 py-3 text-center text-xs font-extrabold text-white uppercase tracking-wider">User</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {historyData.map((item) => (
                        <tr key={item.id} className={`${item.is_adjustment ? 'bg-amber-50' : 'hover:bg-gray-50'} border-b border-gray-200 last:border-b-0 transition-colors duration-200`}>
                          <td className="px-6 py-4 text-sm text-gray-600 text-center whitespace-nowrap font-medium">{formatDateToISO(item.tgl)}</td>
                          <td className="px-6 py-4 text-sm text-gray-500 text-center whitespace-nowrap">{item.waktu}</td>
                          <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center">
                                <span className={item.is_adjustment ? 'font-bold text-amber-800' : ''}>{item.sku}</span>
                                {item.is_adjustment && (
                                  <span className="flex items-center gap-1 bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-2 shadow-sm border border-amber-200 shrink-0">
                                    <Tag className="h-2.5 w-2.5" />
                                    ADJUSTMENT
                                  </span>
                                )}
                              </div>
                              {item.type === 'IN' && (
                                <Button
                                  onClick={() => setQrModalData({ sku: item.sku, tgl: item.tgl, tgl_scan: item.tgl_scan })}
                                  className="h-8 w-8 p-0 bg-gradient-to-br from-blue-400 to-blue-600 hover:from-blue-500 hover:to-blue-700 text-white font-bold rounded-lg shadow-[0_4px_10px_rgba(37,99,235,0.3)] hover:shadow-blue-500/40 transition-all duration-300 transform hover:scale-110 active:scale-90 flex items-center justify-center border border-white/20 backdrop-blur-md ml-2"
                                  title="Tampilkan QR Code"
                                >
                                  <QrCode className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900 text-center font-bold">{item.jumlah}</td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${item.type === 'OUT' ? 'bg-red-50 text-red-700 border-red-100' :
                              item.type === 'IN' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                'bg-purple-50 text-purple-700 border-purple-100'
                              }`}>
                              {item.type === 'IN' ? 'MASUK' : item.type === 'OUT' ? 'KELUAR' : 'TRANSFER'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500 text-center">{item.gudang}</td>
                          <td className="px-6 py-4 text-sm text-gray-500 text-center">{item.rak}</td>
                          <td className="px-6 py-4 text-sm text-gray-500 text-center font-mono text-xs">{item.tgl_scan ? formatDateToISO(item.tgl_scan) : '-'}</td>
                          <td className="px-6 py-4 text-sm text-gray-500 text-center">{item.user_name}</td>
                        </tr>
                      ))}
                      {historyData.length === 0 && !loading && (filters.tanggal_awal && filters.tanggal_akhir) && (
                        <tr>
                          <td colSpan={9} className="px-4 py-12 text-center">
                            <div className="flex flex-col items-center justify-center text-gray-500">
                              <svg className="h-16 w-16 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                              </svg>
                              <p className="text-lg font-medium">Tidak ada data yang sesuai dengan filter</p>
                            </div>
                          </td>
                        </tr>
                      )}
                      {(!filters.tanggal_awal || !filters.tanggal_akhir) && (
                        <tr>
                          <td colSpan={9} className="px-4 py-12 text-center">
                            <div className="flex flex-col items-center justify-center text-gray-500">
                              <svg className="h-16 w-16 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              <p className="text-lg font-medium">Pilih tanggal awal dan tanggal akhir untuk menampilkan data</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1">
            <Card className="rounded-xl shadow-md border border-gray-200 bg-white overflow-hidden">
              <div className="bg-blue-600 p-5 border-b border-blue-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg text-white">
                    <Filter className="h-5 w-5" />
                  </div>
                  <h3 className="font-bold text-white text-lg">Filter Pencarian</h3>
                </div>
                <button
                  onClick={handleManualRefresh}
                  disabled={loading || isUpdatingInBackground}
                  className="p-2 bg-white/20 hover:bg-white/30 rounded-lg text-white transition-all duration-300 transform hover:scale-110 active:scale-90 border border-white/20 backdrop-blur-sm shadow-sm disabled:opacity-50"
                  title="Perbarui Data Metadata"
                >
                  <RefreshCw className={`h-4 w-4 ${(loading || isUpdatingInBackground) ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <CardContent className="p-6 space-y-5">
                <div>
                  <label className="flex items-center text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 ml-1">
                    <Package className="w-3.5 h-3.5 mr-1.5 text-blue-500" />
                    Barang ({products.length.toLocaleString()})
                  </label>
                  <div className="relative group">
                    <CustomDropdown
                      value={barangSearchTerm}
                      onChange={(e) => handleBarangInputChange(e.target.value)}
                      options={products.map(p => p.nama)}
                      placeholder="Cari nama barang..."
                      showClearButton={true}
                      loading={initialLoading}
                      className="bg-white border-gray-300 hover:border-blue-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 rounded-lg py-2.5 text-gray-700"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center text-xs font-bold uppercase tracking-wider text-gray-500 ml-1">
                      <Calendar className="w-3.5 h-3.5 mr-1.5 text-blue-500" />
                      Rentang Waktu
                    </label>
                    <div className="flex gap-1.5 flex-wrap">
                      <button
                        onClick={() => {
                          const today = new Date().toISOString().split('T')[0];
                          setFilters({
                            ...filters,
                            tanggal_awal: today,
                            tanggal_akhir: today
                          });
                          setCurrentPage(1);
                        }}
                        className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 border border-emerald-100 transition-all backdrop-blur-sm shadow-sm"
                      >
                        HARI INI
                      </button>
                      {[
                        { label: '1 Bln', months: 1 },
                        { label: '6 Bln', months: 6 },
                        { label: '1 Thn', months: 12 },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          onClick={() => {
                            const end = new Date();
                            const start = new Date();
                            start.setMonth(start.getMonth() - preset.months);
                            setFilters({
                              ...filters,
                              tanggal_awal: start.toISOString().split('T')[0],
                              tanggal_akhir: end.toISOString().split('T')[0]
                            });
                            setCurrentPage(1);
                          }}
                          className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide bg-blue-50/50 text-blue-600 rounded-lg hover:bg-blue-100 border border-blue-100/50 transition-all backdrop-blur-sm shadow-sm"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <input
                        type="date"
                        value={filters.tanggal_awal}
                        onChange={(e) => {
                          setFilters({ ...filters, tanggal_awal: e.target.value });
                          setCurrentPage(1);
                        }}
                        onClick={(e) => {
                          try {
                            (e.target as HTMLInputElement).showPicker();
                          } catch (err) {
                            // Fallback for browsers that don't support showPicker
                          }
                        }}
                        className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 shadow-sm transition-all duration-200 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
                        placeholder="Dari Tanggal"
                      />
                    </div>
                    <div>
                      <input
                        type="date"
                        value={filters.tanggal_akhir}
                        onChange={(e) => {
                          setFilters({ ...filters, tanggal_akhir: e.target.value });
                          setCurrentPage(1);
                        }}
                        onClick={(e) => {
                          try {
                            (e.target as HTMLInputElement).showPicker();
                          } catch (err) {
                            // Fallback
                          }
                        }}
                        className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 shadow-sm transition-all duration-200 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
                        placeholder="Sampai Tanggal"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="flex items-center text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 ml-1">
                    <ArrowRightLeft className="w-3.5 h-3.5 mr-1.5 text-blue-500" />
                    Jenis Transaksi
                  </label>
                  <select
                    value={filters.type}
                    onChange={(e) => {
                      setFilters({ ...filters, type: e.target.value });
                      setCurrentPage(1);
                    }}
                    className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 shadow-sm transition-all duration-200 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="">Semua Jenis</option>
                    <option value="IN">Masuk (IN)</option>
                    <option value="OUT">Keluar (OUT)</option>
                    <option value="MOVE">Transfer (TRANSFER)</option>
                  </select>
                </div>

                <div>
                  <label className="flex items-center text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 ml-1">
                    <Building className="w-3.5 h-3.5 mr-1.5 text-blue-500" />
                    Gudang ({warehouses.length})
                  </label>
                  <div className="relative">
                    <input
                      ref={gudangInputRef}
                      type="text"
                      value={gudangSearchTerm}
                      onChange={(e) => handleGudangInputChange(e.target.value)}
                      onFocus={() => setShowGudangDropdown(true)}
                      className="w-full px-4 py-2.5 pr-10 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 shadow-sm transition-all duration-200 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder-gray-400"
                      placeholder="Cari gudang..."
                    />
                    {gudangSearchTerm && (
                      <button
                        onClick={clearGudang}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-red-500 transition-colors p-1"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    {showGudangDropdown && (
                      <div
                        ref={gudangDropdownRef}
                        className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto"
                      >
                        {filteredWarehouses.length > 0 ? (
                          filteredWarehouses.map((warehouse) => (
                            <div
                              key={warehouse.id}
                              onClick={() => handleGudangSelect(warehouse.nama)}
                              className="px-4 py-2 text-sm cursor-pointer hover:bg-blue-50 border-b border-gray-100 last:border-b-0 text-gray-700 hover:text-blue-700 transition-colors"
                            >
                              {warehouse.nama}
                            </div>
                          ))
                        ) : (
                          <div className="px-4 py-8 text-sm text-gray-400 text-center italic">
                            Tidak ada gudang yang cocok
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="flex items-center text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 ml-1">
                    <Layers className="w-3.5 h-3.5 mr-1.5 text-blue-500" />
                    Rak ({rackLocations.length})
                  </label>
                  <div className="relative">
                    <CustomDropdown
                      value={rakSearchTerm}
                      onChange={(e) => handleRakInputChange(e.target.value)}
                      options={rackLocations.map(r => r.nama)}
                      placeholder="Cari rak..."
                      showClearButton={true}
                      className="bg-white border-gray-300 hover:border-blue-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 rounded-lg py-2.5 text-gray-700"
                    />
                  </div>
                </div>

                <div>
                  <label className="flex items-center text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 ml-1">
                    <Calendar className="w-3.5 h-3.5 mr-1.5 text-blue-500" />
                    Tanggal Scan
                  </label>
                  <input
                    type="date"
                    value={filters.tanggal_scan}
                    onChange={(e) => {
                      setFilters({ ...filters, tanggal_scan: e.target.value });
                      setCurrentPage(1);
                    }}
                    className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 shadow-sm transition-all duration-200 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="flex items-center text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 ml-1">
                    <List className="w-3.5 h-3.5 mr-1.5 text-blue-500" />
                    Jumlah Data
                  </label>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 shadow-sm transition-all duration-200 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="500">500 baris</option>
                    <option value="800">800 baris</option>
                    <option value="1000">1000 baris</option>
                    <option value="2000">2000 baris</option>
                  </select>
                </div>

                {/* ⭐ FILTER PENYESUAIAN - SPECIAL AMBER */}
                <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer select-none" htmlFor="filter-penyesuaian">
                      <div className="flex items-center gap-1.5">
                        <Tag className="w-4 h-4 text-amber-600" />
                        <span className="text-xs font-black uppercase tracking-wider text-amber-800">Penyesuaian</span>
                      </div>
                      <span className="px-2 py-0.5 bg-amber-400 text-white text-[9px] font-black rounded-full tracking-widest uppercase">SPECIAL</span>
                    </label>
                    <button
                      id="filter-penyesuaian"
                      onClick={() => {
                        setFilters(prev => ({ ...prev, hanya_penyesuaian: !prev.hanya_penyesuaian }));
                        setCurrentPage(1);
                      }}
                      className={`relative w-12 h-6 rounded-full transition-all duration-300 ${filters.hanya_penyesuaian
                        ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]'
                        : 'bg-gray-200'
                        }`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-300 ${filters.hanya_penyesuaian ? 'left-6' : 'left-0.5'
                        }`} />
                    </button>
                  </div>
                  <p className="text-[10px] text-amber-700 mt-2 font-medium leading-snug">
                    Tampilkan hanya data yang ditandai sebagai <strong>Penyesuaian Stok</strong> (is_adjustment)
                  </p>
                  {filters.hanya_penyesuaian && (
                    <div className="mt-2 flex items-center gap-1.5 text-amber-800 bg-amber-100 rounded-lg px-2 py-1">
                      <Tag className="w-3 h-3 shrink-0" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Filter Aktif</span>
                    </div>
                  )}
                </div>

                <div className="pt-4 mt-2 border-t border-gray-100">
                  <Button
                    onClick={clearAll}
                    className="w-full h-10 bg-white/10 hover:bg-white/20 text-rose-600 font-bold rounded-xl shadow-sm transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center gap-2 border border-rose-200 backdrop-blur-xl"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span className="tracking-wide uppercase text-xs">Reset Filter</span>
                  </Button>
                </div>

              </CardContent>
            </Card>
          </div>
        </div>

        {!hideRiwayatStats && (
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-5 rounded-xl shadow-md border border-blue-200">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <span className="text-xs font-semibold text-gray-500 uppercase block mb-1">Total Data</span>
                <span className="text-2xl font-bold text-blue-600">{paginationInfo.totalCount.toLocaleString()}</span>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <span className="text-xs font-semibold text-gray-500 uppercase block mb-1">Data Ditampilkan</span>
                <span className="text-2xl font-bold text-green-600">{historyData.length.toLocaleString()}</span>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <span className="text-xs font-semibold text-gray-500 uppercase block mb-1">Total Qty</span>
                <span className="text-2xl font-bold text-orange-600">
                  {/* Note: Summing quantity on client side only works for current page. For total qty of all pages, we would need an aggregate query. For now, showing sum of visible items. */
                    historyData.reduce((sum, item) => sum + (item.jumlah || 0), 0).toLocaleString()}
                </span>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <span className="text-xs font-semibold text-gray-500 uppercase block mb-1">Halaman</span>
                <span className="text-2xl font-bold text-purple-600">{currentPage} / {paginationInfo.totalPages || 1}</span>
              </div>
            </div>
          </div>
        )}

          {paginationInfo.totalCount > itemsPerPage && (
            <div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="text-xs sm:text-sm text-gray-600 order-2 sm:order-1">
                Menampilkan {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, paginationInfo.totalCount)} dari {paginationInfo.totalCount.toLocaleString()} data
              </div>

              <div className="flex flex-wrap justify-center sm:justify-end items-center gap-1 sm:gap-2 order-1 sm:order-2">
                <Button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="h-9 px-3 bg-white/10 hover:bg-white/20 text-slate-700 font-bold rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center border border-slate-200 backdrop-blur-xl disabled:opacity-30 disabled:scale-100"
                >
                  <span className="hidden sm:inline tracking-wide uppercase text-xs">Awal</span>
                  <span className="sm:hidden">&laquo;</span>
                </Button>

                <Button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="h-9 px-3 bg-white/10 hover:bg-white/20 text-slate-700 font-bold rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center border border-slate-200 backdrop-blur-xl disabled:opacity-30 disabled:scale-100"
                >
                  <span className="hidden sm:inline tracking-wide uppercase text-xs">Prev</span>
                  <span className="sm:hidden">&lsaquo;</span>
                </Button>

                <div className="flex gap-1 flex-wrap justify-center">
                  {(() => {
                    const totalPages = paginationInfo.totalPages;
                    const pages = [];

                    if (totalPages <= 7) {
                      for (let i = 1; i <= totalPages; i++) {
                        pages.push(
                          <button
                            key={i}
                            onClick={() => setCurrentPage(i)}
                            className={`px-3 py-2 min-w-[36px] sm:min-w-[44px] text-xs sm:text-sm font-bold rounded-xl border transition-all duration-300 transform hover:scale-105 active:scale-95 ${currentPage === i
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
                          className={`px-3 py-2 min-w-[36px] sm:min-w-[44px] text-xs sm:text-sm font-bold rounded-xl border transition-all duration-300 transform hover:scale-105 active:scale-95 ${currentPage === 1
                            ? 'bg-gradient-to-br from-blue-500 to-blue-700 border-blue-600 text-white shadow-md'
                            : 'bg-white/50 hover:bg-white/80 border-slate-200 text-slate-700 backdrop-blur-sm'
                            }`}
                        >
                          1
                        </button>
                      );

                      if (currentPage > 3) {
                        pages.push(
                          <span key="dots1" className="px-1 sm:px-2 py-2 text-gray-500 text-xs sm:text-sm">...</span>
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
                            className={`px-3 py-2 min-w-[36px] sm:min-w-[44px] text-xs sm:text-sm font-bold rounded-xl border transition-all duration-300 transform hover:scale-105 active:scale-95 ${currentPage === i
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
                          <span key="dots2" className="px-1 sm:px-2 py-2 text-gray-500 text-xs sm:text-sm">...</span>
                        );
                      }

                      pages.push(
                        <button
                          key={totalPages}
                          onClick={() => setCurrentPage(totalPages)}
                          className={`px-3 py-2 min-w-[36px] sm:min-w-[44px] text-xs sm:text-sm font-bold rounded-xl border transition-all duration-300 transform hover:scale-105 active:scale-95 ${currentPage === totalPages
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

                <Button
                  onClick={() => setCurrentPage(prev => Math.min(paginationInfo.totalPages, prev + 1))}
                  disabled={currentPage === paginationInfo.totalPages}
                  className="h-9 px-3 bg-white/10 hover:bg-white/20 text-slate-700 font-bold rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center border border-slate-200 backdrop-blur-xl disabled:opacity-30 disabled:scale-100"
                >
                  <span className="hidden sm:inline tracking-wide uppercase text-xs">Next</span>
                  <span className="sm:hidden">&rsaquo;</span>
                </Button>

                <Button
                  onClick={() => setCurrentPage(paginationInfo.totalPages)}
                  disabled={currentPage === paginationInfo.totalPages}
                  className="h-9 px-3 bg-white/10 hover:bg-white/20 text-slate-700 font-bold rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center border border-slate-200 backdrop-blur-xl disabled:opacity-30 disabled:scale-100"
                >
                  <span className="hidden sm:inline tracking-wide uppercase text-xs">Akhir</span>
                  <span className="sm:hidden">&raquo;</span>
                </Button>
              </div>
            </div>
          )}
        </div>

      {
        qrModalData && (() => {
          // Gunakan tgl_scan jika ada, jika tidak fallback ke tgl (atau kosongkan sesuai kebutuhan)
          // User request: "Tanggal bukan berdasarkan kolom Tanggal tapi berdasarkan kolom Tgl Scan"
          const finalDate = qrModalData.tgl_scan || qrModalData.tgl;
          const modalFormattedDate = formatDateToIndonesian(finalDate);
          const dateForQr = modalFormattedDate.replace(/\//g, '-');
          const qrDataForScan = `${dateForQr}\t${qrModalData.sku}`;
          const encodedQrData = encodeURIComponent(qrDataForScan);
          const qrCodeUrl = `https://dazzling-halva-7e617b.netlify.app/api/qr?data=${encodedQrData}&size=250&margin=2`;

          return (
            <div
              className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"
              onClick={() => setQrModalData(null)}
            >
              <div
                className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full relative transform transition-all duration-300 scale-95 animate-in fade-in-0 zoom-in-95"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => setQrModalData(null)}
                  className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>

                <h2 className="text-xl font-bold text-gray-800 mb-4 border-b pb-2">Informasi & QR Code</h2>

                <div className="space-y-3 text-gray-700">
                  <div>
                    <label className="font-semibold text-sm">Tanggal:</label>
                    <p className="text-lg bg-gray-100 p-2 rounded">{modalFormattedDate}</p>
                  </div>
                  <div>
                    <label className="font-semibold text-sm">SKU/Nama Barang:</label>
                    <p className="text-lg bg-gray-100 p-2 rounded break-words">{qrModalData.sku}</p>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t">
                  <img
                    src={qrCodeUrl}
                    alt={`QR Code untuk ${qrModalData.sku}`}
                    className="mx-auto w-[250px] h-[250px] rounded-md"
                  />
                  <p className="text-center text-xs text-gray-500 mt-2">
                    Pindai QR Code untuk input data
                  </p>
                </div>
              </div>
            </div>
          );
        })()
      }

      {/* Mobile Sticky Action Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-2xl p-4 border-t border-gray-100 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] flex gap-2 animate-in slide-in-from-bottom-5">
        <Button
          onClick={refreshData}
          className="flex-1 h-14 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl shadow-lg shadow-blue-200 flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-all border-none"
          disabled={loading}
        >
          <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
          <span className="text-[10px] uppercase tracking-tighter">Refresh</span>
        </Button>
        <Button
          onClick={exportDataStandard}
          className="flex-1 h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl shadow-lg shadow-emerald-200 flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-all border-none"
        >
          <Download className="h-5 w-5" />
          <span className="text-[10px] uppercase tracking-tighter">Export</span>
        </Button>
        <Button
          onClick={() => {
            // Quick reset filters for mobile
            const today = new Date().toISOString().split('T')[0];
            setFilters({
              barang: '',
              tanggal_awal: today,
              tanggal_akhir: today,
              type: '',
              inisial_gudang: '',
              rak: '',
              tanggal_scan: '',
              hanya_penyesuaian: false
            });
            setBarangSearchTerm('');
            setGudangSearchTerm('');
            setRakSearchTerm('');
          }}
          className="h-14 w-14 bg-gray-100 text-gray-600 font-black rounded-2xl flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-all border-none"
        >
          <Filter className="h-5 w-5" />
          <span className="text-[8px] uppercase tracking-tighter">Reset</span>
        </Button>
      </div>

      {/* Bottom Spacer for Mobile Sticky Bar */}
      <div className="h-24 lg:hidden"></div>
      <Modal
        isOpen={isAnalysisModalOpen}
        onClose={() => setIsAnalysisModalOpen(false)}
        title="Analisis Rak Beda"
        size="7xl"
      >
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="text-sm text-blue-700">
              <p className="font-semibold mb-1">Cara Kerja Analisis:</p>
              <p>Sistem merangkum data IN dan OUT berdasarkan <strong>SKU dan Tgl Scan</strong>.
                Jika pada tanggal yang sama barang di-scan IN di Rak A, tetapi di-scan OUT di Rak B, sistem akan mendeteksinya sebagai <strong>Rak Beda</strong>.</p>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 shadow-inner space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2 ml-1">Cari / Pilih SKU</label>
                <FilterDropdown
                  value={analysisSku}
                  onChange={(val) => setAnalysisSku(val)}
                  options={products.map(p => p.nama)}
                  placeholder="Ketik nama produk..."
                  loading={initialLoading}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => handleAnalyzeRakMismatch(analysisSku)}
                  disabled={isRakMismatchAnalyzing}
                  className="h-10 bg-gradient-to-r from-purple-600 to-pink-700 hover:from-purple-700 hover:to-pink-800 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center space-x-2 flex-1"
                >
                  {isRakMismatchAnalyzing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  <span>{isRakMismatchAnalyzing ? 'Menganalisis...' : 'Analisis Rak Beda'}</span>
                </Button>

                {rakMismatchResults.length > 0 && (
                  <Button
                    onClick={handleFixRakMismatch}
                    disabled={isRakMismatchAnalyzing || isRakMismatchFixing}
                    className="h-10 bg-gradient-to-r from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center space-x-2 flex-1"
                  >
                    {isRakMismatchFixing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Edit2 className="h-4 w-4" />}
                    <span>{isRakMismatchFixing ? 'Memperbaiki...' : 'Perbaiki Rak Beda'}</span>
                  </Button>
                )}
              </div>
            </div>

            <div className="relative mt-4">
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
                    <th className="px-4 py-3 text-center font-semibold text-gray-700">Tgl Scan</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Rak IN (Seharusnya)</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Rak OUT (Salah)</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-700">Total Qty Tersesat</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {isRakMismatchAnalyzing ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-gray-500 italic">
                        <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-3 text-purple-500" />
                        Menganalisis data, mohon tunggu...
                      </td>
                    </tr>
                  ) : rakMismatchResults.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-gray-500 italic">
                        Klik "Analisis Rak Beda" untuk memproses data.
                      </td>
                    </tr>
                  ) : (
                    rakMismatchResults
                      .filter(res =>
                        res.sku.toLowerCase().includes(analysisSearchTerm.toLowerCase()) ||
                        res.inRak.toLowerCase().includes(analysisSearchTerm.toLowerCase()) ||
                        res.outRak.toLowerCase().includes(analysisSearchTerm.toLowerCase()) ||
                        res.tglScanRaw.toLowerCase().includes(analysisSearchTerm.toLowerCase())
                      )
                      .map((res, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-900">{res.sku}</td>
                          <td className="px-4 py-3 text-center text-gray-600 font-mono text-xs">
                            {formatDateDisplay(res.tglScanRaw)}
                          </td>
                          <td className="px-4 py-3 text-green-700 font-medium">
                            <div className="font-bold">{res.inRak}</div>
                            {res.inSubRak && <div className="text-[10px] text-green-600/70 italic mt-0.5">Sub: {res.inSubRak}</div>}
                          </td>
                          <td className="px-4 py-3 text-red-700 font-medium">
                            <div className="font-bold">{res.outRak}</div>
                            {res.outSubRak && <div className="text-[10px] text-red-600/70 italic mt-0.5">Sub: {res.outSubRak}</div>}
                          </td>
                          <td className="px-4 py-3 text-center text-amber-700 font-bold">{res.outTotal.toLocaleString()}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              <AlertCircle className="h-3 w-3" />
                              <span>RAK BEDA</span>
                            </span>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button
              onClick={() => setIsAnalysisModalOpen(false)}
              className="h-11 px-8 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg transition-all"
            >
              Tutup
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
    </div>
  );
}

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
