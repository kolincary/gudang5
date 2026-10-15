import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import {
  Calculator,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Trash2,
  Copy,
  Clipboard,
  X,
  Search,
  ChevronDown,
  Square,
  Check,
  Scale,
  Zap,
  Info
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  formatDateDisplay,
  formatDeficitReportSentence,
  BalanceAnalysisResult,
  OutTransactionDetail,
  SurplusOption,
  isForbiddenTransferRack,
  isForbiddenRackAdjustment
} from './DatabaseLog';
import {
  normalizeDate,
  normalizeTime,
  toTimestamp,
  isOutDateEligibleForIn
} from '../services/scanDateMatchService';
import { parseMultipleSkus } from '../services/transferPurgeService';

const normRak = (r?: string) => (r || '').trim().toUpperCase().replace(/\./g, '');

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => (prev < filteredOptions.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : filteredOptions.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredOptions[highlightedIndex]) {
          handleOptionSelect(filteredOptions[highlightedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
      default:
        break;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={loading ? 'Memuat data...' : placeholder}
          disabled={loading}
          className="w-full h-11 px-4 pr-10 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm bg-white text-sm"
        />
        {value && (
          <button
            type="button"
            onClick={handleClearClick}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            title="Bersihkan"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isOpen && (
        <div
          ref={listRef}
          className="absolute z-50 w-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-64 overflow-y-auto"
        >
          {filteredOptions.length === 0 ? (
            <div className="p-3 text-xs text-slate-400 text-center italic">
              Tidak ada SKU yang cocok
            </div>
          ) : (
            filteredOptions.map((opt, idx) => (
              <div
                key={idx}
                ref={el => { itemRefs.current[idx] = el; }}
                onClick={() => handleOptionSelect(opt)}
                className={`px-4 py-2.5 text-xs cursor-pointer border-b border-slate-50 last:border-b-0 font-medium ${
                  idx === highlightedIndex ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                {opt}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface CekSaldo1DirectViewProps {
  allSkus: string[];
  onDataUpdated?: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export function CekSaldo1DirectView({ allSkus, onDataUpdated, showToast }: CekSaldo1DirectViewProps) {
  // Input State
  const [analysisSku, setAnalysisSku] = useState('');
  const [analysisSkuInputMode, setAnalysisSkuInputMode] = useState<'single' | 'bulk'>('single');
  const [bulkAnalysisSkuInput, setBulkAnalysisSkuInput] = useState('');
  const [excludedScanDates, setExcludedScanDates] = useState('');
  const [analysisSearchTerm, setAnalysisSearchTerm] = useState('');

  // Analysis Result State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<BalanceAnalysisResult[]>([]);
  const [analyzedSkusList, setAnalyzedSkusList] = useState<string[]>([]);
  const [analysisFilterTab, setAnalysisFilterTab] = useState<'ALL' | 'DEFICIT' | 'SURPLUS'>('ALL');
  const [expandedDeficitKeys, setExpandedDeficitKeys] = useState<Set<string>>(new Set());
  const [singleTargetSelections, setSingleTargetSelections] = useState<Record<string, { targetRak: string; targetRawTglScan: string }>>({});
  const [isProcessingRemediation, setIsProcessingRemediation] = useState(false);

  // Batch Auto-Fix State
  const [batchAutoFixProgress, setBatchAutoFixProgress] = useState<{
    isRunning: boolean;
    isStopping: boolean;
    total: number;
    currentIndex: number;
    currentSku: string;
    iteration: number;
    statusMessage: string;
    completedList: Array<{
      sku: string;
      movesFixed: number;
      isKlop: boolean;
      iterations: number;
      message: string;
    }>;
  }>({
    isRunning: false,
    isStopping: false,
    total: 0,
    currentIndex: 0,
    currentSku: '',
    iteration: 0,
    statusMessage: '',
    completedList: []
  });

  const stopBatchAutoFixRef = useRef(false);

  // Delete Transfer for Cek Saldo Modal State
  const [isDeleteTransferCekSaldoModalOpen, setIsDeleteTransferCekSaldoModalOpen] = useState(false);
  const [transferLogsForCekSaldo, setTransferLogsForCekSaldo] = useState<any[]>([]);
  const [selectedTransferIdsForCekSaldo, setSelectedTransferIdsForCekSaldo] = useState<Set<string>>(new Set());
  const [isLoadingTransferLogsForCekSaldo, setIsLoadingTransferLogsForCekSaldo] = useState(false);
  const [isDeletingTransferLogsForCekSaldo, setIsDeletingTransferLogsForCekSaldo] = useState(false);
  const [targetSkusForDeleteTransfer, setTargetSkusForDeleteTransfer] = useState<string[]>([]);

  // --------------------------------------------------------------------------
  // 1. ANALYZE STOCK BALANCE ENGINE (CEK SALDO 1)
  // --------------------------------------------------------------------------
  const handleAnalyzeStockBalance = async (customSkus?: string | string[]) => {
    let targetSkus: string[] = [];
    if (Array.isArray(customSkus)) {
      targetSkus = customSkus.map(s => s.trim().toUpperCase()).filter(Boolean);
    } else if (typeof customSkus === 'string' && customSkus.trim()) {
      targetSkus = [customSkus.trim().toUpperCase()];
    } else if (analysisSkuInputMode === 'bulk') {
      targetSkus = Array.from(new Set(bulkAnalysisSkuInput.split(/[\r\n,]+/).map(s => s.trim().toUpperCase()).filter(Boolean)));
    } else if (analysisSku && analysisSku.trim()) {
      targetSkus = [analysisSku.trim().toUpperCase()];
    }

    if (targetSkus.length === 0) {
      showToast('Silakan pilih atau tempel setidaknya 1 SKU untuk melakukan analisis.', 'warning');
      return;
    }

    try {
      setIsAnalyzing(true);
      setAnalysisResults([]);
      setExpandedDeficitKeys(new Set());
      setSingleTargetSelections({});
      setAnalyzedSkusList(targetSkus);

      showToast(`Memulai analisis saldo stok untuk ${targetSkus.length} SKU... Ini mungkin memakan waktu untuk data yang besar.`, 'info');

      // 1. Fetch relevant logs based on targetSkus
      let allLogs: any[] = [];

      if (targetSkus.length === 1) {
        let query = supabase
          .from('database_log')
          .select('id, sku, rak, sub_rak, tgl_scan, type, jumlah, tgl, waktu, user_name')
          .or('type.ilike.%IN%,type.ilike.%OUT%')
          .order('id', { ascending: true });

        query = query.ilike('sku', targetSkus[0].trim());

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
            showToast('Data terlalu besar (>50.000). Hasil dibatasi untuk performa.', 'warning');
            hasMore = false;
          }
        }
      } else {
        // Multi-SKU: Fetch in chunks of 30 SKUs with case variations
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
              showToast('Data log terlalu banyak (>100.000). Analisis dibatasi.', 'warning');
              hasMore = false;
              break;
            }
          }
        }
      }

      // Group logs by SKU
      const logsBySku = new Map<string, any[]>();
      allLogs.forEach(log => {
        const normSku = (log.sku || '').trim().toUpperCase();
        if (!logsBySku.has(normSku)) logsBySku.set(normSku, []);
        logsBySku.get(normSku)!.push(log);
      });

      const allCombinedGroups: BalanceAnalysisResult[] = [];
      const initialSelections: Record<string, { targetRak: string; targetRawTglScan: string }> = {};

      logsBySku.forEach((skuLogs, currentSku) => {
        // 2. Aggregate logs for this SKU: key = `${normSku}|${normRak}|${normTglScan}`
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

        // Evaluasi akurat anomali OUT < IN setelah semua baris IN dan OUT teragregasi
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

        // 3. Smart Diagnostics for this SKU
        const inBuckets: Array<{
          id: string;
          tgl: string;
          waktu: string;
          targetTglScan: string;
          rak: string;
          sub_rak: string;
          totalCapacity: number;
          remainingCapacity: number;
          timestamp: number;
        }> = [];

        const outCandidates: Array<{
          id: string;
          tgl: string;
          waktu: string;
          jumlah: number;
          rak: string;
          sub_rak: string;
          oldTglScan: string;
          timestamp: number;
          user: string;
          isAssigned: boolean;
          matchedIn: any | null;
        }> = [];

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
              isAssigned: false,
              matchedIn: null
            });
          }
        });

        inBuckets.sort((a, b) => a.timestamp - b.timestamp);
        outCandidates.sort((a, b) => a.timestamp - b.timestamp);

        // --- TAHAP 1: SAME-DAY EXACT QTY MATCH (Tgl Input Sama, SKU Sama, Qty Sama) ---
        for (const bucket of inBuckets) {
          if (bucket.remainingCapacity <= 0) continue;

          const exactSameDayCandidates = outCandidates.filter(
            c => !c.isAssigned &&
                 c.tgl === bucket.tgl &&
                 c.jumlah === bucket.remainingCapacity &&
                 !isForbiddenRackAdjustment(c.rak)
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
          if (bucket.remainingCapacity <= 0) continue;

          while (bucket.remainingCapacity > 0) {
            const eligibleOuts = outCandidates.filter(
              c => !c.isAssigned &&
                   c.jumlah <= bucket.remainingCapacity &&
                   isOutDateEligibleForIn(c.tgl, bucket.tgl) &&
                   !isForbiddenRackAdjustment(c.rak)
            );

            if (eligibleOuts.length === 0) break;

            eligibleOuts.sort((a, b) => {
              const distA = a.timestamp - bucket.timestamp;
              const distB = b.timestamp - bucket.timestamp;
              const daysA = distA / (24 * 3600 * 1000);
              const daysB = distB / (24 * 3600 * 1000);

              // 1. Proximity Window: Jika salah satu dekat (<= 35 hari) dan yang lain jauh (> 35 hari), dahulukan yang dekat
              if (daysA <= 35 && daysB > 35) return -1;
              if (daysB <= 35 && daysA > 35) return 1;

              // 2. Same Input Date preference: jika tanggal input sama persis, dahulukan
              const aSameDate = a.tgl === bucket.tgl ? 0 : 1;
              const bSameDate = b.tgl === bucket.tgl ? 0 : 1;
              if (aSameDate !== bSameDate) return aSameDate - bSameDate;

              // 3. Jika rentang waktu mirip (selisih < 14 hari), dahulukan rak yang sama
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
            // Deficit / Minus
            const matchedCand = outCandidates.find(c => g.outTransactions.some(tx => tx.id === c.id) && c.matchedIn);

            const isSurplusEligibleForOut = (surplusRawTgl: string) => {
              if (!g.outTransactions || g.outTransactions.length === 0) return true;
              return g.outTransactions.every(tx => !tx.tgl || isOutDateEligibleForIn(tx.tgl, surplusRawTgl));
            };

            const sameRakSurpluses = surplusGroups
              .filter(s => s.rak.toUpperCase() === g.rak.toUpperCase() && isSurplusEligibleForOut(s.rawTglScan))
              .map(s => ({
                rak: s.rak,
                tglScan: s.tglScan,
                rawTglScan: s.rawTglScan,
                surplusQty: s.balance
              }));

            const otherRakSurpluses = !isForbiddenTransferRack(g.rak)
              ? surplusGroups
                  .filter(s => s.rak.toUpperCase() !== g.rak.toUpperCase() && !isForbiddenTransferRack(s.rak) && isSurplusEligibleForOut(s.rawTglScan))
                  .map(s => ({
                    rak: s.rak,
                    tglScan: s.tglScan,
                    rawTglScan: s.rawTglScan,
                    surplusQty: s.balance
                  }))
              : [];

            if (matchedCand && matchedCand.matchedIn) {
              const isSameRak = normRak(g.rak) === normRak(matchedCand.matchedIn.rak);
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
            } else if (sameRakSurpluses.length > 0) {
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
              g.recommendedAction = `Lebih Potong Murni — Total stok gudang defisit (${g.balance.toLocaleString()} pcs). Tidak ada surplus di tgl/rak lain.`;
            }

            g.availableSurplusesSameRak = sameRakSurpluses;
            g.availableSurplusesOtherRak = otherRakSurpluses;
          }
        });

        // Deteksi transaksi OUT yang tidak sesuai rak/tgl_scan meskipun grupnya surplus
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

      // 4. Sort: Deficits first (worst negative first), then Anomalies, then Surpluses, then Balanced
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
        setAnalysisFilterTab('DEFICIT');
        showToast(`Analisis selesai! Ditemukan ${deficitCount} kombinasi MINUS (Lebih Potong) pada ${targetSkus.length} SKU.`, 'warning');
      } else if (anomalyCount > 0) {
        showToast(`Analisis selesai! Ditemukan ${anomalyCount} kombinasi dengan Anomali Tanggal pada ${targetSkus.length} SKU.`, 'warning');
      } else {
        setAnalysisFilterTab('ALL');
        showToast(`Analisis selesai! Seluruh stok dari ${targetSkus.length} SKU aman & klop secara kuantitas dan tanggal.`, 'success');
      }

    } catch (error: any) {
      console.error('Analysis failed:', error);
      showToast('Gagal melakukan analisis saldo stok: ' + (error?.message || error), 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // --------------------------------------------------------------------------
  // 2. AUTO-FIX SINGLE SKU (CEK SALDO 1)
  // --------------------------------------------------------------------------
  const autoFixSingleSku = async (targetSku: string, excludedDatesStr: string = '') => {
    const normTargetSku = targetSku.trim().toUpperCase();

    // 1. Fetch relevant logs for this SKU
    const { data: allLogs, error } = await supabase
      .from('database_log')
      .select('id, sku, rak, sub_rak, tgl_scan, type, jumlah, tgl, waktu, user_name, log_audit_saldo')
      .ilike('sku', normTargetSku)
      .or('type.ilike.%IN%,type.ilike.%OUT%')
      .order('id', { ascending: true });

    if (error) throw error;
    if (!allLogs || allLogs.length === 0) {
      return { movesFixed: 0, isKlop: true, message: 'Tidak ada data log untuk SKU ini.' };
    }

    // 2. Aggregate logs: key = `${normRak}|${normTglScan}`
    const balanceMap = new Map<string, {
      rak: string;
      rawTglScan: string;
      totalIn: number;
      totalOut: number;
      balance: number;
    }>();

    allLogs.forEach(log => {
      const normR = (log.rak || '').trim().toUpperCase();
      const rawTgl = (log.tgl_scan || '').trim();
      const normT = formatDateDisplay(rawTgl) || 'No Date';
      const key = `${normR}|${normT}`;

      if (!balanceMap.has(key)) {
        balanceMap.set(key, {
          rak: (log.rak || '').trim(),
          rawTglScan: rawTgl,
          totalIn: 0,
          totalOut: 0,
          balance: 0
        });
      }

      const row = balanceMap.get(key)!;
      const qty = Number(log.jumlah || 0);
      const isIN = (log.type || '').toUpperCase().includes('IN');
      if (isIN) row.totalIn += qty;
      else row.totalOut += qty;
      row.balance = row.totalIn - row.totalOut;
    });

    const isAlreadyKlop = Array.from(balanceMap.values()).every(b => b.balance >= 0);
    if (isAlreadyKlop) {
      return { movesFixed: 0, isKlop: true, message: 'Saldo sudah seimbang & klop (0 selisih).' };
    }

    const excludedList = excludedDatesStr.split(',').map(d => d.trim().toUpperCase()).filter(Boolean);
    const checkIfExcluded = (targetTgl: string) => {
      const normTgl = (formatDateDisplay(targetTgl) || targetTgl || '').toUpperCase();
      return excludedList.some(excluded => {
        const normExcluded = formatDateDisplay(excluded).toUpperCase();
        return normTgl === normExcluded || normTgl === excluded.toUpperCase();
      });
    };

    // 3. Inflow Buckets & Outflow Candidates
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
      if (bucket.remainingCapacity <= 0 || checkIfExcluded(bucket.targetTglScan)) continue;

      const exactSameDayCandidates = outCandidates.filter(
        c => !c.isAssigned &&
             c.tgl === bucket.tgl &&
             c.jumlah === bucket.remainingCapacity &&
             !isForbiddenRackAdjustment(c.rak)
      );

      if (exactSameDayCandidates.length > 0) {
        exactSameDayCandidates.sort((a, b) => Math.abs(a.timestamp - bucket.timestamp) - Math.abs(b.timestamp - bucket.timestamp));
        const best = exactSameDayCandidates[0];
        best.isAssigned = true;
        best.newTglScan = bucket.targetTglScan;
        if (!isForbiddenRackAdjustment(bucket.rak) && !isForbiddenRackAdjustment(best.rak)) {
          best.newRak = bucket.rak;
          best.newSubRak = bucket.sub_rak || bucket.rak;
        } else {
          best.newRak = best.rak;
          best.newSubRak = best.sub_rak || best.rak;
        }
        bucket.remainingCapacity -= best.jumlah;
      }
    }

    // --- TAHAP 2: MATCHING KRONOLOGIS TERDEKAT (FIFO PROXIMITY) ---
    for (const bucket of inBuckets) {
      if (bucket.remainingCapacity <= 0 || checkIfExcluded(bucket.targetTglScan)) continue;

      while (bucket.remainingCapacity > 0) {
        const eligibleOuts = outCandidates.filter(
          c => !c.isAssigned &&
               c.jumlah <= bucket.remainingCapacity &&
               isOutDateEligibleForIn(c.tgl, bucket.tgl) &&
               !isForbiddenRackAdjustment(c.rak)
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
        if (!isForbiddenRackAdjustment(bucket.rak) && !isForbiddenRackAdjustment(best.rak)) {
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

    // 4. Kumpulkan moves
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

    // 5. Eksekusi moves ke Supabase secara grouped batch
    const todayStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const payloadGroups = new Map<string, { payload: Record<string, any>; ids: string[] }>();
    moves.forEach(move => {
      const isRakChanged = move.toRak && move.toRak !== move.rak;
      const isTglChanged = move.toTgl !== move.fromTgl;

      const payload: Record<string, any> = {
        log_audit_saldo: `LOCKED: Penyesuaian Cek Saldo (${todayStr})`
      };

      if (move.toTgl === null) {
        payload.tgl_scan = null;
        payload.log_update_user = `DEVMODE: Lepas Tgl Scan Anomali (${todayStr.slice(0, 10)})`;
      } else {
        if (isTglChanged && move.toTgl) {
          payload.tgl_scan = move.toTgl;
        }
        if (isRakChanged && move.toRak) {
          payload.rak = move.toRak;
          payload.sub_rak = move.toRak;
        }
      }

      const key = JSON.stringify(payload);
      if (!payloadGroups.has(key)) {
        payloadGroups.set(key, { payload, ids: [] });
      }
      payloadGroups.get(key)!.ids.push(move.id);
    });

    let totalSuccess = 0;
    for (const group of payloadGroups.values()) {
      if (stopBatchAutoFixRef.current) break;
      const { payload, ids } = group;
      const chunkSize = 25;

      for (let i = 0; i < ids.length; i += chunkSize) {
        if (stopBatchAutoFixRef.current) break;
        const chunkIds = ids.slice(i, i + chunkSize);
        let success = false;
        let attempts = 0;

        while (!success && attempts < 3) {
          if (stopBatchAutoFixRef.current) break;
          attempts++;
          let { error } = await supabase
            .from('database_log')
            .update(payload)
            .in('id', chunkIds);

          if (error && error.message && error.message.includes('log_audit_saldo')) {
            const fallbackPayload = { ...payload };
            delete fallbackPayload.log_audit_saldo;
            const res = await supabase
              .from('database_log')
              .update(fallbackPayload)
              .in('id', chunkIds);
            error = res.error;
          }

          if (!error) {
            success = true;
            totalSuccess += chunkIds.length;
          } else {
            console.warn(`Attempt ${attempts} failed for ${chunkIds.length} rows:`, error.message);
            if (attempts < 3) {
              await new Promise(r => setTimeout(r, 600));
            }
          }
        }
      }
    }

    return {
      movesFixed: totalSuccess,
      isKlop: false,
      message: `Berhasil memperbarui ${totalSuccess} baris data.`
    };
  };

  // --------------------------------------------------------------------------
  // 3. RUN BATCH AUTO-FIX PER SKU (CEK SALDO 1)
  // --------------------------------------------------------------------------
  const runBatchAutoFixPerSku = async (skus: string[]) => {
    const uniqueSkus = Array.from(new Set(skus.map(s => s.trim().toUpperCase()).filter(Boolean)));
    if (uniqueSkus.length === 0) {
      showToast('Silakan pilih atau tempel setidaknya 1 SKU.', 'warning');
      return;
    }

    stopBatchAutoFixRef.current = false;
    setBatchAutoFixProgress({
      isRunning: true,
      isStopping: false,
      total: uniqueSkus.length,
      currentIndex: 1,
      currentSku: uniqueSkus[0],
      iteration: 1,
      statusMessage: 'Memulai proses auto-fix batch per SKU...',
      completedList: []
    });

    showToast(`Memulai Auto-Fix Massal untuk ${uniqueSkus.length} SKU (satu per satu sampai klop)...`, 'info');

    const completedList: Array<{
      sku: string;
      movesFixed: number;
      isKlop: boolean;
      iterations: number;
      message: string;
    }> = [];

    for (let i = 0; i < uniqueSkus.length; i++) {
      if (stopBatchAutoFixRef.current) break;

      const currentSku = uniqueSkus[i];
      let skuIteration = 0;
      let totalMovesFixedForSku = 0;
      let isSkuKlop = false;
      let lastMessage = '';

      const maxIterationsPerSku = 6;
      while (skuIteration < maxIterationsPerSku) {
        if (stopBatchAutoFixRef.current) break;
        skuIteration++;

        setBatchAutoFixProgress(prev => ({
          ...prev,
          currentIndex: i + 1,
          currentSku: currentSku,
          iteration: skuIteration,
          statusMessage: `[SKU ${i + 1}/${uniqueSkus.length}] Iterasi ${skuIteration}: Memeriksa dan menyeimbangkan saldo sampai klop...`,
          completedList: [...completedList]
        }));

        try {
          const res = await autoFixSingleSku(currentSku, excludedScanDates);
          totalMovesFixedForSku += res.movesFixed;
          lastMessage = res.message;

          if (res.isKlop) {
            isSkuKlop = true;
            break;
          }

          if (res.movesFixed === 0) {
            break;
          }

          await new Promise(r => setTimeout(r, 400));
        } catch (err: any) {
          console.error(`Error auto-fixing SKU ${currentSku}:`, err);
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
      showToast(`Proses Auto-Fix dihentikan. ${completedList.length} SKU telah diproses.`, 'warning');
    } else {
      showToast(`Auto-Fix Massal selesai! ${completedList.length} SKU telah diproses.`, 'success');
    }

    if (onDataUpdated) onDataUpdated();

    // Refresh active analysis
    if (analysisSkuInputMode === 'single' && analysisSku) {
      handleAnalyzeStockBalance(analysisSku);
    } else if (analyzedSkusList.length > 0) {
      handleAnalyzeStockBalance(analyzedSkusList);
    }
  };

  const handleStopBatchAutoFix = () => {
    stopBatchAutoFixRef.current = true;
    setBatchAutoFixProgress(prev => ({
      ...prev,
      isStopping: true,
      statusMessage: 'Menghentikan proses auto-fix massal...'
    }));
  };

  // --------------------------------------------------------------------------
  // 4. APPLY SINGLE ROW REMEDIATION (CEK SALDO 1)
  // --------------------------------------------------------------------------
  const handleApplySingleRemediation = async (
    item: BalanceAnalysisResult,
    targetRak: string,
    targetRawTglScan: string
  ) => {
    if (!item.outTransactions || item.outTransactions.length === 0) {
      showToast('Tidak ditemukan transaksi OUT untuk dipindahkan.', 'warning');
      return;
    }

    if (targetRawTglScan) {
      const invalidOut = item.outTransactions.find(t => t.tgl && !isOutDateEligibleForIn(t.tgl, targetRawTglScan));
      if (invalidOut) {
        showToast(`Ditolak: Tanggal OUT (${invalidOut.tgl}) lebih kecil dari tanggal IN (${targetRawTglScan}). Data OUT tidak boleh mendahului IN!`, 'error');
        return;
      }
    }

    try {
      setIsProcessingRemediation(true);
      const outIds = item.outTransactions.map(t => t.id);
      const todayStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

      const updatePayload: any = {
        tgl_scan: targetRawTglScan,
        log_update_user: `DEVMODE: Fix Deficit ${item.rak !== targetRak ? `Move ${item.rak}->${targetRak}` : `Change Date->${targetRawTglScan}`}`,
        log_audit_saldo: `LOCKED: Penyesuaian Cek Saldo (${todayStr})`
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

      showToast(`Sukses memindahkan ${outIds.length} transaksi OUT ke ${item.rak !== targetRak ? `Rak ${targetRak} & ` : ''}Tgl Scan ${formatDateDisplay(targetRawTglScan)}!`, 'success');

      if (onDataUpdated) onDataUpdated();
      await handleAnalyzeStockBalance();
    } catch (err: any) {
      console.error('Error applying single remediation:', err);
      showToast(`Gagal memindahkan data: ${err.message || 'unknown error'}`, 'error');
    } finally {
      setIsProcessingRemediation(false);
    }
  };

  // --------------------------------------------------------------------------
  // 5. DELETE TRANSFER HANDLING (CEK SALDO 1)
  // --------------------------------------------------------------------------
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

    if (skus.length === 0 && analysisResults.length > 0) {
      skus = Array.from(new Set(analysisResults.map(r => r.sku).filter(Boolean)));
    }

    if (skus.length === 0) {
      showToast('Silakan pilih atau masukkan SKU terlebih dahulu.', 'warning');
      return;
    }

    setTargetSkusForDeleteTransfer(skus);
    setIsDeleteTransferCekSaldoModalOpen(true);
    setIsLoadingTransferLogsForCekSaldo(true);
    setSelectedTransferIdsForCekSaldo(new Set());
    setTransferLogsForCekSaldo([]);

    try {
      const pageSize = 1000;
      let allLogs: any[] = [];
      const chunkSize = 50;

      for (let i = 0; i < skus.length; i += chunkSize) {
        const chunk = skus.slice(i, i + chunkSize);
        let page = 0;
        while (true) {
          let query = supabase
            .from('database_log')
            .select('id, tgl, waktu, sku, jumlah, type, gudang, rak, sub_rak, tgl_scan, user_name, log_update_user')
            .or('gudang.ilike.%TRANSFER%,rak.ilike.%TRANSFER%');

          if (chunk.length === 1) {
            query = query.eq('sku', chunk[0]);
          } else {
            query = query.in('sku', chunk);
          }

          const { data, error } = await query
            .order('tgl', { ascending: false })
            .order('waktu', { ascending: false })
            .range(page * pageSize, (page + 1) * pageSize - 1);

          if (error) throw error;
          if (!data || data.length === 0) break;
          allLogs.push(...data);
          if (data.length < pageSize) break;
          page++;
          if (page > 20) break;
        }
      }

      setTransferLogsForCekSaldo(allLogs);
      setSelectedTransferIdsForCekSaldo(new Set(allLogs.map(l => l.id)));

      if (allLogs.length === 0) {
        showToast(`Tidak ditemukan data gudang: TRANSFER untuk ${skus.length} SKU yang dipilih.`, 'info');
      } else {
        const inCount = allLogs.filter(l => (l.type || '').toUpperCase().includes('IN')).length;
        const outCount = allLogs.filter(l => (l.type || '').toUpperCase().includes('OUT')).length;
        showToast(`Ditemukan ${allLogs.length} data transfer (${inCount} IN, ${outCount} OUT).`, 'info');
      }
    } catch (err: any) {
      console.error('Error fetching transfer logs for Cek Saldo:', err);
      showToast('Gagal memuat data transfer: ' + (err?.message || err), 'error');
    } finally {
      setIsLoadingTransferLogsForCekSaldo(false);
    }
  };

  const handleExecuteDeleteTransferForCekSaldo = async () => {
    const idsToDelete = Array.from(selectedTransferIdsForCekSaldo);
    if (idsToDelete.length === 0) {
      showToast('Silakan pilih setidaknya satu data transfer untuk dihapus.', 'warning');
      return;
    }

    try {
      setIsDeletingTransferLogsForCekSaldo(true);
      const batchSize = 50;
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < idsToDelete.length; i += batchSize) {
        const batch = idsToDelete.slice(i, i + batchSize);
        const { error } = await supabase
          .from('database_log')
          .delete()
          .in('id', batch);

        if (error) {
          console.error('Error deleting transfer logs:', error);
          errorCount += batch.length;
        } else {
          successCount += batch.length;
        }
      }

      if (errorCount === 0) {
        showToast(`Berhasil menghapus ${successCount} data log transfer!`, 'success');
      } else {
        showToast(`Berhasil menghapus ${successCount} data, ${errorCount} data gagal dihapus.`, 'warning');
      }

      setIsDeleteTransferCekSaldoModalOpen(false);
      setTransferLogsForCekSaldo([]);
      setSelectedTransferIdsForCekSaldo(new Set());

      if (onDataUpdated) onDataUpdated();

      if (analysisSkuInputMode === 'single' && analysisSku) {
        await handleAnalyzeStockBalance(analysisSku);
      } else if (targetSkusForDeleteTransfer.length > 0) {
        await handleAnalyzeStockBalance(targetSkusForDeleteTransfer);
      } else {
        await handleAnalyzeStockBalance();
      }
    } catch (err: any) {
      console.error('Error deleting transfer logs:', err);
      showToast('Gagal menghapus data transfer: ' + (err?.message || err), 'error');
    } finally {
      setIsDeletingTransferLogsForCekSaldo(false);
    }
  };

  // --------------------------------------------------------------------------
  // RENDER CEK SALDO 1 DIRECT VIEW (1000% TAMPILAN PERSIS CEK SALDO 1 DATABASE LOG)
  // --------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Information Banner (Cara Kerja Analisis) */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-4 flex items-start space-x-3">
        <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-900 leading-relaxed">
          <p className="font-bold text-blue-950 mb-1">Cara Kerja Analisis &amp; Diagnosa Selisih:</p>
          <p>
            Sistem menghitung saldo berdasarkan <strong>SKU + Rak + Tgl Scan</strong> (Saldo = <strong>Total IN - Total OUT</strong>).
            Jika saldo bernilai negatif (<strong>Minus / Defisit</strong>), sistem secara cerdas memeriksa ketersediaan stok surplus di rak yang sama pada tanggal lain, atau di rak lain untuk SKU ini, serta merekomendasikan solusi perbaikan secara otomatis.
          </p>
        </div>
      </div>

      {/* Live Batch Auto-Fix Progress Banner & Controller */}
      {batchAutoFixProgress.isRunning && (
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-2 border-indigo-500/50 rounded-2xl p-5 text-white shadow-2xl space-y-4 animate-in fade-in duration-300">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/30">
                <RefreshCw className="h-5 w-5 animate-spin" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-indigo-300">
                    Auto-Fix Massal Berjalan
                  </span>
                  <span className="px-2 py-0.5 bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 rounded-full text-[10px] font-bold">
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
            <div className="flex justify-between text-xs text-indigo-200 font-semibold">
              <span>{batchAutoFixProgress.statusMessage}</span>
              <span>
                {Math.round(((batchAutoFixProgress.currentIndex - 1) / (batchAutoFixProgress.total || 1)) * 100)}%
              </span>
            </div>
            <div className="w-full bg-slate-800/80 rounded-full h-3 p-0.5 border border-indigo-400/20 overflow-hidden">
              <div
                className="bg-gradient-to-r from-indigo-500 via-teal-400 to-emerald-400 h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.max(5, Math.min(100, Math.round(((batchAutoFixProgress.currentIndex) / (batchAutoFixProgress.total || 1)) * 100)))}%`
                }}
              />
            </div>
          </div>

          {/* Live History of Processed SKUs */}
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

      {/* Completed Summary Banner */}
      {!batchAutoFixProgress.isRunning && batchAutoFixProgress.completedList.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
              <span className="font-black text-emerald-950 text-sm">
                Hasil Auto-Fix Batch ({batchAutoFixProgress.completedList.length} SKU Diproses)
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
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
        {/* Mode Selector */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 uppercase">Mode Input SKU:</span>
            <div className="bg-slate-200 p-0.5 rounded-xl flex items-center">
              <button
                type="button"
                onClick={() => setAnalysisSkuInputMode('single')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${analysisSkuInputMode === 'single' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900 cursor-pointer'}`}
              >
                Pilih 1 SKU
              </button>
              <button
                type="button"
                onClick={() => setAnalysisSkuInputMode('bulk')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${analysisSkuInputMode === 'bulk' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600 hover:text-slate-900 cursor-pointer'}`}
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
                  <span className="px-2.5 py-0.5 bg-teal-100 text-teal-800 text-[11px] font-black rounded-lg border border-teal-200">
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
                    showToast('Tidak dapat mengakses clipboard. Silakan gunakan Ctrl+V.', 'info');
                  }
                }}
                className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 hover:underline cursor-pointer"
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
                  options={allSkus}
                  placeholder="Ketik nama produk..."
                />
              </div>

              <div className="w-full md:w-80 flex-shrink-0">
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 ml-1">
                  Kecualikan Tgl Scan (Koma)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={excludedScanDates}
                    onChange={(e) => setExcludedScanDates(e.target.value)}
                    placeholder="Contoh: No Date, 2025-12-06"
                    className="w-full h-11 px-4 pr-10 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm bg-white text-sm"
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
            </div>

            {/* Baris Tombol Aksi Single SKU */}
            <div className="flex flex-wrap items-center gap-2.5 pt-2.5 border-t border-slate-200">
              <Button
                onClick={() => handleAnalyzeStockBalance()}
                disabled={isAnalyzing}
                className="h-11 px-5 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-black rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 active:scale-95 cursor-pointer"
              >
                {isAnalyzing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                <span>{isAnalyzing ? 'Menganalisis...' : 'Mulai Analisis'}</span>
              </Button>

              {analysisResults.some(r => r.balance < 0) && (
                <>
                  <Button
                    onClick={() => {
                      if (analysisSku) {
                        runBatchAutoFixPerSku([analysisSku]);
                      }
                    }}
                    disabled={isAnalyzing || batchAutoFixProgress.isRunning || isProcessingRemediation}
                    className="h-11 px-5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-black rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 active:scale-95 disabled:opacity-50 cursor-pointer"
                    title="Perbaiki semua selisih secara otomatis dan berulang sampai klop"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Auto-Fix (Sampai Klop)</span>
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      const deficits = analysisResults.filter(r => r.balance < 0);
                      const lines = deficits.map(d =>
                        formatDeficitReportSentence(d.sku || analysisSku, d.rak, d.tglScan, d.balance, d.totalIn, d.totalOut)
                      );
                      const text = `LAPORAN LEBIH POTONG (${analysisSku}):\n` + lines.join('\n');
                      navigator.clipboard.writeText(text);
                      showToast(`${lines.length} baris Laporan Lebih Potong disalin!`, 'success');
                    }}
                    className="h-11 px-4 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl border border-rose-300 shadow-sm transition-all flex items-center justify-center space-x-1.5 active:scale-95 cursor-pointer"
                    title="Salin seluruh baris laporan lebih potong untuk tim"
                  >
                    <Copy className="h-4 w-4" />
                    <span>Copy Laporan Lebih Potong</span>
                  </Button>
                </>
              )}

              <Button
                type="button"
                onClick={handleOpenDeleteTransferForCekSaldo}
                disabled={isAnalyzing || batchAutoFixProgress.isRunning || !analysisSku}
                className="h-11 px-4 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 active:scale-95 disabled:opacity-50 cursor-pointer"
                title="Hapus data log gudang TRANSFER (type IN & OUT) untuk SKU ini jika bermasalah"
              >
                <Trash2 className="h-4 w-4" />
                <span>Hapus Data Gudang: TRANSFER</span>
              </Button>
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
                className="w-full p-3 border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-teal-500 bg-white"
              />
            </div>
            <div className="flex flex-col lg:flex-row items-stretch lg:items-end justify-between gap-3 pt-1">
              <div className="w-full lg:w-80 flex-shrink-0">
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 ml-1">
                  Kecualikan Tgl Scan (Koma)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={excludedScanDates}
                    onChange={(e) => setExcludedScanDates(e.target.value)}
                    placeholder="Contoh: No Date, 2025-12-06"
                    className="w-full h-11 px-4 pr-10 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm bg-white text-xs"
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

              <div className="flex flex-wrap items-center gap-2.5">
                <Button
                  onClick={() => handleAnalyzeStockBalance()}
                  disabled={isAnalyzing || batchAutoFixProgress.isRunning || !bulkAnalysisSkuInput.trim()}
                  className="h-11 px-5 bg-gradient-to-r from-teal-600 to-emerald-700 hover:from-teal-700 hover:to-emerald-800 text-white font-black rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {isAnalyzing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                  <span>{isAnalyzing ? 'Menganalisis...' : 'Mulai Analisis Massal'}</span>
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    const skus = Array.from(new Set(bulkAnalysisSkuInput.split(/[\r\n,]+/).map(s => s.trim().toUpperCase()).filter(Boolean)));
                    if (skus.length === 0) {
                      showToast('Silakan tempel setidaknya 1 SKU.', 'warning');
                      return;
                    }
                    runBatchAutoFixPerSku(skus);
                  }}
                  disabled={isAnalyzing || batchAutoFixProgress.isRunning || !bulkAnalysisSkuInput.trim()}
                  className="h-11 px-5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-black rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 active:scale-95 disabled:opacity-50 cursor-pointer"
                  title="Jalankan auto-fix berurutan per batch SKU satu per satu secara iteratif sampai klop"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Mulai Auto-Fix Massal (Per SKU)</span>
                </Button>
                <Button
                  type="button"
                  onClick={handleOpenDeleteTransferForCekSaldo}
                  disabled={isAnalyzing || batchAutoFixProgress.isRunning || (!bulkAnalysisSkuInput.trim() && analyzedSkusList.length === 0)}
                  className="h-11 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center space-x-1.5 active:scale-95 disabled:opacity-50 cursor-pointer"
                  title="Hapus data log gudang TRANSFER (type IN & OUT) untuk daftar SKU yang dianalisis"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Hapus Data Gudang: TRANSFER (Massal)</span>
                </Button>
                {analysisResults.some(r => r.balance < 0) && (
                  <>
                    <Button
                      onClick={() => {
                        const skus = analyzedSkusList.length > 0 ? analyzedSkusList : (analysisSku ? [analysisSku] : []);
                        if (skus.length > 0) {
                          runBatchAutoFixPerSku(skus);
                        }
                      }}
                      disabled={isAnalyzing || batchAutoFixProgress.isRunning || isProcessingRemediation}
                      className="h-11 px-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-black rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 active:scale-95 disabled:opacity-50 cursor-pointer"
                      title="Perbaiki semua selisih secara bertahap satu per satu per batch SKU sampai klop"
                    >
                      <RefreshCw className="h-4 w-4" />
                      <span>Auto-Fix Semua (Per Batch SKU)</span>
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        const deficits = analysisResults.filter(r => r.balance < 0);
                        const lines = deficits.map(d =>
                          formatDeficitReportSentence(d.sku || analysisSku, d.rak, d.tglScan, d.balance, d.totalIn, d.totalOut)
                        );
                        const text = `LAPORAN LEBIH POTONG (${analyzedSkusList.length} SKU):\n` + lines.join('\n');
                        navigator.clipboard.writeText(text);
                        showToast(`${lines.length} baris Laporan Lebih Potong disalin!`, 'success');
                      }}
                      className="h-11 px-4 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl border border-rose-300 shadow-sm transition-all flex items-center justify-center space-x-1.5 active:scale-95 cursor-pointer"
                      title="Salin seluruh baris laporan lebih potong untuk tim"
                    >
                      <Copy className="h-4 w-4" />
                      <span>Copy Laporan Lebih Potong</span>
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Quick Filter in Results */}
        <div className="relative">
          <input
            type="text"
            placeholder="Filter dalam hasil analisis (Cari Rak, Tgl Scan, atau Diagnosa)..."
            value={analysisSearchTerm}
            onChange={(e) => setAnalysisSearchTerm(e.target.value)}
            className="w-full h-11 px-4 pl-11 pr-10 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm bg-white text-sm"
          />
          <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
          {analysisSearchTerm && (
            <button
              type="button"
              onClick={() => setAnalysisSearchTerm('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Quick Stats Cards */}
      {analysisResults.length > 0 && (() => {
        const totalInAll = analysisResults.reduce((sum, r) => sum + r.totalIn, 0);
        const totalOutAll = analysisResults.reduce((sum, r) => sum + r.totalOut, 0);
        const netBalance = totalInAll - totalOutAll;
        const deficitList = analysisResults.filter(r => r.balance < 0);
        const surplusList = analysisResults.filter(r => r.balance > 0);
        const totalDeficitQty = deficitList.reduce((sum, r) => sum + r.balance, 0);
        const totalSurplusQty = surplusList.reduce((sum, r) => sum + r.balance, 0);

        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                <span className="text-[10px] font-black uppercase text-emerald-700 tracking-wider">Total IN</span>
                <p className="text-xl font-black text-emerald-800 mt-0.5">{totalInAll.toLocaleString()}</p>
              </div>
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-center">
                <span className="text-[10px] font-black uppercase text-rose-700 tracking-wider">Total OUT</span>
                <p className="text-xl font-black text-rose-800 mt-0.5">{totalOutAll.toLocaleString()}</p>
              </div>
              <div className={`border rounded-xl p-3 text-center ${netBalance >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-300'}`}>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">Net Saldo Gudang</span>
                <p className={`text-xl font-black mt-0.5 ${netBalance >= 0 ? 'text-blue-800' : 'text-red-700'}`}>
                  {netBalance > 0 ? `+${netBalance.toLocaleString()}` : netBalance.toLocaleString()}
                </p>
              </div>
              <div className={`border rounded-xl p-3 text-center ${deficitList.length > 0 ? 'bg-red-100 border-red-300' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-[10px] font-black uppercase text-red-700 tracking-wider">Defisit / Minus</span>
                <p className="text-xl font-black text-red-800 mt-0.5">
                  {deficitList.length} <span className="text-xs font-normal text-red-600">({totalDeficitQty.toLocaleString()} pcs)</span>
                </p>
              </div>
              <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 text-center">
                <span className="text-[10px] font-black uppercase text-teal-700 tracking-wider">Surplus Stok</span>
                <p className="text-xl font-black text-teal-800 mt-0.5">
                  {surplusList.length} <span className="text-xs font-normal text-teal-600">(+{totalSurplusQty.toLocaleString()} pcs)</span>
                </p>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <button
                type="button"
                onClick={() => setAnalysisFilterTab('ALL')}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                  analysisFilterTab === 'ALL'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Semua Kombinasi ({analysisResults.length})
              </button>
              <button
                type="button"
                onClick={() => setAnalysisFilterTab('DEFICIT')}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                  analysisFilterTab === 'DEFICIT'
                    ? 'bg-red-600 text-white shadow-md'
                    : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                }`}
              >
                <span>Hanya Minus / Selisih ({deficitList.length})</span>
                {deficitList.length > 0 && (
                  <span className="w-2 h-2 rounded-full bg-red-400 animate-ping"></span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setAnalysisFilterTab('SURPLUS')}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                  analysisFilterTab === 'SURPLUS'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                }`}
              >
                Hanya Surplus ({surplusList.length})
              </button>
            </div>
          </div>
        );
      })()}

      {/* Table of Results */}
      <div className="border border-slate-200 rounded-2xl shadow-sm overflow-hidden bg-white">
        <div className="overflow-auto" style={{ maxHeight: '560px' }}>
          <table className="w-full text-sm">
            <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left font-bold text-slate-700 w-48">Lokasi Rak</th>
                <th className="px-4 py-3 text-center font-bold text-slate-700 w-32">Tgl Scan</th>
                <th className="px-3 py-3 text-center font-bold text-slate-700 w-20">IN</th>
                <th className="px-3 py-3 text-center font-bold text-slate-700 w-20">OUT</th>
                <th className="px-4 py-3 text-center font-bold text-slate-700 w-32">Saldo</th>
                <th className="px-4 py-3 text-left font-bold text-slate-700 min-w-[340px]">Diagnosa &amp; Solusi Perbaikan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isAnalyzing ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-slate-500 italic">
                    <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-3 text-blue-500" />
                    Sedang mengaudit histori IN dan OUT seluruh data, mohon tunggu...
                  </td>
                </tr>
              ) : analysisResults.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-slate-500 italic">
                    {analysisSku ? 'Klik "Mulai Analisis" untuk mengaudit saldo stok.' : 'Silakan pilih SKU di atas dan klik "Mulai Analisis".'}
                  </td>
                </tr>
              ) : (
                (() => {
                  const excludedList = excludedScanDates.split(',').map(d => d.trim().toUpperCase()).filter(Boolean);

                  const displayedItems = analysisResults
                    .filter(res => {
                      if (analysisFilterTab === 'DEFICIT' && res.balance >= 0) return false;
                      if (analysisFilterTab === 'SURPLUS' && res.balance <= 0) return false;
                      if (!analysisSearchTerm) return true;
                      const term = analysisSearchTerm.toLowerCase();
                      return (
                        res.sku.toLowerCase().includes(term) ||
                        res.rak.toLowerCase().includes(term) ||
                        res.tglScan.toLowerCase().includes(term) ||
                        res.recommendedAction.toLowerCase().includes(term)
                      );
                    });

                  if (displayedItems.length === 0) {
                    return (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-slate-500 italic">
                          Tidak ada data yang sesuai dengan filter.
                        </td>
                      </tr>
                    );
                  }

                  return displayedItems.map((res, idx) => {
                    const rowKey = res.outTransactions && res.outTransactions.length === 1 && res.outTransactions[0].id
                      ? `${res.rak}|${res.tglScan}|${res.outTransactions[0].id}`
                      : `${res.rak}|${res.tglScan}`;
                    const normResTgl = res.tglScan.toUpperCase();
                    const isExcluded = excludedList.some(excluded => {
                      const normExcluded = formatDateDisplay(excluded).toUpperCase();
                      return normResTgl === normExcluded || normResTgl === excluded.toUpperCase();
                    });

                    const isExpanded = expandedDeficitKeys.has(rowKey);
                    const isMinus = res.balance < 0;
                    const isSurplus = res.balance > 0;

                    const allSurplusOptions = [
                      ...res.availableSurplusesSameRak.map(s => ({
                        label: `[Rak yang Sama] ${res.rak} • Tgl ${s.tglScan} (+${s.surplusQty} pcs)`,
                        rak: s.rak,
                        rawTgl: s.rawTglScan
                      })),
                      ...res.availableSurplusesOtherRak.map(s => ({
                        label: `[Rak Lain] ${s.rak} • Tgl ${s.tglScan} (+${s.surplusQty} pcs)`,
                        rak: s.rak,
                        rawTgl: s.rawTglScan
                      }))
                    ];

                    const currentSelection = singleTargetSelections[rowKey] || (allSurplusOptions.length > 0 ? {
                      targetRak: allSurplusOptions[0].rak,
                      targetRawTglScan: allSurplusOptions[0].rawTgl
                    } : { targetRak: res.rak, targetRawTglScan: res.rawTglScan });

                    return (
                      <React.Fragment key={idx}>
                        <tr
                          className={`transition-colors ${
                            isExcluded
                              ? 'bg-amber-100/60 border-l-4 border-amber-500'
                              : isMinus
                                ? 'bg-red-50/70 border-l-4 border-red-500 hover:bg-red-100/60'
                                : isSurplus
                                  ? 'bg-emerald-50/30 hover:bg-emerald-50/60'
                                  : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="px-4 py-3 text-slate-800">
                            <div className="font-bold">{res.rak}</div>
                            {res.subRaks.size > 0 && !(res.subRaks.size === 1 && res.subRaks.has(res.rak)) && (
                              <div className="text-[10px] text-slate-500 italic mt-0.5">
                                Sub: {Array.from(res.subRaks).join(', ')}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center text-slate-600 font-mono text-xs">
                            <span className="font-semibold">{formatDateDisplay(res.tglScan)}</span>
                            {isExcluded && (
                              <div className="text-[9px] font-black text-amber-700 mt-1 uppercase tracking-tighter bg-amber-200/50 px-1 py-0.5 rounded">
                                Dikecualikan
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center text-emerald-700 font-bold">{res.totalIn.toLocaleString()}</td>
                          <td className="px-3 py-3 text-center text-rose-700 font-bold">{res.totalOut.toLocaleString()}</td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-lg text-xs font-black tracking-wide ${
                                isMinus
                                  ? 'bg-red-600 text-white shadow-sm'
                                  : isSurplus
                                    ? 'bg-emerald-100 text-emerald-800 font-black'
                                    : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {isSurplus ? `+${res.balance.toLocaleString()}` : res.balance.toLocaleString()}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {isMinus ? (
                              <div className="space-y-2 py-1">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-black tracking-wider uppercase ${
                                      res.diagnosticType === 'DEFICIT_FIXABLE_SAME_RAK'
                                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                        : res.diagnosticType === 'DEFICIT_FIXABLE_OTHER_RAK'
                                          ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                                          : 'bg-red-200 text-red-900 border border-red-400'
                                    }`}
                                  >
                                    {res.diagnosticType === 'DEFICIT_FIXABLE_SAME_RAK'
                                      ? 'DAPAT DIALIHKAN (TGL LAIN)'
                                      : res.diagnosticType === 'DEFICIT_FIXABLE_OTHER_RAK'
                                        ? 'DAPAT DIALIHKAN (RAK LAIN)'
                                        : 'LEBIH POTONG MURNI'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const text = formatDeficitReportSentence(res.sku || analysisSku, res.rak, res.tglScan, res.balance, res.totalIn, res.totalOut);
                                      navigator.clipboard.writeText(text);
                                      showToast(`Laporan Lebih Potong disalin: "${text}"`, 'success');
                                    }}
                                    className="px-2 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded border border-rose-200 transition-all flex items-center gap-1 text-[10px] font-bold cursor-pointer"
                                    title="Salin kalimat laporan lebih potong ini"
                                  >
                                    <Copy className="w-3 h-3" />
                                    <span>Salin Laporan</span>
                                  </button>
                                </div>
                                <p className="text-xs text-slate-700 font-medium">
                                  {res.recommendedAction}
                                </p>

                                {/* Action Selector if Surplus Options Available */}
                                {allSurplusOptions.length > 0 && (
                                  <div className="flex flex-wrap items-center gap-2 pt-1">
                                    <select
                                      value={`${currentSelection.targetRak}|||${currentSelection.targetRawTglScan}`}
                                      onChange={(e) => {
                                        const [rak, rawTgl] = e.target.value.split('|||');
                                        setSingleTargetSelections(prev => ({
                                          ...prev,
                                          [rowKey]: { targetRak: rak, targetRawTglScan: rawTgl }
                                        }));
                                      }}
                                      className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[260px]"
                                    >
                                      {allSurplusOptions.map((opt, oIdx) => (
                                        <option key={oIdx} value={`${opt.rak}|||${opt.rawTgl}`}>
                                          {opt.label}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() => handleApplySingleRemediation(res, currentSelection.targetRak, currentSelection.targetRawTglScan)}
                                      disabled={isProcessingRemediation}
                                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
                                    >
                                      {isProcessingRemediation ? 'Menyimpan...' : 'Terapkan Solusi'}
                                    </button>
                                  </div>
                                )}

                                {/* Expand details button */}
                                <div className="pt-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = new Set(expandedDeficitKeys);
                                      if (next.has(rowKey)) next.delete(rowKey);
                                      else next.add(rowKey);
                                      setExpandedDeficitKeys(next);
                                    }}
                                    className="text-[11px] font-bold text-blue-600 hover:text-blue-800 underline flex items-center gap-1 cursor-pointer"
                                  >
                                    <span>{isExpanded ? 'Sembunyikan Rincian OUT' : `Lihat ${res.outTransactions.length} Transaksi OUT Penyebab Minus`}</span>
                                    <ChevronDown className={`h-3 w-3 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                  </button>
                                </div>
                              </div>
                            ) : isSurplus ? (
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded text-[10px] font-black tracking-wider uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  SURPLUS TERSEDIA
                                </span>
                                <span className="text-xs text-slate-600 font-medium">Stok aman (+{res.balance} pcs)</span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 italic">Habis potong pas (0 pcs)</span>
                            )}
                          </td>
                        </tr>

                        {/* Expandable OUT Detail Row */}
                        {isMinus && isExpanded && (
                          <tr className="bg-slate-50 border-b-2 border-slate-200">
                            <td colSpan={6} className="p-3 pl-8">
                              <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-inner space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                                    Rincian Transaksi OUT pada Rak {res.rak} (Tgl Scan {res.tglScan}):
                                  </span>
                                  <span className="text-[11px] text-slate-500">Total {res.outTransactions.length} baris transaksi pemotongan</span>
                                </div>
                                <table className="w-full text-xs">
                                  <thead className="bg-slate-100 text-slate-600">
                                    <tr>
                                      <th className="px-3 py-1.5 text-left">Jam / Waktu</th>
                                      <th className="px-3 py-1.5 text-center">Jumlah OUT</th>
                                      <th className="px-3 py-1.5 text-left">User Pemotong</th>
                                      <th className="px-3 py-1.5 text-left">ID Log Database</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {res.outTransactions.map((tx, tIdx) => (
                                      <tr key={tIdx} className="hover:bg-slate-50">
                                        <td className="px-3 py-1.5 font-mono">{tx.waktu || '-'}</td>
                                        <td className="px-3 py-1.5 text-center font-bold text-rose-600">-{tx.jumlah} pcs</td>
                                        <td className="px-3 py-1.5 text-slate-600">{tx.user || '-'}</td>
                                        <td className="px-3 py-1.5 font-mono text-[10px] text-slate-400">{tx.id}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  });
                })()
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-between items-center text-xs text-slate-500 px-1 py-1 font-medium">
        <span>* Saldo Negatif = Stok pada kombinasi tersebut tidak mencukupi (Lebih Potong).</span>
        <span>* Gunakan &quot;Terapkan Solusi&quot; per baris atau &quot;Auto-Fix (Sampai Klop)&quot; untuk memindahkan secara masal.</span>
      </div>

      {/* MODAL HAPUS DATA GUDANG TRANSFER UNTUK CEK SALDO */}
      <Modal
        isOpen={isDeleteTransferCekSaldoModalOpen}
        onClose={() => {
          if (!isDeletingTransferLogsForCekSaldo) {
            setIsDeleteTransferCekSaldoModalOpen(false);
          }
        }}
        title="Hapus Data Log Gudang: TRANSFER (Type IN & OUT)"
        size="5xl"
        className="w-[96vw] max-w-[1280px]"
      >
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-rose-50 to-amber-50 border border-rose-200 rounded-2xl p-4 flex items-start space-x-3">
            <AlertTriangle className="h-5 w-5 text-rose-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-rose-900 leading-relaxed">
              <p className="font-bold text-rose-950 mb-0.5">Pembersihan Log Gudang TRANSFER:</p>
              <p>
                Menghapus log gudang bertipe TRANSFER (IN maupun OUT) untuk SKU terkait jika terjadi kesalahan pencatatan transfer ganda atau mutasi anomali.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-700">
                Total Ditemukan: <span className="text-blue-700 font-black">{transferLogsForCekSaldo.length}</span> data
              </span>
              <span className="text-xs text-slate-400">|</span>
              <span className="text-xs font-bold text-slate-700">
                Terpilih: <span className="text-rose-700 font-black">{selectedTransferIdsForCekSaldo.size}</span> data
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (selectedTransferIdsForCekSaldo.size === transferLogsForCekSaldo.length) {
                    setSelectedTransferIdsForCekSaldo(new Set());
                  } else {
                    setSelectedTransferIdsForCekSaldo(new Set(transferLogsForCekSaldo.map(l => l.id)));
                  }
                }}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
              >
                {selectedTransferIdsForCekSaldo.size === transferLogsForCekSaldo.length ? 'Batal Pilih Semua' : 'Pilih Semua'}
              </button>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[420px] overflow-y-auto">
            {isLoadingTransferLogsForCekSaldo ? (
              <div className="p-8 text-center text-slate-500 italic text-xs">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-rose-500" />
                Memuat data transfer...
              </div>
            ) : transferLogsForCekSaldo.length === 0 ? (
              <div className="p-8 text-center text-slate-400 italic text-xs">
                Tidak ada data log gudang TRANSFER untuk SKU ini.
              </div>
            ) : (
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 sticky top-0 border-b border-slate-200 text-slate-700 font-bold">
                  <tr>
                    <th className="p-2.5 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={transferLogsForCekSaldo.length > 0 && selectedTransferIdsForCekSaldo.size === transferLogsForCekSaldo.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedTransferIdsForCekSaldo(new Set(transferLogsForCekSaldo.map(l => l.id)));
                          } else {
                            setSelectedTransferIdsForCekSaldo(new Set());
                          }
                        }}
                        className="rounded text-rose-600 focus:ring-rose-500"
                      />
                    </th>
                    <th className="p-2.5">Tanggal &amp; Waktu</th>
                    <th className="p-2.5">SKU / Nama Produk</th>
                    <th className="p-2.5 text-center">Tipe</th>
                    <th className="p-2.5 text-center">Jumlah</th>
                    <th className="p-2.5">Rak / Sub Rak</th>
                    <th className="p-2.5 text-center">Tgl Scan</th>
                    <th className="p-2.5">User</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transferLogsForCekSaldo.map((log, idx) => {
                    const isSelected = selectedTransferIdsForCekSaldo.has(log.id);
                    const isIN = (log.type || '').toUpperCase().includes('IN');
                    return (
                      <tr key={idx} className={isSelected ? 'bg-rose-50/50' : 'hover:bg-slate-50'}>
                        <td className="p-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              const next = new Set(selectedTransferIdsForCekSaldo);
                              if (e.target.checked) next.add(log.id);
                              else next.delete(log.id);
                              setSelectedTransferIdsForCekSaldo(next);
                            }}
                            className="rounded text-rose-600 focus:ring-rose-500"
                          />
                        </td>
                        <td className="p-2.5 font-mono">{log.tgl} {log.waktu}</td>
                        <td className="p-2.5 font-bold text-slate-800">{log.sku}</td>
                        <td className="p-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded font-black text-[10px] ${isIN ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                            {log.type}
                          </span>
                        </td>
                        <td className="p-2.5 text-center font-bold text-slate-900">{log.jumlah}</td>
                        <td className="p-2.5">{log.rak} {log.sub_rak && log.sub_rak !== log.rak ? `(${log.sub_rak})` : ''}</td>
                        <td className="p-2.5 text-center font-mono">{formatDateDisplay(log.tgl_scan) || '-'}</td>
                        <td className="p-2.5 text-slate-500">{log.user_name || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDeleteTransferCekSaldoModalOpen(false)}
              disabled={isDeletingTransferLogsForCekSaldo}
              className="h-10 px-5 rounded-xl text-xs font-bold"
            >
              Batal
            </Button>
            <Button
              type="button"
              onClick={handleExecuteDeleteTransferForCekSaldo}
              disabled={isDeletingTransferLogsForCekSaldo || selectedTransferIdsForCekSaldo.size === 0}
              className="h-10 px-5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isDeletingTransferLogsForCekSaldo ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Menghapus...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>Hapus {selectedTransferIdsForCekSaldo.size} Log Terpilih</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
