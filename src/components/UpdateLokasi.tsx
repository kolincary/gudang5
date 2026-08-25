import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Toast } from './ui/Toast';
import { ValidationAlert } from './ui/ValidationAlert';
import { X, Send, RefreshCw, ChevronLeft, ChevronRight, Filter, Calendar, Package, Building, Building2, Layers, ArrowRightLeft, List, Camera, Search, Plus, Check, Pencil, ShieldAlert, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase, fetchAllProducts } from '../lib/supabase';
import { Modal } from './ui/Modal';
import { BarcodeScanner } from './ui/BarcodeScanner';
import { cn } from '../lib/utils';
import { useAuth } from '../lib/AuthContext';

interface TransactionItem {
  id: string;
  tgl: string;
  waktu: string;
  sku: string;
  jumlah: number;
  type: 'IN' | 'OUT' | 'MOVE';
  gudang: string;
  rak: string;
  tgl_scan: string;
  unique_code?: string;
  lokasi_penyimpanan: string;
  update_lokasi_rak: string;
  log_update_user?: string;
  isValid?: boolean;
  isLocked?: boolean;
  lockReason?: string;
}

interface Warehouse {
  id: string;
  nama: string;
  status: string;
}

interface Product {
  id: string;
  nama: string;
  status: string;
}

interface RackLocation {
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

// Debounce hook untuk search


// ---
// Komponen Search Dropdown yang dioptimalkan, dipindahkan ke luar untuk menghindari re-render yang tidak perlu.
// ---

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
  setShowDropdown, // Prop baru untuk mengelola state dari parent
  clearSearch,
  inputRef,
  maxDisplayItems = 50
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  onSelect: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onFocus: () => void;
  placeholder: string;
  loading: boolean;
  highlightedIndex: number;
  showDropdown: boolean;
  setShowDropdown: (show: boolean) => void;
  clearSearch: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
  maxDisplayItems?: number;
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredOptions = useMemo(() => {
    const filtered = options.filter(option =>
      option.toLowerCase().includes(value.toLowerCase())
    );
    return filtered.slice(0, maxDisplayItems);
  }, [options, value, maxDisplayItems]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        inputRef.current &&
        !inputRef.current.contains(target)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [inputRef, setShowDropdown]);

  useEffect(() => {
    if (dropdownRef.current && highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
      const highlightedElement = dropdownRef.current.children[highlightedIndex];
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, filteredOptions.length]);

  return (
    <div className="relative dropdown-container">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          onKeyDown={onKeyDown}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          className="w-full px-4 py-2.5 pr-10 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200"
          placeholder={loading ? 'Memuat data...' : placeholder}
          disabled={loading}
          autoComplete="off"
        />
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center space-x-1 pointer-events-none">
          {value && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                clearSearch();
              }}
              className="p-1 px-1.5 bg-gray-100/50 hover:bg-gray-200 text-gray-500 hover:text-gray-700 rounded-md transition-all backdrop-blur-sm border border-gray-200 pointer-events-auto"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <ChevronLeft className={`h-4 w-4 text-gray-400 rotate-[-90deg] transition-transform ${showDropdown ? 'rotate-[90deg]' : ''} pointer-events-auto`} />
        </div>
      </div>

      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent"
        >
          {filteredOptions.length > 0 ? (
            <>
              {filteredOptions.map((option, index) => (
                <div
                  key={option}
                  onMouseDown={() => onSelect(option)}
                  className={`px-4 py-2 text-sm cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors ${index === highlightedIndex
                    ? 'bg-blue-500 text-white font-medium'
                    : 'hover:bg-blue-50 hover:text-blue-700'
                    }`}
                >
                  {option}
                </div>
              ))}
              {options.length > maxDisplayItems && (
                <div className="px-4 py-2 text-[10px] text-gray-500 bg-gray-50 border-t font-bold uppercase tracking-widest">
                  Menampilkan {Math.min(filteredOptions.length, maxDisplayItems)} dari {options.length.toLocaleString()} item
                </div>
              )}
            </>
          ) : (
            <div className="px-4 py-2 text-sm text-gray-500">
              {value ? `Tidak ada item yang cocok dengan "${value}"` : 'Ketik untuk mencari...'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ---
// Komponen UpdateLokasiRakDropdown, dipindahkan ke luar untuk perbaikan fokus input
// ---

const UpdateLokasiRakDropdown = ({
  item,
  updateLocation,
  rackLocations,
  isDisabled,
}: {
  item: TransactionItem;
  updateLocation: (id: string, field: 'update_lokasi_rak', value: string) => void;
  rackLocations: RackLocation[];
  isDisabled?: boolean;
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchTerm, setSearchTerm] = useState(item.update_lokasi_rak);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [dropdownPosition, setDropdownPosition] = useState({});

  const filteredRacks = useMemo(() => {
    const filtered = rackLocations.filter(rack =>
      rack.nama.toLowerCase().includes(searchTerm.toLowerCase())
    );
    return filtered;
  }, [rackLocations, searchTerm]);

  const calculateDropdownPosition = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropdownHeight = Math.min(200, filteredRacks.length * 32);

      const style: React.CSSProperties = {
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
        maxHeight: '200px',
      };

      if (spaceBelow < dropdownHeight + 10 && rect.top > dropdownHeight + 10) {
        style.top = 'unset';
        style.bottom = window.innerHeight - rect.top;
      } else {
        style.top = rect.bottom;
      }
      setDropdownPosition(style);
    }
  };

  const handleInputChange = (value: string) => {
    const upperCaseValue = value.toUpperCase();
    setSearchTerm(upperCaseValue);
    updateLocation(item.id, 'update_lokasi_rak', upperCaseValue);
    setShowDropdown(true);
    setHighlightedIndex(0);
  };

  const handleSelect = (rackName: string) => {
    const upperCaseName = rackName.toUpperCase().trimEnd();
    setSearchTerm(upperCaseName);
    updateLocation(item.id, 'update_lokasi_rak', upperCaseName);
    setShowDropdown(false);
  };

  const clearInput = () => {
    setSearchTerm('');
    updateLocation(item.id, 'update_lokasi_rak', '');
    setShowDropdown(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && showDropdown && filteredRacks.length > 0) {
      e.preventDefault();
      setHighlightedIndex(prev => prev >= filteredRacks.length - 1 ? 0 : prev + 1);
    } else if (e.key === 'ArrowUp' && showDropdown && filteredRacks.length > 0) {
      e.preventDefault();
      setHighlightedIndex(prev => prev <= 0 ? filteredRacks.length - 1 : prev - 1);
    } else if (e.key === 'Enter') {
      if (showDropdown && highlightedIndex >= 0 && highlightedIndex < filteredRacks.length) {
        e.preventDefault();
        handleSelect(filteredRacks[highlightedIndex].nama);
      } else {
        setShowDropdown(false);
        e.preventDefault();
      }
    } else if (e.key === 'Tab' && showDropdown && highlightedIndex >= 0 && highlightedIndex < filteredRacks.length) {
      e.preventDefault();
      handleSelect(filteredRacks[highlightedIndex].nama);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
      setHighlightedIndex(0);
    }
  };

  useEffect(() => {
    // Sync internal state with prop value when parent state changes.
    // This is crucial for keeping the input value consistent.
    setSearchTerm(item.update_lokasi_rak);
  }, [item.update_lokasi_rak]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target) &&
        inputRef.current && !inputRef.current.contains(target)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown, inputRef]);



  useEffect(() => {
    if (showDropdown) {
      calculateDropdownPosition();
    }
    optionRefs.current = optionRefs.current.slice(0, filteredRacks.length);
  }, [showDropdown, filteredRacks.length]);

  useEffect(() => {
    if (showDropdown && optionRefs.current[highlightedIndex]) {
      optionRefs.current[highlightedIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [highlightedIndex, showDropdown]);

  return (
    <div className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => {
            if (!isDisabled) {
              setShowDropdown(true);
              setHighlightedIndex(0);
            }
          }}
          onKeyDown={handleKeyDown}
          onMouseDown={(e) => e.stopPropagation()}
          disabled={isDisabled}
          className={`w-full px-3 py-1.5 pr-8 border rounded-lg text-xs shadow-sm transition-all duration-200 focus:outline-none focus:ring-2 ${isDisabled
            ? 'bg-red-100 text-red-700 border-red-300 cursor-not-allowed font-bold placeholder-red-400'
            : !searchTerm 
              ? 'bg-amber-50/50 border-amber-300 hover:border-amber-400 focus:ring-amber-500/20 focus:border-amber-500 text-amber-900 placeholder-amber-600/70 font-medium' 
              : 'bg-emerald-50/50 border-emerald-200 hover:border-emerald-400 focus:ring-emerald-500/20 focus:border-emerald-500 text-emerald-900'
            } ${item.isValid === false && !isDisabled ? 'border-red-500 bg-red-50' : ''}`}
          placeholder={isDisabled ? "🔒 TERKUNCI" : "Belum ada data yang di input"}
          autoComplete="off"
        />
        {searchTerm && !isDisabled && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              clearInput();
            }}
            className="absolute right-1.5 top-1/2 transform -translate-y-1/2 p-0.5 bg-gray-100/50 hover:bg-gray-200 text-gray-500 hover:text-gray-700 rounded transition-all border border-gray-200"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div
          ref={dropdownRef}
          className="bg-white border border-gray-200 rounded-lg shadow-xl overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent"
          style={dropdownPosition}
        >
          {filteredRacks.length > 0 ? (
            filteredRacks.map((rack, idx) => (
              <div
                key={rack.id}
                ref={el => optionRefs.current[idx] = el}
                onMouseDown={() => handleSelect(rack.nama)}
                className={`px-3 py-2 text-xs cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors ${highlightedIndex === idx ? 'bg-blue-500 text-white font-medium' : 'hover:bg-blue-50 hover:text-blue-700'
                  }`}
              >
                {rack.nama}
              </div>
            ))
          ) : (
            <div className="px-3 py-2 text-xs text-gray-500">
              {searchTerm ? `Tidak ada lokasi yang cocok` : 'Tidak ada lokasi tersedia'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ---
// Komponen utama UpdateLokasi
// ---

export function UpdateLokasi() {
  const { userEmail } = useAuth();
  const [filteredTransactions, setFilteredTransactions] = useState<TransactionItem[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [rackLocations, setRackLocations] = useState<RackLocation[]>([]);

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(500);

  const [showScanner, setShowScanner] = useState(false);
  const [scanStep, setScanStep] = useState<'scan_sku' | 'scan_rak'>('scan_sku');
  const [scanTitle, setScanTitle] = useState('Langkah 1: Scan Barcode Barang');

  // Modal State untuk Pilih Lokasi Rak (Full Screen Modal)
  const [selectedItemForRackModal, setSelectedItemForRackModal] = useState<TransactionItem | null>(null);
  const [rackSearchTerm, setRackSearchTerm] = useState('');

  // Use refs to avoid stale closure in BarcodeScanner callback
  const scanStepRef = useRef<'scan_sku' | 'scan_rak'>('scan_sku');
  const scannedDataRef = useRef<{sku: string, tgl: string | null, uniqueCode: string | null}>({sku: '', tgl: null, uniqueCode: null});
  const scanCooldownRef = useRef(false);

  const FAB_STORAGE_KEY = 'camera_fab_position_update_lokasi';
  const getInitialFabPos = () => {
    try {
      const saved = localStorage.getItem(FAB_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch { }
    return { x: typeof window !== 'undefined' ? window.innerWidth - 80 : 300, y: Math.round((typeof window !== 'undefined' ? window.innerHeight : 700) / 2) - 32 };
  };
  const [fabPos, setFabPos] = useState(getInitialFabPos);
  const fabDragging = useRef(false);
  const fabStartPos = useRef({ x: 0, y: 0 });
  const fabOffset = useRef({ x: 0, y: 0 });
  const fabMoved = useRef(false);

  const handleFabPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') {
      document.body.style.overflow = 'hidden';
    }
    fabDragging.current = true;
    fabMoved.current = false;
    fabStartPos.current = { x: e.clientX, y: e.clientY };
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    fabOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleFabPointerMove = (e: React.PointerEvent) => {
    if (!fabDragging.current) return;
    const moveX = Math.abs(e.clientX - fabStartPos.current.x);
    const moveY = Math.abs(e.clientY - fabStartPos.current.y);
    if (moveX > 15 || moveY > 15) {
      fabMoved.current = true;
    }
    if (fabMoved.current) {
      const newX = e.clientX - fabOffset.current.x;
      const newY = e.clientY - fabOffset.current.y;
      setFabPos({
        x: Math.max(0, Math.min(newX, window.innerWidth - 64)),
        y: Math.max(0, Math.min(window.innerHeight - newY - 64, window.innerHeight - 64))
      });
    }
  };

  const finishFabAction = () => {
    document.body.style.overflow = '';
    if (!fabDragging.current) return;
    fabDragging.current = false;
    if (!fabMoved.current) {
      // Reset scan state
      scanStepRef.current = 'scan_sku';
      scannedDataRef.current = {sku: '', tgl: null, uniqueCode: null};
      scanCooldownRef.current = false;
      setScanStep('scan_sku');
      setScanTitle('Langkah 1: Scan Barcode Barang');
      setShowScanner(true);
    } else {
      try { localStorage.setItem(FAB_STORAGE_KEY, JSON.stringify(fabPos)); } catch { }
    }
  };

  const [filters, setFilters] = useState({
    tanggal_masuk: '',
    barang: '',
    inisial_gudang: ''
  });

  const [paginationInfo, setPaginationInfo] = useState<PaginationInfo>({
    currentPage: 1,
    totalPages: 0,
    totalCount: 0,
    hasNextPage: false,
    hasPrevPage: false
  });

  const [showBarangDropdown, setShowBarangDropdown] = useState(false);
  const [barangSearchTerm, setBarangSearchTerm] = useState('');
  const [barangHighlightedIndex, setBarangHighlightedIndex] = useState(0);

  const [showGudangDropdown, setShowGudangDropdown] = useState(false);
  const [gudangSearchTerm, setGudangSearchTerm] = useState('');
  const [gudangHighlightedIndex, setGudangHighlightedIndex] = useState(0);

  const barangInputRef = useRef<HTMLInputElement>(null);
  const gudangInputRef = useRef<HTMLInputElement>(null);
  const modalRakInputRef = useRef<HTMLInputElement>(null);

  // Scan confirmation modal states
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanModalSku, setScanModalSku] = useState('');
  const [scanModalRak, setScanModalRak] = useState('');
  const [scanModalUniqueCode, setScanModalUniqueCode] = useState('');
  const [scanModalTglMasuk, setScanModalTglMasuk] = useState('');
  const [scanModalTglScan, setScanModalTglScan] = useState('');
  const [scanModalRakAwal, setScanModalRakAwal] = useState('');
  const [scanModalLoading, setScanModalLoading] = useState(false);
  const [scanModalStatus, setScanModalStatus] = useState<'idle' | 'found' | 'not_found'>('idle');
  const [scanModalStep, setScanModalStep] = useState<'info' | 'scan_rak'>('info');
  const [showRakDropdown, setShowRakDropdown] = useState(false);
  const [isMobileRackModalOpen, setIsMobileRackModalOpen] = useState(false);
  const [mobileRackSearchTerm, setMobileRackSearchTerm] = useState('');
  const [devMode, setDevMode] = useState(false);
  const [devModeKeys, setDevModeKeys] = useState('');

  // Marquee state for running text
  const [showMarquee, setShowMarquee] = useState(true);

  const [validationAlert, setValidationAlert] = useState({
    isOpen: false,
    invalidCount: 0,
    errors: [] as string[]
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

  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationStats, setVerificationStats] = useState({ pendingManual: 0, pendingOffice: 0 });
  const [matchProgress, setMatchProgress] = useState({
    isMatching: false,
    progress: 0,
    current: 0,
    total: 0,
    message: ''
  });
  const [verificationDate, setVerificationDate] = useState(() => {
    // Default to today in YYYY-MM-DD format
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  });

  useEffect(() => {
    if (!showVerificationModal) {
      setMatchProgress({ isMatching: false, progress: 0, current: 0, total: 0, message: '' });
    }
  }, [showVerificationModal]);

  const [pendingManualData, setPendingManualData] = useState<any[]>([]);
  const [pendingOfficeData, setPendingOfficeData] = useState<any[]>([]);

  const fetchVerificationStats = useCallback(async (dateOverride?: string) => {
    const selectedDate = dateOverride || verificationDate;
    try {
      // 1. Fetch pending manual (gudang belum match)
      const { data: manualData, count: manualCount } = await supabase
        .from('manual_rack_updates')
        .select('*', { count: 'exact' })
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false })
        .limit(100);

      // 2. Fetch office inputs for selected date that are NOT yet matched
      const parsedStatsDate = selectedDate.match(/^\d{4}-\d{2}-\d{2}$/) 
        ? new Date(selectedDate) 
        : parseDateFlexible(selectedDate);
      const possibleFormatsStats = parsedStatsDate ? formatDateForSearch(parsedStatsDate) : [selectedDate];

      const { data: officeData, count: officeCount, error: oErr } = await supabase
        .from('database_log')
        .select('id, sku, tgl, tgl_scan, unique_code, status', { count: 'exact' })
        .eq('type', 'IN')
        .in('tgl', possibleFormatsStats)
        .is('matched_log_id', null)
        .order('created_at', { ascending: false })
        .limit(100);

      if (oErr) {
        console.warn('[VerStats] matched_log_id filter error (kolom mungkin belum ada):', oErr.message);
        // Fallback: fetch all IN records for the date
        const { data: fallbackData, count: fallbackCount } = await supabase
          .from('database_log')
          .select('id, sku, tgl, tgl_scan, unique_code, status', { count: 'exact' })
          .eq('type', 'IN')
          .in('tgl', possibleFormatsStats)
          .order('created_at', { ascending: false })
          .limit(100);
          
        setVerificationStats({ pendingManual: manualCount || 0, pendingOffice: fallbackCount || 0 });
        setPendingManualData(manualData || []);
        setPendingOfficeData(fallbackData || []);
        return;
      }

      setVerificationStats({
        pendingManual: manualCount || 0,
        pendingOffice: officeCount || 0
      });
      setPendingManualData(manualData || []);
      setPendingOfficeData(officeData || []);
      console.log(`📊 [VerStats] Manual: ${manualCount}, Office: ${officeCount} (Date: ${selectedDate})`);
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  }, [verificationDate]);
  
  // Fungsi pembantu untuk memastikan SKU terdaftar di rak di tabel stock_items (Data Gudang)
  const ensureStockItemExists = async (sku: string, rak: string) => {
    try {
      // 1. Cek apakah sudah ada di stock_items (Data Gudang)
      const { data: existing, error: checkErr } = await supabase
        .from('stock_items')
        .select('id')
        .eq('nama_produk', sku.trim())
        .eq('rak', rak.trim())
        .eq('status', 'Aktif')
        .limit(1);
      
      if (checkErr) throw checkErr;
      if (existing && existing.length > 0) return; // Sudah ada, tidak perlu buat baru

      console.log(`🔍 [AutoStock] SKU ${sku} belum ada di Rak ${rak}, mendaftarkan ke Data Gudang...`);

      // 2. Cari detail produk dari tabel products (untuk satuan)
      const { data: productData } = await supabase
        .from('products')
        .select('nama, satuan')
        .eq('nama', sku.trim())
        .limit(1)
        .maybeSingle();

      // 3. Daftarkan ke stock_items
      const { error: insErr } = await supabase.from('stock_items').insert({
        nama_produk: sku.trim(),
        rak: rak.trim(),
        sub_rak: rak.trim(),
        satuan: productData?.satuan || 'PCS',
        stok_awal: 0,
        status: 'Aktif'
      });

      if (insErr) throw insErr;
      console.log(`✨ [AutoStock] Berhasil mendaftarkan ${sku} di Rak ${rak} ke Data Gudang.`);
    } catch (e) {
      console.error('[AutoStock] Error:', e);
    }
  };

  const runAutoMatch = async () => {
    setManualLoading(true);
    setMatchProgress({
      isMatching: true,
      progress: 0,
      current: 0,
      total: 0,
      message: 'Memulai sinkronisasi otomatis...'
    });
    
    // Helper untuk jeda kecil agar tidak overload database
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    try {
      // 1. Get all pending manual updates ordered by FIFO
      const { data: manualEntries, error: mError } = await supabase
        .from('manual_rack_updates')
        .select('*')
        .eq('status', 'PENDING')
        .order('created_at', { ascending: true });

      if (mError) throw mError;
      if (!manualEntries || manualEntries.length === 0) {
        showToast('Tidak ada data manual yang perlu dicocokkan.', 'info');
        setMatchProgress({ isMatching: false, progress: 0, current: 0, total: 0, message: '' });
        return;
      }

      setMatchProgress(prev => ({ ...prev, message: 'Memuat data dari database...' }));

      // Extract unique SKUs to fetch only relevant data
      const manualSkus = Array.from(new Set(manualEntries.map(m => m.sku)));

      // 2. Load ALL relevant unmatched office data IN ADVANCE
      // We use pagination to bypass the 1000 row limit, just in case
      let allUnmatchedLogs: any[] = [];
      let from = 0;
      let hasMoreLogs = true;
      let fallbackMode = false;

      while (hasMoreLogs) {
        let query = supabase
          .from('database_log')
          .select('id, sku, rak, tgl, status')
          .eq('type', 'IN')
          .in('sku', manualSkus)
          .order('created_at', { ascending: true })
          .range(from, from + 999);
        
        if (!fallbackMode) {
           query = query.is('matched_log_id', null);
        }

        const { data: chunk, error: logErr } = await query;

        if (logErr) {
           if (!fallbackMode) {
             fallbackMode = true;
             from = 0; // reset
             allUnmatchedLogs = [];
             continue; // try again without matched_log_id filter
           } else {
             console.error("Error fetching logs:", logErr);
             hasMoreLogs = false;
           }
        } else if (chunk && chunk.length > 0) {
           allUnmatchedLogs = [...allUnmatchedLogs, ...chunk];
           if (chunk.length < 1000) {
             hasMoreLogs = false;
           } else {
             from += 1000;
           }
        } else {
           hasMoreLogs = false;
        }
      }

      // 3. Process matches in memory instantly
      let matchCount = 0;
      const matchedLogIds = new Set<string>();
      const total = manualEntries.length;
      
      const updatesLog = [];
      const updatesManual = [];
      const newStockItems = [];

      for (let i = 0; i < manualEntries.length; i++) {
        const manual = manualEntries[i];

        setMatchProgress(prev => ({
          ...prev,
          current: i + 1,
          total,
          progress: Math.round(((i + 1) / total) * 100),
          message: `Mencocokkan SKU ${manual.sku}...`
        }));

        const parsedDate = manual.tgl_update.match(/^\d{4}-\d{2}-\d{2}$/) 
          ? new Date(manual.tgl_update) 
          : parseDateFlexible(manual.tgl_update);
        const possibleFormats = parsedDate ? formatDateForSearch(parsedDate) : [manual.tgl_update];

        // Primary: Exact SKU + Date match (case-insensitive)
        let bestMatch = allUnmatchedLogs.find(c => 
          !matchedLogIds.has(String(c.id)) &&
          c.sku.toLowerCase() === manual.sku.toLowerCase() &&
          possibleFormats.includes(c.tgl)
        );

        // Secondary: Exact SKU match only (Fallback for wrong dates)
        if (!bestMatch) {
          bestMatch = allUnmatchedLogs.find(c => 
            !matchedLogIds.has(String(c.id)) &&
            c.sku.toLowerCase() === manual.sku.toLowerCase()
          );
        }

        if (bestMatch) {
          matchedLogIds.add(String(bestMatch.id));
          
          updatesLog.push({ id: bestMatch.id, rak: manual.rak, matched_log_id: manual.id, status: 'COMPLETED' });
          updatesManual.push({ id: manual.id, matched_log_id: bestMatch.id, status: 'MATCHED' });
          newStockItems.push({ sku: manual.sku, rak: manual.rak });

          matchCount++;
        }
      }

      // 4. Batch Execution with progress updates
      if (matchCount > 0) {
         setMatchProgress(prev => ({ 
           ...prev, 
           message: 'Menyimpan hasil ke database...', 
           total: updatesLog.length, 
           current: 0, 
           progress: 0 
         }));

         const BATCH_SIZE = 20;
         for (let i = 0; i < updatesLog.length; i += BATCH_SIZE) {
            const chunkLog = updatesLog.slice(i, i + BATCH_SIZE);
            const chunkManual = updatesManual.slice(i, i + BATCH_SIZE);
            const chunkStock = newStockItems.slice(i, i + BATCH_SIZE);

            // Update database_log
            await Promise.all(chunkLog.map(async (ul) => {
               const { error } = await supabase.from('database_log').update({ rak: ul.rak, status: ul.status, matched_log_id: ul.matched_log_id }).eq('id', ul.id);
               if (error) {
                 await supabase.from('database_log').update({ rak: ul.rak, status: ul.status }).eq('id', ul.id);
               }
            }));

            // Update manual_rack_updates
            await Promise.all(chunkManual.map(async (um) => {
               await supabase.from('manual_rack_updates').update({ status: um.status }).eq('id', um.id);
            }));

            // Ensure stock items exist sequentially to avoid product table query conflicts
            for (const st of chunkStock) {
               await ensureStockItemExists(st.sku, st.rak);
            }

            setMatchProgress(prev => ({ 
              ...prev, 
              current: Math.min(updatesLog.length, i + BATCH_SIZE),
              progress: Math.round((Math.min(updatesLog.length, i + BATCH_SIZE) / updatesLog.length) * 100) 
            }));
         }
      }

      if (matchCount > 0) {
         setMatchProgress(prev => ({ 
           ...prev, 
           message: `✅ Selesai! Berhasil mencocokkan ${matchCount} data.`,
           progress: 100
         }));
      } else {
         setMatchProgress({ isMatching: false, progress: 0, current: 0, total: 0, message: '' });
      }

      setVerificationStats(prev => ({
        ...prev,
        pendingManual: Math.max(0, prev.pendingManual - matchCount),
        pendingOffice: Math.max(0, prev.pendingOffice - matchCount)
      }));

      if (matchCount > 0) {
        showToast(`✅ Berhasil mencocokkan ${matchCount} data!`, 'success');
      }
      fetchVerificationStats();
      loadFilteredTransactions();
    } catch (e: any) {
      console.error('[AutoMatch] Error:', e);
      showToast(`❌ Sinkronisasi gagal: ${e.message}`, 'error');
      setMatchProgress({ isMatching: false, progress: 0, current: 0, total: 0, message: '' });
    } finally {
      setManualLoading(false);
    }
  };

  const clearRemainingBacklog = async () => {
    if (!window.confirm('Apakah Anda yakin ingin HAPUS PERMANEN sisa backlog gudang? (Hanya lakukan ini jika Anda yakin data tersebut sudah usang atau sudah diupdate manual)')) {
      return;
    }
    
    setManualLoading(true);
    try {
      const { error } = await supabase
        .from('manual_rack_updates')
        .delete()
        .eq('status', 'PENDING');
        
      if (error) throw error;
      
      showToast('Sisa backlog gudang berhasil dihapus!', 'success');
      fetchVerificationStats();
    } catch (e: any) {
      console.error('[ClearBacklog] Error:', e);
      showToast(`Gagal menghapus backlog: ${e.message}`, 'error');
    } finally {
      setManualLoading(false);
    }
  };

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') => {
    setToast({ isOpen: true, message, type });
    setTimeout(() => {
      setToast({ isOpen: false, message: '', type: 'info' });
    }, 4000);
  }, []);

  // ===== MANUAL EDIT MODAL STATE =====
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualSku, setManualSku] = useState('');
  const [manualRak, setManualRak] = useState('');
  const [manualTgl, setManualTgl] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const [showManualSkuDropdown, setShowManualSkuDropdown] = useState(false);
  const [isMobileSkuModalOpen, setIsMobileSkuModalOpen] = useState(false);
  const [mobileSkuSearchTerm, setMobileSkuSearchTerm] = useState('');
  const [manualRakDropdown, setManualRakDropdown] = useState(false);
  const [isMobileManualRackOpen, setIsMobileManualRackOpen] = useState(false);
  const [mobileManualRackSearch, setMobileManualRackSearch] = useState('');

  const handleManualEdit = useCallback(() => {
    setManualSku('');
    setManualRak('');
    setManualTgl(new Date().toISOString().split('T')[0]);
    setShowManualModal(true);
    // Auto-open SKU picker on mobile
    setTimeout(() => {
      if (window.innerWidth < 1024) {
        setIsMobileSkuModalOpen(true);
      }
    }, 300);
  }, []);

  const handleManualSave = async () => {
    if (!manualSku || !manualRak) {
      showToast('SKU dan Lokasi Rak harus diisi!', 'warning');
      return;
    }
    setManualLoading(true);
    try {
      const today = new Date();
      const tglValue = manualTgl || today.toISOString().split('T')[0];

      // Using a new table 'manual_rack_updates' as a temporary container
      // This allows matching later with office input (database_log IN)
      const { error } = await supabase
        .from('manual_rack_updates')
        .insert({
          sku: manualSku.trim().toUpperCase(),
          rak: manualRak.trim().toUpperCase(),
          tgl_update: tglValue,
          status: 'PENDING',
          updated_by: 'gudang_manual'
        });

      if (error) {
        // Fallback or specific error handling for table existence
        if (error.code === '42P01') {
          throw new Error('Tabel manual_rack_updates belum ada di Supabase. Silakan buat tabelnya terlebih dahulu.');
        }
        throw error;
      }

      showToast(`✅ Tersimpan di wadah sementara! ${manualSku} di Rak ${manualRak}.`, 'success');
      setShowManualModal(false);
      // Optional: Refresh any list if we add a "Manual Records" view later
    } catch (e: any) {
      console.error('[ManualEdit] Error:', e);
      showToast(`❌ Gagal: ${e.message}`, 'error');
    } finally {
      setManualLoading(false);
    }
  };

  // DevMode Trigger Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const char = e.key.toLowerCase();
      if (/^[a-z0-9]$/.test(char)) {
        setDevModeKeys(prev => {
          const next = (prev + char).slice(-7); // Keep last 7 chars for "devmode"
          if (next === 'devmode') {
            setDevMode(true);
            setShowScanModal(true);
            setScanModalSku('');
            setScanModalUniqueCode('');
            setScanModalStatus('idle');
            showToast('DEV MODE ACTIVE: Fields Unlocked!', 'warning');
            return '';
          }
          return next;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showToast]);

  const handleScanResult = useCallback(async (decodedText: string) => {
    const rawText = decodedText.trim();
    console.log('[SmartScan] Received scan:', rawText, 'Step:', scanStepRef.current, 'Cooldown:', scanCooldownRef.current);
    if (!rawText || scanCooldownRef.current) return;

    // Reset cooldown for modal flow
    scanCooldownRef.current = true;
    setShowScanner(false);

    // Step 1: Parsing Complex Barcode
    // Format possible: [Date] [SKU] [UniqueCode] or just [SKU]
    // We try splitting by Tab, Double Space, and also Single Space as fallback for 3 parts
    let extractedDate: string | null = null;
    let extractedSku = '';
    let extractedUniqueCode: string | null = null;

    const parts = rawText.split(/\t|\s\s+/).map(p => p.trim()).filter(Boolean);

    if (parts.length >= 2) {
      // Logic for Tab/Double Space separated parts
      const datePart = parts[0];
      const dateMatch = datePart.match(/^(\d{2}[-/]\d{2}[-/]\d{4})$/) || datePart.match(/^(\d{4}[-/]\d{2}[-/]\d{2})$/);

      if (dateMatch) {
        const dStr = datePart.replace(/\//g, '-');
        if (dStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
          const [dd, mm, yyyy] = dStr.split('-');
          extractedDate = `${yyyy}-${mm}-${dd}`;
        } else {
          extractedDate = dStr;
        }
        extractedSku = parts[1];
        extractedUniqueCode = parts.length > 2 ? parts[2] : null;
      } else {
        extractedSku = parts[0];
        extractedUniqueCode = parts[1];
      }
    } else {
      // Handle Single Space separation for 3 parts: [Date] [SKU] [SN]
      const spaceParts = rawText.split(/\s+/).map(p => p.trim()).filter(Boolean);
      const firstPart = spaceParts[0];
      const isDate = firstPart.match(/^(\d{2}[-/]\d{2}[-/]\d{4})$/) || firstPart.match(/^(\d{4}[-/]\d{2}[-/]\d{2})$/);

      if (isDate && spaceParts.length >= 3) {
        const dStr = firstPart.replace(/\//g, '-');
        if (dStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
          const [dd, mm, yyyy] = dStr.split('-');
          extractedDate = `${yyyy}-${mm}-${dd}`;
        } else {
          extractedDate = dStr;
        }
        extractedSku = spaceParts[1];
        extractedUniqueCode = spaceParts.slice(2).join(' '); // SN might have spaces
      } else {
        // Fallback to legacy regex or just SKU
        const legacyMatch = rawText.match(/^(\d{2}[-/]\d{2}[-/]\d{4})\s+(.+)$/);
        if (legacyMatch) {
          const dStr = legacyMatch[1].replace(/\//g, '-');
          const [dd, mm, yyyy] = dStr.split('-');
          extractedDate = `${yyyy}-${mm}-${dd}`;
          extractedSku = legacyMatch[2].trim();
        } else {
          extractedSku = rawText;
        }
      }
    }

    console.log('[SmartScan] Parsed Result:', { sku: extractedSku, date: extractedDate, unique: extractedUniqueCode });

    // Save to ref
    scannedDataRef.current = { sku: extractedSku, tgl: extractedDate, uniqueCode: extractedUniqueCode };

    // Prepare Modal
    const today = new Date();
    const todayFormatted = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;

    setScanModalSku(extractedSku);
    setScanModalTglScan(extractedDate || '');
    setScanModalUniqueCode(extractedUniqueCode || '');
    setScanModalTglMasuk(extractedDate || todayFormatted);
    setScanModalRakAwal('');
    setScanModalRak('');
    setScanModalStatus('idle');
    setScanModalLoading(true);
    setShowScanModal(true);
    try {
    const performDataLookup = async (sku: string, targetDate: string, uniqueCode: string | null) => {
      // Create date variations
      let dateVariations = [targetDate];
      const cleanDate = targetDate.replace(/\//g, '-');
      if (cleanDate.includes('-')) {
        const parts = cleanDate.split('-');
        if (parts.length === 3) {
          if (parts[0].length === 4) { // YYYY-MM-DD
            const [y, m, d] = parts;
            dateVariations.push(`${d}-${m}-${y}`); // DD-MM-YYYY
            dateVariations.push(`${d}/${m}/${y}`); // DD/MM/YYYY
          } else { // DD-MM-YYYY
            const [d, m, y] = parts;
            dateVariations.push(`${y}-${m}-${d}`); // YYYY-MM-DD
            dateVariations.push(`${d}/${m}/${y}`); // DD/MM/YYYY
          }
        }
      }
      
      const dateFilters = Array.from(new Set(dateVariations)).flatMap(d => [`tgl_scan.eq.${d}`, `tgl.eq.${d}`]).join(',');

      // Create unique code variations (with/without SN-)
      let snVariations = uniqueCode ? [uniqueCode] : [];
      if (uniqueCode && uniqueCode.toUpperCase().startsWith('SN-')) {
        snVariations.push(uniqueCode.substring(3));
      } else if (uniqueCode && !uniqueCode.toUpperCase().startsWith('SN-')) {
        snVariations.push(`SN-${uniqueCode}`);
      }

      try {
        console.log('[SmartScan] Search variation:', { sku, snVariations });

        // 1. If unique code is present, search primarily by SN + SKU (MOST ACCURATE)
        if (snVariations.length > 0) {
          const snFilters = snVariations.map(sn => `unique_code.eq.${sn}`).join(',');
          
          // Try to find the MOST RECENT entry with this SN and SKU
          const { data: snMatch, error: snError } = await supabase
            .from('database_log')
            .select('rak, unique_code, status, tgl, tgl_scan')
            .ilike('sku', sku.trim())
            .eq('type', 'IN')
            .or(snFilters)
            .order('created_at', { ascending: false })
            .limit(1);

          if (snMatch && snMatch.length > 0) {
            console.log('[SmartScan] Found match by SN:', snMatch[0]);
            return { 
                success: true, 
                rak: snMatch[0].rak || 'TIDAK ADA',
                status: snMatch[0].status 
            };
          }
          
          if (snError) console.error('[SmartScan] SN Search Error:', snError);
        }

        // 2. FALLBACK: If no SN match or no SN provided, search by SKU + Date (TRADITIONAL)
        const { data: dateMatch, error: dateError } = await supabase
          .from('database_log')
          .select('rak, unique_code, status, tgl, tgl_scan')
          .ilike('sku', sku.trim())
          .eq('type', 'IN')
          .or(dateFilters)
          .order('created_at', { ascending: false })
          .limit(1);

        if (dateMatch && dateMatch.length > 0) {
          console.log('[SmartScan] Found match by Date:', dateMatch[0]);
          return { 
              success: true, 
              rak: dateMatch[0].rak || 'TIDAK ADA',
              status: dateMatch[0].status
          };
        }

        if (dateError) console.error('[SmartScan] Date Search Error:', dateError);

        return { success: false, rak: 'DATA TIDAK ADA' };
      } catch (err) {
        console.error('[SmartScan] Unexpected lookup error:', err);
        return { success: false, rak: 'ERROR UNEXPECTED' };
      }
    };

    const targetDate = extractedDate || todayFormatted;
    const result = await performDataLookup(extractedSku, targetDate, extractedUniqueCode);

    if (result.success) {
      setScanModalRakAwal(result.rak);
      setScanModalStatus('found');
    } else {
      setScanModalRakAwal('');
      setScanModalStatus('not_found');
    }
    } catch (e) {
      console.error('[SmartScan] Lookup error:', e);
      setScanModalStatus('not_found');
    } finally {
      setScanModalLoading(false);
      setTimeout(() => { scanCooldownRef.current = false; }, 500);
    }
  }, [showToast]);

  const handleScanModalSave = async () => {
    if (!scanModalSku || !scanModalRak) {
      showToast('SKU dan Rak harus diisi!', 'warning');
      return;
    }

    setScanModalLoading(true);
    try {
      const sku = scanModalSku;
      const scannedRak = scanModalRak;
      const uniqueCode = scanModalUniqueCode;

      // 1. SEARCH for the existing record to update (SKU + SN is enough)
      let searchBySn = supabase
        .from('database_log')
        .select('id, rak, status')
        .ilike('sku', sku.trim())
        .eq('type', 'IN');

      if (uniqueCode) {
        // Precise search if SN is provided
        searchBySn = searchBySn.eq('unique_code', uniqueCode);
      } else {
        // If no SN, use the date filter as a fallback to avoid updating wrong rows
        const today = new Date();
        const todayFormatted = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
        const finalTglScan = scanModalTglMasuk || todayFormatted;
        searchBySn = searchBySn.or(`tgl_scan.eq.${finalTglScan},tgl.eq.${finalTglScan}`);
      }

      const { data: existingData, error: searchError } = await searchBySn
        .order('created_at', { ascending: false }) // Get the latest one
        .limit(1);

      if (searchError) throw searchError;

      if (existingData && existingData.length > 0) {
        // 2. UPDATE existing record
        const targetId = existingData[0].id;
        const currentStatus = existingData[0].status;
        
        // Decide next status: 
        // If it was PENDING or UNVERIFIED, move to COMPLETED
        // If it was already COMPLETED/VERIFIED, just keep it or re-verify? 
        // Let's use COMPLETED as the goal for rack updates.
        const nextStatus = (currentStatus === 'PENDING' || currentStatus === 'UNVERIFIED') ? 'COMPLETED' : currentStatus;

        const { error: updateError } = await supabase
          .from('database_log')
          .update({
            rak: scannedRak,
            sub_rak: scannedRak,
            unique_code: uniqueCode, // Update in case it was missing
            status: nextStatus
          })
          .eq('id', targetId);

        if (updateError) throw updateError;

        // [FITUR BARU] Pastikan terdaftar di Data Gudang (stock_items)
        await ensureStockItemExists(sku, scannedRak);

        showToast(`✅ Berhasil Update! ${sku} → Rak ${scannedRak}`, 'success');
      } else {
        // 3. If NOT FOUND, show error (User specifically asked not to insert new data)
        showToast(`❌ Data tidak ditemukan untuk SKU ${sku} ${uniqueCode ? 'dengan SN ' + uniqueCode : ''}. Pastikan data sudah diinput di Barang Masuk.`, 'error');
      }

      setShowScanModal(false);
      loadFilteredTransactions();
    } catch (e: any) {
      console.error('[SmartScan] Error:', e);
      showToast(`❌ Gagal memproses: ${e.message}`, 'error');
    } finally {
      setScanModalLoading(false);
    }
  };

  useEffect(() => {
    loadInitialMetadata();
  }, []);

  useEffect(() => {
    if (filters.tanggal_masuk) {
      loadFilteredTransactions();
    } else {
      setFilteredTransactions([]);
      setPaginationInfo({
        currentPage: 1,
        totalPages: 0,
        totalCount: 0,
        hasNextPage: false,
        hasPrevPage: false
      });
    }
  }, [filters, currentPage, itemsPerPage]);

  useEffect(() => {
    setBarangSearchTerm(filters.barang);
  }, [filters.barang]);

  useEffect(() => {
    setGudangSearchTerm(filters.inisial_gudang);
  }, [filters.inisial_gudang]);

  // Re-trigger lookup when modal inputs change
  useEffect(() => {
    // Only run if modal is open and we have enough data, and not already loading
    if (showScanModal && scanModalSku && !scanModalLoading) {
      const performLookup = async () => {
        setScanModalLoading(true);
        
        // Date variations for robust matching
        let dateVariations = [scanModalTglMasuk];
        const cleanDate = scanModalTglMasuk.replace(/\//g, '-');
        if (cleanDate.includes('-')) {
          const parts = cleanDate.split('-');
          if (parts.length === 3) {
            if (parts[0].length === 4) { // YYYY-MM-DD
              const [y, m, d] = parts;
              dateVariations.push(`${d}-${m}-${y}`); 
              dateVariations.push(`${d}/${m}/${y}`);
            } else { // DD-MM-YYYY
              const [d, m, y] = parts;
              dateVariations.push(`${y}-${m}-${d}`);
              dateVariations.push(`${d}/${m}/${y}`);
            }
          }
        }
        const dateFilters = Array.from(new Set(dateVariations)).flatMap(d => [`tgl_scan.eq.${d}`, `tgl.eq.${d}`]).join(',');

        // Unique code variations
        let snVariations = scanModalUniqueCode ? [scanModalUniqueCode] : [];
        if (scanModalUniqueCode && scanModalUniqueCode.toUpperCase().startsWith('SN-')) {
          snVariations.push(scanModalUniqueCode.substring(3));
        } else if (scanModalUniqueCode && !scanModalUniqueCode.toUpperCase().startsWith('SN-')) {
          snVariations.push(`SN-${scanModalUniqueCode}`);
        }

        console.log('[SmartScan] Re-lookup with variations:', { dateVariations, snVariations });
        
        try {
          // PRIMARY: Pending
          let query = supabase
            .from('database_log')
            .select('rak, status')
            .ilike('sku', scanModalSku.trim())
            .eq('type', 'IN')
            .eq('status', 'PENDING')
            .or(dateFilters);

          if (snVariations.length > 0) {
            const snFilters = snVariations.map(sn => `unique_code.eq.${sn}`).join(',');
            query = query.or(`${snFilters},unique_code.is.null,unique_code.eq.""`);
          }

          const { data, error } = await query
            .order('created_at', { ascending: true })
            .limit(1);

          if (error) {
            console.error('[SmartScan] Re-lookup Query Error:', error);
            setScanModalRakAwal('ERROR QUERY');
            setScanModalStatus('not_found');
          } else if (data && data.length > 0) {
            setScanModalRakAwal(data[0].rak || 'TIDAK ADA');
            setScanModalStatus('found');
          } else {
            // FALLBACK: Search ALL statuses
            let fallbackQuery = supabase
              .from('database_log')
              .select('rak, status')
              .ilike('sku', scanModalSku.trim())
              .eq('type', 'IN')
              .or(dateFilters);

            if (snVariations.length > 0) {
              const snFilters = snVariations.map(sn => `unique_code.eq.${sn}`).join(',');
              fallbackQuery = fallbackQuery.or(snFilters);
            }

            const { data: fallbackData } = await fallbackQuery.limit(1);
              
            if (fallbackData && fallbackData.length > 0) {
              setScanModalRakAwal(`STATUS: ${fallbackData[0].status} (${fallbackData[0].rak})`);
              setScanModalStatus('not_found');
            } else {
              setScanModalRakAwal('DATA TIDAK ADA');
              setScanModalStatus('not_found');
            }
          }
        } catch (e) {
          console.error('[SmartScan] Re-lookup Unexpected Error:', e);
          setScanModalStatus('not_found');
        } finally {
          setScanModalLoading(false);
        }
      };

      const timer = setTimeout(performLookup, 600);
      return () => clearTimeout(timer);
    }
  }, [scanModalTglMasuk, scanModalSku, scanModalUniqueCode, showScanModal]);

  const loadInitialMetadata = async () => {
    try {
      setInitialLoading(true);
      showToast('Memuat metadata...', 'info');

      // Fetch products
      const [productsResult] = await Promise.all([
        fetchAllProducts()
      ]);

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

      setProducts(productsData);

      await Promise.all([
        loadWarehouses(),
        loadRackLocations(),
        fetchVerificationStats()
      ]);

      setDataLoaded(true);
      showToast(`Metadata dimuat: ${productsData.length.toLocaleString()} produk, ${warehouses.length} gudang`, 'success');

    } catch (error) {
      console.error('Error loading metadata:', error);
      showToast('Gagal memuat metadata', 'error');
    } finally {
      setInitialLoading(false);
    }
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
        let day: number = 0, month: number = 0, year: number = 0;

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

        const date: Date = new Date(year, month, day);

        if (date.getFullYear() === year &&
          date.getMonth() === month &&
          date.getDate() === day) {
          return date;
        }
      }
    }

    return null;
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

  const loadFilteredTransactions = async () => {
    if (!filters.tanggal_masuk) {
      setFilteredTransactions([]);
      setPaginationInfo({
        currentPage: 1,
        totalPages: 0,
        totalCount: 0,
        hasNextPage: false,
        hasPrevPage: false
      });
      return;
    }

    try {
      setLoading(true);

      let selectedDate: Date;

      if (filters.tanggal_masuk.match(/^\d{4}-\d{2}-\d{2}$/)) {
        selectedDate = new Date(filters.tanggal_masuk);
      } else {
        const parsedDate = parseDateFlexible(filters.tanggal_masuk);
        if (!parsedDate) {
          showToast('Format tanggal tidak valid. Gunakan format DD/MM/YYYY, DD-MM-YYYY, atau YYYY-MM-DD', 'error');
          return;
        }
        selectedDate = parsedDate;
      }

      const possibleFormats = formatDateForSearch(selectedDate);

      let query = supabase
        .from('database_log')
        .select('*', { count: 'exact' })
        .eq('type', 'IN')
        .in('tgl', possibleFormats)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });

      if (filters.barang) {
        query = query.ilike('sku', `%${filters.barang}%`);
      }
      if (filters.inisial_gudang) {
        query = query.ilike('gudang', `%${filters.inisial_gudang}%`);
      }

      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) {
        console.error('Error loading filtered transactions:', error);
        showToast('Gagal memuat data transaksi', 'error');
        return;
      }

      const transactionItems: TransactionItem[] = (data || []).map(item => {
        const thresholdDate = "2026-03-01";
        const tglScan = item.tgl_scan || '';

        let isLocked = false;
        let lockReason = '';

        // Aturan 1: Jika rak sudah bukan UTAMA (sudah pernah diupdate sekali)
        if (item.rak && item.rak.toUpperCase() !== 'UTAMA') {
          isLocked = true;
          lockReason = 'Sudah pernah diupdate (Telah dipindah dari UTAMA)';
        }
        // Aturan Baru: Jika tgl_scan sebelum 01 Maret 2026
        else if (tglScan && tglScan < thresholdDate) {
          isLocked = true;
          lockReason = 'Data terkunci (Sebelum 01 Maret 2026)';
        }
        // Logika ganti hari dihapus sesuai permintaan: selama >= 01 Maret dan lokasi UTAMA, tetap bisa update.

        return {
          id: item.id,
          tgl: item.tgl,
          waktu: item.waktu,
          sku: item.sku,
          jumlah: item.jumlah,
          type: item.type as 'IN' | 'OUT' | 'MOVE',
          gudang: item.gudang,
          rak: item.rak,
          tgl_scan: tglScan,
          user_name: item.user_name || '',
          log_update_user: item.log_update_user || '',
          lokasi_penyimpanan: item.rak,
          update_lokasi_rak: '',
          isLocked,
          lockReason
        };
      });

      // Aturan 3: Cek apakah ada data OUT (pemotongan) yang sudah terjadi
      // Optimasi: Gunakan satu batch query untuk mengecek semua item sekaligus
      const itemsToCheck = transactionItems.filter(item => !item.isLocked);

      if (itemsToCheck.length > 0) {
        // Buat filter OR untuk SKU, Rak, dan Tgl Scan yang spesifik
        // Format: (and(sku.eq.XXX,rak.eq.YYY,tgl_scan.eq.ZZZ),and(...))
        const filterStrings = itemsToCheck.map(item =>
          `and(sku.eq."${item.sku}",rak.eq."${item.rak}",tgl_scan.eq."${item.tgl_scan}")`
        );

        // Kita bagi menjadi beberapa batch (misal per 50 item) agar query tidak terlalu panjang
        const batchQuerySize = 50;
        for (let i = 0; i < filterStrings.length; i += batchQuerySize) {
          const currentBatchFilters = filterStrings.slice(i, i + batchQuerySize);
          const { data: outRecords, error: outError } = await supabase
            .from('database_log')
            .select('sku, rak, tgl_scan')
            .eq('type', 'OUT')
            .or(currentBatchFilters.join(','));

          if (!outError && outRecords && outRecords.length > 0) {
            // Tandai item yang cocok dengan data OUT yang ditemukan
            outRecords.forEach(out => {
              transactionItems.forEach(item => {
                if (item.sku === out.sku && item.rak === out.rak && item.tgl_scan === out.tgl_scan) {
                  item.isLocked = true;
                  item.lockReason = 'Data sudah terkunci karena ada pemotongan (OUT)';
                }
              });
            });
          }
        }
      }

      setFilteredTransactions(transactionItems);

      const totalPages = Math.ceil((count || 0) / itemsPerPage);
      setPaginationInfo({
        currentPage,
        totalPages,
        totalCount: count || 0,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1
      });

      if (transactionItems.length > 0) {
        showToast(`Berhasil memuat ${transactionItems.length} dari ${(count || 0).toLocaleString()} transaksi untuk tanggal ${filters.tanggal_masuk}`, 'success');
      } else {
        showToast(`Tidak ada transaksi IN untuk tanggal ${filters.tanggal_masuk}`, 'warning');
      }

    } catch (error) {
      console.error('Error loading filtered transactions:', error);
      showToast('Terjadi kesalahan saat memuat data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadWarehouses = async () => {
    try {
      const { data, error } = await supabase
        .from('warehouses')
        .select('id, nama, status')
        .eq('status', 'Aktif')
        .order('nama', { ascending: true });

      if (error) {
        console.error('Error loading warehouses:', error);
        return;
      }

      setWarehouses(data || []);
      return data || [];
    } catch (error) {
      console.error('Error loading warehouses:', error);
      return [];
    }
  };

  const loadRackLocations = async () => {
    try {
      const excludedRacks = [
        'UTAMA'
      ];

      const { data, error } = await supabase
        .from('rack_locations')
        .select('id, nama, status')
        .eq('status', 'Aktif')
        .not('nama', 'in', `(${excludedRacks.join(',')})`)
        .order('nama', { ascending: true });

      if (error) {
        console.error('Error loading rack locations:', error);
        return;
      }

      // Ensure unique rack names
      const uniqueData = (data || []).reduce((acc: any[], current: any) => {
        const x = acc.find(item => item.nama === current.nama);
        if (!x) {
          return acc.concat([current]);
        } else {
          return acc;
        }
      }, []);

      setRackLocations(uniqueData);
    } catch (error) {
      console.error('Error loading rack locations:', error);
    }
  };

  const updateLocation = (id: string, field: 'update_lokasi_rak', value: string) => {
    setFilteredTransactions(filteredTransactions.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const refreshData = useCallback(() => {
    setDataLoaded(false);
    loadInitialMetadata();
    setFilters({
      tanggal_masuk: '',
      barang: '',
      inisial_gudang: ''
    });
    setBarangSearchTerm('');
    setGudangSearchTerm('');
  }, []);

  const clearAll = () => {
    setFilters({
      tanggal_masuk: '',
      barang: '',
      inisial_gudang: ''
    });
    setBarangSearchTerm('');
    setGudangSearchTerm('');
    setCurrentPage(1);
  };

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const validateTransactions = (): { isValid: boolean; invalidCount: number; errors: string[] } => {
    const updatedTransactions = filteredTransactions.map(item => ({
      ...item,
      isValid: true
    }));

    setFilteredTransactions(updatedTransactions);

    return {
      isValid: true,
      invalidCount: 0,
      errors: []
    };
  };

  const handleSubmit = async () => {
    // Restrict Update Lokasi execution to Mobile devices (< 768px screen width)
    if (window.innerWidth >= 768) {
      showToast('📱 Fitur Update Lokasi hanya dapat dilakukan dari perangkat Mobile / HP.', 'warning');
      return;
    }

    try {
      validateTransactions();

      setSubmitting(true);

      const itemsToUpdate = filteredTransactions.filter(item =>
        item.update_lokasi_rak.trim() !== ''
      );

      if (itemsToUpdate.length === 0) {
        showToast('Tidak ada data yang akan diupdate. Silakan isi kolom Update Lokasi Rak terlebih dahulu.', 'warning');
        setSubmitting(false); // Pastikan state submitting di-reset
        return;
      }

      let successCount = 0;
      let errorCount = 0;
      let newStockItemsCount = 0;
      const updatedItemIds: string[] = [];

      for (const item of itemsToUpdate) {
        if (item.isLocked) {
          errorCount++;
          console.warn(`Attempted to update locked item: ${item.sku}`);
          continue;
        }

        try {
          const { data: existingStockItems, error: checkError } = await supabase
            .from('stock_items')
            .select('id')
            .eq('nama_produk', item.sku)
            .eq('rak', item.update_lokasi_rak)
            .limit(1);

          if (checkError) {
            console.error('Error checking existing stock items:', checkError);
          }

          if (!existingStockItems || existingStockItems.length === 0) {
            const { error: insertError } = await supabase
              .from('stock_items')
              .insert([{
                nama_produk: item.sku,
                packing: 'CTN/',
                rak: item.update_lokasi_rak,
                sub_rak: item.update_lokasi_rak,
                satuan: 'PCS',
                stok_awal: 0,
                status: 'Aktif'
              }]);

            if (insertError) {
              console.error('Error creating new stock item:', insertError);
            } else {
              newStockItemsCount++;
            }
          }

          const { error } = await supabase
            .from('database_log')
            .update({
              rak: item.update_lokasi_rak,
              sub_rak: item.update_lokasi_rak,
              log_update_user: userEmail || 'Unknown User'
            })
            .eq('id', item.id);

          if (error) {
            console.error('Error updating item:', error);
            errorCount++;
          } else {
            successCount++;
            updatedItemIds.push(item.id);
          }
        } catch (error) {
          console.error('Error updating item:', error);
          errorCount++;
        }
      }

      if (successCount > 0) {
        const message = newStockItemsCount > 0
          ? `Berhasil mengupdate ${successCount} lokasi rak dan membuat ${newStockItemsCount} data stock_items baru!`
          : `Berhasil mengupdate ${successCount} lokasi rak!`;
        showToast(message, 'success');

        // --- Perbaikan di sini: Update state lokal secara langsung
        setFilteredTransactions(prevTransactions =>
          prevTransactions.map(item => {
            if (updatedItemIds.includes(item.id)) {
              // Temukan item yang berhasil diupdate dan perbarui propertinya
              const updatedItem = itemsToUpdate.find(i => i.id === item.id);
              const newRak = updatedItem?.update_lokasi_rak || item.rak;

              // Tentukan apakah harus langsung dikunci
              const shouldLock = newRak.toUpperCase() !== 'UTAMA';

              return {
                ...item,
                rak: newRak,
                lokasi_penyimpanan: newRak,
                log_update_user: userEmail || 'Unknown User',
                update_lokasi_rak: '', // Kosongkan input
                isValid: true,
                isLocked: shouldLock,
                lockReason: shouldLock ? 'Sudah diupdate (telah dipindah dari UTAMA)' : item.lockReason
              };
            }
            return item;
          })
        );
      }

      if (errorCount > 0) {
        const message = newStockItemsCount > 0
          ? `${successCount} berhasil diupdate (${newStockItemsCount} stock_items baru dibuat), ${errorCount} gagal. Silakan coba lagi untuk yang gagal.`
          : `${successCount} berhasil diupdate, ${errorCount} gagal. Silakan coba lagi untuk yang gagal.`;
        showToast(message, 'warning');
      }

    } catch (error) {
      console.error('Error submitting updates:', error);
      showToast('Terjadi kesalahan saat mengupdate data', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBarangInputChange = useCallback((value: string) => {
    setBarangSearchTerm(value);
    setFilters(prev => ({ ...prev, barang: value }));
    setShowBarangDropdown(true);
    setCurrentPage(1);
  }, []);

  const handleBarangSelect = useCallback((productName: string) => {
    setBarangSearchTerm(productName);
    setFilters(prev => ({ ...prev, barang: productName }));
    setShowBarangDropdown(false);
    setCurrentPage(1);
  }, []);

  const clearBarang = useCallback(() => {
    setBarangSearchTerm('');
    setFilters(prev => ({ ...prev, barang: '' }));
    setShowBarangDropdown(false);
    if (barangInputRef.current) {
      barangInputRef.current.focus();
    }
  }, []);

  const handleBarangKeyDown = useCallback((e: React.KeyboardEvent) => {
    const filtered = products.filter(product =>
      product.nama.toLowerCase().includes(barangSearchTerm.toLowerCase())
    ).slice(0, 50);

    if (e.key === 'ArrowDown' && showBarangDropdown && filtered.length > 0) {
      e.preventDefault();
      setBarangHighlightedIndex(prev => prev >= filtered.length - 1 ? 0 : prev + 1);
    } else if (e.key === 'ArrowUp' && showBarangDropdown && filtered.length > 0) {
      e.preventDefault();
      setBarangHighlightedIndex(prev => prev <= 0 ? filtered.length - 1 : prev - 1);
    } else if ((e.key === 'Enter' || e.key === 'Tab') && showBarangDropdown && barangHighlightedIndex >= 0 && barangHighlightedIndex < filtered.length) {
      e.preventDefault();
      handleBarangSelect(filtered[barangHighlightedIndex].nama);
    } else if (e.key === 'Escape') {
      setShowBarangDropdown(false);
      setBarangHighlightedIndex(0);
    }
  }, [products, barangSearchTerm, showBarangDropdown, barangHighlightedIndex, handleBarangSelect]);

  const handleGudangInputChange = useCallback((value: string) => {
    setGudangSearchTerm(value);
    setFilters(prev => ({ ...prev, inisial_gudang: value }));
    setShowGudangDropdown(true);
    setGudangHighlightedIndex(0);
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
    if (gudangInputRef.current) {
      gudangInputRef.current.focus();
    }
  }, []);

  const handleGudangKeyDown = useCallback((e: React.KeyboardEvent) => {
    const filtered = warehouses.filter(warehouse =>
      warehouse.nama.toLowerCase().includes(gudangSearchTerm.toLowerCase())
    ).slice(0, 50);

    if (e.key === 'ArrowDown' && showGudangDropdown && filtered.length > 0) {
      e.preventDefault();
      setGudangHighlightedIndex(prev => prev >= filtered.length - 1 ? 0 : prev + 1);
    } else if (e.key === 'ArrowUp' && showGudangDropdown && filtered.length > 0) {
      e.preventDefault();
      setGudangHighlightedIndex(prev => prev <= 0 ? filtered.length - 1 : prev - 1);
    } else if (e.key === 'Enter' && showGudangDropdown && gudangHighlightedIndex >= 0 && gudangHighlightedIndex < filtered.length) {
      e.preventDefault();
      handleGudangSelect(filtered[gudangHighlightedIndex].nama);
    } else if (e.key === 'Escape') {
      setShowGudangDropdown(false);
      setGudangHighlightedIndex(0);
    }
  }, [warehouses, gudangSearchTerm, showGudangDropdown, gudangHighlightedIndex, handleGudangSelect]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      if (barangInputRef.current && !barangInputRef.current.contains(target) && !target.closest('.dropdown-container')) {
        setShowBarangDropdown(false);
      }

      if (gudangInputRef.current && !gudangInputRef.current.contains(target) && !target.closest('.dropdown-container')) {
        setShowGudangDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    // Show for 30 seconds, then hide. Every 30 minutes, show again.
    const showDuration = 30000; // 30 seconds
    const hideDuration = 1800000; // 30 minutes

    let hideTimer: NodeJS.Timeout;

    const cycleMarquee = () => {
      setShowMarquee(true);
      hideTimer = setTimeout(() => {
        setShowMarquee(false);
      }, showDuration);
    };

    cycleMarquee();

    const intervalTimer = setInterval(() => {
      cycleMarquee();
    }, hideDuration);

    return () => {
      clearTimeout(hideTimer);
      clearInterval(intervalTimer);
    };
  }, []);



  return (
    <>
      <Toast toast={toast} onClose={() => setToast({ show: false, message: '', type: 'info' })} />

      <ValidationAlert
        isOpen={validationAlert.isOpen}
        onClose={() => setValidationAlert({ isOpen: false, invalidCount: 0, errors: [] })}
        invalidCount={validationAlert.invalidCount}
        errors={validationAlert.errors}
      />

      <div className="space-y-6">
        {/* PREMIUM IMMERSIVE HEADER (310px) */}
        <div className="flex flex-col mb-8 lg:mb-12 uppercase">
          <div className="bg-gradient-to-br from-indigo-700 via-blue-800 to-slate-900 pt-[90px] lg:pt-0 lg:h-[310px] pb-[75px] lg:pb-0 px-6 lg:px-12 rounded-b-[40px] lg:rounded-b-[55px] shadow-2xl shadow-indigo-900/40 relative overflow-hidden transition-all duration-500 flex flex-col justify-center">

            {/* Decorative Background Icon */}
            <div className="absolute -top-12 -right-12 text-white opacity-5">
              <Layers className="w-72 h-72 lg:w-[480px] lg:h-[480px]" />
            </div>

            {/* Decorative Floating Elements */}
            <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute bottom-1/4 right-1/4 w-24 h-24 bg-blue-500/10 rounded-3xl rotate-45 blur-2xl"></div>

            {/* Text Content */}
            <div className="relative z-10 w-full flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 uppercase text-left">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2 mb-3 lg:mb-4 opacity-90">
                  <div className="w-10 h-[2px] bg-indigo-400 rounded-full"></div>
                  <span className="text-[10px] lg:text-[12px] font-black tracking-[0.4em] text-indigo-100">Warehouse Optimization</span>
                </div>
                <h1 className="text-[34px] lg:text-[58px] font-black text-white tracking-tighter leading-[1] mb-3 uppercase">
                  Update Lokasi <span className="text-indigo-400">Rak</span>
                </h1>
                <div className="text-indigo-100/80 font-medium text-[14px] lg:text-[18px] leading-relaxed max-w-[90%] normal-case flex items-center gap-3">
                  <div className="px-3 py-1 bg-white/10 rounded-full backdrop-blur-sm border border-white/10 flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="text-[11px] font-bold tracking-widest uppercase">System Active</span>
                  </div>
                  <span className="opacity-60 hidden sm:inline">|</span>
                  <span className="text-[13px] lg:text-[16px]">
                    {dataLoaded ? `${products.length.toLocaleString()} produk aktif & ${warehouses.length} gudang terdeteksi` : 'Menghubungkan ke database...'}
                  </span>
                </div>
              </div>

              {/* Global Actions Container - Desktop */}
              <div className="relative z-10 flex flex-wrap gap-2 lg:gap-3 lg:mb-2 items-center">
                {(loading || submitting) && (
                  <div className="px-5 py-2.5 bg-indigo-500/20 backdrop-blur-md border border-white/20 rounded-2xl flex items-center gap-3 mr-2">
                    <RefreshCw className="w-4 h-4 text-white animate-spin" />
                    <span className="text-[11px] font-black text-white tracking-[0.2em] uppercase">Syncing</span>
                  </div>
                )}

                <button
                  onClick={refreshData}
                  disabled={loading}
                  className="h-12 px-6 bg-white/10 hover:bg-white/20 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2.5 border border-white/30 backdrop-blur-xl disabled:opacity-50"
                  title="Perbarui Data"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  <span className="uppercase text-xs font-black">Refresh Data</span>
                </button>


              </div>
            </div>
          </div>
        </div>

        <div className="lg:px-10 pb-12 -mt-6 lg:-mt-8">
          {/* Marquee/Running Text */}
          {showMarquee && (
            <div className="bg-gradient-to-r from-blue-700 via-blue-800 to-blue-700 text-white py-2.5 px-6 rounded-2xl overflow-hidden shadow-xl border border-blue-900/50 mb-6 relative z-20">
              <div className="flex items-center whitespace-nowrap animate-marquee">
                {[1, 2].map((i) => (
                  <div key={i} className="flex items-center space-x-4 pr-12">
                    <span className="flex items-center gap-2 font-black uppercase tracking-wider text-[10px] bg-amber-400 text-blue-900 px-3 py-1 rounded-full shadow-sm">
                      <AlertCircle className="h-3 w-3" /> INFO UPDATE
                    </span>
                    <span className="font-bold text-xs lg:text-sm tracking-tight uppercase">
                      Update lokasi rak kini sudah bisa dilakukan untuk lokasi per lantai (seperti LANTAI 2, LANTAI 4) serta rak ecer (seperti ECER-M, ECER-N, ECER-O).
                    </span>
                  </div>
                ))}
              </div>
              <style>
                {`
                  @keyframes marquee {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                  }
                  .animate-marquee {
                    display: inline-flex;
                    animation: marquee 25s linear infinite;
                  }
                  .animate-marquee:hover {
                    animation-play-state: paused;
                  }
                `}
              </style>
            </div>
          )}

          {/* Data Status & Notice */}
          {initialLoading && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500 rounded-lg p-5 shadow-sm animate-pulse">
              <div className="flex items-center">
                <RefreshCw className="h-6 w-6 text-blue-500 animate-spin mr-3" />
                <div className="text-blue-700">
                  <p className="font-bold uppercase tracking-wider text-xs mb-1">Status</p>
                  <p className="text-sm font-medium">Sedang memuat metadata (SKU, Gudang)...</p>
                </div>
              </div>
            </div>
          )}

          {!filters.tanggal_masuk && !initialLoading && (
            <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border-l-4 border-yellow-400 rounded-lg p-5 shadow-sm">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3 text-yellow-700">
                  <p className="font-semibold mb-1 uppercase tracking-wider text-xs">Perhatian</p>
                  <p className="text-sm">Silakan pilih tanggal masuk untuk menampilkan data transaksi yang perlu diupdate lokasinya.</p>
                  <p className="text-xs mt-1 font-medium italic opacity-75">Format yang didukung: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD</p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-col-reverse lg:flex-row">
            {/* Transaction Table */}
            <div className="lg:col-span-3 order-2 lg:order-1">
              <Card>
                <CardContent className="p-0">
                  {loading && dataLoaded && (
                    <div className="flex items-center justify-center p-8">
                      <div className="text-blue-600 font-medium">Memuat data...</div>
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-blue-600 border-b border-blue-700">
                        <tr>
                          <th className="hidden md:table-cell px-2 md:px-4 py-3 text-center text-[10px] font-extrabold text-white uppercase tracking-wider">Tanggal Transaksi</th>
                          <th className="hidden md:table-cell px-2 md:px-4 py-3 text-center text-[10px] font-extrabold text-white uppercase tracking-wider">Waktu Transaksi</th>
                          <th className="px-2.5 md:px-4 py-3.5 text-left text-[10px] font-extrabold text-white uppercase tracking-wider align-middle">Nama Barang</th>
                          <th className="px-2.5 md:px-4 py-3.5 text-center text-[10px] font-extrabold text-white uppercase tracking-wider align-middle">Qty</th>
                          <th className="hidden md:table-cell px-2 md:px-4 py-3 text-center text-[10px] font-extrabold text-white uppercase tracking-wider">Type</th>
                          <th className="hidden md:table-cell px-2 md:px-4 py-3 text-center text-[10px] font-extrabold text-white uppercase tracking-wider">Gudang</th>
                          <th className="px-2.5 md:px-4 py-3.5 text-center text-[10px] font-extrabold text-white uppercase tracking-wider align-middle">Lokasi Lama</th>
                          <th className="md:hidden px-2.5 md:px-4 py-3.5 text-center text-[10px] font-extrabold text-white uppercase tracking-wider bg-blue-700/50 align-middle">Update Lokasi</th>
                          <th className="px-2.5 md:px-4 py-3.5 text-center text-[10px] font-extrabold text-white uppercase tracking-wider align-middle">Diupdate Oleh</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredTransactions.map((item) => (
                          <tr
                            key={item.id}
                            className={`border-b border-gray-200 last:border-b-0 transition-colors duration-200 ${item.isLocked ? 'bg-gray-50/80 opacity-90' : 'hover:bg-blue-50/30'
                              }`}
                          >
                            <td className="hidden md:table-cell px-2 md:px-4 py-3 text-xs text-center whitespace-nowrap font-medium text-gray-600">{item.tgl}</td>
                            <td className="hidden md:table-cell px-2 md:px-4 py-3 text-xs text-center whitespace-nowrap text-gray-500">{item.waktu}</td>
                            <td className="px-2.5 md:px-4 py-3.5 text-[10px] md:text-xs font-semibold text-gray-900 align-middle break-words max-w-[120px] md:max-w-none">
                              {item.sku}
                              {item.isLocked && (
                                <div className="mt-1 flex items-center gap-1.5">
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-red-100 text-red-700 border border-red-200 shadow-sm uppercase tracking-tighter">
                                    LOCKED
                                  </span>
                                  <span className="text-[9px] font-medium text-gray-400 italic">
                                    {item.lockReason}
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="px-2.5 md:px-4 py-3.5 text-xs text-center font-bold text-gray-900 align-middle">{item.jumlah}</td>
                            <td className="hidden md:table-cell px-2 md:px-4 py-3 text-center">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${item.type === 'OUT' ? 'bg-red-50 text-red-700 border-red-100' :
                                item.type === 'IN' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                  'bg-purple-50 text-purple-700 border-purple-100'
                                }`}>
                                {item.type}
                              </span>
                            </td>
                            <td className="hidden md:table-cell px-2 md:px-4 py-3 text-xs text-gray-500 text-center">{item.gudang}</td>
                            <td className="px-2.5 md:px-4 py-3.5 text-[10px] md:text-xs text-gray-500 text-center font-mono align-middle break-all w-16">{item.lokasi_penyimpanan}</td>
                            <td className={`md:hidden px-2.5 md:px-4 py-3.5 align-middle ${item.isLocked ? 'bg-gray-100/50' : 'bg-blue-50/30'} min-w-[110px]`}>
                              {item.isLocked ? (
                                <span className="text-[10px] text-gray-400 italic">Terkunci</span>
                              ) : (
                                <button
                                  onClick={() => {
                                    setSelectedItemForRackModal(item);
                                    setRackSearchTerm(item.update_lokasi_rak || '');
                                  }}
                                  className={`w-full py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-between gap-1.5 transition-all active:scale-95 ${
                                    item.update_lokasi_rak
                                      ? 'bg-emerald-600 text-white border-emerald-700 font-mono shadow-sm'
                                      : 'bg-white text-blue-600 border-blue-300 hover:bg-blue-50 shadow-sm'
                                  }`}
                                >
                                  <span className="truncate">{item.update_lokasi_rak || '+ Pilih Lokasi'}</span>
                                  <Pencil className="h-3.5 w-3.5 shrink-0 opacity-90" />
                                </button>
                              )}
                            </td>
                            <td className="px-2.5 md:px-4 py-3.5 text-[9px] md:text-xs text-gray-600 text-center font-mono align-middle break-all max-w-[100px]">
                              {item.log_update_user ? (
                                <span className="inline-block px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-100 font-semibold truncate max-w-[90px] md:max-w-none" title={item.log_update_user}>
                                  {item.log_update_user}
                                </span>
                              ) : (
                                <span className="text-gray-300">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {filteredTransactions.length === 0 && dataLoaded && (
                          <tr>
                            <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                              {!filters.tanggal_masuk
                                ? 'Pilih tanggal masuk untuk menampilkan data transaksi'
                                : 'Tidak ada data transaksi untuk tanggal dan filter yang dipilih'}
                            </td>
                          </tr>
                        )}
                        {loading && (
                          <tr>
                            <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                              <div className="flex items-center justify-center">
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-2"></div>
                                Memuat data transaksi...
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Sticky Floating Update Lokasi Button */}
                  {filteredTransactions.length > 0 && (
                    <div className="md:hidden fixed bottom-5 left-4 right-4 z-40">
                      <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="w-full h-14 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-2xl shadow-[0_10px_30px_rgba(16,185,129,0.45)] transition-all active:scale-95 flex items-center justify-center gap-3 border border-emerald-400/50 backdrop-blur-md"
                      >
                        <Send className="h-5 w-5" />
                        <span className="uppercase text-base font-black tracking-wider">
                          {submitting ? 'MEMPROSES UPDATE...' : 'UPDATE LOKASI'}
                        </span>
                      </button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Filter Panel */}
            <div className="lg:col-span-1 order-1 lg:order-2">
              <Card className="rounded-xl shadow-md border border-gray-200 bg-white overflow-hidden">
                <div className="bg-blue-600 p-5 border-b border-blue-700 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/20 rounded-lg text-white">
                      <Filter className="h-5 w-5" />
                    </div>
                    <h3 className="font-bold text-white text-lg">Filter Pencarian</h3>
                  </div>
                  <div className="flex items-center gap-2">

                    <button
                      onClick={refreshData}
                      disabled={loading}
                      className="p-2 bg-white/20 hover:bg-white/30 rounded-lg text-white transition-all duration-300 transform hover:scale-110 active:scale-90 border border-white/20 backdrop-blur-sm shadow-sm disabled:opacity-50"
                      title="Perbarui Data"
                    >
                      <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                <CardContent className="p-6 space-y-5">
                  <div>
                    <label className="flex items-center text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 ml-1">
                      <Package className="w-3.5 h-3.5 mr-1.5 text-blue-500" />
                      Barang ({products.length.toLocaleString()})
                    </label>
                    <OptimizedSearchDropdown
                      options={products.map(p => p.nama)}
                      value={barangSearchTerm}
                      onChange={handleBarangInputChange}
                      onSelect={handleBarangSelect}
                      onKeyDown={handleBarangKeyDown}
                      onFocus={() => setShowBarangDropdown(true)}
                      placeholder="Cari nama barang..."
                      loading={initialLoading}
                      highlightedIndex={barangHighlightedIndex}
                      showDropdown={showBarangDropdown}
                      setShowDropdown={setShowBarangDropdown}
                      clearSearch={clearBarang}
                      inputRef={barangInputRef}
                      maxDisplayItems={50}
                    />
                  </div>

                  <div
                    className="cursor-pointer"
                    onClick={(e) => {
                      const input = e.currentTarget.querySelector('input[type="date"]') as any;
                      if (input) input.showPicker?.();
                    }}
                  >
                    <label className="flex items-center text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 ml-1 cursor-pointer">
                      <Calendar className="w-3.5 h-3.5 mr-1.5 text-blue-500" />
                      Tanggal Masuk
                    </label>
                    <input
                      type="date"
                      value={filters.tanggal_masuk}
                      onChange={(e) => {
                        setFilters({ ...filters, tanggal_masuk: e.target.value });
                        setCurrentPage(1);
                      }}
                      onClick={(e) => {
                        e.currentTarget.showPicker?.();
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.currentTarget.showPicker?.();
                      }}
                      onKeyDown={(e) => e.preventDefault()}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 cursor-pointer select-none caret-transparent"
                    />
                  </div>

                  <div className="hidden">
                    <label className="flex items-center text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 ml-1">
                      <Layers className="w-3.5 h-3.5 mr-1.5 text-blue-500" />
                      Type
                    </label>
                    <input
                      type="text"
                      value="IN"
                      readOnly
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-500 bg-gray-50 shadow-sm font-bold"
                    />
                  </div>

                  <div>
                    <label className="flex items-center text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 ml-1">
                      <Building className="w-3.5 h-3.5 mr-1.5 text-blue-500" />
                      Gudang ({warehouses.length})
                    </label>
                    <OptimizedSearchDropdown
                      options={warehouses.map(w => w.nama)}
                      value={gudangSearchTerm}
                      onChange={handleGudangInputChange}
                      onSelect={handleGudangSelect}
                      onKeyDown={handleGudangKeyDown}
                      onFocus={() => setShowGudangDropdown(true)}
                      placeholder="Cari nama gudang..."
                      loading={initialLoading}
                      highlightedIndex={gudangHighlightedIndex}
                      showDropdown={showGudangDropdown}
                      setShowDropdown={setShowGudangDropdown}
                      clearSearch={clearGudang}
                      inputRef={gudangInputRef}
                      maxDisplayItems={50}
                    />
                  </div>

                  <div>
                    <label className="flex items-center text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 ml-1">
                      <List className="w-3.5 h-3.5 mr-1.5 text-blue-500" />
                      Per Halaman
                    </label>
                    <div className="relative">
                      <select
                        value={itemsPerPage}
                        onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 appearance-none bg-white font-medium"
                      >
                        <option value={20}>20 baris</option>
                        <option value={50}>50 baris</option>
                        <option value={100}>100 baris</option>
                        <option value={200}>200 baris</option>
                        <option value={500}>500 baris</option>
                        <option value={1000}>1000 baris</option>
                      </select>
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                        <ChevronLeft className="h-4 w-4 text-gray-400 rotate-[-90deg]" />
                      </div>
                    </div>
                  </div>

                  <div className="pt-2">
                    <Button
                      onClick={clearAll}
                      className="w-full h-11 bg-white hover:bg-gray-50 text-gray-700 font-bold rounded-xl shadow-md transition-all duration-300 transform hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 border border-gray-200 group"
                    >
                      <RefreshCw className="h-4 w-4 text-gray-400 group-hover:rotate-180 transition-transform duration-500" />
                      <span className="tracking-wide uppercase text-xs">Reset All Filters</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Pagination matched to Riwayat Barang style */}
          {paginationInfo.totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-md border border-gray-200">
              <div className="text-sm font-medium text-gray-500 order-2 sm:order-1">
                Menampilkan <span className="text-blue-600 font-bold">{((currentPage - 1) * itemsPerPage) + 1}</span> - <span className="text-blue-600 font-bold">{Math.min(currentPage * itemsPerPage, paginationInfo.totalCount)}</span> dari <span className="text-gray-900 font-extrabold">{paginationInfo.totalCount.toLocaleString()}</span> data
              </div>
              <div className="flex items-center space-x-2 order-1 sm:order-2">
                <Button
                  onClick={() => handlePageChange(1)}
                  disabled={currentPage === 1}
                  className="h-10 w-10 p-0 bg-gray-50 hover:bg-blue-50 text-gray-600 hover:text-blue-600 rounded-xl transition-all duration-300 flex items-center justify-center border border-gray-200 disabled:opacity-30 disabled:hover:bg-gray-50 disabled:hover:text-gray-600"
                >
                  <span className="text-xs font-black">««</span>
                </Button>
                <Button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={!paginationInfo.hasPrevPage}
                  className="h-10 w-10 p-0 bg-gray-50 hover:bg-blue-50 text-gray-600 hover:text-blue-600 rounded-xl transition-all duration-300 flex items-center justify-center border border-gray-200 disabled:opacity-30"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>

                <div className="h-10 px-4 flex items-center justify-center bg-blue-600 rounded-xl shadow-lg shadow-blue-500/30 border border-blue-500 text-white font-bold text-sm min-w-[100px]">
                  {currentPage.toLocaleString()} / {paginationInfo.totalPages.toLocaleString()}
                </div>

                <Button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={!paginationInfo.hasNextPage}
                  className="h-10 w-10 p-0 bg-gray-50 hover:bg-blue-50 text-gray-600 hover:text-blue-600 rounded-xl transition-all duration-300 flex items-center justify-center border border-gray-200 disabled:opacity-30"
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
                <Button
                  onClick={() => handlePageChange(paginationInfo.totalPages)}
                  disabled={currentPage === paginationInfo.totalPages}
                  className="h-10 w-10 p-0 bg-gray-50 hover:bg-blue-50 text-gray-600 hover:text-blue-600 rounded-xl transition-all duration-300 flex items-center justify-center border border-gray-200 disabled:opacity-30"
                >
                  <span className="text-xs font-black">»»</span>
                </Button>
              </div>
            </div>
          )}

          {/* Summary Details */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <Layers className="h-24 w-24 text-blue-900" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 relative z-10">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center">
                  <Package className="w-3 h-3 mr-1 text-blue-500" /> Produk Aktif
                </p>
                <p className="text-xl font-extrabold text-blue-900">{products.length.toLocaleString()}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center">
                  <List className="w-3 h-3 mr-1 text-blue-500" /> Total Record
                </p>
                <p className="text-xl font-extrabold text-blue-900">{paginationInfo.totalCount.toLocaleString()}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center">
                  <ArrowRightLeft className="w-3 h-3 mr-1 text-emerald-500" /> Data Dimuat
                </p>
                <p className="text-xl font-extrabold text-emerald-600">{filteredTransactions.length.toLocaleString()}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center">
                  <Layers className="w-3 h-3 mr-1 text-blue-500" /> Halaman
                </p>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-extrabold text-blue-900">{currentPage}</span>
                  <span className="text-xs font-bold text-gray-400">/ {paginationInfo.totalPages}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>



      {/* Scanner Component */}
      {showScanner && (
        <BarcodeScanner 
          onScan={handleScanResult} 
          onClose={() => setShowScanner(false)} 
        />
      )}

      {/* ===== SCAN CONFIRMATION MODAL ===== */}
      <Modal
        isOpen={showScanModal}
        onClose={() => setShowScanModal(false)}
        title="Update Lokasi"
        subtitle="Konfirmasi pemindahan lokasi barang"
        size="3xl"
        padding="p-0"
        headerVariant="premium"
        icon={<Plus className="h-6 w-6 text-white" />}
        fullHeight={true}
      >
        <div className="flex flex-col flex-1 bg-gray-50">
          {/* Status Banner */}
          <div className={cn(
            "px-6 py-3 flex items-center justify-between",
            scanModalStatus === 'found' ? "bg-emerald-50 text-emerald-700 border-b border-emerald-100" : "bg-blue-50 text-blue-700 border-b border-blue-100"
          )}>
            <div className="flex items-center gap-2">
              {scanModalLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : scanModalStatus === 'found' ? (
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              ) : (
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              )}
              <span className="text-xs font-black uppercase tracking-widest">
                {scanModalLoading ? "Mencari Data..." : scanModalStatus === 'found' ? "Data Pending Ditemukan" : "Data Tidak Ditemukan"}
              </span>
            </div>
            {scanModalTglScan && (
              <div className="text-[10px] font-bold opacity-60 flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {scanModalTglScan}
              </div>
            )}
          </div>

          <div className="p-6 space-y-6">
            {/* Tanggal Barang Masuk */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Tanggal Barang Masuk</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500">
                  <Calendar className="h-5 w-5" />
                </div>
                <input
                  type="date"
                  value={scanModalTglMasuk}
                  max={new Date().toISOString().split('T')[0]}
                  min={new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                  onChange={(e) => setScanModalTglMasuk(e.target.value)}
                  onClick={(e) => {
                    e.currentTarget.showPicker?.();
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.currentTarget.showPicker?.();
                  }}
                  onKeyDown={(e) => e.preventDefault()}
                  className="w-full pl-12 pr-4 py-4 bg-white border-2 border-gray-100 rounded-2xl text-lg font-black text-blue-900 shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all cursor-pointer select-none caret-transparent"
                />
              </div>
              <p className="text-[10px] font-black text-blue-600 ml-1 italic animate-pulse">
                *PENTING: Pilih tanggal kedatangan barang untuk mencocokkan data.
              </p>
            </div>

                {/* SKU Information - LOCKED OR EDITABLE IN DEV MODE */}
                <div className={cn("space-y-2", !devMode && "opacity-70")}>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    SKU Barang {devMode ? '(Editable)' : '(Terkunci)'}
                  </label>
                  <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                      <Package className="h-5 w-5" />
                    </div>
                    <input
                      type="text"
                      value={scanModalSku}
                      readOnly={!devMode}
                      onChange={(e) => setScanModalSku(e.target.value.toUpperCase())}
                      onPaste={(e) => {
                        const pastedData = e.clipboardData.getData('Text');
                        setScanModalSku(pastedData.toUpperCase());
                      }}
                      className={cn(
                        "w-full pl-12 pr-4 py-4 border-2 rounded-2xl text-lg font-black outline-none transition-all",
                        devMode 
                          ? "bg-white border-blue-200 text-blue-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" 
                          : "bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed shadow-inner"
                      )}
                      placeholder={devMode ? "Ketik atau paste SKU..." : "Menunggu scan..."}
                    />
                  </div>
                </div>

                {/* Unique Code Information - LOCKED OR EDITABLE IN DEV MODE */}
                <div className={cn("space-y-2", !devMode && "opacity-70")}>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Kode Unik / Serial Number {devMode ? '(Editable)' : '(Terkunci)'}
                  </label>
                  <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                      <Layers className="h-5 w-5" />
                    </div>
                    <input
                      type="text"
                      value={scanModalUniqueCode}
                      readOnly={!devMode}
                      onChange={(e) => setScanModalUniqueCode(e.target.value.toUpperCase())}
                      onPaste={(e) => {
                        const pastedData = e.clipboardData.getData('Text');
                        setScanModalUniqueCode(pastedData.toUpperCase());
                      }}
                      className={cn(
                        "w-full pl-12 pr-4 py-4 border-2 rounded-2xl text-lg font-black outline-none transition-all",
                        devMode 
                          ? "bg-white border-blue-200 text-blue-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" 
                          : "bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed shadow-inner"
                      )}
                      placeholder={devMode ? "Ketik atau paste Kode Unik..." : "Tidak ada kode unik..."}
                    />
                  </div>
                </div>

                {/* Lokasi Rak Awal - LOCKED */}
                <div className="space-y-2 opacity-70">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Lokasi Rak Awal (Terkunci)</label>
                  <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-500">
                      <Building className="h-5 w-5" />
                    </div>
                    <input
                      type="text"
                      value={scanModalRakAwal}
                      readOnly
                      className="w-full pl-12 pr-4 py-4 bg-gray-100 border-2 border-gray-200 rounded-2xl text-lg font-black text-gray-500 cursor-not-allowed shadow-inner outline-none"
                      placeholder={scanModalLoading ? "Mencari lokasi awal..." : "Data tidak ditemukan di database"}
                    />
                  </div>
                </div>

            {/* Rak Selection */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Target Lokasi Rak Update</label>
              <div className="flex gap-3">
                <div className="relative flex-1 group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500">
                    <Building className="h-5 w-5" />
                  </div>
                  <input
                    ref={modalRakInputRef}
                    type="text"
                    value={scanModalRak}
                    readOnly={window.innerWidth < 1024}
                    onClick={() => {
                      if (window.innerWidth < 1024) {
                        setIsMobileRackModalOpen(true);
                      }
                    }}
                    onChange={(e) => {
                      setScanModalRak(e.target.value.toUpperCase());
                    }}
                    onFocus={() => {
                      if (window.innerWidth >= 1024) {
                        setShowRakDropdown(true);
                      }
                    }}
                    className={cn(
                      "w-full pl-12 pr-4 py-4 bg-white border-2 rounded-2xl text-lg font-black shadow-sm focus:ring-4 outline-none transition-all cursor-pointer lg:cursor-text",
                      scanModalStatus === 'found' 
                        ? "border-emerald-200 text-emerald-700 focus:border-emerald-500 focus:ring-emerald-100" 
                        : "border-gray-100 text-blue-900 focus:border-blue-500 focus:ring-blue-100"
                    )}
                    placeholder="Contoh: A-01-01"
                  />
                  {showRakDropdown && (
                    <div className="absolute z-[100] left-0 right-0 mt-2 max-h-60 overflow-y-auto bg-white border-2 border-gray-100 rounded-2xl shadow-xl">
                      {rackLocations
                        .filter(r => r.nama.toLowerCase().includes(scanModalRak.toLowerCase()))
                        .map((rack) => (
                          <div
                            key={rack.id}
                            onClick={() => {
                              setScanModalRak(rack.nama);
                              setShowRakDropdown(false);
                            }}
                            className="px-4 py-3 hover:bg-blue-50 cursor-pointer text-sm font-bold text-blue-900 border-b border-gray-50 last:border-0"
                          >
                            {rack.nama}
                          </div>
                        ))}
                    </div>
                  )}
                  {scanModalRak && (
                    <button 
                      onClick={() => {setScanModalRak(''); setScanModalStatus('idle');}}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => {
                    setShowScanner(true);
                  }}
                  className="w-16 h-16 bg-white border-2 border-gray-100 rounded-2xl flex items-center justify-center text-gray-400 hover:text-blue-500 hover:border-blue-200 transition-all shadow-sm active:scale-90"
                  title="Scan Barcode Rak"
                >
                  <Camera className="h-6 w-6" />
                </button>
              </div>
              <p className="text-[10px] font-bold text-gray-400 ml-1 italic">
                *Pastikan lokasi rak sudah benar sebelum menyimpan.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3 pt-3">
              <Button
                onClick={handleScanModalSave}
                disabled={scanModalLoading || !scanModalSku || !scanModalRak || scanModalStatus !== 'found'}
                className={cn(
                  "w-full h-14 font-black rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2",
                  scanModalStatus === 'found'
                    ? "bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-blue-200 active:scale-95"
                    : "bg-gray-300 text-gray-500 cursor-not-allowed shadow-none"
                )}
              >
                {scanModalLoading ? (
                  <RefreshCw className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Send className="h-5 w-5" />
                    SAVE CHANGES
                  </>
                )}
              </Button>
              <Button
                onClick={() => setShowScanModal(false)}
                className="w-full h-12 bg-white hover:bg-gray-50 text-gray-400 font-black rounded-2xl border-2 border-gray-100 active:scale-95 transition-all"
              >
                CANCEL
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ===== MANUAL EDIT MODAL ===== */}
      <Modal
        isOpen={showManualModal}
        onClose={() => setShowManualModal(false)}
        title="Input Manual Lokasi"
        subtitle="Registrasi barang sebelum barcode tersedia"
        size="sm"
        padding="p-0"
        headerVariant="premium"
        icon={<Pencil className="h-6 w-6 text-white" />}
        fullHeight={true}
      >
        <div className="flex flex-col flex-1 bg-gray-50">
          {/* Info Banner */}
          <div className="px-6 py-3 flex items-center gap-2 bg-amber-50 text-amber-700 border-b border-amber-100">
            <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
            <span className="text-xs font-black uppercase tracking-widest">Mode Manual — Kode Unik menyusul</span>
          </div>

          <div className="p-6 space-y-6 flex-1 overflow-y-auto">

            {/* Tanggal */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Tanggal</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500">
                  <Calendar className="h-5 w-5" />
                </div>
                <input
                  type="date"
                  value={manualTgl}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setManualTgl(e.target.value)}
                  onClick={(e) => {
                    e.currentTarget.showPicker?.();
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.currentTarget.showPicker?.();
                  }}
                  onKeyDown={(e) => e.preventDefault()}
                  className="w-full pl-12 pr-4 py-4 bg-white border-2 border-gray-100 rounded-2xl text-lg font-black text-blue-900 shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all cursor-pointer select-none caret-transparent"
                />
              </div>
            </div>

            {/* SKU Field */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">SKU Barang</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500 z-10">
                  <Package className="h-5 w-5" />
                </div>
                {/* MOBILE: tap to open full-screen picker */}
                <input
                  type="text"
                  value={manualSku}
                  readOnly={window.innerWidth < 1024}
                  onClick={() => {
                    if (window.innerWidth < 1024) setIsMobileSkuModalOpen(true);
                  }}
                  onChange={(e) => setManualSku(e.target.value.toUpperCase())}
                  onFocus={() => { if (window.innerWidth >= 1024) setShowManualSkuDropdown(true); }}
                  onBlur={() => setTimeout(() => setShowManualSkuDropdown(false), 200)}
                  className="w-full pl-12 pr-10 py-4 bg-white border-2 border-blue-100 rounded-2xl text-lg font-black text-blue-900 shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all cursor-pointer lg:cursor-text"
                  placeholder="Tap untuk pilih SKU..."
                />
                {manualSku && (
                  <button onClick={() => setManualSku('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X className="h-4 w-4" />
                  </button>
                )}
                {/* DESKTOP: inline dropdown */}
                {showManualSkuDropdown && (
                  <div className="absolute z-[200] left-0 right-0 mt-2 max-h-60 overflow-y-auto bg-white border-2 border-blue-100 rounded-2xl shadow-2xl">
                    {products
                      .filter(p => p.nama.toLowerCase().includes(manualSku.toLowerCase()) || p.nama.toUpperCase().includes(manualSku.toUpperCase()))
                      .slice(0, 50)
                      .map((p) => (
                        <div
                          key={p.id}
                          onMouseDown={() => { setManualSku(p.nama); setShowManualSkuDropdown(false); }}
                          className="px-4 py-3 hover:bg-blue-50 cursor-pointer text-sm font-bold text-blue-900 border-b border-gray-50 last:border-0"
                        >
                          {p.nama}
                        </div>
                      ))}
                    {products.filter(p => p.nama.toLowerCase().includes(manualSku.toLowerCase())).length === 0 && (
                      <div className="px-4 py-6 text-center text-sm text-gray-400 font-bold">Tidak ada hasil</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Rak Field */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Lokasi Rak</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500 z-10">
                  <Building className="h-5 w-5" />
                </div>
                <input
                  type="text"
                  value={manualRak}
                  readOnly={window.innerWidth < 1024}
                  onClick={() => { if (window.innerWidth < 1024) setIsMobileManualRackOpen(true); }}
                  onChange={(e) => setManualRak(e.target.value.toUpperCase())}
                  onFocus={() => { if (window.innerWidth >= 1024) setManualRakDropdown(true); }}
                  onBlur={() => setTimeout(() => setManualRakDropdown(false), 200)}
                  className="w-full pl-12 pr-10 py-4 bg-white border-2 border-gray-100 rounded-2xl text-lg font-black text-blue-900 shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all cursor-pointer lg:cursor-text"
                  placeholder="Tap untuk pilih rak..."
                />
                {manualRak && (
                  <button onClick={() => setManualRak('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X className="h-4 w-4" />
                  </button>
                )}
                {/* DESKTOP: inline dropdown */}
                {manualRakDropdown && (
                  <div className="absolute z-[200] left-0 right-0 mt-2 max-h-60 overflow-y-auto bg-white border-2 border-gray-100 rounded-2xl shadow-2xl">
                    {rackLocations
                      .filter(r => r.nama.toLowerCase().includes(manualRak.toLowerCase()))
                      .map((rack) => (
                        <div
                          key={rack.id}
                          onMouseDown={() => { setManualRak(rack.nama); setManualRakDropdown(false); }}
                          className="px-4 py-3 hover:bg-blue-50 cursor-pointer text-sm font-bold text-blue-900 border-b border-gray-50 last:border-0"
                        >
                          {rack.nama}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            {/* Info note */}
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
              <p className="text-[11px] font-bold text-amber-700 leading-relaxed">
                📦 Data ini akan disimpan dengan status <strong>PENDING</strong>. Kode unik akan diisi oleh staf input barang masuk setelah barcode selesai dibuat.
              </p>
            </div>

            {/* Buttons */}
            <div className="space-y-3 pt-2">
              <Button
                onClick={handleManualSave}
                disabled={manualLoading || !manualSku || !manualRak}
                className={cn(
                  "w-full h-14 font-black rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2",
                  manualSku && manualRak
                    ? "bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-amber-200 active:scale-95"
                    : "bg-gray-300 text-gray-500 cursor-not-allowed shadow-none"
                )}
              >
                {manualLoading ? (
                  <RefreshCw className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Send className="h-5 w-5" />
                    SIMPAN LOKASI
                  </>
                )}
              </Button>
              <Button
                onClick={() => setShowManualModal(false)}
                className="w-full h-12 bg-white hover:bg-gray-50 text-gray-400 font-black rounded-2xl border-2 border-gray-100 active:scale-95 transition-all"
              >
                BATAL
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ===== MOBILE: Full-screen SKU Picker ===== */}
      <Modal
        isOpen={isMobileSkuModalOpen}
        onClose={() => setIsMobileSkuModalOpen(false)}
        title="Pilih SKU Barang"
        size="full"
        padding="p-0"
      >
        <div className="flex flex-col h-full bg-gray-50">
          <div className="p-4 bg-white border-b border-gray-100 sticky top-0 z-20">
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                <Search className="h-5 w-5" />
              </div>
              <input
                type="text"
                placeholder="Cari nama barang / SKU..."
                autoFocus
                value={mobileSkuSearchTerm}
                onChange={(e) => setMobileSkuSearchTerm(e.target.value.toUpperCase())}
                className="w-full pl-12 pr-4 py-4 bg-gray-100 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-2xl text-lg font-bold outline-none transition-all"
              />
              {mobileSkuSearchTerm && (
                <button
                  onClick={() => setMobileSkuSearchTerm('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1 bg-gray-200 rounded-full text-gray-500"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {products
              .filter(p =>
                p.nama.toUpperCase().includes(mobileSkuSearchTerm) ||
                (p.id && String(p.id).toUpperCase().includes(mobileSkuSearchTerm))
              )
              .slice(0, 100)
              .map((product) => (
                <button
                  key={product.id}
                  onClick={() => {
                    setManualSku(product.nama);
                    setIsMobileSkuModalOpen(false);
                    setMobileSkuSearchTerm('');
                  }}
                  className={cn(
                    "w-full flex items-center justify-between p-5 bg-white rounded-2xl border-2 transition-all active:scale-[0.98]",
                    manualSku === product.nama
                      ? "border-amber-500 bg-amber-50 shadow-md"
                      : "border-gray-50 hover:border-amber-200"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center transition-colors flex-shrink-0",
                      manualSku === product.nama ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-600"
                    )}>
                      <Package className="h-6 w-6" />
                    </div>
                    <div className="text-left">
                      <div className="text-base font-black text-gray-900 leading-tight">{product.nama}</div>
                    </div>
                  </div>
                  {manualSku === product.nama && (
                    <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center shadow-lg flex-shrink-0">
                      <Check className="h-5 w-5 text-white" />
                    </div>
                  )}
                </button>
              ))}
            {products.filter(p => p.nama.toUpperCase().includes(mobileSkuSearchTerm)).length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <Package className="h-16 w-16 mb-4 opacity-20" />
                <p className="font-bold">Tidak ada barang ditemukan</p>
              </div>
            )}
          </div>
          <div className="p-4 bg-white border-t border-gray-100 text-center">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              Total {products.length.toLocaleString()} Produk Tersedia
            </p>
          </div>
        </div>
      </Modal>

      {/* ===== MOBILE: Full-screen Manual Rack Picker ===== */}
      <Modal
        isOpen={isMobileManualRackOpen}
        onClose={() => setIsMobileManualRackOpen(false)}
        title="Pilih Lokasi Rak"
        size="full"
        padding="p-0"
      >
        <div className="flex flex-col h-full bg-gray-50">
          <div className="p-4 bg-white border-b border-gray-100 sticky top-0 z-20">
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                <Search className="h-5 w-5" />
              </div>
              <input
                type="text"
                placeholder="Cari nama rak..."
                autoFocus
                value={mobileManualRackSearch}
                onChange={(e) => setMobileManualRackSearch(e.target.value.toUpperCase())}
                className="w-full pl-12 pr-4 py-4 bg-gray-100 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-2xl text-lg font-bold outline-none transition-all"
              />
              {mobileManualRackSearch && (
                <button onClick={() => setMobileManualRackSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 p-1 bg-gray-200 rounded-full text-gray-500">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {rackLocations
              .filter(r => r.nama.toLowerCase().includes(mobileManualRackSearch.toLowerCase()))
              .slice(0, 100)
              .map((rack) => (
                <button
                  key={rack.id}
                  onClick={() => {
                    setManualRak(rack.nama);
                    setIsMobileManualRackOpen(false);
                    setMobileManualRackSearch('');
                  }}
                  className={cn(
                    "w-full flex items-center justify-between p-5 bg-white rounded-2xl border-2 transition-all active:scale-[0.98]",
                    manualRak === rack.nama
                      ? "border-emerald-500 bg-emerald-50 shadow-md"
                      : "border-gray-50 hover:border-emerald-200"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
                      manualRak === rack.nama ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-600"
                    )}>
                      <Building className="h-6 w-6" />
                    </div>
                    <div className="text-left">
                      <div className="text-xl font-black text-emerald-900 tracking-tight">{rack.nama}</div>
                    </div>
                  </div>
                  {manualRak === rack.nama && (
                    <div className="w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center shadow-lg shadow-emerald-200">
                      <Check className="h-5 w-5 text-white" />
                    </div>
                  )}
                </button>
              ))}
          </div>
          <div className="p-4 bg-white border-t border-gray-100 text-center">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              Total {rackLocations.length.toLocaleString()} Lokasi Tersedia
            </p>
          </div>
        </div>
      </Modal>

      {/* ===== VERIFICATION / MATCHING MODAL ===== */}
      <Modal
        isOpen={showVerificationModal}
        onClose={() => setShowVerificationModal(false)}
        title="Pusat Verifikasi Data"
        subtitle="Sinkronisasi data gudang & kantor"
        size="7xl"
        headerVariant="premium"
        icon={<RefreshCw className="h-6 w-6 text-white" />}
      >
        <div className="p-6 space-y-5">
          {/* Date Picker untuk filter Input Kantor */}
          <div>
            <label className="flex items-center text-xs font-black text-gray-500 uppercase tracking-widest mb-2 gap-2">
              <Calendar className="h-3.5 w-3.5 text-blue-500" />
              Filter Tanggal Input Kantor
            </label>
            <input
              type="date"
              value={verificationDate}
              onChange={(e) => {
                setVerificationDate(e.target.value);
                fetchVerificationStats(e.target.value);
              }}
              onClick={(e) => {
                e.currentTarget.showPicker?.();
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.currentTarget.showPicker?.();
              }}
              onKeyDown={(e) => e.preventDefault()}
              className="w-full px-4 py-2.5 border-2 border-blue-200 rounded-xl text-sm font-bold text-gray-800 focus:outline-none focus:border-blue-500 transition-all cursor-pointer select-none caret-transparent"
            />
            <p className="text-[10px] text-gray-400 font-bold mt-1 ml-1">
              Data kantor dihitung berdasarkan kolom <span className="font-black text-blue-500">tgl</span> di database_log
            </p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 text-center relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-1 opacity-10 group-hover:opacity-20 transition-opacity">
                <Building className="h-8 w-8 text-amber-900" />
              </div>
              <div className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-1">Backlog Gudang</div>
              <div className="text-3xl font-black text-amber-700">{verificationStats.pendingManual}</div>
              <div className="text-[9px] font-bold text-amber-600 mt-1">Total Belum Match</div>
            </div>
            <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 text-center relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-1 opacity-10 group-hover:opacity-20 transition-opacity">
                <Building2 className="h-8 w-8 text-blue-900" />
              </div>
              <div className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Input Kantor</div>
              <div className="text-3xl font-black text-blue-700">{verificationStats.pendingOffice}</div>
              <div className="text-[9px] font-bold text-blue-600 mt-1">
                Harian: {verificationDate ? new Date(verificationDate + 'T00:00:00').toLocaleDateString('id-ID', {day:'2-digit', month:'short'}) : '-'}
              </div>
            </div>
          </div>

          {/* Detailed Lists */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-[35vh] min-h-[250px] md:h-[350px]">
            {/* Backlog Gudang List */}
            <div className="bg-white rounded-2xl border border-amber-100 flex flex-col overflow-hidden shadow-sm">
              <div className="bg-amber-50 p-3 border-b border-amber-100 flex justify-between items-center shrink-0">
                <span className="text-[11px] font-black text-amber-700 uppercase tracking-widest flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5" /> Detail Backlog Gudang
                </span>
                <span className="text-[10px] font-bold bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">{pendingManualData.length} Data</span>
              </div>
              <div className="overflow-y-auto flex-1 p-2 space-y-2 custom-scrollbar">
                {pendingManualData.length > 0 ? (
                  pendingManualData.map((item, idx) => (
                    <div key={idx} className="bg-amber-50/40 p-2.5 rounded-xl border border-amber-50 text-xs hover:border-amber-200 transition-colors">
                      <div className="font-bold text-gray-800">{item.sku}</div>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="font-mono text-amber-700 font-black bg-amber-100 px-2 py-0.5 rounded text-[10px]">
                          RAK: {item.rak}
                        </span>
                        <span className="text-[10px] font-bold text-gray-400">
                          {new Date(item.created_at).toLocaleDateString('id-ID', {day: '2-digit', month: 'short'})}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-amber-300 gap-2">
                    <CheckCircle className="w-8 h-8" />
                    <span className="text-xs font-bold text-amber-500">Tidak ada backlog</span>
                  </div>
                )}
              </div>
            </div>

            {/* Input Kantor List */}
            <div className="bg-white rounded-2xl border border-blue-100 flex flex-col overflow-hidden shadow-sm">
              <div className="bg-blue-50 p-3 border-b border-blue-100 flex justify-between items-center shrink-0">
                <span className="text-[11px] font-black text-blue-700 uppercase tracking-widest flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" /> Detail Input Kantor
                </span>
                <span className="text-[10px] font-bold bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full">{pendingOfficeData.length} Data</span>
              </div>
              <div className="overflow-y-auto flex-1 p-2 space-y-2 custom-scrollbar">
                {pendingOfficeData.length > 0 ? (
                  pendingOfficeData.map((item, idx) => (
                    <div key={idx} className="bg-blue-50/40 p-2.5 rounded-xl border border-blue-50 text-xs hover:border-blue-200 transition-colors">
                      <div className="font-bold text-gray-800">{item.sku}</div>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[10px] font-bold text-gray-500 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-blue-400" />
                          {item.tgl ? new Date(item.tgl).toLocaleDateString('id-ID', {day: '2-digit', month: 'short'}) : '-'}
                        </span>
                        {item.unique_code && (
                          <span className="font-mono text-blue-700 font-black bg-blue-100 px-2 py-0.5 rounded text-[10px]">
                            {item.unique_code}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-blue-300 gap-2">
                    <CheckCircle className="w-8 h-8" />
                    <span className="text-xs font-bold text-blue-500">Semua matched</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-500" />
              Aturan Sinkronisasi (FIFO)
            </h4>
            <ul className="space-y-2">
              <li className="text-[11px] font-bold text-gray-600 flex items-start gap-2">
                <div className="w-1 h-1 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />
                Sistem pertama-tama mencari pasangan dengan <strong>Tanggal dan SKU</strong> yang persis sama.
              </li>
              <li className="text-[11px] font-bold text-gray-600 flex items-start gap-2">
                <div className="w-1 h-1 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />
                Jika tidak ada tanggal yang cocok (kemungkinan selisih hari input), sistem akan <strong>otomatis mencari tanggal terlama (FIFO)</strong> untuk SKU tersebut yang belum dipasangkan.
              </li>
              <li className="text-[11px] font-bold text-gray-600 flex items-start gap-2">
                <div className="w-1 h-1 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />
                Data yang sudah Match (matched_log_id terisi) tidak akan diproses ulang.
              </li>
            </ul>
          </div>

          {matchProgress.isMatching && (
            <div className="bg-white rounded-2xl p-4 border-2 border-emerald-100 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest truncate max-w-[80%]">{matchProgress.message}</span>
                <span className="text-sm font-black text-emerald-600">{matchProgress.progress}%</span>
              </div>
              <div className="w-full bg-emerald-50 rounded-full h-3 mb-2 overflow-hidden shadow-inner">
                <div 
                  className="bg-gradient-to-r from-emerald-400 to-teal-500 h-3 rounded-full transition-all duration-300 relative overflow-hidden" 
                  style={{ width: `${matchProgress.progress}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 font-bold text-right tracking-wider">
                MEMPROSES {matchProgress.current} DARI {matchProgress.total} DATA
              </p>
            </div>
          )}

          <div className="sticky -bottom-6 -mx-6 -mb-6 p-6 bg-white/95 backdrop-blur-sm border-t border-gray-100 shadow-[0_-20px_25px_-5px_rgba(0,0,0,0.05)] z-20 space-y-3">
            <Button
              onClick={runAutoMatch}
              disabled={manualLoading || verificationStats.pendingManual === 0}
              className={cn(
                "w-full h-14 font-black rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2",
                verificationStats.pendingManual > 0
                  ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-emerald-200 active:scale-95"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed shadow-none"
              )}
            >
              {manualLoading ? (
                <RefreshCw className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Send className="h-5 w-5" />
                  MULAI AUTO-MATCH
                </>
              )}
            </Button>
            
            <div className="flex gap-3">
              {devMode && (
                <Button
                  onClick={clearRemainingBacklog}
                  disabled={manualLoading || verificationStats.pendingManual === 0}
                  className={cn(
                    "flex-1 h-12 font-black rounded-2xl transition-all border-2",
                    verificationStats.pendingManual > 0
                      ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100 hover:border-red-300 active:scale-95"
                      : "bg-gray-50 text-gray-400 border-gray-100 cursor-not-allowed"
                  )}
                >
                  HAPUS SISA BACKLOG
                </Button>
              )}
              <Button
                onClick={() => setShowVerificationModal(false)}
                className="flex-1 h-12 bg-white hover:bg-gray-50 text-gray-600 font-black rounded-2xl border-2 border-gray-200 active:scale-95 transition-all"
              >
                TUTUP
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isMobileRackModalOpen}
        onClose={() => setIsMobileRackModalOpen(false)}
        title="Pilih Lokasi Rak"
        size="full"
        padding="p-0"
      >
        <div className="flex flex-col h-full bg-gray-50">
          {/* Search Header */}
          <div className="p-4 bg-white border-b border-gray-100 sticky top-0 z-20">
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                <Search className="h-5 w-5" />
              </div>
              <input
                type="text"
                placeholder="Cari nama rak..."
                value={mobileRackSearchTerm}
                onChange={(e) => setMobileRackSearchTerm(e.target.value.toUpperCase())}
                className="w-full pl-12 pr-4 py-4 bg-gray-100 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-2xl text-lg font-bold outline-none transition-all"
              />
              {mobileRackSearchTerm && (
                <button 
                  onClick={() => setMobileRackSearchTerm('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1 bg-gray-200 rounded-full text-gray-500"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* List Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {rackLocations
              .filter(r => r.nama.toLowerCase().includes(mobileRackSearchTerm.toLowerCase()))
              .slice(0, 100) // Performance: Limit display
              .map((rack) => (
                <button
                  key={rack.id}
                  onClick={() => {
                    setScanModalRak(rack.nama);
                    setIsMobileRackModalOpen(false);
                    setMobileRackSearchTerm('');
                  }}
                  className={cn(
                    "w-full flex items-center justify-between p-5 bg-white rounded-2xl border-2 transition-all active:scale-[0.98]",
                    scanModalRak === rack.nama 
                      ? "border-blue-500 bg-blue-50 shadow-md" 
                      : "border-gray-50 hover:border-blue-200"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
                      scanModalRak === rack.nama ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600"
                    )}>
                      <Building className="h-6 w-6" />
                    </div>
                    <div className="text-left">
                      <div className="text-xl font-black text-blue-900 tracking-tight">{rack.nama}</div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        {rack.gudang_inisial || 'Gudang Utama'}
                      </div>
                    </div>
                  </div>
                  {scanModalRak === rack.nama && (
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center shadow-lg shadow-blue-200">
                      <Check className="h-5 w-5 text-white" />
                    </div>
                  )}
                </button>
              ))}
            
            {rackLocations.filter(r => r.nama.toLowerCase().includes(mobileRackSearchTerm.toLowerCase())).length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <Building className="h-16 w-16 mb-4 opacity-20" />
                <p className="font-bold">Tidak ada rak yang ditemukan</p>
                <p className="text-xs">Coba gunakan kata kunci lain</p>
              </div>
            )}
          </div>

          {/* Footer Info */}
          <div className="p-4 bg-white border-t border-gray-100 text-center">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              Total {rackLocations.length.toLocaleString()} Lokasi Tersedia
            </p>
          </div>
        </div>
      </Modal>

      {/* Full Screen Modal Pilih Lokasi Rak Baru */}
      {selectedItemForRackModal && (
        <div className="fixed inset-0 z-50 bg-gray-900/80 backdrop-blur-md flex flex-col justify-between animate-fadeIn">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 px-5 py-4 flex items-center justify-between text-white shadow-lg border-b border-blue-600/30">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-md">
                <Building className="h-6 w-6 text-amber-400" />
              </div>
              <div>
                <h3 className="font-black text-lg text-white tracking-wide uppercase">Pilih Lokasi Rak Baru</h3>
                <p className="text-xs text-blue-200">Pilih atau ketik lokasi rak penyimpanan baru</p>
              </div>
            </div>
            <button
              onClick={() => setSelectedItemForRackModal(null)}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-all active:scale-95 border border-white/20"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Context Info Card (Nama Barang/SKU & Lokasi Lama) */}
          <div className="p-5 bg-white border-b border-gray-200 shadow-sm space-y-3">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 p-4 rounded-2xl border border-blue-100/80 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-blue-600">Nama Barang / SKU</span>
                  <h4 className="font-black text-base md:text-lg text-gray-900 leading-tight">{selectedItemForRackModal.sku}</h4>
                </div>
                <span className="px-3 py-1 bg-blue-600 text-white rounded-full text-xs font-black shadow-sm shrink-0">
                  {selectedItemForRackModal.jumlah} PCS
                </span>
              </div>

              <div className="flex items-center gap-4 text-xs pt-1 border-t border-blue-100">
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-500 font-bold uppercase text-[10px]">Lokasi Lama:</span>
                  <span className="font-mono font-black text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                    {selectedItemForRackModal.lokasi_penyimpanan || 'UTAMA'}
                  </span>
                </div>
                <div className="text-gray-400">•</div>
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-500 font-bold uppercase text-[10px]">Gudang:</span>
                  <span className="font-bold text-gray-800">{selectedItemForRackModal.gudang}</span>
                </div>
              </div>
            </div>

            {/* Search Input Box */}
            <div className="relative">
              <input
                type="text"
                value={rackSearchTerm}
                onChange={(e) => setRackSearchTerm(e.target.value.toUpperCase())}
                placeholder="Cari lokasi rak (contoh: A5, B12, ECER-M)..."
                className="w-full h-12 px-4 pr-10 border-2 border-blue-500 rounded-xl text-sm font-bold text-gray-900 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-white"
                autoFocus
              />
              {rackSearchTerm && (
                <button
                  onClick={() => setRackSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>

          {/* List/Grid of Rack Locations */}
          <div className="flex-1 overflow-y-auto p-5 bg-gray-50 space-y-3">
            {/* Custom Input Button if search term not exactly matching */}
            {rackSearchTerm.trim() !== '' && (
              <button
                onClick={() => {
                  const upperName = rackSearchTerm.trim().toUpperCase();
                  updateLocation(selectedItemForRackModal.id, 'update_lokasi_rak', upperName);
                  setSelectedItemForRackModal(null);
                  setRackSearchTerm('');
                  showToast(`Lokasi rak di-set ke: ${upperName}`, 'success');
                }}
                className="w-full p-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl shadow-md flex items-center justify-between transition-all active:scale-98 border border-emerald-500"
              >
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-6 w-6" />
                  <div className="text-left">
                    <p className="text-xs opacity-90 uppercase tracking-wider">Gunakan Lokasi Custom</p>
                    <p className="text-base font-black font-mono">{rackSearchTerm.trim().toUpperCase()}</p>
                  </div>
                </div>
                <span className="text-xs font-bold bg-white/20 px-3 py-1 rounded-lg">PILIH</span>
              </button>
            )}

            <p className="text-xs font-extrabold uppercase tracking-wider text-gray-500 ml-1">
              Daftar Lokasi Rak Terdaftar ({rackLocations.length})
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {rackLocations
                .filter(r => r.nama.toLowerCase().includes(rackSearchTerm.toLowerCase()))
                .map((rack) => (
                  <button
                    key={rack.id || rack.nama}
                    onClick={() => {
                      const upperName = rack.nama.trim().toUpperCase();
                      updateLocation(selectedItemForRackModal.id, 'update_lokasi_rak', upperName);
                      setSelectedItemForRackModal(null);
                      setRackSearchTerm('');
                      showToast(`Lokasi rak dipilih: ${upperName}`, 'success');
                    }}
                    className={`p-3.5 rounded-xl border-2 text-center transition-all duration-200 active:scale-95 flex flex-col items-center justify-center gap-1 ${
                      selectedItemForRackModal.update_lokasi_rak === rack.nama
                        ? 'bg-blue-600 text-white border-blue-700 shadow-md'
                        : 'bg-white text-gray-800 border-gray-200 hover:border-blue-400 hover:bg-blue-50/50 shadow-sm'
                    }`}
                  >
                    <span className="font-mono font-black text-sm md:text-base tracking-wider">{rack.nama}</span>
                  </button>
                ))}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="p-4 bg-white border-t border-gray-200 flex justify-end">
            <button
              onClick={() => setSelectedItemForRackModal(null)}
              className="w-full h-12 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-all uppercase text-xs tracking-wider"
            >
              Batal
            </button>
          </div>
        </div>
      )}
    </>
  );
}