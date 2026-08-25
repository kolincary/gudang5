import React, { useState, useMemo, useEffect, useCallback, useRef } from "react"
import { Search, RefreshCw, Calendar, ChevronLeft, ChevronRight, X, ChevronLast, ChevronFirst, Activity } from "lucide-react"
import { Button } from "./ui/Button"
import { Card, CardContent } from "./ui/Card"
import { motion, AnimatePresence } from "motion/react"
import { cn } from "../lib/utils"
import { supabase } from "../lib/supabase"

const OptimizedSearchDropdown = ({
  options,
  value,
  onChange,
  onSelect,
  onKeyDown,
  onFocus,
  onClose,
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
  onClose: () => void;
  placeholder: string;
  loading: boolean;
  highlightedIndex: number;
  showDropdown: boolean;
  clearSearch: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
  maxDisplayItems?: number;
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);

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
    if (dropdownRef.current && highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
      const highlightedElement = dropdownRef.current.children[highlightedIndex];
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, filteredOptions.length]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current && !inputRef.current.contains(event.target as Node)
      ) {
         onClose();
      }
    };
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [inputRef, onClose, showDropdown]);

  return (
    <div className="relative flex-1 w-full flex items-center h-full">
      <div className="pl-5 text-blue-500 pointer-events-none"><Search className="h-5 w-5" /></div>
      <input
        ref={inputRef}
        type="text"
        onKeyDown={onKeyDown}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        className="w-full px-4 py-4 focus:outline-none bg-transparent font-semibold text-gray-800 placeholder:text-gray-400 h-full"
        placeholder={placeholder}
      />
      {value && (
        <button
          onClick={(e) => { e.preventDefault(); clearSearch(); }}
          className="p-1.5 mr-3 bg-gray-50 hover:bg-gray-100 text-gray-400 hover:text-red-500 rounded-xl transition-all border border-gray-100 flex-shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-3 bg-white border border-gray-100 rounded-2xl shadow-[0_20px_50px_-15px_rgba(31,41,55,0.25)] z-50 max-h-64 overflow-y-auto overflow-hidden"
        >
          {filteredOptions.length > 0 ? (
            <>
              {filteredOptions.map((product, index) => (
                <div
                  key={product.nama}
                  onMouseDown={(e) => {
                     e.preventDefault();
                     onSelect(product.nama);
                  }}
                  className={`px-5 py-3.5 text-sm cursor-pointer border-b border-gray-50 last:border-b-0 font-bold transition-colors ${index === highlightedIndex
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-white hover:bg-gray-50 text-gray-700'
                    }`}
                >
                  {product.nama}
                </div>
              ))}
              {options.length > maxDisplayItems && (
                <div className="px-5 py-2.5 text-[10px] text-gray-400 bg-gray-50 font-black uppercase tracking-wider text-center border-t border-gray-100">
                  Menampilkan {Math.min(filteredOptions.length, maxDisplayItems)} dari {options.length} produk
                </div>
              )}
            </>
          ) : loading ? (
            <div className="px-5 py-6 text-sm text-gray-500 text-center flex items-center justify-center gap-3 font-bold">
              <RefreshCw className="h-5 w-5 animate-spin text-blue-500" /> Memuat daftar produk...
            </div>
          ) : (
            <div className="px-5 py-6 text-sm text-gray-400 text-center font-bold">
              {value.length > 0 ? 'Produk tidak ditemukan' : 'Ketik untuk mencari SKU produk'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => {
  return (
    <input className={cn("flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50", className)} ref={ref} {...props} />
  )
})
Input.displayName = "Input"

const Badge = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => {
  return (
    <div ref={ref} className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500", className)} {...props} />
  )
})
Badge.displayName = "Badge"

// Helper to generate dates
const getDatesInRange = (startDate: Date, daysBefore: number, daysAfter: number) => {
  const dates = [];
  for (let i = -daysBefore; i <= daysAfter; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    dates.push(date);
  }
  return dates;
};

// Helper for timezone-safe YYYY-MM-DD local strings
const getLocalYYYYMMDD = (d: Date) => {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const formatDateDisplay = (dateStr: string): string => {
  if (!dateStr) return '';
  let cleanStr = dateStr.trim();
  if (cleanStr.includes(' ') || cleanStr.includes('T')) {
    cleanStr = cleanStr.split(/[ T]/)[0];
  }
  if (/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.test(cleanStr)) {
    const match = cleanStr.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
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

interface DailyDataMap {
  [dateString: string]: { in: number; out: number };
}

interface GroupedRow {
  skuOnly: string;
  rack: string;
  lastScan: string;
  currentStock: number;
  dailyData: DailyDataMap;
}

export function DailyMonitoring() {
  const [searchTerm, setSearchTerm] = useState("");
  const [centerDate, setCenterDate] = useState(new Date());
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [monitoringData, setMonitoringData] = useState<GroupedRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Dropdown States
  const [allProducts, setAllProducts] = useState<{ nama: string }[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [productsLoading, setProductsLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  // Generate 7 days range
  const visibleDates = useMemo(() => getDatesInRange(centerDate, 3, 3), [centerDate]);

  const handlePrevWeek = () => {
    const newDate = new Date(centerDate);
    newDate.setDate(centerDate.getDate() - 7);
    setCenterDate(newDate);
  };

  const handleNextWeek = () => {
    const newDate = new Date(centerDate);
    newDate.setDate(centerDate.getDate() + 7);
    setCenterDate(newDate);
  };

  useEffect(() => {
    const fetchSkusForDate = async () => {
      setProductsLoading(true);
      try {
        const dateStr = getLocalYYYYMMDD(centerDate);
        
        // Exact match or start search based on how tgl_scan is stored
        // Assuming it's YYYY-MM-DD or contains it
        const { data, error } = await supabase
          .from('database_log')
          .select('sku')
          .ilike('type', '%IN%')
          .or(`tgl_scan.ilike.%${dateStr}%,tgl_scan.ilike.%${centerDate.toLocaleDateString('id-ID').replace(/\//g, '-').split('-').reverse().join('-')}%`);

        if (error) throw error;

        if (data) {
          // Get unique SKUs
          const uniqueSkus = Array.from(new Set(data.map(item => item.sku?.trim()).filter(Boolean)));
          const mapped = uniqueSkus.map(sku => ({ nama: sku }));
          setAllProducts(mapped);
          
          if (uniqueSkus.length === 0) {
            // Fallback to cache if no data for today, or just empty? 
            // The user said "hanya menampilkan sku pada tanggal barcode yang dipilih"
            // So if none, show empty or fallback. I'll stick to what they said.
          }
        }
      } catch (e) {
        console.error("Error fetching SKUs for date:", e);
      } finally {
        setProductsLoading(false);
      }
    };
    
    fetchSkusForDate();
  }, [centerDate]);

  const loadDatabaseLogs = useCallback(async (skuQuery: string) => {
    if (!skuQuery.trim()) {
      // Only warn if they try to track without input
      return;
    }
    
    try {
      setIsLoading(true);
      setIsRefreshing(true);
      setHasSearched(true);
      
      const { data, error } = await supabase
        .from('database_log')
        .select('sku, rak, tgl_scan, type, jumlah')
        .ilike('sku', `%${skuQuery.trim()}%`)
        .or('type.ilike.%IN%,type.ilike.%OUT%')
        .limit(50000);
        
      if (error) throw error;
      
      const allLogs = data || [];

      const groups = new Map<string, GroupedRow>();
        
      allLogs.forEach(log => {
        const normSku = (log.sku || '').trim();
        const normRak = (log.rak || '').trim() || '-';
        const tglScan = formatDateDisplay(log.tgl_scan || '');
        const normType = (log.type || '').trim().toUpperCase();
        const qty = Number(log.jumlah || 0);
        
        if (!normSku) return;
        
        const finalType = normType.includes('IN') ? 'IN' : 'OUT';
        const key = `${normSku}|${normRak}`;
        
        if (!groups.has(key)) {
          groups.set(key, {
            skuOnly: normSku,
            rack: normRak,
            lastScan: tglScan,
            currentStock: 0,
            dailyData: {}
          });
        }
        
        const row = groups.get(key)!;
        
        if (finalType === 'IN') {
            row.currentStock += qty;
        } else {
            row.currentStock -= qty;
        }
        
        if (tglScan && tglScan > row.lastScan) {
            row.lastScan = tglScan;
        } else if (!row.lastScan && tglScan) {
            row.lastScan = tglScan;
        }
        
        if (tglScan) {
            if (!row.dailyData[tglScan]) {
              row.dailyData[tglScan] = { in: 0, out: 0 };
            }
            if (finalType === 'IN') {
              row.dailyData[tglScan].in += qty;
            } else {
              row.dailyData[tglScan].out += qty;
            }
        }
      });

      const finalData = Array.from(groups.values());
      finalData.sort((a,b) => a.skuOnly.localeCompare(b.skuOnly));
      
      setMonitoringData(finalData);
    } catch (error) {
      console.error('Error loading monitoring data:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const handleSelectProduct = useCallback((productName: string) => {
    setSearchTerm(productName);
    setShowDropdown(false);
    loadDatabaseLogs(productName);
  }, [loadDatabaseLogs]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const filtered = allProducts.filter(product =>
      product.nama && product.nama.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 50);

    if (e.key === 'ArrowDown' && showDropdown && filtered.length > 0) {
      e.preventDefault();
      setHighlightedIndex((prev) => prev >= filtered.length - 1 ? 0 : prev + 1);
    } else if (e.key === 'ArrowUp' && showDropdown && filtered.length > 0) {
      e.preventDefault();
      setHighlightedIndex((prev) => prev <= 0 ? filtered.length - 1 : prev - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (showDropdown && highlightedIndex >= 0 && highlightedIndex < filtered.length) {
        handleSelectProduct(filtered[highlightedIndex].nama);
        if (inputRef.current) inputRef.current.blur();
      } else if (searchTerm) {
        setShowDropdown(false);
        loadDatabaseLogs(searchTerm);
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
      setHighlightedIndex(0);
      if (inputRef.current) inputRef.current.blur();
    }
  }, [allProducts, searchTerm, showDropdown, highlightedIndex, handleSelectProduct, loadDatabaseLogs]);

  const filteredData = useMemo(() => {
    return monitoringData; // We already filtered by SKU from DB!
  }, [monitoringData]);

  // Pagination logic
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, currentPage, itemsPerPage]);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  // Advanced Pagination Range Generator
  const getPaginationRange = () => {
    const range = [];
    const delta = 1; // Number of pages to show around current page
    
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) range.push(i);
      return range;
    }

    // Always show first page
    range.push(1);

    if (currentPage > 3) {
      range.push("...");
    }

    // Pages around current page
    const start = Math.max(2, currentPage - delta);
    const end = Math.min(totalPages - 1, currentPage + delta);

    for (let i = start; i <= end; i++) {
      range.push(i);
    }

    if (currentPage < totalPages - 2) {
      range.push("...");
    }

    // Always show last page
    range.push(totalPages);

    return range;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] lg:h-[calc(100vh-4rem)] overflow-hidden -mt-16 pt-16 px-3 lg:px-8">
      {/* ======================================================== */}
      {/* FIXED HEADER & SEARCH (Matched with Dashboard/Input Styles) */}
      {/* ======================================================== */}
      <div className="flex-none z-50 bg-gray-50 pb-2">
        <div className="flex flex-col">
          {/* Main Blue Banner Container - Size matched to Dashboard (lg:h-[310px]) */}
          <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 pt-[90px] lg:pt-0 lg:h-[310px] pb-[75px] lg:pb-0 px-6 lg:px-12 rounded-b-[40px] lg:rounded-b-[55px] shadow-2xl relative overflow-hidden transition-all duration-500 flex flex-col justify-center">
            
            {/* Banner Background Activity Icon */}
            <div className="absolute -top-6 -right-6 text-white opacity-5">
              <Activity className="w-64 h-64 lg:w-96 lg:h-96" />
            </div>

            {/* Decorative Floating Shapes (Matched with Dashboard) */}
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
                  Monitoring <span className="text-blue-200">Harian</span>
                </h1>
                <div className="text-blue-100/90 font-medium text-[14px] lg:text-[18px] leading-relaxed max-w-[90%] normal-case flex items-center gap-3">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                  </span>
                  <span className="font-black text-white tracking-wide uppercase">{centerDate.toLocaleString('id-ID', { month: 'long', year: 'numeric' })}</span>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="flex bg-white/10 backdrop-blur-md rounded-2xl p-1.5 border border-white/20 items-center shadow-xl">
                  <Button onClick={handlePrevWeek} variant="ghost" className="h-11 px-4 text-white hover:bg-white/20 rounded-xl transition-all flex items-center gap-2">
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <div className="w-[1px] h-6 bg-white/20 mx-1" />
                  <Button onClick={handleNextWeek} variant="ghost" className="h-11 px-4 text-white hover:bg-white/20 rounded-xl transition-all flex items-center gap-2">
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </div>
                <Button 
                  onClick={() => loadDatabaseLogs(searchTerm)}
                  disabled={isRefreshing || !searchTerm.trim()}
                  className="h-14 px-8 bg-white/15 hover:bg-white/25 text-white font-black rounded-2xl shadow-xl transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center gap-3 border border-white/20 backdrop-blur-md"
                >
                  <RefreshCw className={cn("h-5 w-5", isRefreshing ? "animate-spin" : "")} />
                  REFRESH DATA
                </Button>
              </div>
            </div>
          </div>

          {/* Search Box Wrapper - Floating Style Matched with Dashboard (-mt-[48px] lg:-mt-[55px]) */}
          <div className="relative z-30 -mt-[48px] lg:-mt-[55px] px-4 lg:px-24 w-full max-w-6xl mx-auto mb-2">
            <div className="bg-white/95 backdrop-blur-2xl rounded-[28px] lg:rounded-[35px] shadow-[0_20px_50px_-15px_rgba(31,41,55,0.25)] p-2 lg:p-3 border border-white flex flex-col md:flex-row gap-3">
              
              {/* Date Column with optimized size */}
              <div 
                onClick={() => {
                  const input = document.getElementById('date-filter-input') as HTMLInputElement;
                  if (input) {
                    try { input.showPicker(); } catch (e) { input.click(); }
                  }
                }}
                className="relative flex items-center md:w-[32%] border border-gray-100 rounded-[22px] lg:rounded-[28px] bg-gray-50/50 overflow-hidden focus-within:border-blue-500 transition-all shadow-inner cursor-pointer hover:bg-gray-100/50"
              >
                <div className="pl-4 text-blue-500/70"><Calendar className="h-5 w-5" /></div>
                <div className="flex flex-col flex-1 pl-3 pr-2 py-2">
                  <span className="text-[10px] font-black text-blue-500/80 uppercase tracking-widest leading-none mt-0.5 mb-1.5">Filter Tanggal Barcode</span>
                  <input
                    id="date-filter-input"
                    type="date"
                    value={getLocalYYYYMMDD(centerDate)}
                    onChange={(e) => {
                      if (e.target.value) setCenterDate(new Date(e.target.value));
                    }}
                    className="w-full focus:outline-none bg-transparent font-black text-gray-800 text-[15px] h-7 cursor-pointer"
                  />
                </div>
              </div>
              
              {/* Dropdown with full width capability */}
              <div className="relative flex items-center flex-1 border border-gray-100 rounded-[22px] lg:rounded-[28px] bg-gray-50/50 overflow-visible focus-within:border-blue-500 transition-all z-40 shadow-inner">
                <OptimizedSearchDropdown
                  options={allProducts}
                  value={searchTerm}
                  onChange={(val) => {
                    setSearchTerm(val);
                    setHighlightedIndex(0);
                    setShowDropdown(true);
                    if (val.length === 0) { setMonitoringData([]); setHasSearched(false); }
                  }}
                  onSelect={handleSelectProduct}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setShowDropdown(true)}
                  onClose={() => setShowDropdown(false)}
                  placeholder="Cari SKU yang aktif pada tanggal terpilih..."
                  loading={productsLoading}
                  highlightedIndex={highlightedIndex}
                  showDropdown={showDropdown}
                  clearSearch={() => {
                    setSearchTerm("");
                    setMonitoringData([]);
                    setHasSearched(false);
                    setShowDropdown(false);
                  }}
                  inputRef={inputRef}
                  maxDisplayItems={100}
                />
              </div>

              {/* Action Button */}
              <Button 
                 onClick={() => loadDatabaseLogs(searchTerm)}
                 disabled={!searchTerm.trim() || isLoading}
                 className="h-14 md:w-32 rounded-[22px] lg:rounded-[28px] font-black text-xs bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-500/30 text-white tracking-widest transition-all active:scale-95"
              >
                 LACAK
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* SCROLLABLE DATA BODY */}
      {/* ======================================================== */}
      <div className="flex-1 overflow-auto px-4 lg:px-8 pb-10 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
        <div className="w-full max-w-[1600px] mx-auto pt-4 lg:pt-6">
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <Card className="border-none shadow-[0_8px_30px_-5px_rgba(0,0,0,0.05)] rounded-[24px] overflow-hidden bg-white border border-gray-100">
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="py-20 text-center flex flex-col items-center justify-center bg-white">
                    <div className="relative flex items-center justify-center mb-6">
                      <div className="absolute h-16 w-16 rounded-full border-4 border-blue-50 animate-pulse"></div>
                      <RefreshCw className="h-8 w-8 text-blue-500 animate-spin" />
                    </div>
                    <p className="text-gray-400 font-black text-xs uppercase tracking-[0.2em]">Memetakan Aliran Barang...</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto overflow-y-visible">
                    <table className="w-full text-left border-collapse min-w-max">
                    <thead className="sticky top-0 z-40 drop-shadow-sm">
                      <tr className="bg-gray-50/90 backdrop-blur-md">
                        <th className="min-w-[200px] lg:min-w-[280px] p-6 lg:p-7 text-[12px] font-black text-gray-400 uppercase tracking-widest sticky left-0 bg-gray-50 z-20 border border-gray-200/80 shadow-[4px_0_15px_rgba(0,0,0,0.06)]">Informasi SKU</th>
                        <th className="min-w-[100px] lg:min-w-[120px] p-6 lg:p-7 text-[12px] font-black text-gray-400 uppercase tracking-widest border border-gray-200/80 text-center">RAK</th>
                        <th className="min-w-[140px] lg:min-w-[160px] p-6 lg:p-7 text-[12px] font-black text-gray-400 uppercase tracking-widest border border-gray-200/80 text-center">LAST SCAN</th>
                        <th className="min-w-[100px] lg:min-w-[120px] p-6 lg:p-7 text-[12px] font-black text-gray-400 uppercase tracking-widest text-center border border-gray-200/80">STOK</th>
                        {visibleDates.map(date => {
                          const dayStr = date.getDate().toString().padStart(2, '0');
                          const monthStr = date.toLocaleString('id-ID', { month: 'short' }).toUpperCase();
                          const isToday = new Date().toDateString() === date.toDateString();
                          
                          return (
                            <th key={date.toISOString()} className={cn(
                              "min-w-[130px] lg:min-w-[150px] p-6 lg:p-7 text-center border border-gray-200/80 transition-colors uppercase",
                              isToday && "bg-blue-50/50"
                            )}>
                              <div className="flex flex-col items-center">
                                <span className={cn("text-[11px] font-black uppercase mb-1", isToday ? "text-blue-500" : "text-gray-400")}>{monthStr}</span>
                                <span className={cn(
                                  "text-xl lg:text-2xl font-black leading-none",
                                  isToday ? "text-blue-600" : "text-gray-800"
                                )}>{dayStr}</span>
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      <AnimatePresence mode="popLayout">
                        {paginatedData.length > 0 ? (
                          paginatedData.map((row) => (
                            <motion.tr 
                              layout
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              key={row.skuOnly + row.rack} 
                              className="hover:bg-blue-50/30 transition-colors group"
                            >
                              <td className="p-6 lg:p-7 sticky left-0 bg-white z-10 shadow-[6px_0_20px_rgba(0,0,0,0.04)] group-hover:bg-blue-50/50 transition-colors border border-gray-100">
                                <span className="font-black text-gray-900 text-sm lg:text-base whitespace-nowrap tracking-tight">{row.skuOnly}</span>
                              </td>
                              <td className="p-6 lg:p-7 text-center border border-gray-100">
                                <Badge className={cn(
                                  "border-none font-black text-[11px] px-3 py-1.5 rounded-lg shadow-sm",
                                  row.rack === '-' ? "bg-gray-100 text-gray-400" : "bg-blue-50 text-blue-600"
                                )}>
                                  {row.rack}
                                </Badge>
                              </td>
                              <td className="p-6 lg:p-7 whitespace-nowrap text-center text-[12px] font-bold text-gray-400 border border-gray-100 tracking-tight">
                                {row.lastScan ? row.lastScan : "-"}
                              </td>
                              <td className="p-6 lg:p-7 text-center border border-gray-100">
                                <span className={cn(
                                  "inline-block min-w-[40px] text-[13px] lg:text-sm font-black px-3 py-1.5 rounded-xl border",
                                  row.currentStock <= 0 
                                    ? "bg-red-50 text-red-600 border-red-100" 
                                    : "bg-green-50 text-green-700 border-green-100"
                                )}>
                                  {row.currentStock}
                                </span>
                              </td>
                              {visibleDates.map(date => {
                                const dateStr = getLocalYYYYMMDD(date);
                                const data = row.dailyData[dateStr];
                                const isToday = new Date().toDateString() === date.toDateString();
   
                                return (
                                  <td key={date.toISOString()} className={cn(
                                    "p-4 lg:p-5 border border-gray-100",
                                    isToday && "bg-blue-50/5"
                                  )}>
                                    <div className="flex flex-col gap-2 min-h-[50px] justify-center">
                                      {data && data.in > 0 && (
                                        <div className="flex items-center justify-between bg-green-500/10 px-3 py-1.5 rounded-lg border border-green-500/20">
                                          <span className="text-[10px] font-black text-green-600 tracking-tighter">IN</span>
                                          <span className="text-[14px] font-black text-green-700">{data.in}</span>
                                        </div>
                                      )}
                                      {data && data.out > 0 && (
                                        <div className="flex items-center justify-between bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/20">
                                          <span className="text-[10px] font-black text-red-600 tracking-tighter">OUT</span>
                                          <span className="text-[14px] font-black text-red-700">{data.out}</span>
                                        </div>
                                      )}
                                      {(!data || (data.in === 0 && data.out === 0)) && (
                                        <div className="text-center text-[9px] text-gray-100 font-black">---</div>
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                            </motion.tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={visibleDates.length + 4} className="p-16 text-center bg-gray-50/30">
                              <div className="flex flex-col items-center gap-3">
                                <div className="h-14 w-14 rounded-full bg-blue-100/50 flex items-center justify-center">
                                  <Search className="h-6 w-6 text-blue-400" />
                                </div>
                                <div className="space-y-1">
                                  <p className="text-gray-500 font-black text-sm uppercase tracking-wide">
                                    {!hasSearched ? "Siap Melacak" : "Pencarian Nihil"}
                                  </p>
                                  <p className="text-gray-400 text-[11px] font-medium">
                                    {!hasSearched 
                                      ? "Hubungkan tanggal dan SKU untuk memantau pergerakan stok harian Anda." 
                                      : "Tidak ditemukan aktivitas log untuk kriteria pencarian tersebut."}
                                  </p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
                )}

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="p-8 border-t border-gray-100 flex flex-col lg:flex-row items-center justify-between gap-6 bg-gray-50/30">
                  <div className="flex flex-col md:flex-row items-center gap-6">
                    <div className="text-[11px] font-black text-gray-400 uppercase tracking-widest">
                      Menampilkan <span className="text-gray-900">{(currentPage - 1) * itemsPerPage + 1}</span> - <span className="text-gray-900">{Math.min(currentPage * itemsPerPage, filteredData.length)}</span> dari <span className="text-gray-900">{filteredData.length}</span> SKU
                    </div>
                    
                    <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-gray-200 shadow-sm">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Tampilkan:</span>
                      {[50, 100, 150].map(size => (
                        <button
                          key={size}
                          onClick={() => {setItemsPerPage(size); setCurrentPage(1);}}
                          className={cn(
                            "text-[11px] font-black px-2 py-1 rounded-md transition-all",
                            itemsPerPage === size ? "bg-blue-600 text-white shadow-md" : "text-gray-400 hover:text-blue-600"
                          )}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      onClick={() => goToPage(1)} 
                      disabled={currentPage === 1}
                      className="px-2 py-2 rounded-xl border-gray-200 hover:bg-white hover:text-blue-600 transition-all shadow-sm"
                    >
                      <ChevronFirst className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => goToPage(currentPage - 1)} 
                      disabled={currentPage === 1}
                      className="px-2 py-2 rounded-xl border-gray-200 hover:bg-white hover:text-blue-600 transition-all shadow-sm"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    
                    <div className="flex items-center gap-1.5 px-2">
                      {getPaginationRange().map((page, i) => (
                        <React.Fragment key={i}>
                          {page === "..." ? (
                            <span className="px-2 text-gray-400 font-black">...</span>
                          ) : (
                            <Button
                              variant={currentPage === page ? "primary" : "outline"}
                              size="sm"
                              onClick={() => goToPage(Number(page))}
                              className={cn(
                                "min-w-[40px] h-10 rounded-xl font-black text-xs transition-all",
                                currentPage === page 
                                  ? "bg-blue-600 text-white shadow-lg shadow-blue-200" 
                                  : "border-gray-200 hover:bg-white hover:text-blue-600 shadow-sm"
                              )}
                            >
                              {page}
                            </Button>
                          )}
                        </React.Fragment>
                      ))}
                    </div>

                    <Button 
                      variant="outline" 
                      onClick={() => goToPage(currentPage + 1)} 
                      disabled={currentPage === totalPages}
                      className="px-2 py-2 rounded-xl border-gray-200 hover:bg-white hover:text-blue-600 transition-all shadow-sm"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => goToPage(totalPages)} 
                      disabled={currentPage === totalPages}
                      className="px-2 py-2 rounded-xl border-gray-200 hover:bg-white hover:text-blue-600 transition-all shadow-sm"
                    >
                      <ChevronLast className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
