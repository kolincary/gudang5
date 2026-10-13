import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import {
  Calculator, AlertCircle, AlertTriangle, CheckCircle, RefreshCw,
  Trash2, Copy, Clipboard, X, Search, ChevronDown, Calendar, CalendarX,
  Package, Square, Check, Scale, Zap
} from 'lucide-react';
import { supabase, fetchAllProducts, fetchAllStockItems } from '../lib/supabase';
import {
  formatDateDisplay,
  formatDeficitReportSentence,
  formatMoveReportSentence,
  BalanceAnalysisResult,
  OutTransactionDetail,
  SurplusOption,
  isForbiddenRackAdjustment,
  isForbiddenTransferRack
} from './DatabaseLog';
import {
  normalizeDate,
  normalizeTime,
  toTimestamp,
  isOutDateEligibleForIn
} from '../services/scanDateMatchService';
import { parseMultipleSkus } from '../services/transferPurgeService';

interface FilterDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options?: string[];
  placeholder?: string;
  loading?: boolean;
}

function FilterDropdown({ value, onChange, options = [], placeholder, loading = false }: FilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filteredOptions, setFilteredOptions] = useState<string[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const safeOptions = Array.isArray(options) ? options : [];
    if (value && value.trim() !== '') {
      const searchTerm = value.toLowerCase().trim();
      const filtered = safeOptions.filter(option =>
        String(option).toLowerCase().includes(searchTerm)
      );
      setFilteredOptions(filtered);
    } else {
      setFilteredOptions(safeOptions);
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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFocus = () => {
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
    if (inputRef.current) inputRef.current.focus();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    if (!isOpen && !loading) {
      setIsOpen(true);
      setHighlightedIndex(0);
    }
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={handleFocus}
          placeholder={loading ? 'Memuat data...' : placeholder}
          disabled={loading}
          className="w-full h-11 px-4 pr-10 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-sm bg-white text-sm"
        />
        {value && !loading && (
          <button
            type="button"
            onClick={handleClearClick}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
            title="Hapus"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isOpen && !loading && filteredOptions.length > 0 && (
        <div
          ref={listRef}
          className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto"
        >
          {filteredOptions.map((option, index) => (
            <div
              key={index}
              ref={el => (itemRefs.current[index] = el)}
              onClick={() => handleOptionSelect(option)}
              className={`px-4 py-2.5 text-xs font-medium cursor-pointer transition-colors ${
                index === highlightedIndex
                  ? 'bg-purple-50 text-purple-700 font-bold'
                  : 'hover:bg-slate-50 text-slate-800'
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

export interface CekSaldo2ModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  allSkus?: string[];
  initialSku?: string;
  onDataUpdated?: () => void;
  showToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  isInline?: boolean;
}

export function CekSaldo2Modal({
  isOpen = false,
  onClose = () => {},
  allSkus = [],
  initialSku = '',
  onDataUpdated,
  showToast: externalShowToast,
  isInline = false
}: CekSaldo2ModalProps) {
  // Toast fallback
  const [toastState, setToastState] = useState<{ isOpen: boolean; message: string; type: 'success' | 'error' | 'warning' | 'info' }>({
    isOpen: false,
    message: '',
    type: 'info'
  });

  const notify = useCallback((message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    if (externalShowToast) {
      externalShowToast(message, type);
    } else {
      setToastState({ isOpen: true, message, type });
      setTimeout(() => setToastState(prev => ({ ...prev, isOpen: false })), 4000);
    }
  }, [externalShowToast]);

  // Core State
  const [analysisSku, setAnalysisSku] = useState(initialSku);
  const [analysisSkuInputMode, setAnalysisSkuInputMode] = useState<'single' | 'bulk'>('single');
  const [bulkAnalysisSkuInput, setBulkAnalysisSkuInput] = useState('');
  const [analysisResults, setAnalysisResults] = useState<BalanceAnalysisResult[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [excludedScanDates, setExcludedScanDates] = useState('');
  const [excludedRacks, setExcludedRacks] = useState('');
  const [activeFilterTab, setActiveFilterTab] = useState<'all' | 'deficit' | 'surplus'>('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [singleTargetSelections, setSingleTargetSelections] = useState<Record<string, { targetRak: string; targetRawTglScan: string }>>({});
  const [expandedDeficitKeys, setExpandedDeficitKeys] = useState<Set<string>>(new Set());
  const [analyzedSkusList, setAnalyzedSkusList] = useState<string[]>([]);
  const [isProcessingRemediation, setIsProcessingRemediation] = useState(false);

  // Redistribution Preview State
  const [isRedistributeModalOpen, setIsRedistributeModalOpen] = useState(false);
  const [redistributeMoves, setRedistributeMoves] = useState<any[]>([]);
  const [isExecutingRedistribute, setIsExecutingRedistribute] = useState(false);

  // Delete Transfer State
  const [isDeleteTransferModalOpen, setIsDeleteTransferModalOpen] = useState(false);
  const [transferLogs, setTransferLogs] = useState<any[]>([]);
  const [selectedTransferIds, setSelectedTransferIds] = useState<Set<string>>(new Set());
  const [isLoadingTransferLogs, setIsLoadingTransferLogs] = useState(false);
  const [isDeletingTransferLogs, setIsDeletingTransferLogs] = useState(false);
  const [targetSkusForDeleteTransfer, setTargetSkusForDeleteTransfer] = useState<string[]>([]);

  // Delete Overcut (TIDAK JADI POTONG) State
  const [deleteOvercutModal, setDeleteOvercutModal] = useState<{
    isOpen: boolean;
    item: BalanceAnalysisResult | null;
    targetTransactions: OutTransactionDetail[];
    selectedIds: Set<string>;
    isDeleting: boolean;
  }>({
    isOpen: false,
    item: null,
    targetTransactions: [],
    selectedIds: new Set(),
    isDeleting: false
  });

  // Live Batch Auto-Fix State
  const [batchAutoFixProgress, setBatchAutoFixProgress] = useState<{
    isRunning: boolean;
    isStopping: boolean;
    currentIndex: number;
    total: number;
    currentSku: string;
    iteration: number;
    statusMessage: string;
    completedList: { sku: string; movesFixed: number; isKlop: boolean; iterations: number; message: string }[];
  }>({
    isRunning: false,
    isStopping: false,
    currentIndex: 0,
    total: 0,
    currentSku: '',
    iteration: 0,
    statusMessage: '',
    completedList: []
  });
  const stopBatchAutoFixRef = useRef(false);

  // DevMode keystroke listener for "Hapus Data Gudang: TRANSFER" (default hidden, toggle with 'devmode')
  const [showDeleteTransferBtn, setShowDeleteTransferBtn] = useState<boolean>(false);
  const devmodeBufferRef = useRef<string>('');

  useEffect(() => {
    // Clear any past session storage so default is always hidden
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('cek_saldo_devmode_active');
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      devmodeBufferRef.current = (devmodeBufferRef.current + e.key.toLowerCase()).slice(-10);
      if (devmodeBufferRef.current.endsWith('devmode')) {
        devmodeBufferRef.current = ''; // Reset buffer immediately so typing it again can trigger next toggle
        setShowDeleteTransferBtn(prev => {
          const nextState = !prev;
          notify(
            nextState
              ? 'DevMode diaktifkan: Tombol Hapus Data Gudang: TRANSFER sekarang muncul.'
              : 'DevMode dinonaktifkan: Tombol Hapus Data Gudang: TRANSFER disembunyikan.',
            'info'
          );
          return nextState;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [notify]);

  // Fallback SKU loading if allSkus is empty (tanpa batasan 1000 data)
  const [internalSkus, setInternalSkus] = useState<string[]>([]);
  useEffect(() => {
    if ((isOpen || isInline) && (!allSkus || allSkus.length === 0)) {
      const fetchSkus = async () => {
        try {
          const res = await fetchAllProducts(undefined, true);
          if (res.success && res.data && res.data.length > 0) {
            const unique = Array.from(new Set(res.data.map((d: any) => (d.nama || d.nama_produk || '').trim().toUpperCase()).filter(Boolean)));
            setInternalSkus(unique);
          } else {
            const stockRes = await fetchAllStockItems();
            if (stockRes.success && stockRes.data && stockRes.data.length > 0) {
              const unique = Array.from(new Set(stockRes.data.map((d: any) => (d.nama_produk || '').trim().toUpperCase()).filter(Boolean)));
              setInternalSkus(unique);
            }
          }
        } catch (e) {
          console.warn('Failed to fetch fallback skus in CekSaldo2Modal:', e);
        }
      };
      fetchSkus();
    }
  }, [isOpen, isInline, allSkus]);

  const effectiveSkus = (allSkus && allSkus.length > 0) ? allSkus : internalSkus;

  // Sync initial SKU when modal opens or is active inline
  useEffect(() => {
    if ((isOpen || isInline) && initialSku) {
      setAnalysisSku(initialSku);
    }
  }, [isOpen, isInline, initialSku]);

  const normRak = (r?: string) => (r || '').trim().toUpperCase().replace(/\./g, '');

  // -------------------------------------------------------------
  // 1. ANALYZE STOCK BALANCE ENGINE (CEK SALDO 2)
  // -------------------------------------------------------------
  const handleAnalyzeStockBalance = useCallback(async (customSkuOrList?: string | string[]) => {
    let targetSkus: string[] = [];

    if (customSkuOrList) {
      if (Array.isArray(customSkuOrList)) {
        targetSkus = customSkuOrList.map(s => s.trim().toUpperCase()).filter(Boolean);
      } else {
        targetSkus = [customSkuOrList.trim().toUpperCase()];
      }
    } else if (analysisSkuInputMode === 'bulk' && bulkAnalysisSkuInput.trim()) {
      targetSkus = parseMultipleSkus(bulkAnalysisSkuInput);
    } else if (analysisSku && analysisSku.trim()) {
      targetSkus = [analysisSku.trim().toUpperCase()];
    }

    if (targetSkus.length === 0) {
      notify('Silakan pilih atau tempel setidaknya 1 SKU untuk melakukan analisis.', 'warning');
      return;
    }

    try {
      setIsAnalyzing(true);
      setAnalysisResults([]);
      setExpandedDeficitKeys(new Set());
      setSingleTargetSelections({});
      setAnalyzedSkusList(targetSkus);
      setBatchAutoFixProgress(prev => ({ ...prev, completedList: [] }));

      notify(`Memulai analisis saldo stok 2 untuk ${targetSkus.length} SKU...`, 'info');

      let allLogs: any[] = [];

      if (targetSkus.length === 1) {
        let query = supabase
          .from('database_log')
          .select('id, sku, rak, sub_rak, tgl_scan, type, jumlah, tgl, waktu, user_name, gudang, log_audit_saldo')
          .or('type.ilike.%IN%,type.ilike.%OUT%')
          .order('id', { ascending: true })
          .ilike('sku', targetSkus[0].trim());

        const batchSize = 1000;
        let from = 0;
        let hasMore = true;

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

          if (allLogs.length > 50000) {
            notify('Data terlalu besar (>50.000). Hasil dibatasi untuk performa.', 'warning');
            hasMore = false;
          }
        }
      } else {
        const skuBatchSize = 30;
        for (let i = 0; i < targetSkus.length; i += skuBatchSize) {
          const rawChunk = targetSkus.slice(i, i + skuBatchSize);
          const chunkSet = new Set<string>();
          rawChunk.forEach(s => {
            const trimmed = s.trim();
            if (trimmed) {
              chunkSet.add(trimmed);
              chunkSet.add(trimmed.toUpperCase());
              chunkSet.add(trimmed.toLowerCase());
            }
          });
          const chunk = Array.from(chunkSet);
          let from = 0;
          let hasMore = true;

          while (hasMore) {
            let query = supabase
              .from('database_log')
              .select('*')
              .in('sku', chunk)
              .or('type.ilike.%IN%,type.ilike.%OUT%')
              .order('id', { ascending: true });

            const { data, error } = await query.range(from, from + 999);
            if (error) throw error;

            if (data && data.length > 0) {
              allLogs = [...allLogs, ...data];
              from += 1000;
              if (data.length < 1000) hasMore = false;
            } else {
              hasMore = false;
            }

            if (allLogs.length > 100000) {
              notify('Data log terlalu banyak (>100.000). Analisis dibatasi.', 'warning');
              hasMore = false;
              break;
            }
          }
        }
      }

      const logsBySku = new Map<string, any[]>();
      allLogs.forEach(log => {
        const normSku = (log.sku || '').trim().toUpperCase();
        if (!logsBySku.has(normSku)) logsBySku.set(normSku, []);
        logsBySku.get(normSku)!.push(log);
      });

      const allCombinedGroups: BalanceAnalysisResult[] = [];
      const initialSelections: Record<string, { targetRak: string; targetRawTglScan: string }> = {};

      logsBySku.forEach((skuLogs, currentSku) => {
        const balanceMap = new Map<string, BalanceAnalysisResult>();

        skuLogs.forEach(log => {
          const normSku = currentSku;
          const logNormRak = (log.rak || '').trim().toUpperCase();
          const normSubRak = (log.sub_rak || '').trim().toUpperCase();
          const rawTglScan = (log.tgl_scan || '').trim();
          const normTglScan = formatDateDisplay(rawTglScan) || 'No Date';
          const normType = (log.type || '').trim().toUpperCase();

          if (!normType.includes('IN') && !normType.includes('OUT')) return;
          const finalType = normType.includes('IN') ? 'IN' : 'OUT';

          const key = `${normSku}|${logNormRak}|${normTglScan}`;

          if (!balanceMap.has(key)) {
            balanceMap.set(key, {
              sku: normSku,
              rak: (log.rak || '').trim(),
              subRaks: new Set<string>(),
              tglScan: normTglScan,
              rawTglScan: rawTglScan,
              totalIn: 0,
              totalOut: 0,
              balance: 0,
              outTransactions: [],
              diagnosticType: 'BALANCED',
              recommendedAction: '',
              availableSurplusesSameRak: [],
              availableSurplusesOtherRak: [],
              hasTimeAnomaly: false,
              timeAnomalyCount: 0,
              timeAnomalyQty: 0,
              timeAnomalyOuts: []
            });
          }

          const result = balanceMap.get(key)!;
          if (normSubRak) result.subRaks.add(normSubRak);

          const jumlah = Number(log.jumlah || 0);

          if (finalType === 'IN') {
            result.totalIn += jumlah;
            const inD = normalizeDate(log.tgl);
            if (inD && (!result.earliestInTgl || inD < result.earliestInTgl)) {
              result.earliestInTgl = inD;
            }
          } else {
            result.totalOut += jumlah;
            const outDetail: OutTransactionDetail = {
              id: log.id,
              waktu: log.waktu,
              jumlah: jumlah,
              user: log.user_name || (log as any).user || '',
              gudang: (log.gudang || '').trim(),
              tgl_scan: rawTglScan,
              rak: (log.rak || '').trim(),
              sub_rak: (log.sub_rak || '').trim(),
              tgl: normalizeDate(log.tgl),
              log_audit_saldo: log.log_audit_saldo,
              isTimeAnomaly: false
            };
            result.outTransactions.push(outDetail);
          }
          result.balance = result.totalIn - result.totalOut;
        });

        // Pastikan seluruh transaksi OUT berurutan kronologis berdasarkan tgl & waktu input
        balanceMap.forEach(result => {
          if (result.outTransactions && result.outTransactions.length > 1) {
            result.outTransactions.sort((a, b) => toTimestamp(a.tgl, a.waktu) - toTimestamp(b.tgl, b.waktu));
          }
        });

        // Time anomaly checks
        balanceMap.forEach(result => {
          const refDate = normalizeDate(result.rawTglScan) || result.earliestInTgl || '';
          if (refDate) {
            result.timeAnomalyCount = 0;
            result.timeAnomalyQty = 0;
            result.timeAnomalyOuts = [];
            result.outTransactions.forEach(outDetail => {
              const outD = normalizeDate(outDetail.tgl);
              const isAnomaly = Boolean(outD && outD < refDate);
              outDetail.isTimeAnomaly = isAnomaly;
              if (isAnomaly) {
                result.hasTimeAnomaly = true;
                result.timeAnomalyCount = (result.timeAnomalyCount || 0) + 1;
                result.timeAnomalyQty = (result.timeAnomalyQty || 0) + outDetail.jumlah;
                result.timeAnomalyOuts!.push(outDetail);
              }
            });
          }
        });

        // Buckets for matching
        interface InflowBucket {
          id: string;
          tgl: string;
          waktu: string;
          targetTglScan: string;
          rak: string;
          sub_rak: string;
          totalCapacity: number;
          remainingCapacity: number;
          timestamp: number;
        }

        interface OutCandidate {
          id: string;
          tgl: string;
          waktu: string;
          jumlah: number;
          rak: string;
          sub_rak: string;
          oldTglScan: string;
          timestamp: number;
          user: string;
          gudang?: string;
          isAssigned: boolean;
          matchedIn: any | null;
        }

        const inBuckets: InflowBucket[] = [];
        const outCandidates: OutCandidate[] = [];

        skuLogs.forEach(log => {
          const qty = Number(log.jumlah || 0);
          const normType = (log.type || '').trim().toUpperCase();
          if (normType.includes('IN')) {
            const targetTglScan = normalizeDate(log.tgl_scan) || normalizeDate(log.tgl);
            inBuckets.push({
              id: log.id,
              tgl: normalizeDate(log.tgl),
              waktu: normalizeTime(log.waktu),
              targetTglScan,
              rak: (log.rak || '').trim(),
              sub_rak: (log.sub_rak || log.rak || '').trim(),
              totalCapacity: qty,
              remainingCapacity: qty,
              timestamp: toTimestamp(log.tgl, log.waktu)
            });
          } else if (normType.includes('OUT')) {
            const isRowLocked = Boolean(
              log.log_audit_saldo &&
              (log.log_audit_saldo.toUpperCase().includes('LOCKED: PENYESUAIAN') ||
               log.log_audit_saldo.toUpperCase().includes('LOCKED:'))
            );

            if (isRowLocked) {
              const assignedBucket = inBuckets.find(b =>
                normRak(b.rak) === normRak(log.rak) &&
                b.targetTglScan === (normalizeDate(log.tgl_scan) || normalizeDate(log.tgl))
              );
              if (assignedBucket) {
                assignedBucket.remainingCapacity = Math.max(0, assignedBucket.remainingCapacity - qty);
              }
              // Transaksi yang sudah LOCKED tidak boleh diubah / dipindahkan lagi
              return;
            }

            outCandidates.push({
              id: log.id,
              tgl: normalizeDate(log.tgl),
              waktu: normalizeTime(log.waktu),
              jumlah: qty,
              rak: (log.rak || '').trim(),
              sub_rak: (log.sub_rak || log.rak || '').trim(),
              oldTglScan: normalizeDate(log.tgl_scan),
              timestamp: toTimestamp(log.tgl, log.waktu),
              user: log.user_name || (log as any).user || '',
              gudang: (log.gudang || '').trim(),
              isAssigned: false,
              matchedIn: null
            });
          }
        });

        inBuckets.sort((a, b) => a.timestamp - b.timestamp);
        outCandidates.sort((a, b) => a.timestamp - b.timestamp);

        const excludedList = excludedScanDates.split(',').map(d => d.trim().toUpperCase()).filter(Boolean);
        const checkIfExcluded = (targetTgl: string) => {
          const normTgl = (formatDateDisplay(targetTgl) || targetTgl || '').toUpperCase();
          return excludedList.some(excluded => {
            const normExcluded = formatDateDisplay(excluded).toUpperCase();
            return normTgl === normExcluded || normTgl === excluded.toUpperCase();
          });
        };

        const excludedRackList = excludedRacks.split(',').map(r => normRak(r)).filter(Boolean);
        const isRackExcluded = (targetRack?: string) => {
          if (!targetRack) return false;
          const nr = normRak(targetRack);
          return excludedRackList.some(ex => nr === ex);
        };

        // --- TAHAP 1: SAME-DAY EXACT QTY MATCH (Tgl Input Sama, SKU Sama, Qty Sama) ---
        for (const bucket of inBuckets) {
          if (bucket.remainingCapacity <= 0 || checkIfExcluded(bucket.targetTglScan) || isRackExcluded(bucket.rak)) continue;

          const exactSameDayCandidates = outCandidates.filter(
            c => !c.isAssigned &&
                 c.tgl === bucket.tgl &&
                 c.jumlah === bucket.remainingCapacity &&
                 !isForbiddenRackAdjustment(c.rak) &&
                 !isRackExcluded(c.rak)
          );

          if (exactSameDayCandidates.length > 0) {
            exactSameDayCandidates.sort((a, b) => Math.abs(a.timestamp - bucket.timestamp) - Math.abs(b.timestamp - bucket.timestamp));
            const best = exactSameDayCandidates[0];
            best.isAssigned = true;
            best.matchedIn = bucket;
            bucket.remainingCapacity -= best.jumlah;
          }
        }

        // --- TAHAP 2: MATCHING KRONOLOGIS TERDEKAT (FIFO PROXIMITY) ---
        for (const bucket of inBuckets) {
          if (bucket.remainingCapacity <= 0 || checkIfExcluded(bucket.targetTglScan) || isRackExcluded(bucket.rak)) continue;

          while (bucket.remainingCapacity > 0) {
            const eligibleOuts = outCandidates.filter(
              c => !c.isAssigned &&
                   c.jumlah <= bucket.remainingCapacity &&
                   isOutDateEligibleForIn(c.tgl, bucket.tgl) &&
                   !isForbiddenRackAdjustment(c.rak) &&
                   !isRackExcluded(c.rak)
            );

            if (eligibleOuts.length === 0) break;

            eligibleOuts.sort((a, b) => {
              const distA = a.timestamp - bucket.timestamp;
              const distB = b.timestamp - bucket.timestamp;
              const daysA = distA / (24 * 3600 * 1000);
              const daysB = distB / (24 * 3600 * 1000);

              if (daysA <= 35 && daysB > 35) return -1;
              if (daysB <= 35 && daysA > 35) return 1;

              const aSameDate = a.tgl === bucket.tgl ? 0 : 1;
              const bSameDate = b.tgl === bucket.tgl ? 0 : 1;
              if (aSameDate !== bSameDate) return aSameDate - bSameDate;

              const aSameRak = normRak(a.rak) === normRak(bucket.rak) ? 0 : 1;
              const bSameRak = normRak(b.rak) === normRak(bucket.rak) ? 0 : 1;
              if (aSameRak !== bSameRak && Math.abs(daysA - daysB) < 14) {
                return aSameRak - bSameRak;
              }

              return distA - distB;
            });

            const best = eligibleOuts[0];
            best.isAssigned = true;
            best.matchedIn = bucket;
            bucket.remainingCapacity -= best.jumlah;
          }
        }

        const skuGroups = Array.from(balanceMap.values());
        const surplusGroups = skuGroups.filter(g => g.balance > 0);

        skuGroups.forEach(g => {
          const rowKey = g.outTransactions && g.outTransactions.length === 1 && g.outTransactions[0].id
            ? `${g.sku}|${g.rak}|${g.tglScan}|${g.outTransactions[0].id}`
            : `${g.sku}|${g.rak}|${g.tglScan}`;

          if (g.balance > 0) {
            g.diagnosticType = 'SURPLUS';
            g.recommendedAction = `Tersedia sisa stok (+${g.balance.toLocaleString()} pcs)`;
          } else if (g.balance === 0) {
            if (g.hasTimeAnomaly) {
              g.diagnosticType = 'TIME_ANOMALY';
              g.recommendedAction = `⚠️ Anomali Waktu: ${g.timeAnomalyCount} transaksi OUT (${g.timeAnomalyQty} pcs) memotong batch masuk (${g.tglScan}) yang tanggalnya lebih baru dari tanggal keluar!`;
            } else {
              g.diagnosticType = 'BALANCED';
              g.recommendedAction = 'Stok seimbang (Habis potong pas)';
            }
          } else {
            const matchedCand = outCandidates.find(c => g.outTransactions.some(tx => tx.id === c.id) && c.matchedIn);

            const isSurplusEligibleForOut = (surplusRawTgl: string) => {
              if (!g.outTransactions || g.outTransactions.length === 0) return true;
              return g.outTransactions.every(tx => !tx.tgl || isOutDateEligibleForIn(tx.tgl, surplusRawTgl));
            };

            const sameRakSurpluses = surplusGroups
              .filter(s => s.rak.toUpperCase() === g.rak.toUpperCase() &&
                           !isRackExcluded(s.rak) &&
                           !checkIfExcluded(s.rawTglScan) &&
                           isSurplusEligibleForOut(s.rawTglScan) &&
                           normalizeDate(s.rawTglScan) !== normalizeDate(g.rawTglScan))
              .map(s => ({
                rak: s.rak,
                tglScan: s.tglScan,
                rawTglScan: s.rawTglScan,
                surplusQty: s.balance
              }));

            const otherRakSurpluses = !isForbiddenTransferRack(g.rak) && !isRackExcluded(g.rak)
              ? surplusGroups
                  .filter(s => s.rak.toUpperCase() !== g.rak.toUpperCase() &&
                               !isForbiddenTransferRack(s.rak) &&
                               !isRackExcluded(s.rak) &&
                               !checkIfExcluded(s.rawTglScan) &&
                               isSurplusEligibleForOut(s.rawTglScan))
                  .map(s => ({
                    rak: s.rak,
                    tglScan: s.tglScan,
                    rawTglScan: s.rawTglScan,
                    surplusQty: s.balance
                  }))
              : [];

            if (matchedCand && matchedCand.matchedIn) {
              const isSameRak = normRak(g.rak) === normRak(matchedCand.matchedIn.rak);
              const isSameDate = normalizeDate(g.rawTglScan) === normalizeDate(matchedCand.matchedIn.targetTglScan);

              // HANYA pasangkan jika target IN berbeda dari rak atau tgl scan grup minus ini
              // (Mencegah circular loop: memindahkan OUT ke rak & tgl scan yang sama persis)
              if (!isSameRak || !isSameDate) {
                const matchOpt = {
                  rak: matchedCand.matchedIn.rak,
                  tglScan: formatDateDisplay(matchedCand.matchedIn.targetTglScan),
                  rawTglScan: matchedCand.matchedIn.targetTglScan,
                  surplusQty: matchedCand.jumlah
                };

                if (isSameRak) {
                  sameRakSurpluses.unshift(matchOpt);
                  g.diagnosticType = 'DEFICIT_FIXABLE_SAME_RAK';
                } else {
                  otherRakSurpluses.unshift(matchOpt);
                  g.diagnosticType = 'DEFICIT_FIXABLE_OTHER_RAK';
                }

                g.recommendedAction = `Cocok dengan Nota Masuk: Pindahkan OUT ${matchedCand.jumlah} pcs ke Rak ${matchedCand.matchedIn.rak} & Tgl Scan ${formatDateDisplay(matchedCand.matchedIn.targetTglScan)} (Sesuai nota IN ${matchedCand.matchedIn.tgl} ${matchedCand.matchedIn.waktu})`;
                initialSelections[rowKey] = {
                  targetRak: matchedCand.matchedIn.rak,
                  targetRawTglScan: matchedCand.matchedIn.targetTglScan
                };
              }
            }

            if (!g.diagnosticType) {
              if (sameRakSurpluses.length > 0) {
                g.diagnosticType = 'DEFICIT_FIXABLE_SAME_RAK';
                const best = sameRakSurpluses[0];
                g.recommendedAction = `Pindahkan Tgl Scan OUT ke ${best.tglScan} (Tersedia +${best.surplusQty.toLocaleString()} pcs di Rak ${g.rak})`;
                initialSelections[rowKey] = { targetRak: best.rak, targetRawTglScan: best.rawTglScan };
              } else if (otherRakSurpluses.length > 0) {
                g.diagnosticType = 'DEFICIT_FIXABLE_OTHER_RAK';
                const best = otherRakSurpluses[0];
                g.recommendedAction = `Pindahkan Rak OUT ke ${best.rak} (Tgl ${best.tglScan}, Tersedia +${best.surplusQty.toLocaleString()} pcs)`;
                initialSelections[rowKey] = { targetRak: best.rak, targetRawTglScan: best.rawTglScan };
              } else {
                g.diagnosticType = 'DEFICIT_PURE_OVERCUT';
                g.recommendedAction = `Lebih Potong Murni — Total OUT (${g.totalOut.toLocaleString()} pcs) melebihi IN (${g.totalIn.toLocaleString()} pcs) sebesar ${Math.abs(g.balance).toLocaleString()} pcs. Tidak ada stok IN yang sesuai/tersedia di periode tersebut. (Keterangan: TIDAK JADI POTONG)`;
              }
            }

            g.availableSurplusesSameRak = sameRakSurpluses;
            g.availableSurplusesOtherRak = otherRakSurpluses;
          }
        });

        // Deteksi OUT yang tidak sesuai rak/tgl_scan meskipun grupnya surplus
        outCandidates.forEach(c => {
          if (!c.matchedIn) return;
          const isRakDiff = normRak(c.rak) !== normRak(c.matchedIn.rak);
          const isTglDiff = normalizeDate(c.oldTglScan) !== normalizeDate(c.matchedIn.targetTglScan);
          if (!isRakDiff && !isTglDiff) return;

          const parentKey = `${currentSku}|${c.rak.trim().toUpperCase()}|${formatDateDisplay(c.oldTglScan) || 'No Date'}`;
          const parentGroup = balanceMap.get(parentKey);
          if (parentGroup && parentGroup.balance >= 0) {
            const rowKey = `${currentSku}|${c.rak}|${formatDateDisplay(c.oldTglScan) || 'No Date'}|${c.id}`;
            const isSameRak = !isRakDiff;
            const surplusOpt = {
              rak: c.matchedIn.rak,
              tglScan: formatDateDisplay(c.matchedIn.targetTglScan),
              rawTglScan: c.matchedIn.targetTglScan,
              surplusQty: c.jumlah
            };

            skuGroups.push({
              sku: currentSku,
              rak: c.rak,
              subRaks: new Set([c.sub_rak]),
              tglScan: formatDateDisplay(c.oldTglScan) || 'No Date',
              rawTglScan: c.oldTglScan,
              totalIn: 0,
              totalOut: c.jumlah,
              balance: -c.jumlah,
              outTransactions: [{
                id: c.id,
                waktu: c.waktu,
                jumlah: c.jumlah,
                user: c.user,
                gudang: c.gudang || '',
                tgl_scan: c.oldTglScan,
                rak: c.rak,
                sub_rak: c.sub_rak
              }],
              diagnosticType: isSameRak ? 'DEFICIT_FIXABLE_SAME_RAK' : 'DEFICIT_FIXABLE_OTHER_RAK',
              recommendedAction: `Pasangan Tidak Sesuai: Pindahkan OUT ${c.jumlah} pcs ke Rak ${c.matchedIn.rak} & Tgl Scan ${formatDateDisplay(c.matchedIn.targetTglScan)} (Sesuai nota IN ${c.matchedIn.tgl} ${c.matchedIn.waktu})`,
              availableSurplusesSameRak: isSameRak ? [surplusOpt] : [],
              availableSurplusesOtherRak: !isSameRak ? [surplusOpt] : []
            });

            initialSelections[rowKey] = {
              targetRak: c.matchedIn.rak,
              targetRawTglScan: c.matchedIn.targetTglScan
            };
          }
        });

        allCombinedGroups.push(...skuGroups);
      });

      setSingleTargetSelections(initialSelections);

      allCombinedGroups.sort((a, b) => {
        if (a.balance < 0 && b.balance >= 0) return -1;
        if (b.balance < 0 && a.balance >= 0) return 1;
        if (a.balance < 0 && b.balance < 0) return a.balance - b.balance;
        if (a.hasTimeAnomaly && !b.hasTimeAnomaly) return -1;
        if (!a.hasTimeAnomaly && b.hasTimeAnomaly) return 1;
        if (a.balance > 0 && b.balance === 0) return -1;
        if (b.balance > 0 && a.balance === 0) return 1;
        const skuCmp = (a.sku || '').localeCompare(b.sku || '');
        if (skuCmp !== 0) return skuCmp;
        return a.rak.localeCompare(b.rak);
      });

      setAnalysisResults(allCombinedGroups);

      const deficitCount = allCombinedGroups.filter(r => r.balance < 0).length;
      const anomalyCount = allCombinedGroups.filter(r => r.hasTimeAnomaly).length;

      if (deficitCount > 0) {
        notify(`Analisis 2 selesai! Ditemukan ${deficitCount} kombinasi defisit/minus pada ${targetSkus.length} SKU.`, 'warning');
      } else if (anomalyCount > 0) {
        notify(`Analisis 2 selesai! Ditemukan ${anomalyCount} kombinasi anomali waktu OUT < IN.`, 'info');
      } else {
        notify(`Analisis 2 selesai! Seluruh saldo pada ${targetSkus.length} SKU seimbang & klop.`, 'success');
      }

    } catch (error: any) {
      console.error('Error analyzing stock balance 2:', error);
      notify(`Gagal melakukan analisis saldo stok 2: ${error.message || 'Error'}`, 'error');
    } finally {
      setIsAnalyzing(false);
    }
  }, [analysisSku, analysisSkuInputMode, bulkAnalysisSkuInput, notify]);

  // -------------------------------------------------------------
  // 2. AUTO-FIX SINGLE SKU (CEK SALDO 2)
  // -------------------------------------------------------------
  const autoFixSingleSku = async (targetSku: string): Promise<{ movesFixed: number; isKlop: boolean; message: string }> => {
    let allLogs: any[] = [];
    const batchSize = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      if (stopBatchAutoFixRef.current) break;
      const { data, error } = await supabase
        .from('database_log')
        .select('*')
        .ilike('sku', targetSku)
        .or('type.ilike.%IN%,type.ilike.%OUT%')
        .order('id', { ascending: true })
        .range(from, from + batchSize - 1);

      if (error) throw error;
      if (data && data.length > 0) {
        allLogs = [...allLogs, ...data];
        from += batchSize;
        if (data.length < batchSize) hasMore = false;
      } else {
        hasMore = false;
      }
      if (allLogs.length > 50000) break;
    }

    if (stopBatchAutoFixRef.current) {
      return { movesFixed: 0, isKlop: false, message: 'Dibatalkan pengguna.' };
    }

    if (allLogs.length === 0) {
      return { movesFixed: 0, isKlop: true, message: 'Tidak ada riwayat log.' };
    }

    const balanceMap = new Map<string, { totalIn: number; totalOut: number; balance: number }>();

    allLogs.forEach(log => {
      const r = normRak(log.rak);
      const rawTglScan = (log.tgl_scan || '').trim();
      const t = formatDateDisplay(rawTglScan) || 'No Date';
      const key = `${r}|${t}`;

      if (!balanceMap.has(key)) {
        balanceMap.set(key, { totalIn: 0, totalOut: 0, balance: 0 });
      }
      const b = balanceMap.get(key)!;
      const qty = Number(log.jumlah || 0);
      const normType = (log.type || '').trim().toUpperCase();

      if (normType.includes('IN')) {
        b.totalIn += qty;
        b.balance += qty;
      } else if (normType.includes('OUT')) {
        b.totalOut += qty;
        b.balance -= qty;
      }
    });

    const excludedList = excludedScanDates.split(',').map(d => d.trim().toUpperCase()).filter(Boolean);
    const checkIfExcluded = (targetTgl: string) => {
      const normTgl = (formatDateDisplay(targetTgl) || targetTgl || '').toUpperCase();
      return excludedList.some(excluded => {
        const normExcluded = formatDateDisplay(excluded).toUpperCase();
        return normTgl === normExcluded || normTgl === excluded.toUpperCase();
      });
    };

    const excludedRackList = excludedRacks.split(',').map(r => normRak(r)).filter(Boolean);
    const isRackExcluded = (targetRack?: string) => {
      if (!targetRack) return false;
      const nr = normRak(targetRack);
      return excludedRackList.some(ex => nr === ex);
    };

    interface InflowBucket {
      id: string;
      tgl: string;
      waktu: string;
      targetTglScan: string;
      rak: string;
      sub_rak: string;
      totalCapacity: number;
      remainingCapacity: number;
      timestamp: number;
    }

    interface OutCandidate {
      id: string;
      tgl: string;
      waktu: string;
      jumlah: number;
      rak: string;
      sub_rak: string;
      oldTglScan: string;
      timestamp: number;
      isAssigned: boolean;
      newRak: string;
      newSubRak: string;
      newTglScan: string;
    }

    // --- OTOMATIS BERSIHKAN BATCH MINUS & ANOMALI SEBELUM MATCHING (HANYA DATA UNLOCKED) ---
    const todayStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const idsToClearScan: string[] = [];

    // 1. Deteksi OUT pada batch yang saldonya minus (unlocked only)
    allLogs.forEach(log => {
      const normType = (log.type || '').trim().toUpperCase();
      if (!normType.includes('OUT') || !log.tgl_scan) return;
      const isRowLocked = Boolean(
        log.log_audit_saldo &&
        (log.log_audit_saldo.toUpperCase().includes('LOCKED: PENYESUAIAN') ||
         log.log_audit_saldo.toUpperCase().includes('LOCKED:'))
      );
      if (isRowLocked) return;

      const r = normRak(log.rak);
      const rawTglScan = (log.tgl_scan || '').trim();
      const t = formatDateDisplay(rawTglScan) || 'No Date';
      const key = `${r}|${t}`;
      const b = balanceMap.get(key);
      if (b && b.balance < 0) {
        idsToClearScan.push(log.id);
      }
    });

    // 2. Deteksi OUT anomali (OUT date < earliest IN date untuk batch tersebut)
    const earliestInMap = new Map<string, string>();
    allLogs.forEach(log => {
      const normType = (log.type || '').trim().toUpperCase();
      if (normType.includes('IN')) {
        const key = `${normRak(log.rak)}|${formatDateDisplay(log.tgl_scan || log.tgl) || 'No Date'}`;
        const inDate = normalizeDate(log.tgl);
        if (inDate) {
          if (!earliestInMap.has(key) || inDate < earliestInMap.get(key)!) {
            earliestInMap.set(key, inDate);
          }
        }
      }
    });

    allLogs.forEach(log => {
      const normType = (log.type || '').trim().toUpperCase();
      if (!normType.includes('OUT') || !log.tgl_scan) return;
      const isRowLocked = Boolean(
        log.log_audit_saldo &&
        (log.log_audit_saldo.toUpperCase().includes('LOCKED: PENYESUAIAN') ||
         log.log_audit_saldo.toUpperCase().includes('LOCKED:'))
      );
      if (isRowLocked) return;

      const key = `${normRak(log.rak)}|${formatDateDisplay(log.tgl_scan) || 'No Date'}`;
      const earliestIn = earliestInMap.get(key);
      const outDate = normalizeDate(log.tgl);
      if (earliestIn && outDate && outDate < earliestIn) {
        idsToClearScan.push(log.id);
      }
    });

    const uniqueClearIds = Array.from(new Set(idsToClearScan));
    if (uniqueClearIds.length > 0) {
      const chunkSize = 50;
      for (let k = 0; k < uniqueClearIds.length; k += chunkSize) {
        const chunk = uniqueClearIds.slice(k, k + chunkSize);
        await supabase
          .from('database_log')
          .update({
            tgl_scan: null,
            log_update_user: `DEVMODE V2: Auto-Clear Batch Minus/Anomali (${todayStr.slice(0, 10)})`,
            log_audit_saldo: `LOCKED: Auto-Clear Cek Saldo 2 (${todayStr})`
          })
          .in('id', chunk);
      }
      const clearSet = new Set(uniqueClearIds);
      allLogs.forEach(l => {
        if (clearSet.has(l.id)) {
          l.tgl_scan = null;
        }
      });
    }

    const inBuckets: InflowBucket[] = [];
    const outCandidates: OutCandidate[] = [];

    allLogs.forEach(log => {
      const qty = Number(log.jumlah || 0);
      const normType = (log.type || '').trim().toUpperCase();
      if (normType.includes('IN')) {
        const targetTglScan = normalizeDate(log.tgl_scan) || normalizeDate(log.tgl);
        inBuckets.push({
          id: log.id,
          tgl: normalizeDate(log.tgl),
          waktu: normalizeTime(log.waktu),
          targetTglScan,
          rak: (log.rak || '').trim(),
          sub_rak: (log.sub_rak || log.rak || '').trim(),
          totalCapacity: qty,
          remainingCapacity: qty,
          timestamp: toTimestamp(log.tgl, log.waktu)
        });
      } else if (normType.includes('OUT')) {
        // Cek status LOCKED
        const isRowLocked = Boolean(
          log.log_audit_saldo &&
          (log.log_audit_saldo.toUpperCase().includes('LOCKED: PENYESUAIAN') ||
           log.log_audit_saldo.toUpperCase().includes('LOCKED:'))
        );

        if (isRowLocked) {
          const assignedBucket = inBuckets.find(b =>
            normRak(b.rak) === normRak(log.rak) &&
            b.targetTglScan === (normalizeDate(log.tgl_scan) || normalizeDate(log.tgl))
          );
          if (assignedBucket) {
            assignedBucket.remainingCapacity = Math.max(0, assignedBucket.remainingCapacity - qty);
          }
          return; // Terkunci, tidak boleh diubah / dipindahkan lagi
        }

        outCandidates.push({
          id: log.id,
          tgl: normalizeDate(log.tgl),
          waktu: normalizeTime(log.waktu),
          jumlah: qty,
          rak: (log.rak || '').trim(),
          sub_rak: (log.sub_rak || log.rak || '').trim(),
          oldTglScan: normalizeDate(log.tgl_scan),
          timestamp: toTimestamp(log.tgl, log.waktu),
          isAssigned: false,
          newRak: (log.rak || '').trim(),
          newSubRak: (log.sub_rak || log.rak || '').trim(),
          newTglScan: normalizeDate(log.tgl_scan)
        });
      }
    });

    inBuckets.sort((a, b) => a.timestamp - b.timestamp);
    outCandidates.sort((a, b) => a.timestamp - b.timestamp);

    // --- TAHAP 1: SAME-DAY EXACT QTY MATCH ---
    for (const bucket of inBuckets) {
      if (bucket.remainingCapacity <= 0 || checkIfExcluded(bucket.targetTglScan) || isRackExcluded(bucket.rak)) continue;

      const exactSameDayCandidates = outCandidates.filter(
        c => !c.isAssigned &&
             c.tgl === bucket.tgl &&
             c.jumlah === bucket.remainingCapacity &&
             !isForbiddenRackAdjustment(c.rak) &&
             !isRackExcluded(c.rak)
      );

      if (exactSameDayCandidates.length > 0) {
        exactSameDayCandidates.sort((a, b) => Math.abs(a.timestamp - bucket.timestamp) - Math.abs(b.timestamp - bucket.timestamp));
        const best = exactSameDayCandidates[0];
        best.isAssigned = true;
        best.newTglScan = bucket.targetTglScan;
        if (!isForbiddenRackAdjustment(bucket.rak) && !isForbiddenRackAdjustment(best.rak) && !isRackExcluded(bucket.rak)) {
          best.newRak = bucket.rak;
          best.newSubRak = bucket.sub_rak || bucket.rak;
        } else {
          best.newRak = best.rak;
          best.newSubRak = best.sub_rak || best.rak;
        }
        bucket.remainingCapacity -= best.jumlah;
      }
    }

    // --- TAHAP 2: FIFO PROXIMITY ---
    for (const bucket of inBuckets) {
      if (bucket.remainingCapacity <= 0 || checkIfExcluded(bucket.targetTglScan) || isRackExcluded(bucket.rak)) continue;

      while (bucket.remainingCapacity > 0) {
        const eligibleOuts = outCandidates.filter(
          c => !c.isAssigned &&
               c.jumlah <= bucket.remainingCapacity &&
               isOutDateEligibleForIn(c.tgl, bucket.tgl) &&
               !isForbiddenRackAdjustment(c.rak) &&
               !isRackExcluded(c.rak)
        );

        if (eligibleOuts.length === 0) break;

        eligibleOuts.sort((a, b) => {
          const distA = a.timestamp - bucket.timestamp;
          const distB = b.timestamp - bucket.timestamp;
          const daysA = distA / (24 * 3600 * 1000);
          const daysB = distB / (24 * 3600 * 1000);

          if (daysA <= 35 && daysB > 35) return -1;
          if (daysB <= 35 && daysA > 35) return 1;

          const aSameDate = a.tgl === bucket.tgl ? 0 : 1;
          const bSameDate = b.tgl === bucket.tgl ? 0 : 1;
          if (aSameDate !== bSameDate) return aSameDate - bSameDate;

          const aIsSame = normRak(a.rak) === normRak(bucket.rak) ? 0 : 1;
          const bIsSame = normRak(b.rak) === normRak(bucket.rak) ? 0 : 1;
          if (aIsSame !== bIsSame && Math.abs(daysA - daysB) < 14) {
            return aIsSame - bIsSame;
          }

          return distA - distB;
        });

        const best = eligibleOuts[0];
        best.isAssigned = true;
        if (!isForbiddenRackAdjustment(bucket.rak) && !isForbiddenRackAdjustment(best.rak) && !isRackExcluded(bucket.rak)) {
          best.newRak = bucket.rak;
          best.newSubRak = bucket.sub_rak || bucket.rak;
        } else {
          best.newRak = best.rak;
          best.newSubRak = best.sub_rak || best.rak;
        }
        best.newTglScan = bucket.targetTglScan;
        bucket.remainingCapacity -= best.jumlah;
      }
    }

    const moves: any[] = [];
    outCandidates.forEach(c => {
      if (c.isAssigned) {
        const isRakChanged = normRak(c.rak) !== normRak(c.newRak);
        const isTglChanged = normalizeDate(c.oldTglScan) !== normalizeDate(c.newTglScan);

        if (isRakChanged || isTglChanged) {
          moves.push({
            id: c.id,
            rak: c.rak,
            toRak: c.newRak,
            fromTgl: c.oldTglScan,
            toTgl: c.newTglScan,
            jumlah: c.jumlah
          });
        }
      } else {
        const isAnomaly = c.oldTglScan && !isOutDateEligibleForIn(c.tgl, c.oldTglScan);
        if (isAnomaly) {
          moves.push({
            id: c.id,
            rak: c.rak,
            toRak: c.rak,
            fromTgl: c.oldTglScan,
            toTgl: null,
            jumlah: c.jumlah
          });
        }
      }
    });

    if (moves.length === 0) {
      const isDeficitLeft = Array.from(balanceMap.values()).some(b => b.balance < 0);
      return {
        movesFixed: 0,
        isKlop: !isDeficitLeft,
        message: isDeficitLeft
          ? 'Tidak ada kapasitas surplus untuk pemindahan lebih lanjut.'
          : 'Saldo sudah seimbang & klop (seluruh transaksi OUT sudah sesuai batch masuk).'
      };
    }

    const payloadGroups = new Map<string, { payload: Record<string, any>; ids: string[] }>();
    moves.forEach(move => {
      const isRakChanged = move.toRak && move.toRak !== move.rak;
      const isTglChanged = move.toTgl !== move.fromTgl;

      const payload: Record<string, any> = {
        log_audit_saldo: `LOCKED: Penyesuaian Cek Saldo 2 (${todayStr})`
      };

      if (move.toTgl === null) {
        payload.tgl_scan = null;
        payload.log_audit_saldo = `LOCKED: Lepas Anomali Cek Saldo 2 (${todayStr})`;
        payload.log_update_user = `DEVMODE V2: Lepas Tgl Scan Anomali (${todayStr.slice(0, 10)})`;
      } else {
        payload.log_update_user = isRakChanged
          ? `DEVMODE V2: Auto-Fix Move ${move.rak}->${move.toRak}`
          : 'DEVMODE V2: Auto-Fix Tgl Scan';
        if (isTglChanged && move.toTgl) {
          payload.tgl_scan = move.toTgl;
        }
        if (isRakChanged && move.toRak) {
          payload.rak = move.toRak;
          payload.sub_rak = move.toRak;
        }
      }

      const payloadKey = JSON.stringify(payload);
      if (!payloadGroups.has(payloadKey)) {
        payloadGroups.set(payloadKey, { payload, ids: [] });
      }
      payloadGroups.get(payloadKey)!.ids.push(move.id);
    });

    const updateGroupEntries = Array.from(payloadGroups.values());
    for (const group of updateGroupEntries) {
      if (stopBatchAutoFixRef.current) break;
      const subBatchSize = 50;
      for (let j = 0; j < group.ids.length; j += subBatchSize) {
        const idChunk = group.ids.slice(j, j + subBatchSize);
        let { error: updateError } = await supabase
          .from('database_log')
          .update(group.payload)
          .in('id', idChunk);

        if (updateError && updateError.message && updateError.message.includes('log_audit_saldo')) {
          const fallbackPayload = { ...group.payload };
          delete fallbackPayload.log_audit_saldo;
          const fallbackRes = await supabase
            .from('database_log')
            .update(fallbackPayload)
            .in('id', idChunk);
          updateError = fallbackRes.error;
        }

        if (updateError) {
          console.error('Error executing grouped auto-fix update in V2:', updateError);
          return { movesFixed: 0, isKlop: false, message: `Update error: ${updateError.message}` };
        }
      }
    }

    return {
      movesFixed: moves.length,
      isKlop: false,
      message: `${moves.length} transaksi OUT diselaraskan ke batch masuk yang sesuai.`
    };
  };

  // -------------------------------------------------------------
  // 3. RUN BATCH AUTO-FIX PER SKU (CEK SALDO 2)
  // -------------------------------------------------------------
  const runBatchAutoFixPerSku = async (skusToProcess: string[]) => {
    const uniqueSkus = Array.from(new Set(skusToProcess.map(s => s.trim().toUpperCase()).filter(Boolean)));
    if (uniqueSkus.length === 0) {
      notify('Silakan masukkan atau pilih setidaknya 1 SKU.', 'warning');
      return;
    }

    stopBatchAutoFixRef.current = false;
    setBatchAutoFixProgress({
      isRunning: true,
      isStopping: false,
      currentIndex: 0,
      total: uniqueSkus.length,
      currentSku: '',
      iteration: 0,
      statusMessage: 'Memulai proses Auto-Fix 2...',
      completedList: []
    });

    notify(`Memulai Auto-Fix 2 untuk ${uniqueSkus.length} SKU...`, 'info');

    const completedList: { sku: string; movesFixed: number; isKlop: boolean; iterations: number; message: string }[] = [];

    for (let i = 0; i < uniqueSkus.length; i++) {
      if (stopBatchAutoFixRef.current) break;
      const currentSku = uniqueSkus[i];

      let skuIteration = 0;
      const maxIterationsPerSku = 6;
      let totalMovesFixedForSku = 0;
      let isSkuKlop = false;
      let lastMessage = '';

      while (skuIteration < maxIterationsPerSku && !isSkuKlop && !stopBatchAutoFixRef.current) {
        skuIteration++;
        setBatchAutoFixProgress(prev => ({
          ...prev,
          currentIndex: i + 1,
          currentSku,
          iteration: skuIteration,
          statusMessage: `Memproses ${currentSku} (Iterasi ke-${skuIteration}/${maxIterationsPerSku})...`
        }));

        try {
          const res = await autoFixSingleSku(currentSku);
          totalMovesFixedForSku += res.movesFixed;
          lastMessage = res.message;

          if (res.isKlop) {
            isSkuKlop = true;
            break;
          }
          if (res.movesFixed === 0) {
            break;
          }
          await new Promise(r => setTimeout(r, 350));
        } catch (err: any) {
          console.error(`Error auto-fixing SKU ${currentSku} in V2:`, err);
          lastMessage = `Error: ${err.message || 'Gagal'}`;
          break;
        }
      }

      completedList.push({
        sku: currentSku,
        movesFixed: totalMovesFixedForSku,
        isKlop: isSkuKlop,
        iterations: skuIteration,
        message: isSkuKlop
          ? (totalMovesFixedForSku > 0 ? `Klop (${totalMovesFixedForSku} baris diperbaiki)` : 'Sudah Klop (0 selisih)')
          : (totalMovesFixedForSku > 0 ? `${totalMovesFixedForSku} baris diperbaiki (${lastMessage})` : lastMessage)
      });

      setBatchAutoFixProgress(prev => ({
        ...prev,
        completedList: [...completedList]
      }));

      if (stopBatchAutoFixRef.current) break;
    }

    const wasStopped = stopBatchAutoFixRef.current;
    setBatchAutoFixProgress(prev => ({
      ...prev,
      isRunning: false,
      isStopping: false,
      statusMessage: wasStopped
        ? `Proses dihentikan oleh pengguna pada SKU ke-${completedList.length} dari ${uniqueSkus.length}.`
        : `Selesai! Seluruh ${completedList.length} SKU telah diproses.`
    }));

    if (wasStopped) {
      notify(`Proses Auto-Fix 2 dihentikan. ${completedList.length} SKU telah diproses.`, 'warning');
    } else {
      notify(`Auto-Fix 2 Massal selesai! ${completedList.length} SKU telah diproses.`, 'success');
    }

    if (analysisSkuInputMode === 'single' && analysisSku) {
      handleAnalyzeStockBalance(analysisSku);
    } else if (analyzedSkusList.length > 0) {
      handleAnalyzeStockBalance(analyzedSkusList);
    }

    if (onDataUpdated) {
      onDataUpdated();
    }
  };

  const handleStopBatchAutoFix = () => {
    stopBatchAutoFixRef.current = true;
    setBatchAutoFixProgress(prev => ({
      ...prev,
      isStopping: true,
      statusMessage: 'Menghentikan proses auto-fix...'
    }));
  };

  // -------------------------------------------------------------
  // DEFICIT OUTS & ANOMALY OUTS COMPUTATION (FOR STEP 2 & 3)
  // -------------------------------------------------------------
  const deficitOutsWithScan = useMemo(() => {
    const list: OutTransactionDetail[] = [];
    analysisResults.forEach(r => {
      if (r.balance < 0 && r.outTransactions) {
        r.outTransactions.forEach(o => {
          const isLocked = Boolean(
            o.log_audit_saldo &&
            (o.log_audit_saldo.toUpperCase().includes('LOCKED: PENYESUAIAN') ||
             o.log_audit_saldo.toUpperCase().includes('LOCKED:'))
          );
          if (o.tgl_scan && !isLocked) list.push(o);
        });
      }
    });
    return list;
  }, [analysisResults]);

  const anomalyOutsWithScan = useMemo(() => {
    const list: OutTransactionDetail[] = [];
    analysisResults.forEach(r => {
      if (r.hasTimeAnomaly && r.timeAnomalyOuts) {
        r.timeAnomalyOuts.forEach(o => {
          const isLocked = Boolean(
            o.log_audit_saldo &&
            (o.log_audit_saldo.toUpperCase().includes('LOCKED: PENYESUAIAN') ||
             o.log_audit_saldo.toUpperCase().includes('LOCKED:'))
          );
          if (o.tgl_scan && !isLocked) list.push(o);
        });
      }
    });
    return list;
  }, [analysisResults]);

  // -------------------------------------------------------------
  // TAHAP 2: HAPUS TGL SCAN BATCH MINUS
  // -------------------------------------------------------------
  const handleClearDeficitBatchScanDates = async () => {
    if (deficitOutsWithScan.length === 0) {
      notify('Tidak ada transaksi OUT dengan Tgl Scan pada batch yang berstatus minus / defisit.', 'info');
      return;
    }

    const uniqueIds = Array.from(new Set(deficitOutsWithScan.map(o => o.id)));
    const totalPcs = deficitOutsWithScan.reduce((sum, o) => sum + (o.jumlah || 0), 0);
    const deficitBatchCount = analysisResults.filter(r => r.balance < 0).length;

    if (!window.confirm(`[Tahap 2] Hapus Tgl Scan untuk ${uniqueIds.length} transaksi OUT (${totalPcs.toLocaleString()} pcs) pada ${deficitBatchCount} batch minus?\n\nSetelah dikosongkan (tgl_scan = null), transaksi OUT ini tidak akan lagi membebani batch yang minus sehingga saldo batch dapat kembali seimbang.`)) {
      return;
    }

    try {
      setIsProcessingRemediation(true);
      const todayStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const chunkSize = 50;
      let totalSuccess = 0;

      for (let i = 0; i < uniqueIds.length; i += chunkSize) {
        const chunk = uniqueIds.slice(i, i + chunkSize);
        let { error } = await supabase
          .from('database_log')
          .update({
            tgl_scan: null,
            log_update_user: `DEVMODE V2: Hapus Tgl Scan Batch Minus (${todayStr.slice(0, 10)})`,
            log_audit_saldo: `LOCKED: Hapus Tgl Scan Batch Minus (${todayStr})`
          })
          .in('id', chunk);

        if (error && error.message && error.message.includes('log_audit_saldo')) {
          const res = await supabase
            .from('database_log')
            .update({
              tgl_scan: null,
              log_update_user: `DEVMODE V2: Hapus Tgl Scan Batch Minus (${todayStr.slice(0, 10)})`
            })
            .in('id', chunk);
          error = res.error;
        }

        if (error) throw error;
        totalSuccess += chunk.length;
      }

      notify(`Sukses mengosongkan Tgl Scan untuk ${totalSuccess} transaksi OUT pada batch minus!`, 'success');
      if (analysisSkuInputMode === 'single' && analysisSku) {
        await handleAnalyzeStockBalance(analysisSku);
      } else if (analyzedSkusList.length > 0) {
        await handleAnalyzeStockBalance(analyzedSkusList);
      } else {
        await handleAnalyzeStockBalance();
      }
      if (onDataUpdated) onDataUpdated();
    } catch (err: any) {
      console.error('Error clearing deficit scan dates in V2:', err);
      notify(`Gagal menghapus Tgl Scan batch minus: ${err.message || 'unknown error'}`, 'error');
    } finally {
      setIsProcessingRemediation(false);
    }
  };

  // -------------------------------------------------------------
  // TAHAP 3: LEPAS TGL SCAN ANOMALI
  // -------------------------------------------------------------
  const handleClearAnomalyScanDates = async () => {
    if (anomalyOutsWithScan.length === 0) {
      notify('Tidak ada transaksi OUT anomali (tanggal keluar mendahului tanggal masuk IN).', 'info');
      return;
    }

    const uniqueIds = Array.from(new Set(anomalyOutsWithScan.map(o => o.id)));
    const totalPcs = anomalyOutsWithScan.reduce((sum, o) => sum + (o.jumlah || 0), 0);

    if (!window.confirm(`[Tahap 3] Lepas Tgl Scan untuk ${uniqueIds.length} transaksi OUT anomali (${totalPcs.toLocaleString()} pcs)?\n\nTransaksi OUT ini terjadi sebelum tanggal kedatangan batch barang masuk (OUT < IN) sehingga tidak sah memotong batch ini.\n\nSetelah dilepas (tgl_scan = null), transaksi OUT ini akan dikembalikan dan tidak lagi memotong batch yang salah.`)) {
      return;
    }

    try {
      setIsProcessingRemediation(true);
      const todayStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const chunkSize = 50;
      let totalSuccess = 0;

      for (let i = 0; i < uniqueIds.length; i += chunkSize) {
        const chunk = uniqueIds.slice(i, i + chunkSize);
        let { error } = await supabase
          .from('database_log')
          .update({
            tgl_scan: null,
            log_update_user: `DEVMODE V2: Lepas Tgl Scan Anomali OUT < IN (${todayStr.slice(0, 10)})`,
            log_audit_saldo: `LOCKED: Lepas Anomali Cek Saldo 2 (${todayStr})`
          })
          .in('id', chunk);

        if (error && error.message && error.message.includes('log_audit_saldo')) {
          const res = await supabase
            .from('database_log')
            .update({
              tgl_scan: null,
              log_update_user: `DEVMODE V2: Lepas Tgl Scan Anomali OUT < IN (${todayStr.slice(0, 10)})`
            })
            .in('id', chunk);
          error = res.error;
        }

        if (error) throw error;
        totalSuccess += chunk.length;
      }

      notify(`Sukses melepas Tgl Scan untuk ${totalSuccess} transaksi OUT anomali!`, 'success');
      if (analysisSkuInputMode === 'single' && analysisSku) {
        await handleAnalyzeStockBalance(analysisSku);
      } else if (analyzedSkusList.length > 0) {
        await handleAnalyzeStockBalance(analyzedSkusList);
      } else {
        await handleAnalyzeStockBalance();
      }
      if (onDataUpdated) onDataUpdated();
    } catch (err: any) {
      console.error('Error clearing anomaly scan dates in V2:', err);
      notify(`Gagal melepas Tgl Scan anomali: ${err.message || 'unknown error'}`, 'error');
    } finally {
      setIsProcessingRemediation(false);
    }
  };

  // -------------------------------------------------------------
  // 4. APPLY SINGLE ROW REMEDIATION (CEK SALDO 2)
  // -------------------------------------------------------------
  const handleApplySingleRemediation = async (
    item: BalanceAnalysisResult,
    targetRak: string,
    targetRawTglScan: string
  ) => {
    if (!item.outTransactions || item.outTransactions.length === 0) {
      notify('Tidak ditemukan transaksi OUT untuk dipindahkan.', 'warning');
      return;
    }

    if (targetRawTglScan) {
      const invalidOut = item.outTransactions.find(t => t.tgl && !isOutDateEligibleForIn(t.tgl, targetRawTglScan));
      if (invalidOut) {
        notify(`Ditolak: Tanggal OUT (${invalidOut.tgl}) lebih kecil dari tanggal IN (${targetRawTglScan}). Data OUT tidak boleh mendahului IN!`, 'error');
        return;
      }
    }

    const excludedRackList = excludedRacks.split(',').map(r => normRak(r)).filter(Boolean);
    const isTargetExcluded = targetRak && excludedRackList.some(ex => normRak(targetRak) === ex);
    if (isTargetExcluded) {
      notify(`Ditolak: Rak tujuan ${targetRak} ada dalam daftar rak yang dikecualikan (${excludedRacks})!`, 'error');
      return;
    }
    const isSourceExcluded = item.rak && excludedRackList.some(ex => normRak(item.rak) === ex);
    if (isSourceExcluded) {
      notify(`Ditolak: Rak asal ${item.rak} ada dalam daftar rak yang dikecualikan (${excludedRacks})!`, 'error');
      return;
    }

    try {
      setIsProcessingRemediation(true);
      const outIds = item.outTransactions.map(t => t.id);
      const todayStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

      const updatePayload: any = {
        tgl_scan: targetRawTglScan,
        log_update_user: `DEVMODE V2: Fix Deficit ${item.rak !== targetRak ? `Move ${item.rak}->${targetRak}` : `Change Date->${targetRawTglScan}`}`,
        log_audit_saldo: `LOCKED: Penyesuaian Cek Saldo 2 (${todayStr})`
      };

      if (targetRak) {
        updatePayload.rak = targetRak;
        updatePayload.sub_rak = targetRak;
      }

      let { error } = await supabase
        .from('database_log')
        .update(updatePayload)
        .in('id', outIds);

      if (error && error.message && error.message.includes('log_audit_saldo')) {
        const fallbackPayload = { ...updatePayload };
        delete fallbackPayload.log_audit_saldo;
        const res = await supabase
          .from('database_log')
          .update(fallbackPayload)
          .in('id', outIds);
        error = res.error;
      }

      if (error) throw error;

      notify(`Sukses memindahkan ${outIds.length} transaksi OUT ke ${item.rak !== targetRak ? `Rak ${targetRak} & ` : ''}Tgl Scan ${formatDateDisplay(targetRawTglScan)}!`, 'success');

      await handleAnalyzeStockBalance();
      if (onDataUpdated) onDataUpdated();
    } catch (err: any) {
      console.error('Error applying remediation in V2:', err);
      notify(`Gagal memindahkan data: ${err.message || 'unknown error'}`, 'error');
    } finally {
      setIsProcessingRemediation(false);
    }
  };

  // -------------------------------------------------------------
  // 4B. REPORT & CLIPBOARD FORMATTERS (TIDAK JADI POTONG)
  // -------------------------------------------------------------
  const copySingleBatchTidakJadiPotong = (item: BalanceAnalysisResult) => {
    let runningCum = 0;
    const overCutList: OutTransactionDetail[] = [];
    (item.outTransactions || []).forEach(tx => {
      runningCum += tx.jumlah;
      if (runningCum > item.totalIn) {
        overCutList.push(tx);
      }
    });

    const listToCopy = overCutList.length > 0 ? overCutList : (item.outTransactions || []);

    const lines = listToCopy.map((tx, idx) => {
      const userInitial = (tx.gudang || tx.user || '-').trim();
      const waktuStr = tx.waktu ? ` ${tx.waktu}` : '';
      return `${idx + 1}. ${tx.tgl}${waktuStr} | ${tx.jumlah} pcs | User: ${userInitial} ⚠️ [TIDAK JADI POTONG]`;
    });

    const text = `Rincian Transaksi OUT (Database Log):\n${lines.join('\n')}`;

    navigator.clipboard.writeText(text);
    notify(`Laporan TIDAK JADI POTONG (${lines.length} baris) disalin ke clipboard!`, 'success');
  };

  const copySingleOutRow = (tx: OutTransactionDetail) => {
    const userInitial = (tx.gudang || tx.user || '-').trim();
    const waktuStr = tx.waktu ? ` ${tx.waktu}` : '';
    const text = `Rincian Transaksi OUT (Database Log):\n1. ${tx.tgl}${waktuStr} | ${tx.jumlah} pcs | User: ${userInitial} ⚠️ [TIDAK JADI POTONG]`;

    navigator.clipboard.writeText(text);
    notify(`Data transaksi OUT (${tx.tgl} - ${tx.jumlah} pcs) disalin!`, 'success');
  };

  const copyAllDeficitsTidakJadiPotong = () => {
    const deficits = analysisResults.filter(r => r.balance < 0);
    if (deficits.length === 0) {
      notify('Tidak ada data batch defisit / minus untuk disalin.', 'warning');
      return;
    }

    let counter = 1;
    const lines: string[] = [];
    deficits.forEach(d => {
      let runningCum = 0;
      const overCutList: OutTransactionDetail[] = [];
      (d.outTransactions || []).forEach(tx => {
        runningCum += tx.jumlah;
        if (runningCum > d.totalIn) {
          overCutList.push(tx);
        }
      });
      const listToCopy = overCutList.length > 0 ? overCutList : (d.outTransactions || []);
      listToCopy.forEach(tx => {
        const userInitial = (tx.gudang || tx.user || '-').trim();
        const waktuStr = tx.waktu ? ` ${tx.waktu}` : '';
        lines.push(`${counter}. ${tx.tgl}${waktuStr} | ${tx.jumlah} pcs | User: ${userInitial} ⚠️ [TIDAK JADI POTONG]`);
        counter++;
      });
    });

    const text = `Rincian Transaksi OUT (Database Log):\n${lines.join('\n')}`;

    navigator.clipboard.writeText(text);
    notify(`${lines.length} baris Laporan TIDAK JADI POTONG disalin ke clipboard!`, 'success');
  };

  // -------------------------------------------------------------
  // 4C. DELETE OVERCUT OUT LOGS (TIDAK JADI POTONG)
  // -------------------------------------------------------------
  const handleOpenDeleteOvercutModal = (item: BalanceAnalysisResult, specificTx?: OutTransactionDetail) => {
    let list: OutTransactionDetail[] = [];
    if (specificTx) {
      list = [specificTx];
    } else {
      let runningCum = 0;
      const overCutList: OutTransactionDetail[] = [];
      (item.outTransactions || []).forEach(tx => {
        runningCum += tx.jumlah;
        if (runningCum > item.totalIn) {
          overCutList.push(tx);
        }
      });
      list = overCutList.length > 0 ? overCutList : (item.outTransactions || []);
    }

    if (list.length === 0) {
      notify('Tidak ditemukan data transaksi OUT untuk dihapus.', 'warning');
      return;
    }

    setDeleteOvercutModal({
      isOpen: true,
      item,
      targetTransactions: list,
      selectedIds: new Set(list.map(t => t.id)),
      isDeleting: false
    });
  };

  const handleExecuteDeleteOvercut = async () => {
    const idsToDelete = Array.from(deleteOvercutModal.selectedIds);
    if (idsToDelete.length === 0) {
      notify('Pilih setidaknya 1 transaksi OUT untuk dihapus.', 'warning');
      return;
    }

    try {
      setDeleteOvercutModal(prev => ({ ...prev, isDeleting: true }));

      const chunkSize = 50;
      for (let i = 0; i < idsToDelete.length; i += chunkSize) {
        const chunk = idsToDelete.slice(i, i + chunkSize);
        const { error } = await supabase
          .from('database_log')
          .delete()
          .in('id', chunk);

        if (error) throw error;
      }

      notify(`Sukses menghapus ${idsToDelete.length} data transaksi OUT (TIDAK JADI POTONG) dari Database Log!`, 'success');

      setDeleteOvercutModal({
        isOpen: false,
        item: null,
        targetTransactions: [],
        selectedIds: new Set(),
        isDeleting: false
      });

      if (analysisSkuInputMode === 'single' && analysisSku) {
        await handleAnalyzeStockBalance(analysisSku);
      } else if (analyzedSkusList.length > 0) {
        await handleAnalyzeStockBalance(analyzedSkusList);
      } else {
        await handleAnalyzeStockBalance();
      }

      if (onDataUpdated) {
        onDataUpdated();
      }
    } catch (err: any) {
      console.error('Error deleting overcut logs:', err);
      notify(`Gagal menghapus data dari Database Log: ${err.message || 'Error'}`, 'error');
      setDeleteOvercutModal(prev => ({ ...prev, isDeleting: false }));
    }
  };

  // -------------------------------------------------------------
  // 5. DELETE TRANSFER HANDLING (CEK SALDO 2)
  // -------------------------------------------------------------
  const handleOpenDeleteTransferForCekSaldo = async () => {
    let skus: string[] = [];
    if (analysisSkuInputMode === 'single') {
      if (analysisSku) skus = [analysisSku.trim().toUpperCase()];
    } else {
      if (analyzedSkusList.length > 0) {
        skus = analyzedSkusList;
      } else if (bulkAnalysisSkuInput.trim()) {
        skus = parseMultipleSkus(bulkAnalysisSkuInput);
      }
    }

    if (skus.length === 0) {
      notify('Pilih atau masukkan setidaknya 1 SKU terlebih dahulu.', 'warning');
      return;
    }

    setTargetSkusForDeleteTransfer(skus);
    setIsDeleteTransferModalOpen(true);
    setIsLoadingTransferLogs(true);
    setTransferLogs([]);
    setSelectedTransferIds(new Set());

    try {
      const { data, error } = await supabase
        .from('database_log')
        .select('*')
        .in('sku', skus)
        .ilike('gudang', '%TRANSFER%')
        .order('tgl', { ascending: false })
        .order('waktu', { ascending: false });

      if (error) throw error;

      const logs = data || [];
      setTransferLogs(logs);
      setSelectedTransferIds(new Set(logs.map(l => l.id)));
    } catch (err: any) {
      console.error('Error fetching transfer logs for Cek Saldo 2:', err);
      notify(`Gagal mengambil data transfer: ${err.message || 'Error'}`, 'error');
    } finally {
      setIsLoadingTransferLogs(false);
    }
  };

  const handleExecuteDeleteTransferForCekSaldo = async () => {
    const idsToDelete = Array.from(selectedTransferIds);
    if (idsToDelete.length === 0) {
      notify('Pilih setidaknya 1 data log transfer untuk dihapus.', 'warning');
      return;
    }

    if (!confirm(`Konfirmasi Penghapusan Permanen (Cek Saldo 2):\n\nAnda akan menghapus ${idsToDelete.length} data log gudang TRANSFER untuk SKU terpilih.\n\nLanjutkan?`)) {
      return;
    }

    try {
      setIsDeletingTransferLogs(true);
      const chunkSize = 50;
      for (let i = 0; i < idsToDelete.length; i += chunkSize) {
        const chunk = idsToDelete.slice(i, i + chunkSize);
        const { error } = await supabase
          .from('database_log')
          .delete()
          .in('id', chunk);

        if (error) throw error;
      }

      notify(`Berhasil menghapus ${idsToDelete.length} data log gudang TRANSFER!`, 'success');
      setIsDeleteTransferModalOpen(false);

      if (analysisSkuInputMode === 'single' && analysisSku) {
        handleAnalyzeStockBalance(analysisSku);
      } else if (analyzedSkusList.length > 0) {
        handleAnalyzeStockBalance(analyzedSkusList);
      }
      if (onDataUpdated) onDataUpdated();
    } catch (err: any) {
      console.error('Error deleting transfer logs in V2:', err);
      notify(`Gagal menghapus data transfer: ${err.message || 'Error'}`, 'error');
    } finally {
      setIsDeletingTransferLogs(false);
    }
  };

  // -------------------------------------------------------------
  // Filtered Results for UI Table
  // -------------------------------------------------------------
  const filteredAnalysisResults = useMemo(() => {
    let res = analysisResults;

    if (activeFilterTab === 'deficit') {
      res = res.filter(r => r.balance < 0);
    } else if (activeFilterTab === 'surplus') {
      res = res.filter(r => r.balance > 0);
    }

    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase().trim();
      res = res.filter(r =>
        (r.sku || '').toLowerCase().includes(q) ||
        (r.rak || '').toLowerCase().includes(q) ||
        (r.tglScan || '').toLowerCase().includes(q) ||
        (r.recommendedAction || '').toLowerCase().includes(q)
      );
    }

    return res;
  }, [analysisResults, activeFilterTab, searchFilter]);

  const summaryStats = useMemo(() => {
    const totalIn = analysisResults.reduce((sum, r) => sum + r.totalIn, 0);
    const totalOut = analysisResults.reduce((sum, r) => sum + r.totalOut, 0);
    const deficitRows = analysisResults.filter(r => r.balance < 0);
    const deficitQty = deficitRows.reduce((sum, r) => sum + Math.abs(r.balance), 0);
    const surplusRows = analysisResults.filter(r => r.balance > 0);
    const surplusQty = surplusRows.reduce((sum, r) => sum + r.balance, 0);

    return {
      totalIn,
      totalOut,
      net: totalIn - totalOut,
      deficitCount: deficitRows.length,
      deficitQty,
      surplusCount: surplusRows.length,
      surplusQty
    };
  }, [analysisResults]);

  if (!isInline && !isOpen) return null;

  const renderAuditBody = () => (
    <div className="space-y-6">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 border border-purple-200 rounded-2xl p-4 flex items-start space-x-3 shadow-xs">
            <div className="p-2 rounded-xl bg-purple-600 text-white flex-shrink-0 shadow-md shadow-purple-600/20">
              <Calculator className="h-5 w-5" />
            </div>
            <div className="text-sm text-purple-950 leading-relaxed">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-black text-purple-950 text-base">Cek Saldo (Eksklusi Rak Tertentu):</span>
                <span className="px-2.5 py-0.5 bg-purple-600 text-white rounded-full text-[10px] font-black uppercase tracking-wider">
                  Engine Eksklusi Rak
                </span>
              </div>
              <p className="text-purple-900/90 text-xs">
                Sistem menghitung saldo berdasarkan <strong>SKU + Rak + Tgl Scan</strong> dengan dukungan filter khusus untuk <strong>mengecualikan rak tertentu</strong> dan tanggal scan (dipisah koma). Rak yang dikecualikan tidak akan digunakan sebagai target pemindahan maupun rekomendasi surplus.
              </p>
            </div>
          </div>

          {/* 4-Step Process Guide Banner */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <span className="text-[11px] font-black uppercase tracking-wider text-purple-700 flex items-center gap-1.5 bg-purple-100/80 px-2.5 py-1 rounded-lg border border-purple-200">
                <Zap className="h-3.5 w-3.5 text-amber-500 fill-amber-400" />
                Pipeline Otomatis Terpadu (Cukup Klik Tombol 1 untuk Menjalankan Tahap 1 s/d 4 Sampai Klop)
              </span>
              <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                🔒 Data Berstatus LOCKED Terkunci Aman &amp; Tidak Diubah Ulang
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 p-3 rounded-2xl bg-slate-900 border border-purple-500/30 text-white shadow-md">
              <div className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-800/90 border border-purple-500/20">
                <div className="w-6 h-6 rounded-lg bg-purple-600 flex items-center justify-center text-xs font-black shrink-0">1</div>
                <div className="min-w-0">
                  <div className="text-[11px] font-black text-purple-200 truncate">1. Mulai Analisis 2</div>
                  <div className="text-[10px] text-slate-400 truncate">Deteksi saldo &amp; selisih</div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-800/90 border border-rose-500/20">
                <div className="w-6 h-6 rounded-lg bg-rose-600 flex items-center justify-center text-xs font-black shrink-0">2</div>
                <div className="min-w-0">
                  <div className="text-[11px] font-black text-rose-200 truncate">2. Hapus Tgl Scan Batch Minus</div>
                  <div className="text-[10px] text-slate-400 truncate">Auto-lepas OUT di batch minus</div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-800/90 border border-amber-500/20">
                <div className="w-6 h-6 rounded-lg bg-amber-600 flex items-center justify-center text-xs font-black shrink-0">3</div>
                <div className="min-w-0">
                  <div className="text-[11px] font-black text-amber-200 truncate">3. Lepas Tgl Scan Anomali</div>
                  <div className="text-[10px] text-slate-400 truncate">Auto-lepas OUT mendahului IN</div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-800/90 border border-emerald-500/20">
                <div className="w-6 h-6 rounded-lg bg-emerald-600 flex items-center justify-center text-xs font-black shrink-0">4</div>
                <div className="min-w-0">
                  <div className="text-[11px] font-black text-emerald-200 truncate">4. Auto-Fix 2 (Sampai Klop)</div>
                  <div className="text-[10px] text-slate-400 truncate">Sinkronkan sampai 100% klop</div>
                </div>
              </div>
            </div>
          </div>

          {/* Live Batch Auto-Fix Progress Banner */}
          {batchAutoFixProgress.isRunning && (
            <div className="bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900 border-2 border-purple-500/50 rounded-2xl p-5 text-white shadow-2xl space-y-4 animate-in fade-in duration-300">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center font-bold text-white shadow-lg shadow-purple-500/30">
                    <RefreshCw className="h-5 w-5 animate-spin" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black uppercase tracking-wider text-purple-300">
                        Auto-Fix 2 Massal Berjalan
                      </span>
                      <span className="px-2 py-0.5 bg-purple-500/30 text-purple-200 border border-purple-400/30 rounded-full text-[10px] font-bold">
                        SKU {batchAutoFixProgress.currentIndex} dari {batchAutoFixProgress.total}
                      </span>
                      <span className="px-2 py-0.5 bg-amber-500/30 text-amber-200 border border-amber-400/30 rounded-full text-[10px] font-bold">
                        Iterasi {batchAutoFixProgress.iteration}/6
                      </span>
                    </div>
                    <h4 className="text-base font-black text-white tracking-wide mt-0.5 font-mono">
                      {batchAutoFixProgress.currentSku}
                    </h4>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleStopBatchAutoFix}
                  disabled={batchAutoFixProgress.isStopping}
                  className="h-10 px-4 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-xl shadow-lg shadow-rose-600/30 transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50 cursor-pointer border border-rose-400/40"
                  title="Hentikan proses auto-fix massal sekarang"
                >
                  <Square className="h-4 w-4 fill-current" />
                  <span>{batchAutoFixProgress.isStopping ? 'Menghentikan...' : 'Hentikan Proses'}</span>
                </button>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-purple-200 font-semibold">
                  <span>{batchAutoFixProgress.statusMessage}</span>
                  <span>
                    {Math.round(((batchAutoFixProgress.currentIndex - 1) / (batchAutoFixProgress.total || 1)) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-slate-800/80 rounded-full h-3 p-0.5 border border-purple-400/20 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-purple-500 via-indigo-400 to-teal-400 h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.max(5, Math.min(100, Math.round(((batchAutoFixProgress.currentIndex) / (batchAutoFixProgress.total || 1)) * 100)))}%`
                    }}
                  />
                </div>
              </div>

              {/* Live History */}
              {batchAutoFixProgress.completedList.length > 0 && (
                <div className="bg-black/30 rounded-xl p-3 max-h-40 overflow-y-auto space-y-1.5 border border-white/5 text-xs">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Histori Batch SKU yang Sudah Diproses:
                  </div>
                  {batchAutoFixProgress.completedList.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between py-1 px-2.5 rounded-lg bg-white/5 border border-white/5">
                      <span className="font-mono font-bold text-white text-[11px]">
                        {idx + 1}. {item.sku}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-bold ${item.isKlop ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {item.message}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          ({item.iterations} iterasi)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Completed Summary */}
          {!batchAutoFixProgress.isRunning && batchAutoFixProgress.completedList.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                  <span className="font-black text-emerald-950 text-sm">
                    Hasil Auto-Fix 2 Batch ({batchAutoFixProgress.completedList.length} SKU Diproses)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setBatchAutoFixProgress(prev => ({ ...prev, completedList: [] }))}
                  className="text-xs text-slate-500 hover:text-slate-800 font-bold cursor-pointer hover:underline"
                >
                  Tutup Ringkasan
                </button>
              </div>
              <div className="bg-white rounded-xl p-3 border border-emerald-100 max-h-48 overflow-y-auto space-y-1.5 text-xs">
                {batchAutoFixProgress.completedList.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="font-mono font-bold text-slate-900 text-xs">
                      {idx + 1}. {item.sku}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold ${item.isKlop ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {item.message}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        ({item.iterations} iterasi)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search & Control Panel */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
            {/* Mode Selector */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700 uppercase">Mode Input SKU:</span>
                <div className="bg-slate-200 p-0.5 rounded-xl flex items-center">
                  <button
                    type="button"
                    onClick={() => setAnalysisSkuInputMode('single')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${analysisSkuInputMode === 'single' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-600 hover:text-slate-900 cursor-pointer'}`}
                  >
                    Pilih 1 SKU
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnalysisSkuInputMode('bulk')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${analysisSkuInputMode === 'bulk' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-600 hover:text-slate-900 cursor-pointer'}`}
                  >
                    Paste Massal SKU
                  </button>
                </div>
              </div>

              {analysisSkuInputMode === 'bulk' && (
                <div className="flex items-center gap-2">
                  {(() => {
                    const skus = Array.from(new Set(bulkAnalysisSkuInput.split(/[\r\n,]+/).map(s => s.trim().toUpperCase()).filter(Boolean)));
                    return skus.length > 0 ? (
                      <span className="px-2.5 py-0.5 bg-purple-100 text-purple-800 text-[11px] font-black rounded-lg border border-purple-200">
                        {skus.length} SKU Terdeteksi
                      </span>
                    ) : null;
                  })()}
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const text = await navigator.clipboard.readText();
                        if (text) setBulkAnalysisSkuInput(text);
                      } catch {
                        notify('Tidak dapat mengakses clipboard. Silakan gunakan Ctrl+V.', 'info');
                      }
                    }}
                    className="text-xs text-purple-600 hover:text-purple-800 font-bold flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <Clipboard className="h-3.5 w-3.5" />
                    Tempel Clipboard
                  </button>
                  {bulkAnalysisSkuInput && (
                    <button
                      type="button"
                      onClick={() => setBulkAnalysisSkuInput('')}
                      className="text-xs text-slate-400 hover:text-rose-600 cursor-pointer font-bold"
                    >
                      Bersihkan
                    </button>
                  )}
                </div>
              )}
            </div>

            {analysisSkuInputMode === 'single' ? (
              <div className="space-y-3.5">
                <div className="flex flex-col md:flex-row items-stretch md:items-end gap-3.5">
                  <div className="flex-1 min-w-[260px]">
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 ml-1">
                      Cari / Pilih SKU
                    </label>
                    <FilterDropdown
                      value={analysisSku}
                      onChange={(val) => setAnalysisSku(val)}
                      options={effectiveSkus}
                      placeholder="Ketik nama produk..."
                    />
                  </div>

                  <div className="w-full md:w-72 flex-shrink-0">
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 ml-1">
                      Kecualikan Tgl Scan (Koma)
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={excludedScanDates}
                        onChange={(e) => setExcludedScanDates(e.target.value)}
                        placeholder="Contoh: No Date, 2025-12-06"
                        className="w-full h-11 px-4 pr-10 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-sm bg-white text-sm"
                      />
                      {excludedScanDates && (
                        <button
                          type="button"
                          onClick={() => setExcludedScanDates('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500"
                          title="Bersihkan"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="w-full md:w-72 flex-shrink-0">
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 ml-1">
                      Kecualikan Rak Tertentu (Koma)
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={excludedRacks}
                        onChange={(e) => setExcludedRacks(e.target.value)}
                        placeholder="Contoh: ECER-O, G14, LANTAI 4"
                        className="w-full h-11 px-4 pr-10 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-sm bg-white text-sm"
                      />
                      {excludedRacks && (
                        <button
                          type="button"
                          onClick={() => setExcludedRacks('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500"
                          title="Bersihkan"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Control Action Buttons Single Mode (4 Tahapan Proses) */}
                <div className="flex flex-wrap items-center gap-2.5 pt-2.5 border-t border-slate-200">
                  {/* Tahap 1: Mulai Analisis & Auto-Fix 2 (Otomatis Sampai Klop) */}
                  <Button
                    onClick={async () => {
                      if (!analysisSku) {
                        notify('Silakan pilih SKU terlebih dahulu.', 'warning');
                        return;
                      }
                      await runBatchAutoFixPerSku([analysisSku]);
                    }}
                    disabled={isAnalyzing || batchAutoFixProgress.isRunning}
                    className="h-11 px-4 sm:px-5 bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-600 hover:from-purple-700 hover:to-emerald-700 text-white font-black rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 active:scale-95 cursor-pointer"
                    title="Jalankan otomatis dari Analisis 2 sampai Auto-Fix 2 klop 100%"
                  >
                    {batchAutoFixProgress.isRunning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                    <span>{batchAutoFixProgress.isRunning ? 'Memproses Otomatis...' : '1. Mulai Analisis 2 (Auto-Fix Otomatis)'}</span>
                  </Button>

                  {/* Tahap 2: Hapus Tgl Scan Batch Minus */}
                  <Button
                    type="button"
                    onClick={handleClearDeficitBatchScanDates}
                    disabled={isAnalyzing || isProcessingRemediation || deficitOutsWithScan.length === 0}
                    className={`h-11 px-4 rounded-xl font-black text-xs transition-all flex items-center justify-center space-x-1.5 active:scale-95 cursor-pointer shadow-sm border ${
                      deficitOutsWithScan.length > 0
                        ? 'bg-rose-600 hover:bg-rose-700 text-white border-rose-700 shadow-rose-600/30 animate-pulse'
                        : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    }`}
                    title="Tahap 2: Kosongkan Tgl Scan transaksi OUT pada batch yang berstatus minus agar tidak memotong batch yang salah"
                  >
                    <CalendarX className="h-4 w-4 shrink-0" />
                    <span>2. Hapus Tgl Scan Batch Minus</span>
                    {deficitOutsWithScan.length > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-white text-rose-700 text-[10px] font-black">
                        {deficitOutsWithScan.length}
                      </span>
                    )}
                  </Button>

                  {/* Tahap 3: Lepas Tgl Scan Anomali */}
                  <Button
                    type="button"
                    onClick={handleClearAnomalyScanDates}
                    disabled={isAnalyzing || isProcessingRemediation || anomalyOutsWithScan.length === 0}
                    className={`h-11 px-4 rounded-xl font-black text-xs transition-all flex items-center justify-center space-x-1.5 active:scale-95 cursor-pointer shadow-sm border ${
                      anomalyOutsWithScan.length > 0
                        ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-700 shadow-amber-600/30'
                        : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    }`}
                    title="Tahap 3: Lepas Tgl Scan transaksi OUT yang tanggalnya lebih lampau daripada batch IN (OUT < IN)"
                  >
                    <Trash2 className="h-4 w-4 shrink-0" />
                    <span>3. Lepas Tgl Scan Anomali</span>
                    {anomalyOutsWithScan.length > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-white text-amber-700 text-[10px] font-black">
                        {anomalyOutsWithScan.length}
                      </span>
                    )}
                  </Button>

                  {/* Tahap 4: Auto-Fix 2 (Sampai Klop) */}
                  <Button
                    onClick={() => {
                      if (analysisSku) {
                        runBatchAutoFixPerSku([analysisSku]);
                      }
                    }}
                    disabled={isAnalyzing || batchAutoFixProgress.isRunning || isProcessingRemediation || !analysisResults.some(r => r.balance < 0)}
                    className={`h-11 px-4 sm:px-5 font-black rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 active:scale-95 cursor-pointer ${
                      analysisResults.some(r => r.balance < 0)
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white border border-emerald-600 shadow-emerald-600/30'
                        : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    }`}
                    title="Tahap 4: Perbaiki semua selisih secara otomatis dan berulang sampai klop"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>4. Auto-Fix 2 (Sampai Klop)</span>
                  </Button>

                  {showDeleteTransferBtn && (
                    <Button
                      type="button"
                      onClick={handleOpenDeleteTransferForCekSaldo}
                      disabled={isAnalyzing || batchAutoFixProgress.isRunning || !analysisSku}
                      className="h-11 px-4 bg-rose-50 hover:bg-rose-100 text-rose-700 font-black rounded-xl border border-rose-300 shadow-xs transition-all flex items-center justify-center space-x-2 active:scale-95 disabled:opacity-50 cursor-pointer"
                      title="Hapus data log gudang TRANSFER (type IN & OUT) untuk SKU ini jika bermasalah"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>Hapus Data Gudang: TRANSFER</span>
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 ml-1">
                    Daftar SKU / Nama Produk (Format Vertikal per Baris dari Hasil Salin Data Gudang / Excel):
                  </label>
                  <textarea
                    value={bulkAnalysisSkuInput}
                    onChange={(e) => setBulkAnalysisSkuInput(e.target.value)}
                    rows={4}
                    placeholder={"Tempel daftar nama produk di sini (satu per baris):\nBAG-RSB-100-7X10\nBAG-RSB-102-20X15/1PC\nDESKSET-DS-20"}
                    className="w-full p-3 border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-purple-500 bg-white"
                  />
                </div>
                <div className="flex flex-col lg:flex-row items-stretch lg:items-end justify-between gap-3 pt-1">
                  <div className="flex flex-col sm:flex-row items-stretch gap-3 flex-1">
                    <div className="w-full sm:w-72 flex-shrink-0">
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 ml-1">
                        Kecualikan Tgl Scan (Koma)
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={excludedScanDates}
                          onChange={(e) => setExcludedScanDates(e.target.value)}
                          placeholder="Contoh: No Date, 2025-12-06"
                          className="w-full h-11 px-4 pr-10 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-sm bg-white text-xs"
                        />
                        {excludedScanDates && (
                          <button
                            type="button"
                            onClick={() => setExcludedScanDates('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500"
                            title="Bersihkan"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="w-full sm:w-72 flex-shrink-0">
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 ml-1">
                        Kecualikan Rak Tertentu (Koma)
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={excludedRacks}
                          onChange={(e) => setExcludedRacks(e.target.value)}
                          placeholder="Contoh: ECER-O, G14, LANTAI 4"
                          className="w-full h-11 px-4 pr-10 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-sm bg-white text-xs"
                        />
                        {excludedRacks && (
                          <button
                            type="button"
                            onClick={() => setExcludedRacks('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500"
                            title="Bersihkan"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Control Action Buttons Bulk Mode (4 Tahapan Proses) */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Tahap 1: Mulai Analisis & Auto-Fix 2 Massal (Otomatis Sampai Klop) */}
                    <Button
                      type="button"
                      onClick={() => {
                        const skus = Array.from(new Set(bulkAnalysisSkuInput.split(/[\r\n,]+/).map(s => s.trim().toUpperCase()).filter(Boolean)));
                        if (skus.length === 0) {
                          notify('Silakan tempel setidaknya 1 SKU.', 'warning');
                          return;
                        }
                        runBatchAutoFixPerSku(skus);
                      }}
                      disabled={isAnalyzing || batchAutoFixProgress.isRunning || !bulkAnalysisSkuInput.trim()}
                      className="h-11 px-4 sm:px-5 bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-600 hover:from-purple-700 hover:to-emerald-700 text-white font-black rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 active:scale-95 disabled:opacity-50 cursor-pointer"
                      title="Jalankan otomatis dari Analisis 2 sampai Auto-Fix 2 klop 100% untuk seluruh daftar SKU"
                    >
                      {batchAutoFixProgress.isRunning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                      <span>{batchAutoFixProgress.isRunning ? 'Memproses Otomatis Massal...' : '1. Mulai Analisis 2 Massal (Auto-Fix Otomatis)'}</span>
                    </Button>

                    {/* Tahap 2: Hapus Tgl Scan Batch Minus */}
                    <Button
                      type="button"
                      onClick={handleClearDeficitBatchScanDates}
                      disabled={isAnalyzing || isProcessingRemediation || deficitOutsWithScan.length === 0}
                      className={`h-11 px-4 rounded-xl font-black text-xs transition-all flex items-center justify-center space-x-1.5 active:scale-95 cursor-pointer shadow-sm border ${
                        deficitOutsWithScan.length > 0
                          ? 'bg-rose-600 hover:bg-rose-700 text-white border-rose-700 shadow-rose-600/30 animate-pulse'
                          : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                      }`}
                      title="Tahap 2: Kosongkan Tgl Scan transaksi OUT pada seluruh batch minus massal"
                    >
                      <CalendarX className="h-4 w-4 shrink-0" />
                      <span>2. Hapus Tgl Scan Batch Minus</span>
                      {deficitOutsWithScan.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-white text-rose-700 text-[10px] font-black">
                          {deficitOutsWithScan.length}
                        </span>
                      )}
                    </Button>

                    {/* Tahap 3: Lepas Tgl Scan Anomali */}
                    <Button
                      type="button"
                      onClick={handleClearAnomalyScanDates}
                      disabled={isAnalyzing || isProcessingRemediation || anomalyOutsWithScan.length === 0}
                      className={`h-11 px-4 rounded-xl font-black text-xs transition-all flex items-center justify-center space-x-1.5 active:scale-95 cursor-pointer shadow-sm border ${
                        anomalyOutsWithScan.length > 0
                          ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-700 shadow-amber-600/30'
                          : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                      }`}
                      title="Tahap 3: Lepas Tgl Scan seluruh transaksi OUT anomali yang mendahului batch IN massal"
                    >
                      <Trash2 className="h-4 w-4 shrink-0" />
                      <span>3. Lepas Tgl Scan Anomali</span>
                      {anomalyOutsWithScan.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-white text-amber-700 text-[10px] font-black">
                          {anomalyOutsWithScan.length}
                        </span>
                      )}
                    </Button>

                    {/* Tahap 4: Auto-Fix 2 Massal */}
                    <Button
                      type="button"
                      onClick={() => {
                        const skus = Array.from(new Set(bulkAnalysisSkuInput.split(/[\r\n,]+/).map(s => s.trim().toUpperCase()).filter(Boolean)));
                        if (skus.length === 0) {
                          notify('Silakan tempel setidaknya 1 SKU.', 'warning');
                          return;
                        }
                        runBatchAutoFixPerSku(skus);
                      }}
                      disabled={isAnalyzing || batchAutoFixProgress.isRunning || !bulkAnalysisSkuInput.trim()}
                      className="h-11 px-4 sm:px-5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-black rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 active:scale-95 disabled:opacity-50 cursor-pointer"
                      title="Tahap 4: Jalankan auto-fix berurutan per batch SKU satu per satu secara iteratif sampai klop"
                    >
                      <RefreshCw className="h-4 w-4" />
                      <span>4. Auto-Fix 2 Massal (Sampai Klop)</span>
                    </Button>

                    {/* Divider pelengkap */}
                    <div className="h-7 w-px bg-slate-300 mx-1 hidden sm:block"></div>

                    {showDeleteTransferBtn && (
                      <Button
                        type="button"
                        onClick={handleOpenDeleteTransferForCekSaldo}
                        disabled={isAnalyzing || batchAutoFixProgress.isRunning || (!bulkAnalysisSkuInput.trim() && analyzedSkusList.length === 0)}
                        className="h-11 px-4 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl border border-rose-300 shadow-xs transition-all flex items-center justify-center space-x-1.5 active:scale-95 disabled:opacity-50 cursor-pointer"
                        title="Hapus data log gudang TRANSFER (type IN & OUT) untuk daftar SKU yang dianalisis"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span>Hapus Data Gudang: TRANSFER</span>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Filter Tabs & Quick Search */}
          {analysisResults.length > 0 && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setActiveFilterTab('all')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    activeFilterTab === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Semua Kombinasi ({analysisResults.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilterTab('deficit')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    activeFilterTab === 'deficit'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-rose-600'
                  }`}
                >
                  Hanya Minus / Selisih ({analysisResults.filter(r => r.balance < 0).length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilterTab('surplus')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    activeFilterTab === 'surplus'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-emerald-600'
                  }`}
                >
                  Hanya Surplus ({analysisResults.filter(r => r.balance > 0).length})
                </button>
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Cari Rak, Tgl Scan, atau SKU..."
                  className="w-full h-9 pl-9 pr-8 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 bg-white"
                />
                {searchFilter && (
                  <button
                    onClick={() => setSearchFilter('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Summary Stats Cards */}
          {analysisResults.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Total IN</span>
                <span className="text-base font-black text-emerald-700">{summaryStats.totalIn.toLocaleString()}</span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Total OUT</span>
                <span className="text-base font-black text-rose-700">{summaryStats.totalOut.toLocaleString()}</span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Net Saldo Gudang</span>
                <span className={`text-base font-black ${summaryStats.net < 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                  {summaryStats.net.toLocaleString()}
                </span>
              </div>
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-center">
                <span className="text-[10px] font-bold text-rose-600 uppercase block">Defisit / Minus</span>
                <span className="text-base font-black text-rose-800">
                  {summaryStats.deficitCount} <span className="text-xs font-normal">(-{summaryStats.deficitQty.toLocaleString()} pcs)</span>
                </span>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                <span className="text-[10px] font-bold text-emerald-600 uppercase block">Surplus Stok</span>
                <span className="text-base font-black text-emerald-800">
                  {summaryStats.surplusCount} <span className="text-xs font-normal">(+{summaryStats.surplusQty.toLocaleString()} pcs)</span>
                </span>
              </div>
            </div>
          )}

          {/* Status Banner: Klop vs Ada Selisih (Gambar 3) */}
          {analysisResults.length > 0 && (
            summaryStats.deficitCount === 0 ? (
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white shadow-lg border border-emerald-400/40 flex items-center justify-between gap-4 animate-in fade-in duration-300">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/30 shadow-inner">
                    <CheckCircle className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h4 className="font-black text-sm sm:text-base uppercase tracking-tight flex items-center gap-2">
                      <span>SEMUA DATA SUDAH KLOP &amp; BERSIH</span>
                      <span className="px-2.5 py-0.5 rounded-full bg-white text-emerald-800 text-[10px] font-black uppercase tracking-wider">
                        100% OK
                      </span>
                    </h4>
                    <p className="text-xs text-emerald-100 mt-0.5 font-medium leading-relaxed">
                      Tidak ada selisih saldo atau stok minus (Defisit: 0 pcs). Seluruh transaksi IN &amp; OUT telah seimbang sempurna sesuai rak dan tanggal scan. Proses Auto-Fix 2 telah berjalan sukses.
                    </p>
                  </div>
                </div>
                <div className="hidden sm:flex flex-col items-end shrink-0 text-right">
                  <span className="text-[10px] text-emerald-200 uppercase font-bold tracking-wider">Net Saldo Gudang</span>
                  <span className="text-lg font-black font-mono text-white">+{summaryStats.net.toLocaleString()}</span>
                </div>
              </div>
            ) : (
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 text-white shadow-lg border border-rose-400/40 flex items-center justify-between gap-4 animate-in fade-in duration-300">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/30 shadow-inner">
                    <AlertTriangle className="w-6 h-6 text-amber-300" />
                  </div>
                  <div>
                    <h4 className="font-black text-sm sm:text-base uppercase tracking-tight flex items-center gap-2">
                      <span>DITEMUKAN {summaryStats.deficitCount} DATA DEFISIT / MINUS (-{summaryStats.deficitQty.toLocaleString()} PCS)</span>
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black uppercase tracking-wider">
                        PERLU PERBAIKAN
                      </span>
                    </h4>
                    <p className="text-xs text-rose-100 mt-0.5 font-medium leading-relaxed">
                      Terdapat transaksi OUT yang melebihi saldo IN. Silakan klik tombol <strong>"4. Auto-Fix 2 (Sampai Klop)"</strong> di atas atau terapkan solusi yang disarankan pada baris bertanda merah di bawah.
                    </p>
                  </div>
                </div>
                <div className="hidden sm:flex flex-col items-end shrink-0 text-right">
                  <span className="text-[10px] text-rose-200 uppercase font-bold tracking-wider">Total Defisit</span>
                  <span className="text-lg font-black font-mono text-amber-200">-{summaryStats.deficitQty.toLocaleString()} pcs</span>
                </div>
              </div>
            )
          )}

          {/* Results Table */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs bg-white">
            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 border-b border-slate-200 font-bold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="p-3">SKU</th>
                    <th className="p-3">Lokasi Rak</th>
                    <th className="p-3">Tgl Scan</th>
                    <th className="p-3 text-center">IN</th>
                    <th className="p-3 text-center">OUT</th>
                    <th className="p-3 text-center">Saldo</th>
                    <th className="p-3">Diagnosa & Solusi Perbaikan (V2)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAnalysisResults.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                        {isAnalyzing ? 'Sedang menganalisis...' : 'Tidak ada data saldo untuk ditampilkan. Silakan pilih SKU dan klik Mulai Analisis 2.'}
                      </td>
                    </tr>
                  ) : (
                    filteredAnalysisResults.map((res, idx) => {
                      const rowKey = res.outTransactions && res.outTransactions.length === 1 && res.outTransactions[0].id
                        ? `${res.sku}|${res.rak}|${res.tglScan}|${res.outTransactions[0].id}`
                        : `${res.sku}|${res.rak}|${res.tglScan}`;
                      const isExpanded = expandedDeficitKeys.has(rowKey);
                      const isMinus = res.balance < 0;
                      const isSurplus = res.balance > 0;
                      const hasOptions = (res.availableSurplusesSameRak.length > 0 || res.availableSurplusesOtherRak.length > 0);
                      const currentSelection = singleTargetSelections[rowKey] || { targetRak: '', targetRawTglScan: '' };

                      return (
                        <React.Fragment key={idx}>
                          <tr className={`hover:bg-slate-50 transition-colors ${isMinus ? 'bg-rose-50/30' : isSurplus ? 'bg-emerald-50/20' : ''}`}>
                            <td className="p-3 font-mono font-bold text-slate-900 max-w-[140px] truncate" title={res.sku}>
                              {res.sku}
                            </td>
                            <td className="p-3 font-bold text-slate-800">
                              {res.rak}
                            </td>
                            <td className="p-3 text-slate-600 font-mono">
                              {res.tglScan}
                            </td>
                            <td className="p-3 text-center font-bold text-emerald-700">
                              {res.totalIn}
                            </td>
                            <td className="p-3 text-center font-bold text-rose-700">
                              {res.totalOut}
                            </td>
                            <td className="p-3 text-center">
                              <div className="inline-flex items-center gap-1">
                                <span className={`px-2 py-0.5 rounded-full font-black text-xs ${
                                  isMinus ? 'bg-rose-100 text-rose-800' : isSurplus ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                                }`}>
                                  {res.balance > 0 ? `+${res.balance}` : res.balance}
                                </span>
                                {isMinus && (
                                  <button
                                    type="button"
                                    onClick={() => copySingleBatchTidakJadiPotong(res)}
                                    className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-100 rounded transition-all cursor-pointer"
                                    title="Salin Laporan TIDAK JADI POTONG (WA)"
                                  >
                                    <Copy className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {res.diagnosticType === 'DEFICIT_FIXABLE_SAME_RAK' && (
                                    <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-black text-[10px]">
                                      DAPAT DIALIHKAN (SAMA RAK)
                                    </span>
                                  )}
                                  {res.diagnosticType === 'DEFICIT_FIXABLE_OTHER_RAK' && (
                                    <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded font-black text-[10px]">
                                      DAPAT DIALIHKAN (RAK LAIN)
                                    </span>
                                  )}
                                  {res.diagnosticType === 'DEFICIT_PURE_OVERCUT' && (
                                    <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded font-black text-[10px]">
                                      LEBIH POTONG MURNI (TIDAK JADI POTONG)
                                    </span>
                                  )}
                                  {res.diagnosticType === 'TIME_ANOMALY' && (
                                    <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-black text-[10px]">
                                      ANOMALI WAKTU
                                    </span>
                                  )}
                                  {res.diagnosticType === 'SURPLUS' && (
                                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-black text-[10px]">
                                      SURPLUS STOK
                                    </span>
                                  )}
                                  {res.diagnosticType === 'BALANCED' && (
                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-black text-[10px]">
                                      SEIMBANG
                                    </span>
                                  )}
                                </div>

                                <p className="text-[11px] text-slate-700 font-medium leading-relaxed">
                                  {res.recommendedAction}
                                </p>

                                {isMinus && hasOptions && (
                                  <div className="flex flex-wrap items-center gap-2 pt-1">
                                    <select
                                      value={JSON.stringify(currentSelection)}
                                      onChange={(e) => {
                                        try {
                                          const parsed = JSON.parse(e.target.value);
                                          setSingleTargetSelections(prev => ({
                                            ...prev,
                                            [rowKey]: parsed
                                          }));
                                        } catch {}
                                      }}
                                      className="h-8 px-2.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 font-mono"
                                    >
                                      {res.availableSurplusesSameRak.map((opt, sIdx) => (
                                        <option key={`same-${sIdx}`} value={JSON.stringify({ targetRak: opt.rak, targetRawTglScan: opt.rawTglScan })}>
                                          [Sama Rak] {opt.tglScan} (+{opt.surplusQty} pcs)
                                        </option>
                                      ))}
                                      {res.availableSurplusesOtherRak.map((opt, sIdx) => (
                                        <option key={`other-${sIdx}`} value={JSON.stringify({ targetRak: opt.rak, targetRawTglScan: opt.rawTglScan })}>
                                          [Rak Lain] {opt.rak} • Tgl {opt.tglScan} (+{opt.surplusQty} pcs)
                                        </option>
                                      ))}
                                    </select>

                                    <Button
                                      type="button"
                                      onClick={() => handleApplySingleRemediation(res, currentSelection.targetRak, currentSelection.targetRawTglScan)}
                                      disabled={isProcessingRemediation || !currentSelection.targetRawTglScan}
                                      className="h-8 px-3 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-lg shadow-sm cursor-pointer"
                                    >
                                      {isProcessingRemediation ? 'Memproses...' : 'Terapkan Solusi 2'}
                                    </Button>
                                  </div>
                                )}

                                {isMinus && !hasOptions && (
                                  <div className="flex flex-wrap items-center gap-2 pt-1">
                                    <Button
                                      type="button"
                                      onClick={() => copySingleBatchTidakJadiPotong(res)}
                                      className="h-8 px-3 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-lg shadow-sm cursor-pointer flex items-center space-x-1.5 active:scale-95 transition-all"
                                      title="Salin rincian transaksi TIDAK JADI POTONG ke format WhatsApp"
                                    >
                                      <Copy className="h-3.5 w-3.5" />
                                      <span>Salin Laporan TIDAK JADI POTONG (WA)</span>
                                    </Button>

                                    <Button
                                      type="button"
                                      onClick={() => handleOpenDeleteOvercutModal(res)}
                                      className="h-8 px-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg shadow-sm cursor-pointer flex items-center space-x-1.5 active:scale-95 transition-all"
                                      title="Hapus data transaksi OUT yang melebihi kuota IN (TIDAK JADI POTONG) dari database_log"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                      <span>Hapus Data (Database Log)</span>
                                    </Button>
                                  </div>
                                )}

                                {res.outTransactions.length > 0 && (
                                  <div className="flex items-center gap-2 pt-0.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setExpandedDeficitKeys(prev => {
                                          const next = new Set(prev);
                                          if (next.has(rowKey)) next.delete(rowKey);
                                          else next.add(rowKey);
                                          return next;
                                        });
                                      }}
                                      className="text-[11px] text-purple-600 hover:text-purple-800 font-bold flex items-center gap-1 hover:underline cursor-pointer"
                                    >
                                      <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                      <span>
                                        {isExpanded ? 'Sembunyikan' : 'Lihat'} {res.outTransactions.length} Transaksi OUT dari Database Log
                                      </span>
                                    </button>

                                    {isMinus && (
                                      <button
                                        type="button"
                                        onClick={() => copySingleBatchTidakJadiPotong(res)}
                                        className="text-[10px] bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold px-2 py-0.5 rounded border border-rose-200 flex items-center gap-1 cursor-pointer"
                                        title="Salin format WA"
                                      >
                                        <Copy className="h-2.5 w-2.5" />
                                        <span>Salin WA</span>
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* Expanded OUT Detail */}
                          {isExpanded && res.outTransactions.length > 0 && (
                            <tr className="bg-slate-50">
                              <td colSpan={7} className="p-3 pl-8">
                                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-inner bg-white">
                                  <div className="bg-slate-100 px-3 py-2 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-800">
                                      <span>Rincian Database Log: {res.outTransactions.length} Transaksi OUT</span>
                                      <span className="text-slate-400">•</span>
                                      <span className="text-emerald-700">Kapasitas IN: {res.totalIn} pcs</span>
                                      <span className="text-slate-400">•</span>
                                      <span className="text-rose-700">Total OUT: {res.totalOut} pcs</span>
                                      {res.balance < 0 && (
                                        <>
                                          <span className="text-slate-400">•</span>
                                          <span className="text-rose-800 font-black">Kelebihan OUT: {Math.abs(res.balance)} pcs</span>
                                        </>
                                      )}
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <button
                                        type="button"
                                        onClick={() => copySingleBatchTidakJadiPotong(res)}
                                        className="text-xs bg-purple-600 hover:bg-purple-700 text-white font-bold px-3 py-1 rounded-lg flex items-center space-x-1.5 cursor-pointer shadow-xs transition-all active:scale-95"
                                        title="Salin rincian transaksi TIDAK JADI POTONG ke WhatsApp"
                                      >
                                        <Copy className="h-3 w-3" />
                                        <span>Salin Rincian ke Grup WA</span>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => handleOpenDeleteOvercutModal(res)}
                                        className="text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-1 rounded-lg flex items-center space-x-1.5 cursor-pointer shadow-xs transition-all active:scale-95"
                                        title="Hapus transaksi OUT yang melebihi kuota IN (TIDAK JADI POTONG) dari database_log"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                        <span>Hapus Data TIDAK JADI POTONG</span>
                                      </button>
                                    </div>
                                  </div>

                                  <table className="w-full text-xs text-left">
                                    <thead className="bg-slate-50 text-slate-600 font-bold text-[10px] border-b border-slate-200">
                                      <tr>
                                        <th className="p-2">No</th>
                                        <th className="p-2">Tgl / Waktu Input</th>
                                        <th className="p-2 text-right">Qty OUT</th>
                                        <th className="p-2 text-center">Akumulasi OUT</th>
                                        <th className="p-2">Status Kuota IN</th>
                                        <th className="p-2">User Input</th>
                                        <th className="p-2">Rak Asal</th>
                                        <th className="p-2 font-mono">ID Log</th>
                                        <th className="p-2 text-center">Aksi</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                                      {(() => {
                                        let runningCum = 0;
                                        return res.outTransactions.map((tx, txIdx) => {
                                          runningCum += tx.jumlah;
                                          const isOver = runningCum > res.totalIn;
                                          return (
                                            <tr key={txIdx} className={isOver ? 'bg-rose-50/50 hover:bg-rose-100/50' : 'hover:bg-slate-50'}>
                                              <td className="p-2 text-slate-500 font-sans">{txIdx + 1}</td>
                                              <td className="p-2 text-slate-800 font-sans">
                                                {tx.tgl} <span className="text-slate-400 font-mono text-[10px]">{tx.waktu}</span>
                                              </td>
                                              <td className="p-2 text-right font-black text-rose-600">
                                                -{tx.jumlah} pcs
                                              </td>
                                              <td className="p-2 text-center text-slate-600 font-sans text-[11px]">
                                                {runningCum} / {res.totalIn} pcs
                                              </td>
                                              <td className="p-2 font-sans">
                                                {isOver ? (
                                                  <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-black text-[10px] inline-flex items-center gap-1">
                                                    ⚠️ TIDAK JADI POTONG (Lebih Input)
                                                  </span>
                                                ) : (
                                                  <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold text-[10px]">
                                                    ✓ Masuk Kuota IN
                                                  </span>
                                                )}
                                              </td>
                                              <td className="p-2 font-sans text-xs">
                                                <span className="px-1.5 py-0.5 bg-slate-100 rounded font-black text-slate-900 mr-1.5">
                                                  User: {(tx.gudang || tx.user || '-').trim()}
                                                </span>
                                                {tx.user && tx.user !== tx.gudang && (
                                                  <span className="text-slate-400 text-[10px] truncate max-w-[120px] inline-block align-middle" title={tx.user}>
                                                    ({tx.user})
                                                  </span>
                                                )}
                                              </td>
                                              <td className="p-2 font-bold text-slate-700 font-sans">
                                                {tx.rak}
                                              </td>
                                              <td className="p-2 text-slate-400 text-[10px]">
                                                {tx.id}
                                              </td>
                                              <td className="p-2 text-center">
                                                <div className="inline-flex items-center space-x-1">
                                                  <button
                                                    type="button"
                                                    onClick={() => copySingleOutRow(tx)}
                                                    className="p-1 text-slate-400 hover:text-purple-600 rounded transition-colors cursor-pointer"
                                                    title="Salin baris ini untuk WA"
                                                  >
                                                    <Copy className="h-3.5 w-3.5" />
                                                  </button>
                                                  {isOver && (
                                                    <button
                                                      type="button"
                                                      onClick={() => handleOpenDeleteOvercutModal(res, tx)}
                                                      className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                                      title="Hapus baris transaksi ini dari database_log"
                                                    >
                                                      <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                  )}
                                                </div>
                                              </td>
                                            </tr>
                                          );
                                        });
                                      })()}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <span className="text-xs text-slate-400 font-medium">
              Cek Saldo 2 Engine • Menyesuaikan Rak & Tgl Scan secara mandiri
            </span>
            {!isInline && (
              <Button
                type="button"
                onClick={onClose}
                className="h-10 px-6 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs cursor-pointer shadow-md"
              >
                Tutup Modal
              </Button>
            )}
          </div>
    </div>
  );

  return (
    <>
      {isInline ? (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xl overflow-hidden p-4 sm:p-6 lg:p-8">
          {renderAuditBody()}
        </div>
      ) : (
        <Modal
          isOpen={isOpen}
          onClose={onClose}
          title="Audit & Analisis Saldo Stok (Fitur Eksklusi Rak Tertentu)"
          size="8xl"
          className="w-[96vw] max-w-[1580px]"
        >
          {renderAuditBody()}
        </Modal>
      )}

      {/* Sub-Modal: Hapus Data Log Transfer untuk Cek Saldo 2 */}
      <Modal
        isOpen={isDeleteTransferModalOpen}
        onClose={() => {
          if (!isDeletingTransferLogs) setIsDeleteTransferModalOpen(false);
        }}
        title="Hapus Data Log Gudang: TRANSFER (Cek Saldo 2)"
        size="5xl"
        className="w-[96vw] max-w-[1280px]"
      >
        <div className="space-y-4">
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-rose-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-rose-900 leading-relaxed">
              <p className="font-bold text-rose-950 mb-1">
                Pembersihan Data Log Transfer Gudang Bermasalah (Cek Saldo 2):
              </p>
              <p>
                Fitur ini menghapus baris transaksi dengan <strong>Gudang: TRANSFER</strong> (type <strong>IN</strong> maupun <strong>OUT</strong>) untuk SKU yang dipilih.
                Setelah dihapus, jalankan ulang Analisis 2 atau Auto-Fix 2 dengan data yang sudah bersih.
              </p>
              {targetSkusForDeleteTransfer.length > 0 && (
                <div className="mt-2 font-mono text-[11px] bg-white/70 px-2 py-1 rounded border border-rose-200 text-rose-800">
                  Target SKU ({targetSkusForDeleteTransfer.length}): {targetSkusForDeleteTransfer.slice(0, 5).join(', ')}{targetSkusForDeleteTransfer.length > 5 ? '...' : ''}
                </div>
              )}
            </div>
          </div>

          {isLoadingTransferLogs ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="h-8 w-8 text-rose-600 animate-spin" />
              <p className="text-sm font-bold text-slate-600">Memuat data log gudang TRANSFER...</p>
            </div>
          ) : transferLogs.length === 0 ? (
            <div className="py-10 text-center space-y-3 bg-slate-50 rounded-2xl border border-slate-200 p-6">
              <CheckCircle className="h-10 w-10 text-emerald-500 mx-auto" />
              <p className="text-sm font-bold text-slate-800">
                Tidak ada data log gudang TRANSFER ditemukan untuk SKU ini.
              </p>
              <p className="text-xs text-slate-500">
                Semua log saat ini sudah bersih dari data transfer.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={transferLogs.length > 0 && selectedTransferIds.size === transferLogs.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedTransferIds(new Set(transferLogs.map(l => l.id)));
                      } else {
                        setSelectedTransferIds(new Set());
                      }
                    }}
                    className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                  />
                  <span>Pilih Semua ({transferLogs.length} baris)</span>
                </label>
                <span className="text-[11px] text-slate-400">
                  Centang baris yang ingin dihapus permanen
                </span>
              </div>

              <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl shadow-inner bg-white">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                      <th className="p-2 w-10 text-center">#</th>
                      <th className="p-2">Tgl / Waktu</th>
                      <th className="p-2">SKU</th>
                      <th className="p-2 text-center">Type</th>
                      <th className="p-2 text-center">Gudang</th>
                      <th className="p-2">Rak</th>
                      <th className="p-2 text-right">Qty</th>
                      <th className="p-2">Tgl Scan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {transferLogs.map((row) => {
                      const isSelected = selectedTransferIds.has(row.id);
                      const isOut = (row.type || '').toUpperCase().includes('OUT');
                      return (
                        <tr
                          key={row.id}
                          onClick={() => {
                            setSelectedTransferIds(prev => {
                              const next = new Set(prev);
                              if (next.has(row.id)) next.delete(row.id);
                              else next.add(row.id);
                              return next;
                            });
                          }}
                          className={`cursor-pointer transition-colors ${isSelected ? 'bg-rose-50/70 hover:bg-rose-100/60' : 'hover:bg-slate-50'}`}
                        >
                          <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                setSelectedTransferIds(prev => {
                                  const next = new Set(prev);
                                  if (next.has(row.id)) next.delete(row.id);
                                  else next.add(row.id);
                                  return next;
                                });
                              }}
                              className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-3.5 h-3.5 cursor-pointer"
                            />
                          </td>
                          <td className="p-2 text-slate-800 font-medium">
                            {row.tgl} <span className="text-slate-400">{row.waktu}</span>
                          </td>
                          <td className="p-2 text-slate-900 font-bold max-w-[150px] truncate" title={row.sku}>
                            {row.sku}
                          </td>
                          <td className="p-2 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black ${isOut ? 'bg-rose-100 text-rose-700 border border-rose-300' : 'bg-emerald-100 text-emerald-700 border border-emerald-300'}`}>
                              {row.type}
                            </span>
                          </td>
                          <td className="p-2 text-center">
                            <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px] font-bold">
                              {row.gudang}
                            </span>
                          </td>
                          <td className="p-2 font-bold text-slate-700">
                            {row.rak}
                          </td>
                          <td className="p-2 text-right font-black text-slate-900">
                            {row.jumlah}
                          </td>
                          <td className="p-2 text-slate-600">
                            {row.tgl_scan || <span className="text-slate-400 italic">(Kosong)</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <Button
              type="button"
              onClick={() => setIsDeleteTransferModalOpen(false)}
              disabled={isDeletingTransferLogs}
              className="h-10 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer transition-all"
            >
              Batal
            </Button>

            {transferLogs.length > 0 && (
              <Button
                type="button"
                onClick={handleExecuteDeleteTransferForCekSaldo}
                disabled={isDeletingTransferLogs || selectedTransferIds.size === 0}
                className="h-10 px-5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-rose-600/30 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isDeletingTransferLogs ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Menghapus Data...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    <span>Hapus {selectedTransferIds.size} Data Transfer Sekarang</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {/* Sub-Modal: Konfirmasi Hapus Data TIDAK JADI POTONG (Database Log) */}
      <Modal
        isOpen={deleteOvercutModal.isOpen}
        onClose={() => {
          if (!deleteOvercutModal.isDeleting) {
            setDeleteOvercutModal(prev => ({ ...prev, isOpen: false }));
          }
        }}
        title="Konfirmasi Hapus Data Transaksi OUT (TIDAK JADI POTONG)"
        size="2xl"
        className="w-[94vw] max-w-2xl"
      >
        <div className="space-y-4">
          {/* Header Warning Card */}
          <div className="p-4 bg-gradient-to-r from-rose-50 via-red-50 to-rose-50 border-2 border-rose-300 rounded-2xl space-y-2 shadow-xs">
            <div className="flex items-center space-x-2 text-rose-800 font-black text-xs uppercase tracking-wide">
              <AlertTriangle className="h-5 w-5 text-rose-600 animate-pulse shrink-0" />
              <span>PERINGATAN KRITIS: TINDAKAN TIDAK DAPAT DIBATALKAN!</span>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              Apakah Anda yakin ingin menghapus data transaksi OUT ini langsung dari tabel <strong>database_log</strong>? 
              Data yang telah dihapus <strong>TIDAK BISA DIKEMBALIKAN / DIPULIHKAN LAGI</strong> dengan cara apa pun.
            </p>
            <p className="text-[11px] text-rose-700 font-medium">
              * Setelah data berhasil dihapus, stok batch ini akan langsung dihitung ulang dan saldo otomatis menjadi klop/seimbang.
            </p>
          </div>

          {/* Batch Context Card */}
          {deleteOvercutModal.item && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">SKU</span>
                <span className="font-mono font-black text-slate-800">{deleteOvercutModal.item.sku}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Rak / Tgl Scan</span>
                <span className="font-bold text-slate-800">{deleteOvercutModal.item.rak} • {deleteOvercutModal.item.tglScan}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Kapasitas IN</span>
                <span className="font-bold text-emerald-700">{deleteOvercutModal.item.totalIn} pcs</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Saldo Defisit</span>
                <span className="font-black text-rose-600">{deleteOvercutModal.item.balance} pcs</span>
              </div>
            </div>
          )}

          {/* Table / List of Target Transactions */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs bg-white">
            <div className="bg-slate-100 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
              <label className="flex items-center space-x-2 text-xs font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={
                    deleteOvercutModal.targetTransactions.length > 0 &&
                    deleteOvercutModal.selectedIds.size === deleteOvercutModal.targetTransactions.length
                  }
                  onChange={(e) => {
                    if (e.target.checked) {
                      setDeleteOvercutModal(prev => ({
                        ...prev,
                        selectedIds: new Set(prev.targetTransactions.map(t => t.id))
                      }));
                    } else {
                      setDeleteOvercutModal(prev => ({
                        ...prev,
                        selectedIds: new Set()
                      }));
                    }
                  }}
                  className="rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                />
                <span>
                  Pilih Semua ({deleteOvercutModal.targetTransactions.length} Transaksi)
                </span>
              </label>
              <span className="text-xs font-black text-rose-600">
                Total Qty Terpilih: {
                  deleteOvercutModal.targetTransactions
                    .filter(t => deleteOvercutModal.selectedIds.has(t.id))
                    .reduce((sum, t) => sum + t.jumlah, 0)
                } pcs
              </span>
            </div>

            <div className="max-h-60 overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 font-bold text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="p-2 w-8 text-center">Pilih</th>
                    <th className="p-2">Tgl / Waktu Input</th>
                    <th className="p-2 text-right">Qty</th>
                    <th className="p-2">User (Gudang)</th>
                    <th className="p-2">Rak</th>
                    <th className="p-2 font-mono">ID Log</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {deleteOvercutModal.targetTransactions.map((tx, idx) => {
                    const isSelected = deleteOvercutModal.selectedIds.has(tx.id);
                    return (
                      <tr key={tx.id || idx} className={`hover:bg-rose-50/50 ${isSelected ? 'bg-rose-50/30' : ''}`}>
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              const next = new Set(deleteOvercutModal.selectedIds);
                              if (e.target.checked) next.add(tx.id);
                              else next.delete(tx.id);
                              setDeleteOvercutModal(prev => ({ ...prev, selectedIds: next }));
                            }}
                            className="rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                          />
                        </td>
                        <td className="p-2 text-slate-800 font-sans">
                          {tx.tgl} <span className="text-slate-400 font-mono text-[10px]">{tx.waktu}</span>
                        </td>
                        <td className="p-2 text-right font-black text-rose-600">
                          -{tx.jumlah} pcs
                        </td>
                        <td className="p-2 font-sans text-xs">
                          <span className="px-1.5 py-0.5 bg-slate-100 rounded font-black text-slate-900 mr-1.5">
                            User: {(tx.gudang || tx.user || '-').trim()}
                          </span>
                          {tx.user && tx.user !== tx.gudang && (
                            <span className="text-slate-400 text-[10px]">({tx.user})</span>
                          )}
                        </td>
                        <td className="p-2 font-bold text-slate-700 font-sans">
                          {tx.rak}
                        </td>
                        <td className="p-2 text-slate-400 text-[10px]">
                          {tx.id}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <Button
              type="button"
              onClick={() => setDeleteOvercutModal(prev => ({ ...prev, isOpen: false }))}
              disabled={deleteOvercutModal.isDeleting}
              className="h-10 px-5 bg-white hover:bg-slate-50 text-slate-700 font-bold border border-slate-300 rounded-xl text-xs cursor-pointer shadow-xs transition-all"
            >
              Batal
            </Button>
            <Button
              type="button"
              onClick={handleExecuteDeleteOvercut}
              disabled={deleteOvercutModal.isDeleting || deleteOvercutModal.selectedIds.size === 0}
              className="h-10 px-5 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white font-black rounded-xl text-xs flex items-center space-x-2 shadow-md cursor-pointer transition-all active:scale-95 disabled:opacity-50"
            >
              {deleteOvercutModal.isDeleting ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Menghapus Data...</span>
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  <span>Ya, Hapus Permanen ({deleteOvercutModal.selectedIds.size} Transaksi)</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
