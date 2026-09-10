import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Toast } from './ui/Toast';
import { Modal } from './ui/Modal';
import { Download, Upload, FileText, CheckCircle, X, Trash2, Edit2, Lock, ChevronDown, Calendar, Building2, User, Package, Trash, ArrowUpDown, ArrowUp, ArrowDown, Calculator, Search, AlertCircle, RefreshCw, Tag, Database, RotateCcw, ArrowRightLeft, History, Copy, CheckSquare, Square, Filter, Link } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { saveExportHistory } from '../lib/exportHistoryService';
import { ExportHistoryModal } from './ExportHistoryModal';
import { skuConversionService } from '../services/skuConversionService';
import { TransferChainAuditModal } from './TransferChainAuditModal';
import { auditTransferChains, fixTransferChainLinks, ChainAuditSummary, BrokenChainLink } from '../services/transferChainService';

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
  sku_pcs?: string;
  jumlah_pcs?: number;
}

interface ImportProgress {
  isImporting: boolean;
  progress: number;
  total: number;
  current: number;
  message: string;
}

export interface OutTransactionDetail {
  id: string;
  waktu: string;
  jumlah: number;
  user: string;
  tgl_scan: string;
  rak: string;
  sub_rak?: string;
}

export interface SurplusOption {
  rak: string;
  tglScan: string;
  rawTglScan: string;
  surplusQty: number;
}

export interface BalanceAnalysisResult {
  sku: string;
  rak: string;
  subRaks: Set<string>;
  tglScan: string;
  rawTglScan: string;
  totalIn: number;
  totalOut: number;
  balance: number;
  outTransactions: OutTransactionDetail[];
  diagnosticType: 'SURPLUS' | 'BALANCED' | 'DEFICIT_FIXABLE_SAME_RAK' | 'DEFICIT_FIXABLE_OTHER_RAK' | 'DEFICIT_PURE_OVERCUT';
  recommendedAction: string;
  availableSurplusesSameRak: SurplusOption[];
  availableSurplusesOtherRak: SurplusOption[];
}

export type TransferAnomalyType = 'DUPLICATE' | 'INITIAL_MISMATCH' | 'ORPHAN' | 'SAME_RAK' | 'DEFICIT';

export interface TransferAnomalyItem {
  id: string;
  sku: string;
  type: 'IN' | 'OUT';
  gudang: string;
  rak: string;
  sub_rak?: string;
  jumlah: number;
  tgl: string;
  tgl_scan: string;
  waktu: string;
  user?: string;
  created_at?: string;
  anomalyType: TransferAnomalyType;
  anomalyReason: string;
  isRedundantDuplicate: boolean;
  masterId?: string;
  partnerId?: string;
  partnerRak?: string;
  // --- REFERENSI BARANG MASUK / NOTA AWAL ---
  initialReceipt?: {
    id: string;
    rak: string;
    sub_rak?: string;
    jumlah: number;
    tgl: string;
    tgl_scan: string;
    waktu: string;
    gudang: string;
  };
  initialMismatchType?: 'NO_INITIAL' | 'RAK_MISMATCH' | 'DATE_MISMATCH' | 'OVER_QTY' | 'PERFECT_MATCH';
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

// --- Helper: Format Date Display ---
// Ensure strict YYYY-MM-DD display regardless of stored format
export const formatDateDisplay = (dateStr: string): string => {
  if (!dateStr) return '';
  let cleanStr = dateStr.trim();

  // Jika string berisi jam (ada spasi atau T), ambil hanya tanggalnya
  if (cleanStr.includes(' ') || cleanStr.includes('T')) {
    cleanStr = cleanStr.split(/[ T]/)[0];
  }

  // Check for YYYY-MM-DD or YYYY-M-D and normalize to YYYY-MM-DD
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
      if (parseInt(month) > 12 && parseInt(day) <= 12) {
        [day, month] = [month, day];
      }
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  return cleanStr;
};

// --- Helper: Normalize Date Filter ---
export const normalizeFilterDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const cleanStr = dateStr.trim();
  if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(cleanStr)) {
    const parts = cleanStr.split(/[\/-]/);
    let day = parseInt(parts[0]);
    let month = parseInt(parts[1]);
    const year = parts[2];

    if (month > 12 && day <= 12) {
      const temp = day;
      day = month;
      month = temp;
    }

    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return cleanStr;
};

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
  const [subRakProgress, setSubRakProgress] = useState({ current: 0, total: 0 });
  const [isFixingTransferDates, setIsFixingTransferDates] = useState(false);
  const [transferFixProgress, setTransferFixProgress] = useState({ current: 0, total: 0, percent: 0 });

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

  // --- TRANSFER MUTASI PAIRING ---
  interface TransferPairDetail {
    pairId: string;
    role: 'OUT_ORIGIN' | 'IN_DEST';
    partnerId: string;
    partnerRak: string;
    partnerSubRak?: string;
    partnerType: 'IN' | 'OUT';
    sku: string;
    qty: number;
    tgl: string;
    waktu: string;
    tglScan: string;
  }

  const transferPairs = useMemo(() => {
    const pairMap = new Map<string, TransferPairDetail>();

    // Filter candidate transfer entries
    const candidates = filteredEntries.filter(
      entry => (entry.gudang || '').toUpperCase().includes('TRANSFER') || (entry.type === 'MOVE')
    );

    // Group by unique signature: SKU + Normalized Tgl + Waktu + Normalized Tgl Scan + Qty
    const grouped = new Map<string, DatabaseLogEntry[]>();
    candidates.forEach(entry => {
      const normSku = (entry.sku || '').trim().toUpperCase();
      const normTgl = formatDateDisplay(entry.tgl) || (entry.tgl || '').trim();
      const normWaktu = (entry.waktu || '').trim();
      const normTglScan = formatDateDisplay(entry.tgl_scan) || (entry.tgl_scan || '').trim();
      const qty = Number(entry.jumlah || 0);
      const key = `${normSku}|${normTgl}|${normWaktu}|${normTglScan}|${qty}`;

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(entry);
    });

    grouped.forEach((entries, key) => {
      const outItems = entries.filter(e => (e.type || '').toUpperCase() === 'OUT');
      const inItems = entries.filter(e => (e.type || '').toUpperCase() === 'IN');

      const minPairs = Math.min(outItems.length, inItems.length);
      for (let i = 0; i < minPairs; i++) {
        const outItem = outItems[i];
        const inItem = inItems[i];

        pairMap.set(outItem.id, {
          pairId: key,
          role: 'OUT_ORIGIN',
          partnerId: inItem.id,
          partnerRak: inItem.rak,
          partnerSubRak: inItem.sub_rak,
          partnerType: 'IN',
          sku: outItem.sku,
          qty: outItem.jumlah,
          tgl: outItem.tgl,
          waktu: outItem.waktu,
          tglScan: outItem.tgl_scan
        });

        pairMap.set(inItem.id, {
          pairId: key,
          role: 'IN_DEST',
          partnerId: outItem.id,
          partnerRak: outItem.rak,
          partnerSubRak: outItem.sub_rak,
          partnerType: 'OUT',
          sku: inItem.sku,
          qty: inItem.jumlah,
          tgl: inItem.tgl,
          waktu: inItem.waktu,
          tglScan: inItem.tgl_scan
        });
      }
    });

    return pairMap;
  }, [filteredEntries]);

  // --- STOCK BALANCE ANALYSIS & DEFICIT AUDIT STATE ---
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<BalanceAnalysisResult[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisSearchTerm, setAnalysisSearchTerm] = useState('');
  const [analysisSku, setAnalysisSku] = useState('');
  const [analysisFilterTab, setAnalysisFilterTab] = useState<'ALL' | 'DEFICIT' | 'SURPLUS'>('ALL');
  const [expandedDeficitKeys, setExpandedDeficitKeys] = useState<Set<string>>(new Set());
  const [singleTargetSelections, setSingleTargetSelections] = useState<Record<string, { targetRak: string; targetRawTglScan: string }>>({});
  const [isProcessingRemediation, setIsProcessingRemediation] = useState(false);

  // --- REDISTRIBUTION (FIX LEBIH POTONG) STATE ---
  const [isRedistributeModalOpen, setIsRedistributeModalOpen] = useState(false);
  const [redistributeMoves, setRedistributeMoves] = useState<any[]>([]);
  const [isProcessingRedistribution, setIsProcessingRedistribution] = useState(false);
  const [excludedScanDates, setExcludedScanDates] = useState('');

  // --- TRANSFER AUDIT & CLEANUP STATE ---
  const [isTransferAuditModalOpen, setIsTransferAuditModalOpen] = useState(false);
  const [transferAuditSku, setTransferAuditSku] = useState('');
  const [transferAnomalies, setTransferAnomalies] = useState<TransferAnomalyItem[]>([]);
  const [isScanningTransfers, setIsScanningTransfers] = useState(false);
  const [selectedTransferIds, setSelectedTransferIds] = useState<Set<string>>(new Set());
  const [transferFilterTab, setTransferFilterTab] = useState<'ALL' | 'DUPLICATE' | 'INITIAL_MISMATCH' | 'ORPHAN' | 'SAME_RAK' | 'DEFICIT'>('ALL');
  const [transferSearchTerm, setTransferSearchTerm] = useState('');
  const [isDeletingTransfers, setIsDeletingTransfers] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

  // --- TRANSFER CHAIN AUDIT & AUTO-FIX STATE ---
  const [isChainAuditModalOpen, setIsChainAuditModalOpen] = useState(false);
  const [chainAuditSku, setChainAuditSku] = useState('');
  const [chainAuditSummary, setChainAuditSummary] = useState<ChainAuditSummary | null>(null);
  const [isAuditingChain, setIsAuditingChain] = useState(false);
  const [isFixingChain, setIsFixingChain] = useState(false);
  const [selectedChainLinkIds, setSelectedChainLinkIds] = useState<Set<string>>(new Set());
  const [chainFilterTab, setChainFilterTab] = useState<'ALL' | 'TRANSFERS' | 'NON_TRANSFER_OUTS'>('ALL');
  const [chainSearchTerm, setChainSearchTerm] = useState('');

  const handleAnalyzeStockBalance = async (skuToAnalyze: string) => {
    if (!skuToAnalyze) {
      showToast('Silakan pilih atau cari SKU terlebih dahulu untuk melakukan analisis.', 'warning');
      return;
    }

    try {
      setIsAnalyzing(true);
      setAnalysisResults([]);
      setExpandedDeficitKeys(new Set());
      setSingleTargetSelections({});

      showToast('Memulai analisis saldo stok... Ini mungkin memakan waktu untuk data yang besar.', 'info');

      // 1. Fetch relevant logs based on SKU
      let query = supabase
        .from('database_log')
        .select('id, sku, rak, sub_rak, tgl_scan, type, jumlah, waktu, user_name')
        .or('type.ilike.%IN%,type.ilike.%OUT%')
        .order('id', { ascending: true });

      query = query.ilike('sku', skuToAnalyze.trim());
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

        if (allLogs.length > 50000) {
          showToast('Data terlalu besar (>50.000). Hasil dibatasi untuk performa.', 'warning');
          hasMore = false;
        }
      }

      // 2. Aggregate logs: key = `${normSku}|${normRak}|${normTglScan}`
      const balanceMap = new Map<string, BalanceAnalysisResult>();

      allLogs.forEach(log => {
        const normSku = (log.sku || '').trim().toUpperCase();
        const normRak = (log.rak || '').trim().toUpperCase();
        const normSubRak = (log.sub_rak || '').trim().toUpperCase();
        const rawTglScan = (log.tgl_scan || '').trim();
        const normTglScan = formatDateDisplay(rawTglScan) || 'No Date';
        const normType = (log.type || '').trim().toUpperCase();

        if (!normType.includes('IN') && !normType.includes('OUT')) return;
        const finalType = normType.includes('IN') ? 'IN' : 'OUT';

        const key = `${normSku}|${normRak}|${normTglScan}`;

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
            availableSurplusesOtherRak: []
          });
        }

        const result = balanceMap.get(key)!;
        if (normSubRak) result.subRaks.add(normSubRak);

        const jumlah = Number(log.jumlah || 0);

        if (finalType === 'IN') {
          result.totalIn += jumlah;
        } else {
          result.totalOut += jumlah;
          result.outTransactions.push({
            id: log.id,
            waktu: log.waktu || '',
            jumlah: jumlah,
            user: log.user_name || (log as any).user || '',
            tgl_scan: rawTglScan,
            rak: (log.rak || '').trim(),
            sub_rak: (log.sub_rak || '').trim()
          });
        }
        result.balance = result.totalIn - result.totalOut;
      });

      // 3. Smart Diagnostics: identify surplus pools and match deficits
      const allGroups = Array.from(balanceMap.values());
      const surplusGroups = allGroups.filter(g => g.balance > 0);
      const initialSelections: Record<string, { targetRak: string; targetRawTglScan: string }> = {};

      allGroups.forEach(g => {
        const rowKey = `${g.rak}|${g.tglScan}`;
        if (g.balance > 0) {
          g.diagnosticType = 'SURPLUS';
          g.recommendedAction = `Tersedia sisa stok (+${g.balance.toLocaleString()} pcs)`;
        } else if (g.balance === 0) {
          g.diagnosticType = 'BALANCED';
          g.recommendedAction = 'Stok seimbang (Habis potong pas)';
        } else {
          // Deficit / Minus
          const sameRakSurpluses = surplusGroups
            .filter(s => s.rak.toUpperCase() === g.rak.toUpperCase())
            .map(s => ({
              rak: s.rak,
              tglScan: s.tglScan,
              rawTglScan: s.rawTglScan,
              surplusQty: s.balance
            }));

          const otherRakSurpluses = surplusGroups
            .filter(s => s.rak.toUpperCase() !== g.rak.toUpperCase())
            .map(s => ({
              rak: s.rak,
              tglScan: s.tglScan,
              rawTglScan: s.rawTglScan,
              surplusQty: s.balance
            }));

          g.availableSurplusesSameRak = sameRakSurpluses;
          g.availableSurplusesOtherRak = otherRakSurpluses;

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
            g.recommendedAction = `Lebih Potong Murni — Total stok gudang defisit (${g.balance.toLocaleString()} pcs). Tidak ada surplus di tgl/rak lain.`;
          }
        }
      });

      setSingleTargetSelections(initialSelections);

      // 4. Sort: Deficits first (worst negative first), then Surpluses, then Balanced
      allGroups.sort((a, b) => {
        if (a.balance < 0 && b.balance >= 0) return -1;
        if (b.balance < 0 && a.balance >= 0) return 1;
        if (a.balance < 0 && b.balance < 0) return a.balance - b.balance;
        if (a.balance > 0 && b.balance === 0) return -1;
        if (b.balance > 0 && a.balance === 0) return 1;
        return a.rak.localeCompare(b.rak);
      });

      setAnalysisResults(allGroups);

      const deficitCount = allGroups.filter(r => r.balance < 0).length;
      if (deficitCount > 0) {
        setAnalysisFilterTab('DEFICIT'); // Automatically focus on deficits
        showToast(`Analisis selesai! Ditemukan ${deficitCount} kombinasi yang MINUS (Lebih Potong).`, 'warning');
      } else {
        setAnalysisFilterTab('ALL');
        showToast(`Analisis selesai! Seluruh stok SKU ${skuToAnalyze} aman & tidak ada defisit.`, 'success');
      }

    } catch (error) {
      console.error('Analysis failed:', error);
      showToast('Gagal melakukan analisis saldo stok.', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApplySingleRemediation = async (
    item: BalanceAnalysisResult,
    targetRak: string,
    targetRawTglScan: string
  ) => {
    if (!item.outTransactions || item.outTransactions.length === 0) {
      showToast('Tidak ditemukan transaksi OUT untuk dipindahkan.', 'warning');
      return;
    }

    try {
      setIsProcessingRemediation(true);
      const outIds = item.outTransactions.map(t => t.id);

      const updatePayload: any = {
        tgl_scan: targetRawTglScan,
        log_update_user: `DEVMODE: Fix Deficit ${item.rak !== targetRak ? `Move ${item.rak}->${targetRak}` : `Change Date->${targetRawTglScan}`}`
      };

      if (item.rak !== targetRak) {
        updatePayload.rak = targetRak;
        updatePayload.sub_rak = targetRak;
      }

      const { error } = await supabase
        .from('database_log')
        .update(updatePayload)
        .in('id', outIds);

      if (error) throw error;

      showToast(`Sukses memindahkan ${outIds.length} transaksi OUT ke ${item.rak !== targetRak ? `Rak ${targetRak} & ` : ''}Tgl Scan ${formatDateDisplay(targetRawTglScan)}!`, 'success');

      // Refresh analysis & main table
      await handleAnalyzeStockBalance(analysisSku);
      loadLogEntries(currentPage, itemsPerPage, debouncedFilters);
    } catch (err: any) {
      console.error('Error applying single remediation:', err);
      showToast(`Gagal memindahkan data: ${err.message || 'unknown error'}`, 'error');
    } finally {
      setIsProcessingRemediation(false);
    }
  };

  const handlePrepareRedistribute = async () => {
    if (!analysisSku) return;

    try {
      setIsAnalyzing(true);
      showToast('Menghitung rekomendasi pemindahan data...', 'info');

      // 1. Fetch ALL relevant logs for this specific SKU
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
        const rawTgl = (log.tgl_scan || '').trim();
        const normTglScan = formatDateDisplay(rawTgl) || 'No Date';
        const normType = (log.type || '').trim().toUpperCase();
        const finalType = normType.includes('IN') ? 'IN' : 'OUT';
        const key = `${normRak}|${normTglScan}`;

        if (!groups.has(key)) {
          groups.set(key, {
            balance: 0,
            tglScanRaw: rawTgl,
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
            tglScan: rawTgl
          });
        }
      });

      const moves: any[] = [];
      const checkIfExcluded = (g: any) => {
        const normTgl = g.normalizedTglScan.toUpperCase();
        return excludedList.some(excluded => {
          const normExcluded = formatDateDisplay(excluded).toUpperCase();
          return normTgl === normExcluded || normTgl === excluded.toUpperCase();
        });
      };

      const groupList = Array.from(groups.values());

      // Phase 1: Same-Rak Redistribution
      const rakKeys = Array.from(new Set(groupList.map(g => g.rak.toUpperCase())));

      rakKeys.forEach(rakName => {
        const rakGroups = groupList.filter(g => g.rak.toUpperCase() === rakName);
        const surpluses = rakGroups.filter(g => g.balance > 0 && !checkIfExcluded(g)).sort((a, b) => b.balance - a.balance);
        const deficits = rakGroups.filter(g => g.balance < 0 && !checkIfExcluded(g));

        deficits.forEach(negG => {
          const rows = [...negG.outRows].sort((a, b) => b.jumlah - a.jumlah);

          for (const row of rows) {
            if (negG.balance >= 0) break;
            const targetEntry = surpluses.find(tg => tg.balance > 0);
            if (targetEntry) {
              moves.push({
                id: row.id,
                sku: analysisSku,
                rak: negG.rak,
                toRak: targetEntry.rak,
                fromTgl: negG.tglScanRaw,
                toTgl: targetEntry.tglScanRaw,
                jumlah: row.jumlah,
                type: 'SAME_RAK'
              });

              negG.balance += row.jumlah;
              targetEntry.balance -= row.jumlah;
              surpluses.sort((a, b) => b.balance - a.balance);
            }
          }
        });
      });

      // Phase 2: Cross-Rak Redistribution (if deficits still remain and other raks have surplus)
      const remainingDeficits = groupList.filter(g => g.balance < 0 && !checkIfExcluded(g));
      const remainingSurpluses = groupList.filter(g => g.balance > 0 && !checkIfExcluded(g)).sort((a, b) => b.balance - a.balance);

      if (remainingDeficits.length > 0 && remainingSurpluses.length > 0) {
        remainingDeficits.forEach(negG => {
          const rows = [...negG.outRows].filter(r => !moves.some(m => m.id === r.id)).sort((a, b) => b.jumlah - a.jumlah);

          for (const row of rows) {
            if (negG.balance >= 0) break;
            const targetEntry = remainingSurpluses.find(tg => tg.balance > 0);
            if (targetEntry) {
              moves.push({
                id: row.id,
                sku: analysisSku,
                rak: negG.rak,
                toRak: targetEntry.rak,
                fromTgl: negG.tglScanRaw,
                toTgl: targetEntry.tglScanRaw,
                jumlah: row.jumlah,
                type: 'CROSS_RAK'
              });

              negG.balance += row.jumlah;
              targetEntry.balance -= row.jumlah;
              remainingSurpluses.sort((a, b) => b.balance - a.balance);
            }
          }
        });
      }

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

        const promises = batch.map(move => {
          const updatePayload: any = {
            tgl_scan: move.toTgl,
            log_update_user: move.toRak && move.toRak !== move.rak
              ? `DEVMODE: Redistribute Move ${move.rak}->${move.toRak}`
              : `DEVMODE: Redistribute Tgl Scan`
          };

          if (move.toRak && move.toRak !== move.rak) {
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

      showToast(`Sukses memperbarui ${successCount} data log!`, 'success');
      setIsRedistributeModalOpen(false);
      setRedistributeMoves([]);
      handleAnalyzeStockBalance(analysisSku);
      loadLogEntries(currentPage, itemsPerPage, debouncedFilters);
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

  // Global Keyboard Listener: ketik sembarang "devmode" pada keyboard untuk toggle DevMode
  useEffect(() => {
    let devModeSequence = '';
    const targetSequence = 'DEVMODE';

    const handleKeyDown = (event: KeyboardEvent) => {
      // Abaikan jika menekan tombol modifier (Ctrl, Alt, Meta/Cmd)
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === 'Backspace') {
        devModeSequence = devModeSequence.slice(0, -1);
        return;
      }

      if (event.key.length === 1) {
        const char = event.key.toUpperCase();
        devModeSequence += char;

        if (devModeSequence.length > targetSequence.length) {
          devModeSequence = devModeSequence.slice(-targetSequence.length);
        }

        if (devModeSequence === targetSequence) {
          devModeSequence = '';
          setShowFixDates(prev => {
            const next = !prev;
            if (next) {
              localStorage.setItem('devmode', 'true');
              showToast('DevMode Aktif! Tombol Cek Saldo & Audit Transfer ditampilkan.', 'success');
            } else {
              localStorage.removeItem('devmode');
              showToast('DevMode Nonaktif.', 'warning');
            }
            return next;
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // --- TRANSFER AUDIT & CLEANUP LOGIC ---
  const handleScanTransferAnomalies = async (skuToScan?: string) => {
    try {
      setIsScanningTransfers(true);
      setSelectedTransferIds(new Set());
      setTransferAnomalies([]);

      const targetSku = (skuToScan !== undefined ? skuToScan : transferAuditSku).trim();

      // 1. Fetch relevant TRANSFER logs
      let query = supabase
        .from('database_log')
        .select('*')
        .eq('gudang', 'TRANSFER')
        .order('created_at', { ascending: true });

      if (targetSku) {
        query = query.ilike('sku', `%${targetSku}%`);
      } else {
        query = query.limit(3000);
      }

      const { data: transferLogs, error: transferError } = await query;

      if (transferError) {
        console.error('Error fetching transfer logs for audit:', transferError);
        showToast('Gagal memuat log transfer: ' + transferError.message, 'error');
        return;
      }

      if (!transferLogs || transferLogs.length === 0) {
        showToast(targetSku ? `Tidak ada data transfer ditemukan untuk SKU "${targetSku}".` : 'Tidak ada data transfer ditemukan.', 'info');
        setTransferAnomalies([]);
        return;
      }

      // 2. Fetch all BARANG MASUK AWAL (Supplier IN receipts) for the corresponding SKUs
      const skusToFetch = targetSku
        ? [targetSku]
        : Array.from(new Set(transferLogs.map(t => (t.sku || '').trim()).filter(Boolean)));

      const initialReceiptsBySku = new Map<string, any[]>();
      const skuChunkSize = 50;

      for (let i = 0; i < skusToFetch.length; i += skuChunkSize) {
        const chunk = skusToFetch.slice(i, i + skuChunkSize);
        let inQuery = supabase
          .from('database_log')
          .select('*')
          .eq('type', 'IN')
          .neq('gudang', 'TRANSFER')
          .order('created_at', { ascending: true });

        if (targetSku && skusToFetch.length === 1) {
          inQuery = inQuery.ilike('sku', `%${targetSku}%`);
        } else {
          inQuery = inQuery.in('sku', chunk);
        }

        const { data: inData, error: inErr } = await inQuery;
        if (inErr) {
          console.warn('Error fetching initial receipts for transfer audit:', inErr);
        }
        if (inData) {
          inData.forEach(item => {
            const k = (item.sku || '').trim().toUpperCase();
            if (!initialReceiptsBySku.has(k)) initialReceiptsBySku.set(k, []);
            initialReceiptsBySku.get(k)!.push(item);
          });
        }
      }

      // Helper: Find corresponding initial receipt for a transfer row
      const findMatchingInitialReceipt = (row: any) => {
        const normSku = (row.sku || '').trim().toUpperCase();
        const inList = initialReceiptsBySku.get(normSku) || [];
        if (inList.length === 0) return null;

        // Priority 1: Exact match by waktu and (tgl or tgl_scan)
        const exactMatch = inList.find(init =>
          init.waktu && row.waktu && init.waktu.trim() === row.waktu.trim() &&
          (init.tgl === row.tgl || init.tgl_scan === row.tgl_scan)
        );
        if (exactMatch) return exactMatch;

        // Priority 2: Match by waktu alone
        const waktuMatch = inList.find(init =>
          init.waktu && row.waktu && init.waktu.trim() === row.waktu.trim()
        );
        if (waktuMatch) return waktuMatch;

        // Priority 3: Match by (tgl or tgl_scan) and same rak (for OUT)
        const dateRakMatch = inList.find(init =>
          (init.tgl === row.tgl || init.tgl_scan === row.tgl_scan) &&
          ((init.rak || '').trim().toUpperCase() === (row.rak || '').trim().toUpperCase())
        );
        if (dateRakMatch) return dateRakMatch;

        // Priority 4: Closest chronological initial receipt before transfer created_at
        const rowTime = new Date(row.created_at || 0).getTime();
        for (let i = inList.length - 1; i >= 0; i--) {
          const initTime = new Date(inList[i].created_at || 0).getTime();
          if (initTime <= rowTime + 60000) {
            return inList[i];
          }
        }

        return inList[0];
      };

      const detectedAnomalies: TransferAnomalyItem[] = [];
      const processedAnomalyIds = new Set<string>();

      // --- 3. Detect Exact Duplicates ---
      const duplicateGroups = new Map<string, any[]>();
      transferLogs.forEach(row => {
        const normSku = (row.sku || '').trim().toUpperCase();
        const normType = (row.type || '').trim().toUpperCase();
        const normRak = (row.rak || '').trim().toUpperCase();
        const normSubRak = (row.sub_rak || '').trim().toUpperCase();
        const qty = Number(row.jumlah || 0);
        const normTgl = (row.tgl || '').trim();
        const normTglScan = (row.tgl_scan || '').trim();
        const normWaktu = (row.waktu || '').trim();
        const key = `${normSku}|${normType}|${normRak}|${normSubRak}|${qty}|${normTgl}|${normTglScan}|${normWaktu}`;

        if (!duplicateGroups.has(key)) duplicateGroups.set(key, []);
        duplicateGroups.get(key)!.push(row);
      });

      duplicateGroups.forEach((rows) => {
        if (rows.length > 1) {
          rows.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
          const master = rows[0];
          const masterInit = findMatchingInitialReceipt(master);
          const masterInitRef = masterInit ? {
            id: masterInit.id,
            rak: masterInit.rak,
            sub_rak: masterInit.sub_rak,
            jumlah: Number(masterInit.jumlah || 0),
            tgl: masterInit.tgl,
            tgl_scan: masterInit.tgl_scan,
            waktu: masterInit.waktu,
            gudang: masterInit.gudang
          } : undefined;

          const normTime = (w?: string) => (w || '').replace(/[:.]/g, '').trim().slice(0, 4);
          let masterMismatchType: 'NO_INITIAL' | 'RAK_MISMATCH' | 'DATE_MISMATCH' | 'OVER_QTY' | 'PERFECT_MATCH' = 'PERFECT_MATCH';
          let masterMismatchNote = '';

          if (!masterInit) {
            masterMismatchType = 'NO_INITIAL';
            masterMismatchNote = ' • Tidak ada Nota Masuk Awal';
          } else {
            const isOut = (master.type || '').toUpperCase() === 'OUT';
            const isRakDiff = isOut && (master.rak || '').trim().toUpperCase() !== (masterInit.rak || '').trim().toUpperCase();
            const isTimeDiff = Boolean(masterInit.waktu && master.waktu && normTime(master.waktu) !== normTime(masterInit.waktu));
            const isDateDiff = (master.tgl && masterInit.tgl && master.tgl.trim() !== masterInit.tgl.trim()) ||
                               (master.tgl_scan && masterInit.tgl_scan && master.tgl_scan.trim() !== masterInit.tgl_scan.trim()) ||
                               isTimeDiff;

            if (isRakDiff) {
              masterMismatchType = 'RAK_MISMATCH';
              masterMismatchNote = ` • Rak asal (${master.rak}) beda dari Nota Awal (${masterInit.rak})`;
            } else if (isDateDiff) {
              masterMismatchType = 'DATE_MISMATCH';
              masterMismatchNote = ` • Tgl/Waktu (${master.tgl_scan} ${master.waktu || ''}) beda dari Nota Awal (${masterInit.tgl_scan} ${masterInit.waktu || ''})`;
            }
          }

          processedAnomalyIds.add(master.id);
          detectedAnomalies.push({
            id: master.id,
            sku: master.sku,
            type: (master.type || '').toUpperCase() as 'IN' | 'OUT',
            gudang: master.gudang,
            rak: master.rak,
            sub_rak: master.sub_rak,
            jumlah: Number(master.jumlah || 0),
            tgl: master.tgl,
            tgl_scan: master.tgl_scan,
            waktu: master.waktu,
            user: master.user,
            created_at: master.created_at,
            anomalyType: 'DUPLICATE',
            anomalyReason: `Master Asli (Ada ${rows.length - 1} duplikat kembar redundan)${masterMismatchNote}`,
            isRedundantDuplicate: false,
            initialReceipt: masterInitRef,
            initialMismatchType: masterMismatchType
          });

          for (let i = 1; i < rows.length; i++) {
            const dup = rows[i];
            processedAnomalyIds.add(dup.id);
            detectedAnomalies.push({
              id: dup.id,
              sku: dup.sku,
              type: (dup.type || '').toUpperCase() as 'IN' | 'OUT',
              gudang: dup.gudang,
              rak: dup.rak,
              sub_rak: dup.sub_rak,
              jumlah: Number(dup.jumlah || 0),
              tgl: dup.tgl,
              tgl_scan: dup.tgl_scan,
              waktu: dup.waktu,
              user: dup.user,
              created_at: dup.created_at,
              anomalyType: 'DUPLICATE',
              anomalyReason: `Duplikat Redundan #${i} (Salinan kembar dari Master ID: ${master.id.slice(0, 8)})${masterMismatchNote}`,
              isRedundantDuplicate: true,
              masterId: master.id,
              initialReceipt: masterInitRef,
              initialMismatchType: masterMismatchType
            });
          }
        }
      });

      // --- 4. Detect Mismatches Against Initial Receipt (Beda Rak, Beda Tgl, Over-Qty, Tanpa Nota Awal) ---
      const totalOutPerInitialReceipt = new Map<string, number>();
      transferLogs.filter(r => (r.type || '').toUpperCase() === 'OUT').forEach(o => {
        const init = findMatchingInitialReceipt(o);
        if (init) {
          totalOutPerInitialReceipt.set(init.id, (totalOutPerInitialReceipt.get(init.id) || 0) + Number(o.jumlah || 0));
        }
      });

      transferLogs.forEach(row => {
        if (processedAnomalyIds.has(row.id)) return;

        const init = findMatchingInitialReceipt(row);
        const initRef = init ? {
          id: init.id,
          rak: init.rak,
          sub_rak: init.sub_rak,
          jumlah: Number(init.jumlah || 0),
          tgl: init.tgl,
          tgl_scan: init.tgl_scan,
          waktu: init.waktu,
          gudang: init.gudang
        } : undefined;

        if (!init) {
          processedAnomalyIds.add(row.id);
          detectedAnomalies.push({
            id: row.id,
            sku: row.sku,
            type: (row.type || '').toUpperCase() as 'IN' | 'OUT',
            gudang: row.gudang,
            rak: row.rak,
            sub_rak: row.sub_rak,
            jumlah: Number(row.jumlah || 0),
            tgl: row.tgl,
            tgl_scan: row.tgl_scan,
            waktu: row.waktu,
            user: row.user,
            created_at: row.created_at,
            anomalyType: 'INITIAL_MISMATCH',
            anomalyReason: `Tidak ditemukan data Nota Masuk Awal untuk SKU ini`,
            isRedundantDuplicate: false,
            initialReceipt: undefined,
            initialMismatchType: 'NO_INITIAL'
          });
          return;
        }

        const normTime = (w?: string) => (w || '').replace(/[:.]/g, '').trim().slice(0, 4);
        const isOut = (row.type || '').toUpperCase() === 'OUT';
        const isRakMismatch = isOut && (row.rak || '').trim().toUpperCase() !== (init.rak || '').trim().toUpperCase();
        const isTimeDiff = Boolean(init.waktu && row.waktu && normTime(row.waktu) !== normTime(init.waktu));
        const isDateMismatch = (row.tgl && init.tgl && row.tgl.trim() !== init.tgl.trim()) ||
                               (row.tgl_scan && init.tgl_scan && row.tgl_scan.trim() !== init.tgl_scan.trim()) ||
                               isTimeDiff;
        const isOverQty = isOut && ((totalOutPerInitialReceipt.get(init.id) || 0) > Number(init.jumlah || 0));

        if (isRakMismatch) {
          processedAnomalyIds.add(row.id);
          detectedAnomalies.push({
            id: row.id,
            sku: row.sku,
            type: 'OUT',
            gudang: row.gudang,
            rak: row.rak,
            sub_rak: row.sub_rak,
            jumlah: Number(row.jumlah || 0),
            tgl: row.tgl,
            tgl_scan: row.tgl_scan,
            waktu: row.waktu,
            user: row.user,
            created_at: row.created_at,
            anomalyType: 'INITIAL_MISMATCH',
            anomalyReason: `Rak Asal Transfer (${row.rak}) tidak sesuai Rak Nota Masuk Awal (${init.rak})`,
            isRedundantDuplicate: false,
            initialReceipt: initRef,
            initialMismatchType: 'RAK_MISMATCH'
          });
          return;
        }

        if (isDateMismatch) {
          processedAnomalyIds.add(row.id);
          detectedAnomalies.push({
            id: row.id,
            sku: row.sku,
            type: (row.type || '').toUpperCase() as 'IN' | 'OUT',
            gudang: row.gudang,
            rak: row.rak,
            sub_rak: row.sub_rak,
            jumlah: Number(row.jumlah || 0),
            tgl: row.tgl,
            tgl_scan: row.tgl_scan,
            waktu: row.waktu,
            user: row.user,
            created_at: row.created_at,
            anomalyType: 'INITIAL_MISMATCH',
            anomalyReason: `Tgl/Waktu Transfer (${row.tgl_scan} ${row.waktu}) berbeda dari Nota Masuk Awal (${init.tgl_scan} ${init.waktu})`,
            isRedundantDuplicate: false,
            initialReceipt: initRef,
            initialMismatchType: 'DATE_MISMATCH'
          });
          return;
        }

        if (isOverQty) {
          processedAnomalyIds.add(row.id);
          detectedAnomalies.push({
            id: row.id,
            sku: row.sku,
            type: 'OUT',
            gudang: row.gudang,
            rak: row.rak,
            sub_rak: row.sub_rak,
            jumlah: Number(row.jumlah || 0),
            tgl: row.tgl,
            tgl_scan: row.tgl_scan,
            waktu: row.waktu,
            user: row.user,
            created_at: row.created_at,
            anomalyType: 'INITIAL_MISMATCH',
            anomalyReason: `Total Transfer OUT (${totalOutPerInitialReceipt.get(init.id)} pcs) melebihi Qty Nota Masuk (${init.jumlah} pcs)`,
            isRedundantDuplicate: false,
            initialReceipt: initRef,
            initialMismatchType: 'OVER_QTY'
          });
          return;
        }
      });

      // --- 5. Pair Transfers to Detect Orphans & Same-Rak ---
      const pairGroups = new Map<string, any[]>();
      transferLogs.forEach(row => {
        const normSku = (row.sku || '').trim().toUpperCase();
        const qty = Number(row.jumlah || 0);
        const normTgl = (row.tgl || '').trim();
        const normTglScan = (row.tgl_scan || '').trim();
        const normWaktu = (row.waktu || '').trim();
        const sig = `${normSku}|${qty}|${normTgl}|${normTglScan}|${normWaktu}`;

        if (!pairGroups.has(sig)) pairGroups.set(sig, []);
        pairGroups.get(sig)!.push(row);
      });

      pairGroups.forEach((group) => {
        const outs = group.filter(r => (r.type || '').toUpperCase() === 'OUT');
        const ins = group.filter(r => (r.type || '').toUpperCase() === 'IN');

        // Check for Same-Rak transfers (OUT rak == IN rak)
        outs.forEach(o => {
          ins.forEach(i => {
            if ((o.rak || '').trim().toUpperCase() === (i.rak || '').trim().toUpperCase() &&
                (o.sub_rak || '').trim().toUpperCase() === (i.sub_rak || '').trim().toUpperCase()) {
              const oInit = findMatchingInitialReceipt(o);
              const oInitRef = oInit ? {
                id: oInit.id,
                rak: oInit.rak,
                sub_rak: oInit.sub_rak,
                jumlah: Number(oInit.jumlah || 0),
                tgl: oInit.tgl,
                tgl_scan: oInit.tgl_scan,
                waktu: oInit.waktu,
                gudang: oInit.gudang
              } : undefined;

              if (!processedAnomalyIds.has(o.id)) {
                processedAnomalyIds.add(o.id);
                detectedAnomalies.push({
                  id: o.id,
                  sku: o.sku,
                  type: 'OUT',
                  gudang: o.gudang,
                  rak: o.rak,
                  sub_rak: o.sub_rak,
                  jumlah: Number(o.jumlah || 0),
                  tgl: o.tgl,
                  tgl_scan: o.tgl_scan,
                  waktu: o.waktu,
                  user: o.user,
                  created_at: o.created_at,
                  anomalyType: 'SAME_RAK',
                  anomalyReason: `Transfer ke Rak yang Sama (Asal: ${o.rak} -> Tujuan: ${i.rak})`,
                  isRedundantDuplicate: false,
                  partnerId: i.id,
                  partnerRak: i.rak,
                  initialReceipt: oInitRef
                });
              }
              if (!processedAnomalyIds.has(i.id)) {
                processedAnomalyIds.add(i.id);
                detectedAnomalies.push({
                  id: i.id,
                  sku: i.sku,
                  type: 'IN',
                  gudang: i.gudang,
                  rak: i.rak,
                  sub_rak: i.sub_rak,
                  jumlah: Number(i.jumlah || 0),
                  tgl: i.tgl,
                  tgl_scan: i.tgl_scan,
                  waktu: i.waktu,
                  user: i.user,
                  created_at: i.created_at,
                  anomalyType: 'SAME_RAK',
                  anomalyReason: `Transfer dari Rak yang Sama (Asal: ${o.rak} -> Tujuan: ${i.rak})`,
                  isRedundantDuplicate: false,
                  partnerId: o.id,
                  partnerRak: o.rak,
                  initialReceipt: oInitRef
                });
              }
            }
          });
        });

        // Check for Orphans
        if (outs.length > ins.length) {
          const unpairedOuts = outs.slice(ins.length);
          unpairedOuts.forEach(u => {
            if (!processedAnomalyIds.has(u.id)) {
              processedAnomalyIds.add(u.id);
              const uInit = findMatchingInitialReceipt(u);
              detectedAnomalies.push({
                id: u.id,
                sku: u.sku,
                type: 'OUT',
                gudang: u.gudang,
                rak: u.rak,
                sub_rak: u.sub_rak,
                jumlah: Number(u.jumlah || 0),
                tgl: u.tgl,
                tgl_scan: u.tgl_scan,
                waktu: u.waktu,
                user: u.user,
                created_at: u.created_at,
                anomalyType: 'ORPHAN',
                anomalyReason: `Transfer OUT Gantung (Tidak ada pasangan TRANSFER IN)`,
                isRedundantDuplicate: false,
                initialReceipt: uInit ? {
                  id: uInit.id,
                  rak: uInit.rak,
                  sub_rak: uInit.sub_rak,
                  jumlah: Number(uInit.jumlah || 0),
                  tgl: uInit.tgl,
                  tgl_scan: uInit.tgl_scan,
                  waktu: uInit.waktu,
                  gudang: uInit.gudang
                } : undefined
              });
            }
          });
        } else if (ins.length > outs.length) {
          const unpairedIns = ins.slice(outs.length);
          unpairedIns.forEach(u => {
            if (!processedAnomalyIds.has(u.id)) {
              processedAnomalyIds.add(u.id);
              const uInit = findMatchingInitialReceipt(u);
              detectedAnomalies.push({
                id: u.id,
                sku: u.sku,
                type: 'IN',
                gudang: u.gudang,
                rak: u.rak,
                sub_rak: u.sub_rak,
                jumlah: Number(u.jumlah || 0),
                tgl: u.tgl,
                tgl_scan: u.tgl_scan,
                waktu: u.waktu,
                user: u.user,
                created_at: u.created_at,
                anomalyType: 'ORPHAN',
                anomalyReason: `Transfer IN Gantung (Tidak ada pasangan TRANSFER OUT)`,
                isRedundantDuplicate: false,
                initialReceipt: uInit ? {
                  id: uInit.id,
                  rak: uInit.rak,
                  sub_rak: uInit.sub_rak,
                  jumlah: Number(uInit.jumlah || 0),
                  tgl: uInit.tgl,
                  tgl_scan: uInit.tgl_scan,
                  waktu: uInit.waktu,
                  gudang: uInit.gudang
                } : undefined
              });
            }
          });
        }
      });

      setTransferAnomalies(detectedAnomalies);

      const redundantCount = detectedAnomalies.filter(x => x.isRedundantDuplicate).length;
      const mismatchCount = detectedAnomalies.filter(x => x.anomalyType === 'INITIAL_MISMATCH').length;
      if (redundantCount > 0 || mismatchCount > 0) {
        showToast(`Scan selesai: Ditemukan ${detectedAnomalies.length} anomali (${redundantCount} duplikat, ${mismatchCount} beda nota awal).`, 'warning');
      } else if (detectedAnomalies.length > 0) {
        showToast(`Scan selesai: Ditemukan ${detectedAnomalies.length} anomali data transfer.`, 'warning');
      } else {
        showToast('Scan selesai: Semua data transfer telah sesuai dengan data barang masuk nota awal.', 'success');
      }
    } catch (err: any) {
      console.error('Exception scanning transfer anomalies:', err);
      showToast('Terjadi kesalahan saat memeriksa anomali: ' + (err?.message || err), 'error');
    } finally {
      setIsScanningTransfers(false);
    }
  };

  const handleToggleSelectTransfer = (id: string) => {
    setSelectedTransferIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllDuplicates = () => {
    const redundantIds = transferAnomalies
      .filter(item => item.isRedundantDuplicate)
      .map(item => item.id);

    if (redundantIds.length === 0) {
      showToast('Tidak ada duplikat redundan untuk dipilih.', 'info');
      return;
    }

    setSelectedTransferIds(new Set(redundantIds));
    showToast(`${redundantIds.length} baris duplikat redundan berhasil dipilih.`, 'success');
  };

  const handleSelectAllInitialMismatches = () => {
    const mismatchIds = transferAnomalies
      .filter(item => item.anomalyType === 'INITIAL_MISMATCH' || (item.initialMismatchType && item.initialMismatchType !== 'PERFECT_MATCH'))
      .map(item => item.id);

    if (mismatchIds.length === 0) {
      showToast('Tidak ada data beda nota awal untuk dipilih.', 'info');
      return;
    }

    setSelectedTransferIds(new Set(mismatchIds));
    showToast(`${mismatchIds.length} baris anomali beda nota awal berhasil dipilih.`, 'success');
  };

  const handleSelectAllVisible = (visibleIds: string[]) => {
    setSelectedTransferIds(prev => {
      const allSelected = visibleIds.length > 0 && visibleIds.every(id => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        visibleIds.forEach(id => next.delete(id));
      } else {
        visibleIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const handleClearTransferSelection = () => {
    setSelectedTransferIds(new Set());
  };

  const handleSingleDeleteClick = (item: TransferAnomalyItem) => {
    setSelectedTransferIds(new Set([item.id]));
    setIsConfirmDeleteOpen(true);
  };

  const handleDeleteTransferLogs = async (idsToDelete: string[]) => {
    if (idsToDelete.length === 0) return;
    try {
      setIsDeletingTransfers(true);
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
        showToast(`Berhasil menghapus ${successCount} data transfer!`, 'success');
      } else {
        showToast(`Berhasil menghapus ${successCount} data, ${errorCount} gagal`, 'warning');
      }

      const deletedSet = new Set(idsToDelete);
      setTransferAnomalies(prev => prev.filter(item => !deletedSet.has(item.id)));
      setSelectedTransferIds(prev => {
        const next = new Set(prev);
        idsToDelete.forEach(id => next.delete(id));
        return next;
      });

      loadLogEntries(currentPage, itemsPerPage);
      setIsConfirmDeleteOpen(false);
    } catch (err) {
      console.error('Error in handleDeleteTransferLogs:', err);
      showToast('Terjadi kesalahan saat menghapus data transfer', 'error');
    } finally {
      setIsDeletingTransfers(false);
    }
  };

  // --- TRANSFER CHAIN AUDIT & FIX HANDLERS ---
  const handleScanTransferChains = async (skuToScan?: string) => {
    try {
      setIsAuditingChain(true);
      setSelectedChainLinkIds(new Set());
      const target = (skuToScan !== undefined ? skuToScan : chainAuditSku).trim();
      const summary = await auditTransferChains(target);
      setChainAuditSummary(summary);
      
      const totalBroken = summary.brokenTransfers.length + summary.brokenNonTransferOuts.length;
      if (totalBroken > 0) {
        showToast(`Audit Selesai: Ditemukan ${totalBroken} anomali rantai transfer (${summary.brokenTransfers.length} transfer, ${summary.brokenNonTransferOuts.length} potong keluar).`, 'warning');
      } else {
        showToast('Audit Selesai: Rantai transfer sudah teratur dan sesuai alur fisik barang.', 'success');
      }
    } catch (err: any) {
      console.error('Error scanning transfer chains:', err);
      showToast('Gagal audit rantai transfer: ' + (err?.message || err), 'error');
    } finally {
      setIsAuditingChain(false);
    }
  };

  const handleToggleSelectChainLink = (id: string) => {
    setSelectedChainLinkIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllVisibleChainLinks = (visibleIds: string[]) => {
    setSelectedChainLinkIds(prev => {
      const allSelected = visibleIds.length > 0 && visibleIds.every(id => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        visibleIds.forEach(id => next.delete(id));
      } else {
        visibleIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const handleClearChainSelection = () => {
    setSelectedChainLinkIds(new Set());
  };

  const handleFixSelectedChainLinks = async (specificLinks?: BrokenChainLink[]) => {
    if (!chainAuditSummary) return;
    const allBroken = [...chainAuditSummary.brokenTransfers, ...chainAuditSummary.brokenNonTransferOuts];
    const targets = specificLinks || allBroken.filter(l => selectedChainLinkIds.has(l.id));

    if (targets.length === 0) {
      showToast('Pilih setidaknya satu baris anomali untuk diperbaiki.', 'info');
      return;
    }

    if (!confirm(`Apakah Anda yakin ingin memperbaiki ${targets.length} baris log agar rantai rak transfer sesuai fisik barang?`)) {
      return;
    }

    try {
      setIsFixingChain(true);
      const { successCount, errorCount } = await fixTransferChainLinks(targets);
      if (errorCount === 0) {
        showToast(`Berhasil memperbaiki ${successCount} baris rantai transfer!`, 'success');
      } else {
        showToast(`Berhasil memperbaiki ${successCount} baris, ${errorCount} gagal.`, 'warning');
      }

      // Re-scan to update modal and main list
      await handleScanTransferChains(chainAuditSku);
      loadLogEntries(currentPage, itemsPerPage);
    } catch (err: any) {
      console.error('Error fixing transfer chains:', err);
      showToast('Terjadi kesalahan saat memperbaiki rantai: ' + (err?.message || err), 'error');
    } finally {
      setIsFixingChain(false);
    }
  };

  const handleFixAllChainLinks = async () => {
    if (!chainAuditSummary) return;
    const allBroken = [...chainAuditSummary.brokenTransfers, ...chainAuditSummary.brokenNonTransferOuts];
    if (allBroken.length === 0) {
      showToast('Tidak ada anomali rantai transfer yang perlu diperbaiki.', 'info');
      return;
    }
    await handleFixSelectedChainLinks(allBroken);
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

  const sortLogRows = (items: any[]) => {
    const isAscending = sortConfig ? sortConfig.direction === 'asc' : false;

    // 1. Identify and link transfer pairs (same SKU, same quantity, created within 30s)
    const pairedInfo = new Map<string, { groupKey: string; isOut: boolean; time: number }>();
    const transfers = items.filter(i => (i.gudang || '').toUpperCase().includes('TRANSFER'));
    
    const usedIds = new Set<string>();
    const outTransfers = transfers.filter(t => (t.type || '').toUpperCase() === 'OUT');
    const inTransfers = transfers.filter(t => (t.type || '').toUpperCase() === 'IN');

    outTransfers.forEach(outItem => {
      if (usedIds.has(outItem.id)) return;
      const outTime = outItem.created_at ? new Date(outItem.created_at).getTime() : 0;
      const normSku = (outItem.sku || '').trim().toUpperCase();
      const qty = Math.abs(Number(outItem.jumlah || 0));

      let bestIn: any = null;
      let minDiff = Infinity;

      inTransfers.forEach(inItem => {
        if (usedIds.has(inItem.id)) return;
        if ((inItem.sku || '').trim().toUpperCase() !== normSku) return;
        if (Math.abs(Number(inItem.jumlah || 0)) !== qty) return;

        const inTime = inItem.created_at ? new Date(inItem.created_at).getTime() : 0;
        const diff = Math.abs(inTime - outTime);
        if (diff < minDiff && diff <= 30000) {
          minDiff = diff;
          bestIn = inItem;
        }
      });

      if (bestIn) {
        const groupKey = `pair_${outItem.id}_${bestIn.id}`;
        const inTime = bestIn.created_at ? new Date(bestIn.created_at).getTime() : 0;
        const baseTime = Math.max(outTime, inTime);
        pairedInfo.set(outItem.id, { groupKey, isOut: true, time: baseTime });
        pairedInfo.set(bestIn.id, { groupKey, isOut: false, time: baseTime });
        usedIds.add(outItem.id);
        usedIds.add(bestIn.id);
      }
    });

    return [...items].sort((a, b) => {
      // Primary column sort if user clicked a table header
      if (sortConfig) {
        const key = sortConfig.key === 'tgl' ? 'tgl_normalized' : sortConfig.key;
        const aVal = a[key] ?? '';
        const bVal = b[key] ?? '';
        if (aVal !== bVal) {
          if (aVal < bVal) return isAscending ? -1 : 1;
          if (aVal > bVal) return isAscending ? 1 : -1;
        }
      } else {
        // Default sort: tgl_normalized DESC
        const aTgl = a.tgl_normalized || a.tgl || '';
        const bTgl = b.tgl_normalized || b.tgl || '';
        if (aTgl !== bTgl) {
          return aTgl > bTgl ? -1 : 1;
        }
        // waktu DESC
        const aWaktu = a.waktu || '';
        const bWaktu = b.waktu || '';
        if (aWaktu !== bWaktu) {
          return aWaktu > bWaktu ? -1 : 1;
        }
      }

      const aPair = pairedInfo.get(a.id);
      const bPair = pairedInfo.get(b.id);

      // If both belong to the exact same transfer pair:
      // In descending sort (default): IN (Destination) comes above OUT (Source)
      // In ascending sort: OUT (Source) comes before IN (Destination)
      if (aPair && bPair && aPair.groupKey === bPair.groupKey) {
        if (isAscending) {
          return aPair.isOut ? -1 : 1;
        } else {
          return aPair.isOut ? 1 : -1;
        }
      }

      // Secondary: created_at timestamp
      const aCreated = aPair ? aPair.time : (a.created_at ? new Date(a.created_at).getTime() : 0);
      const bCreated = bPair ? bPair.time : (b.created_at ? new Date(b.created_at).getTime() : 0);
      if (aCreated !== bCreated) {
        return aCreated > bCreated ? -1 : 1;
      }

      // Group tie-breaker to prevent transfer pairs from interleaving with other records
      const aKey = aPair ? aPair.groupKey : a.id;
      const bKey = bPair ? bPair.groupKey : b.id;
      if (aKey !== bKey) {
        return aKey > bKey ? -1 : 1;
      }

      return a.id > b.id ? -1 : 1;
    });
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
        query = query
          .order('created_at', { ascending: false })
          .order('id', { ascending: false });
      } else {
        query = query
          .order('tgl_normalized', { ascending: false })
          .order('waktu', { ascending: false })
          .order('created_at', { ascending: false })
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
        const sortedSelected = sortLogRows(allSelectedData);
        
        // Pagination manual di client
        const count = sortedSelected.length;
        const from = (safePage - 1) * safePerPage;
        const to = from + safePerPage;
        const pagedData = sortedSelected.slice(from, to);
        
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

      // Apply transfer-aware chronological sorting
      const sortedData = sortLogRows(mappedData);

      setFilteredEntries(sortedData);
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
      setSubRakProgress({ current: 0, total: 0 });
      showToast('Memulai sinkronisasi Sub Rak = Rak...', 'info');

      // Get total count of problematic rows first
      const { count: totalProblematic } = await supabase
        .from('database_log')
        .select('*', { count: 'exact', head: true })
        .not('rak', 'is', null)
        .neq('rak', '')
        .or('sub_rak.is.null,sub_rak.eq.UTAMA,sub_rak.neq.rak');

      const estimatedTotal = totalProblematic || 1000;
      setSubRakProgress({ current: 0, total: estimatedTotal });

      let totalUpdated = 0;
      let hasMore = true;

      while (hasMore) {
        const { data: records, error: fetchError } = await supabase
          .from('database_log')
          .select('id, rak, sub_rak')
          .not('rak', 'is', null)
          .neq('rak', '')
          .or('sub_rak.is.null,sub_rak.eq.UTAMA,sub_rak.neq.rak')
          .limit(500);

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
        setSubRakProgress({ current: totalUpdated, total: Math.max(estimatedTotal, totalUpdated) });

        if (batchSuccess === 0) {
          break;
        }
      }

      if (totalUpdated > 0) {
        showToast(`Berhasil menyamakan Sub Rak = Rak untuk ${totalUpdated} data secara keseluruhan!`, 'success');
      } else {
        showToast(`Semua data Sub Rak sudah sesuai dengan Rak!`, 'info');
      }

      loadLogEntries(currentPage, itemsPerPage, debouncedFilters);
    } catch (err: any) {
      console.error('Error in handleSyncAllSubRakWithRak:', err);
      showToast(`Gagal menyamakan Sub Rak: ${err.message || 'unknown error'}`, 'error');
    } finally {
      setIsSyncingSubRak(false);
      setSubRakProgress({ current: 0, total: 0 });
    }
  };

  const handleFixAllTransferDates = async () => {
    if (!confirm('Apakah Anda yakin ingin memperhitungkan & menyamakan tgl & tgl_scan SELURUH log TRANSFER (OUT & IN berpasangan) secara otomatis di database_log?')) {
      return;
    }

    try {
      setIsFixingTransferDates(true);
      setTransferFixProgress({ current: 0, total: 0, percent: 0 });
      showToast('Memuat data log TRANSFER dari database...', 'info');

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

      // 2. Fetch original IN receipt logs per unique SKU using fast .in() chunks
      const inReceiptsBySku = new Map<string, any[]>();
      const skuChunkSize = 50;

      for (let i = 0; i < uniqueSkus.length; i += skuChunkSize) {
        const chunkSkus = uniqueSkus.slice(i, i + skuChunkSize);
        const { data: inData, error: inError } = await supabase
          .from('database_log')
          .select('sku, tgl, tgl_scan, waktu, created_at')
          .in('sku', chunkSkus)
          .eq('type', 'IN')
          .neq('gudang', 'TRANSFER')
          .order('created_at', { ascending: true });

        if (inError) {
          console.warn('Error fetching inData in handleFixAllTransferDates:', inError);
        }

        if (inData) {
          inData.forEach(d => {
            const norm = (d.sku || '').trim().toUpperCase();
            if (!inReceiptsBySku.has(norm)) inReceiptsBySku.set(norm, []);
            inReceiptsBySku.get(norm)!.push({
              tgl: d.tgl,
              tgl_scan: d.tgl_scan || d.tgl,
              waktu: d.waktu,
              createdAt: new Date(d.created_at).getTime()
            });
          });
        }
      }

      // Helper to find chronological IN date for a given SKU at/before transferTimestamp
      const findCorrectDate = (normSku: string, transferTimestamp: number) => {
        const list = inReceiptsBySku.get(normSku);
        if (!list || list.length === 0) return null;
        for (let i = list.length - 1; i >= 0; i--) {
          if (list[i].createdAt <= transferTimestamp + 60000) {
            return list[i];
          }
        }
        return list[0];
      };

      // 3. Process TRANSFER rows and match authentic receipts
      const updatesMap = new Map<string, { tgl: string; tgl_scan: string; waktu?: string }>();

      allTransferLogs.forEach(row => {
        const normSku = (row.sku || '').trim().toUpperCase();
        const transferTime = new Date(row.created_at).getTime();
        const matched = findCorrectDate(normSku, transferTime);

        if (matched) {
          const correctTgl = matched.tgl;
          const correctTglScan = matched.tgl_scan;
          const correctWaktu = matched.waktu || row.waktu;

          const needsTglUpdate = row.tgl !== correctTgl;
          const needsScanUpdate = row.tgl_scan !== correctTglScan;
          const needsWaktuUpdate = correctWaktu && row.waktu !== correctWaktu;

          if (needsTglUpdate || needsScanUpdate || needsWaktuUpdate) {
            updatesMap.set(row.id, {
              tgl: correctTgl,
              tgl_scan: correctTglScan,
              waktu: correctWaktu
            });
          }
        }
      });

      const totalToUpdate = updatesMap.size;
      if (totalToUpdate === 0) {
        showToast('Seluruh data log TRANSFER sudah 100% cocok & akurat!', 'success');
        return;
      }

      showToast(`Memperbarui ${totalToUpdate} baris log TRANSFER secara cepat & akurat...`, 'info');
      setTransferFixProgress({ current: 0, total: totalToUpdate, percent: 0 });

      // 4. Ultra-fast bulk update: Group by target payload and update with .in('id', chunkIds)
      const payloadGroups = new Map<string, { tgl: string; tgl_scan: string; waktu?: string; ids: string[] }>();
      updatesMap.forEach((val, id) => {
        const key = `${val.tgl}|||${val.tgl_scan}|||${val.waktu || ''}`;
        if (!payloadGroups.has(key)) {
          payloadGroups.set(key, { tgl: val.tgl, tgl_scan: val.tgl_scan, waktu: val.waktu, ids: [] });
        }
        payloadGroups.get(key)!.ids.push(id);
      });

      let updatedCount = 0;
      const updateChunkSize = 100;

      for (const group of payloadGroups.values()) {
        for (let i = 0; i < group.ids.length; i += updateChunkSize) {
          const chunkIds = group.ids.slice(i, i + updateChunkSize);
          const updatePayload: any = {
            tgl: group.tgl,
            tgl_scan: group.tgl_scan,
            log_update_user: 'DEVMODE: Fix Transfer Date'
          };
          if (group.waktu) {
            updatePayload.waktu = group.waktu;
          }

          const { error: updateError } = await supabase
            .from('database_log')
            .update(updatePayload)
            .in('id', chunkIds);

          if (!updateError) {
            updatedCount += chunkIds.length;
          } else {
            console.error('Error updating chunk in handleFixAllTransferDates:', updateError);
          }

          const percent = Math.min(100, Math.round((updatedCount / totalToUpdate) * 100));
          setTransferFixProgress({
            current: updatedCount,
            total: totalToUpdate,
            percent
          });
          showToast(`Memperbarui data: ${updatedCount} / ${totalToUpdate} (${percent}%)...`, 'info');
        }
      }

      showToast(`Selesai! Berhasil memperbarui ${updatedCount} baris log TRANSFER secara akurat!`, 'success');
      loadLogEntries(currentPage, itemsPerPage, debouncedFilters);
    } catch (err: any) {
      console.error('Error in handleFixAllTransferDates:', err);
      showToast(`Gagal memperbaiki tanggal transfer: ${err.message || 'unknown error'}`, 'error');
    } finally {
      setIsFixingTransferDates(false);
      setTransferFixProgress({ current: 0, total: 0, percent: 0 });
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
                        disabled={isMigrating || isRepairing || isSyncingSubRak || isFixingTransferDates}
                        className="h-12 px-5 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 border border-amber-400/50 disabled:opacity-50 min-w-[120px]"
                      >
                        <ArrowUpDown className={`h-4 w-4 ${isMigrating ? 'animate-spin' : ''}`} />
                        <span className="uppercase text-[10px] font-black">
                          {isMigrating 
                            ? (migrationProgress.total > 0 ? `Fixing ${Math.round((migrationProgress.current / migrationProgress.total) * 100)}%` : 'Fixing...')
                            : 'Fix Date'}
                        </span>
                      </button>
                      <button
                        onClick={handleFixScanDates}
                        disabled={isMigrating || isRepairing || isSyncingSubRak || isFixingTransferDates}
                        className="h-12 px-5 bg-indigo-500 hover:bg-indigo-600 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 border border-indigo-400/50 disabled:opacity-50 min-w-[120px]"
                      >
                        <Calendar className={`h-4 w-4 ${isRepairing ? 'animate-spin' : ''}`} />
                        <span className="uppercase text-[10px] font-black">
                          {isRepairing 
                            ? (migrationProgress.total > 0 ? `Repair ${Math.round((migrationProgress.current / migrationProgress.total) * 100)}%` : 'Repairing...')
                            : 'Fix Scan'}
                        </span>
                      </button>
                      <button
                        onClick={handleSyncAllSubRakWithRak}
                        disabled={isMigrating || isRepairing || isSyncingSubRak || isFixingTransferDates}
                        className="h-12 px-5 bg-teal-600 hover:bg-teal-700 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 border border-teal-400/50 disabled:opacity-50 min-w-[130px]"
                        title="Samakan SEMUA Sub Rak = Rak di database_log"
                      >
                        <RefreshCw className={`h-4 w-4 ${isSyncingSubRak ? 'animate-spin' : ''}`} />
                        <span className="uppercase text-[10px] font-black">
                          {isSyncingSubRak 
                            ? (subRakProgress.total > 0 ? `Sync ${Math.round((subRakProgress.current / subRakProgress.total) * 100)}%` : 'Syncing...')
                            : 'Fix Sub Rak'}
                        </span>
                      </button>
                      <button
                        onClick={handleFixAllTransferDates}
                        disabled={isMigrating || isRepairing || isSyncingSubRak || isFixingTransferDates}
                        className="h-12 px-5 bg-purple-600 hover:bg-purple-700 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 border border-purple-400/50 disabled:opacity-50 min-w-[140px]"
                        title="Perbaiki Tanggal Log TRANSFER (OUT & IN Berpasangan) Sesuai Tanggal Barang Masuk Asli"
                      >
                        <Calendar className={`h-4 w-4 ${isFixingTransferDates ? 'animate-spin' : ''}`} />
                        <span className="uppercase text-[10px] font-black">
                          {isFixingTransferDates 
                            ? `Fixing ${transferFixProgress.percent}%` 
                            : 'Fix Transfer Date'}
                        </span>
                      </button>

                      {/* DEVMODE: CEK SALDO / AUDIT MINUS */}
                      <button
                        onClick={() => {
                          setIsAnalysisModalOpen(true);
                          const targetSku = filters.sku || analysisSku;
                          if (targetSku) {
                            setAnalysisSku(targetSku);
                            handleAnalyzeStockBalance(targetSku);
                          } else {
                            setAnalysisResults([]);
                          }
                        }}
                        className="h-12 px-5 bg-teal-600 hover:bg-teal-500 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 border border-teal-400/30"
                        title="Cek Saldo Stok & Diagnosa Data Minus / Lebih Potong"
                      >
                        <Calculator className="h-4 w-4" />
                        <span className="uppercase text-[10px] font-black">Cek Saldo / Audit Minus</span>
                      </button>

                      {/* DEVMODE: AUDIT TRANSFER (IN/OUT) */}
                      <button
                        onClick={() => {
                          setIsTransferAuditModalOpen(true);
                          const targetSku = filters.sku || transferAuditSku;
                          if (targetSku) {
                            setTransferAuditSku(targetSku);
                            handleScanTransferAnomalies(targetSku);
                          } else {
                            handleScanTransferAnomalies('');
                          }
                        }}
                        className="h-12 px-5 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 border border-indigo-400/30"
                        title="Audit Anomali Data Transfer (Duplikat, Gantung, & Selisih)"
                      >
                        <ArrowRightLeft className="h-4 w-4" />
                        <span className="uppercase text-[10px] font-black">Audit Transfer (IN/OUT)</span>
                      </button>

                      {/* DEVMODE: AUDIT TRANSFER CHAIN */}
                      <button
                        onClick={() => {
                          setIsChainAuditModalOpen(true);
                          const targetSku = filters.sku || chainAuditSku;
                          if (targetSku) {
                            setChainAuditSku(targetSku);
                            handleScanTransferChains(targetSku);
                          } else {
                            handleScanTransferChains('');
                          }
                        }}
                        className="h-12 px-5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 border border-violet-400/40"
                        title="Audit & Perbaiki Rantai Transfer (Chain) & Potong Stok Keluar"
                      >
                        <Link className="h-4 w-4" />
                        <span className="uppercase text-[10px] font-black">Audit Transfer Chain</span>
                      </button>
                    </div>
                  )}

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
                        {dataLoaded && filteredEntries.map((entry, index) => {
                          const pair = transferPairs.get(entry.id);
                          const isSelected = selectedIds.has(entry.id);

                          // Row styling: Selected > Transfer Pair > Adjustment > Zebra
                          const rowClass = isSelected
                            ? 'bg-blue-200 hover:bg-blue-300'
                            : pair
                              ? pair.role === 'OUT_ORIGIN'
                                ? 'bg-purple-50/90 hover:bg-purple-100/90 border-l-4 border-l-purple-600'
                                : 'bg-indigo-50/90 hover:bg-indigo-100/90 border-l-4 border-l-indigo-600'
                              : entry.is_adjustment
                                ? 'bg-amber-50 hover:bg-amber-100'
                                : index % 2 === 0
                                  ? 'bg-blue-50/40 hover:bg-blue-100/60'
                                  : 'bg-white hover:bg-blue-50';

                          return (
                            <tr key={entry.id} className={`${rowClass} border-b border-gray-200 transition-colors`}>
                              <td className="px-3 py-2 text-center border-r border-gray-200 w-12">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleCheckboxChange(entry.id)}
                                  className="w-4 h-4 cursor-pointer"
                                />
                              </td>
                              <td className="px-4 py-2 text-sm text-center border-r border-gray-200 font-medium">
                                {formatDateDisplay(entry.tgl)}
                              </td>
                              <td className="px-4 py-2 text-sm text-center border-r border-gray-200 font-mono">
                                {entry.waktu}
                              </td>
                              <td className="px-4 py-2 text-sm border-r border-gray-200 font-mono">
                                <div className="flex items-center justify-between">
                                  <span className={entry.is_adjustment ? 'font-bold text-amber-800' : 'font-semibold text-gray-900'}>{entry.sku}</span>
                                  {entry.is_adjustment && (
                                    <span className="flex items-center gap-1 bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-2 shadow-sm border border-amber-200 shrink-0">
                                      <Tag className="h-2.5 w-2.5" />
                                      PENYESUAIAN
                                    </span>
                                  )}
                                </div>
                                {(() => {
                                  const conv = entry.sku_pcs
                                    ? { sku_pcs: entry.sku_pcs, qty: entry.jumlah_pcs ? Math.round(entry.jumlah_pcs / (entry.jumlah || 1)) : 1 }
                                    : skuConversionService.findConversion(entry.sku);
                                  if (!conv || !conv.sku_pcs) return null;
                                  const finalQtyPcs = entry.jumlah_pcs !== undefined && entry.jumlah_pcs !== null
                                    ? entry.jumlah_pcs
                                    : (entry.jumlah * Number(conv.qty || 1));
                                  return (
                                    <div className="mt-1 flex items-center gap-1.5 bg-blue-50/90 border border-blue-200/80 rounded px-1.5 py-0.5 text-[11px] text-blue-900 font-sans shadow-xs">
                                      <span className="font-extrabold text-blue-700 bg-blue-100/90 px-1 rounded text-[9px] uppercase tracking-wider">➔ PCS</span>
                                      <span className="font-mono font-bold text-blue-950 truncate max-w-[200px]" title={conv.sku_pcs}>{conv.sku_pcs}</span>
                                      <span className="font-black text-blue-700 ml-auto whitespace-nowrap">({finalQtyPcs} Pcs)</span>
                                    </div>
                                  );
                                })()}
                              </td>
                              <td className="px-4 py-2 text-sm text-center border-r border-gray-200 font-black text-gray-900">
                                {entry.jumlah}
                              </td>
                              <td className="px-4 py-2 text-center border-r border-gray-200">
                                {pair ? (
                                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-black shadow-sm ${
                                    entry.type === 'OUT'
                                      ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                      : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  }`}>
                                    <ArrowRightLeft className="h-3 w-3" />
                                    {entry.type === 'OUT' ? 'OUT (MUTASI)' : 'IN (MUTASI)'}
                                  </span>
                                ) : (
                                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                                    entry.type === 'IN' ? 'bg-green-100 text-green-800' :
                                    entry.type === 'OUT' ? 'bg-red-100 text-red-800' :
                                    'bg-blue-100 text-blue-800'
                                  }`}>
                                    {entry.type}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-sm border-r border-gray-200">
                                {pair ? (
                                  <div className="flex flex-col gap-0.5">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-black bg-purple-600 text-white shadow-sm w-fit">
                                      <ArrowRightLeft className="h-3 w-3" />
                                      TRANSFER
                                    </span>
                                    <span className="text-[10px] text-purple-700 font-bold whitespace-nowrap">
                                      {pair.role === 'OUT_ORIGIN' ? '↗ Dari Rak Asal' : '↘ Ke Rak Tujuan'}
                                    </span>
                                  </div>
                                ) : (
                                  entry.gudang
                                )}
                              </td>
                              <td className="px-4 py-2 text-sm border-r border-gray-200">
                                {pair ? (
                                  <div>
                                    <span className="font-black text-gray-900">{entry.rak}</span>
                                    <div className="text-[10px] font-bold flex items-center gap-1 mt-0.5 whitespace-nowrap">
                                      {pair.role === 'OUT_ORIGIN' ? (
                                        <>
                                          <span className="text-purple-700">Pindah ➔</span>
                                          <span className="bg-purple-200/80 text-purple-900 px-1.5 py-0.2 rounded font-mono font-black">{pair.partnerRak}</span>
                                        </>
                                      ) : (
                                        <>
                                          <span className="text-indigo-700">Terima 🠔</span>
                                          <span className="bg-indigo-200/80 text-indigo-900 px-1.5 py-0.2 rounded font-mono font-black">{pair.partnerRak}</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  entry.rak
                                )}
                              </td>
                              <td
                                className="px-4 py-2 text-sm border-r border-gray-200 cursor-pointer hover:bg-blue-200 transition-colors font-medium"
                                onClick={() => setFilters({ ...filters, tglScan: entry.tgl_scan || '' })}
                                title="Klik untuk filter Tgl Scan"
                              >
                                {formatDateDisplay(entry.tgl_scan)}
                              </td>
                              <td className="px-4 py-2 text-sm border-r border-gray-200 text-gray-600">{entry.user}</td>
                              <td className="px-4 py-2 text-sm border-r border-gray-200 text-gray-600">{entry.sub_rak}</td>
                              <td className="px-4 py-2 text-sm border-r border-gray-200 text-gray-600 font-mono text-xs">{entry.log_update_user}</td>
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
                          );
                        })}
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
                      {dataLoaded && filteredEntries.map((entry, index) => {
                        const pair = transferPairs.get(entry.id);
                        const isSelected = selectedIds.has(entry.id);

                        return (
                          <div
                            key={entry.id}
                            className={`p-4 ${
                              isSelected
                                ? 'bg-blue-100'
                                : pair
                                  ? pair.role === 'OUT_ORIGIN'
                                    ? 'bg-purple-50/80 border-l-4 border-l-purple-600'
                                    : 'bg-indigo-50/80 border-l-4 border-l-indigo-600'
                                  : entry.is_adjustment
                                    ? 'bg-amber-50'
                                    : 'bg-white'
                            } active:bg-blue-50 transition-colors relative`}
                          >
                            {pair && (
                              <div className="mb-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center justify-between shadow-sm">
                                <span className="flex items-center gap-1.5">
                                  <ArrowRightLeft className="h-3.5 w-3.5" />
                                  {pair.role === 'OUT_ORIGIN'
                                    ? `MUTASI KELUAR: ${entry.rak} ➔ ${pair.partnerRak}`
                                    : `MUTASI MASUK: ${entry.rak} 🠔 ${pair.partnerRak}`}
                                </span>
                                <span className="bg-white/20 px-2 py-0.5 rounded text-[10px] font-black">
                                  {pair.qty} PCS
                                </span>
                              </div>
                            )}
                            <div className="flex items-start gap-3">
                              <div className="pt-1">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
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
                                    {(() => {
                                      const conv = entry.sku_pcs
                                        ? { sku_pcs: entry.sku_pcs, qty: entry.jumlah_pcs ? Math.round(entry.jumlah_pcs / (entry.jumlah || 1)) : 1 }
                                        : skuConversionService.findConversion(entry.sku);
                                      if (!conv || !conv.sku_pcs) return null;
                                      const finalQtyPcs = entry.jumlah_pcs !== undefined && entry.jumlah_pcs !== null
                                        ? entry.jumlah_pcs
                                        : (entry.jumlah * Number(conv.qty || 1));
                                      return (
                                        <div className="mt-1.5 flex items-center gap-1.5 bg-blue-50/90 border border-blue-200/80 rounded-md px-2 py-1 text-xs">
                                          <span className="font-extrabold text-blue-700 bg-blue-100 px-1.5 py-0.2 rounded text-[10px] uppercase">➔ PCS</span>
                                          <span className="font-mono font-bold text-blue-950 truncate max-w-[180px]">{conv.sku_pcs}</span>
                                          <span className="font-black text-blue-700 ml-auto whitespace-nowrap">({finalQtyPcs} Pcs)</span>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                  <span className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm ${
                                    entry.type === 'IN' ? 'bg-green-100 text-green-800 border border-green-200' :
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
                                    <p className="text-sm font-bold text-blue-600">
                                      {entry.rak}
                                      {pair && (
                                        <span className="block text-[10px] text-purple-700 font-semibold">
                                          {pair.role === 'OUT_ORIGIN' ? `➔ ke ${pair.partnerRak}` : `🠔 dari ${pair.partnerRak}`}
                                        </span>
                                      )}
                                    </p>
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
                        );
                      })}
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
      {/* Modal Penjelasan Analisis Saldo & Audit Defisit */}
      <Modal
        isOpen={isAnalysisModalOpen}
        onClose={() => setIsAnalysisModalOpen(false)}
        title="Audit & Analisis Saldo Stok (Deteksi Selisih & Lebih Potong)"
        size="5xl"
      >
        <div className="space-y-6">
          {/* Information Banner */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-4 flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-900 leading-relaxed">
              <p className="font-bold text-blue-950 mb-1">Cara Kerja Analisis & Diagnosa Selisih:</p>
              <p>
                Sistem menghitung saldo berdasarkan <strong>SKU + Rak + Tgl Scan</strong> (Saldo = <strong>Total IN - Total OUT</strong>).
                Jika saldo bernilai negatif (<strong>Minus / Defisit</strong>), sistem secara cerdas memeriksa ketersediaan stok surplus di rak yang sama pada tanggal lain, atau di rak lain untuk SKU ini, serta merekomendasikan solusi perbaikan secara otomatis.
              </p>
            </div>
          </div>

          {/* Search & Control Panel */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-2 ml-1">Cari / Pilih SKU</label>
                <FilterDropdown
                  value={analysisSku}
                  onChange={(val) => setAnalysisSku(val)}
                  options={allSkus}
                  placeholder="Ketik nama produk..."
                  loading={dropdownsLoading}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => handleAnalyzeStockBalance(analysisSku)}
                  disabled={isAnalyzing}
                  className="flex-1 h-11 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-black rounded-xl shadow-lg transition-all flex items-center justify-center space-x-2 active:scale-95"
                >
                  {isAnalyzing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                  <span>{isAnalyzing ? 'Menganalisis...' : 'Mulai Analisis'}</span>
                </Button>
                {analysisResults.some(r => r.balance < 0) && (
                  <Button
                    onClick={handlePrepareRedistribute}
                    disabled={isAnalyzing || isProcessingRemediation}
                    className="h-11 px-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-black rounded-xl shadow-lg transition-all flex items-center justify-center space-x-2 active:scale-95"
                    title="Perbaiki semua selisih secara otomatis ke tanggal atau rak yang memiliki surplus"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Auto-Fix Semua</span>
                  </Button>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-2 ml-1">Kecualikan Tgl Scan (Koma)</label>
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
            <div className="overflow-auto" style={{ maxHeight: '520px' }}>
              <table className="w-full text-sm">
                <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left font-bold text-slate-700 w-48">Lokasi Rak</th>
                    <th className="px-4 py-3 text-center font-bold text-slate-700 w-32">Tgl Scan</th>
                    <th className="px-3 py-3 text-center font-bold text-slate-700 w-20">IN</th>
                    <th className="px-3 py-3 text-center font-bold text-slate-700 w-20">OUT</th>
                    <th className="px-4 py-3 text-center font-bold text-slate-700 w-32">Saldo</th>
                    <th className="px-4 py-3 text-left font-bold text-slate-700 min-w-[340px]">Diagnosa & Solusi Perbaikan</th>
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
                        const rowKey = `${res.rak}|${res.tglScan}`;
                        const normResTgl = res.tglScan.toUpperCase();
                        const isExcluded = excludedList.some(excluded => {
                          const normExcluded = formatDateDisplay(excluded).toUpperCase();
                          return normResTgl === normExcluded || normResTgl === excluded.toUpperCase();
                        });

                        const isExpanded = expandedDeficitKeys.has(rowKey);
                        const isMinus = res.balance < 0;
                        const isSurplus = res.balance > 0;

                        // Selection options for this row
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
                                          onClick={() => handleApplySingleRemediation(res, currentSelection.targetRak, currentSelection.targetRawTglScan)}
                                          disabled={isProcessingRemediation}
                                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50"
                                        >
                                          {isProcessingRemediation ? 'Menyimpan...' : 'Terapkan Solusi'}
                                        </button>
                                      </div>
                                    )}

                                    {/* Expand details button */}
                                    <div className="pt-1">
                                      <button
                                        onClick={() => {
                                          const next = new Set(expandedDeficitKeys);
                                          if (next.has(rowKey)) next.delete(rowKey);
                                          else next.add(rowKey);
                                          setExpandedDeficitKeys(next);
                                        }}
                                        className="text-[11px] font-bold text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
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
            <span>* Gunakan "Terapkan Solusi" per baris atau "Auto-Fix Semua" untuk memindahkan secara masal.</span>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={() => setIsAnalysisModalOpen(false)}
              className="h-11 px-8 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all"
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

      <TransferAuditModal
        isOpen={isTransferAuditModalOpen}
        onClose={() => setIsTransferAuditModalOpen(false)}
        anomalies={transferAnomalies}
        isScanning={isScanningTransfers}
        onRescan={handleScanTransferAnomalies}
        selectedIds={selectedTransferIds}
        onToggleSelect={handleToggleSelectTransfer}
        onSelectAllDuplicates={handleSelectAllDuplicates}
        onSelectAllInitialMismatches={handleSelectAllInitialMismatches}
        onSelectAllVisible={handleSelectAllVisible}
        onClearSelection={handleClearTransferSelection}
        onOpenDeleteConfirm={() => setIsConfirmDeleteOpen(true)}
        onSingleDelete={handleSingleDeleteClick}
        onAutoPurgeDuplicates={() => {
          const redundantIds = transferAnomalies
            .filter(item => item.isRedundantDuplicate)
            .map(item => item.id);
          if (redundantIds.length === 0) {
            showToast('Tidak ada duplikat redundan untuk dihapus.', 'info');
            return;
          }
          setSelectedTransferIds(new Set(redundantIds));
          setIsConfirmDeleteOpen(true);
        }}
        skuInput={transferAuditSku}
        setSkuInput={setTransferAuditSku}
        skuOptions={allSkus}
        filterTab={transferFilterTab}
        setFilterTab={setTransferFilterTab}
        searchTerm={transferSearchTerm}
        setSearchTerm={setTransferSearchTerm}
      />

      <TransferDeleteConfirmModal
        isOpen={isConfirmDeleteOpen}
        onClose={() => setIsConfirmDeleteOpen(false)}
        itemsToDelete={transferAnomalies.filter(item => selectedTransferIds.has(item.id))}
        isDeleting={isDeletingTransfers}
        onConfirmDelete={() => handleDeleteTransferLogs(Array.from(selectedTransferIds))}
      />

      <TransferChainAuditModal
        isOpen={isChainAuditModalOpen}
        onClose={() => setIsChainAuditModalOpen(false)}
        summary={chainAuditSummary}
        isScanning={isAuditingChain}
        isFixing={isFixingChain}
        onRescan={handleScanTransferChains}
        selectedIds={selectedChainLinkIds}
        onToggleSelect={handleToggleSelectChainLink}
        onSelectAllVisible={handleSelectAllVisibleChainLinks}
        onClearSelection={handleClearChainSelection}
        onFixSelected={handleFixSelectedChainLinks}
        onFixAll={handleFixAllChainLinks}
        skuInput={chainAuditSku}
        setSkuInput={setChainAuditSku}
        skuOptions={allSkus}
        filterTab={chainFilterTab}
        setFilterTab={setChainFilterTab}
        searchTerm={chainSearchTerm}
        setSearchTerm={setChainSearchTerm}
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
          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-800">
            <p className="font-bold mb-1">Rencana Pemindahan Otomatis:</p>
            <p>
              Sistem akan memindahkan transaksi <strong>OUT</strong> yang menyebabkan saldo negatif ke baris data yang memiliki saldo sisa (Surplus), baik pada Tgl Scan lain maupun Rak lain yang sesuai.
            </p>
          </div>
        </div>

        <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="max-h-[400px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  <th className="px-4 py-2.5 text-left">SKU & Jenis Aksi</th>
                  <th className="px-4 py-2.5 text-left">Dari (Asal)</th>
                  <th className="px-4 py-2.5 text-left">Ke (Tujuan Surplus)</th>
                  <th className="px-4 py-2.5 text-center">Qty Dipindah</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {moves.map((m, i) => {
                  const isCrossRak = m.toRak && m.toRak !== m.rak;
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <div className="font-bold text-slate-900">{m.sku}</div>
                        <span className={`inline-block mt-0.5 text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${
                          isCrossRak ? 'bg-indigo-100 text-indigo-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {isCrossRak ? 'PINDAH RAK & TGL' : 'GANTI TGL SCAN'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">
                        <div className="font-medium">Rak: {m.rak}</div>
                        <div className="text-xs text-red-500 font-mono">Tgl: {m.fromTgl || '(KOSONG)'}</div>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">
                        <div className="font-bold text-emerald-700">Rak: {m.toRak || m.rak}</div>
                        <div className="text-xs text-emerald-600 font-mono font-bold">Tgl: {m.toTgl || '(KOSONG)'}</div>
                      </td>
                      <td className="px-4 py-2.5 text-center font-black text-blue-700">{m.jumlah} pcs</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-200">
          <div className="text-sm font-medium text-gray-700">
            Total Rekomendasi: <span className="text-blue-600 font-bold">{moves.length} baris transaksi</span>
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

// --- TRANSFER AUDIT & CLEANUP MODAL ---
interface TransferAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  anomalies: TransferAnomalyItem[];
  isScanning: boolean;
  onRescan: (sku?: string) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAllDuplicates: () => void;
  onSelectAllInitialMismatches: () => void;
  onSelectAllVisible: (ids: string[]) => void;
  onClearSelection: () => void;
  onOpenDeleteConfirm: () => void;
  onSingleDelete: (item: TransferAnomalyItem) => void;
  onAutoPurgeDuplicates: () => void;
  skuInput: string;
  setSkuInput: (sku: string) => void;
  skuOptions: string[];
  filterTab: 'ALL' | 'DUPLICATE' | 'INITIAL_MISMATCH' | 'ORPHAN' | 'SAME_RAK' | 'DEFICIT';
  setFilterTab: (tab: 'ALL' | 'DUPLICATE' | 'INITIAL_MISMATCH' | 'ORPHAN' | 'SAME_RAK' | 'DEFICIT') => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
}

function TransferAuditModal({
  isOpen,
  onClose,
  anomalies,
  isScanning,
  onRescan,
  selectedIds,
  onToggleSelect,
  onSelectAllDuplicates,
  onSelectAllInitialMismatches,
  onSelectAllVisible,
  onClearSelection,
  onOpenDeleteConfirm,
  onSingleDelete,
  onAutoPurgeDuplicates,
  skuInput,
  setSkuInput,
  skuOptions,
  filterTab,
  setFilterTab,
  searchTerm,
  setSearchTerm
}: TransferAuditModalProps) {
  const filteredList = useMemo(() => {
    return anomalies.filter(item => {
      if (filterTab === 'INITIAL_MISMATCH') {
        const hasMismatch = item.anomalyType === 'INITIAL_MISMATCH' ||
          (item.initialMismatchType && item.initialMismatchType !== 'PERFECT_MATCH');
        if (!hasMismatch) return false;
      }
      if (filterTab === 'DUPLICATE' && item.anomalyType !== 'DUPLICATE') return false;
      if (filterTab === 'ORPHAN' && item.anomalyType !== 'ORPHAN') return false;
      if (filterTab === 'SAME_RAK' && item.anomalyType !== 'SAME_RAK') return false;
      if (filterTab === 'DEFICIT' && item.anomalyType !== 'DEFICIT') return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchSku = (item.sku || '').toLowerCase().includes(q);
        const matchRak = (item.rak || '').toLowerCase().includes(q);
        const matchSub = (item.sub_rak || '').toLowerCase().includes(q);
        const matchId = (item.id || '').toLowerCase().includes(q);
        const matchReason = (item.anomalyReason || '').toLowerCase().includes(q);
        const matchInitRak = (item.initialReceipt?.rak || '').toLowerCase().includes(q);
        return matchSku || matchRak || matchSub || matchId || matchReason || matchInitRak;
      }
      return true;
    });
  }, [anomalies, filterTab, searchTerm]);

  const totalCount = anomalies.length;
  const initialMismatchCount = anomalies.filter(a =>
    a.anomalyType === 'INITIAL_MISMATCH' ||
    (a.initialMismatchType && a.initialMismatchType !== 'PERFECT_MATCH')
  ).length;
  const redundantDuplicatesCount = anomalies.filter(a => a.isRedundantDuplicate).length;
  const orphanCount = anomalies.filter(a => a.anomalyType === 'ORPHAN').length;
  const sameRakCount = anomalies.filter(a => a.anomalyType === 'SAME_RAK').length;
  const deficitCount = anomalies.filter(a => a.anomalyType === 'DEFICIT').length;

  const visibleIds = useMemo(() => filteredList.map(a => a.id), [filteredList]);
  const isAllVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Audit & Pembersihan Anomali Data TRANSFER (IN & OUT)" size="5xl">
      <div className="space-y-4 max-h-[85vh] flex flex-col">
        {/* Banner Penjelasan */}
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 p-4 rounded-2xl flex items-start space-x-3.5 shadow-sm">
          <div className="p-2 bg-indigo-600 rounded-xl text-white shadow-md mt-0.5">
            <ArrowRightLeft className="h-5 w-5" />
          </div>
          <div className="text-xs text-indigo-950 space-y-1">
            <p className="font-bold text-sm text-indigo-900">Audit Data Transfer Berdasarkan Nota Masuk Awal (Supplier IN)</p>
            <p className="text-indigo-800 leading-relaxed">
              Logika transfer mencocokkan data transfer dengan <strong>Nota Masuk Awal</strong>: SKU, Rak Asal, Tanggal Scan, dan Waktu harus selaras.
              Sistem mendeteksi <span className="font-bold text-rose-700">Beda Nota Awal</span> (rak/tgl/waktu tidak cocok atau fiktif),{' '}
              <span className="font-bold text-red-700">Duplikat Redundan</span> (double submit/scan),{' '}
              <span className="font-bold text-amber-700">Transfer Gantung</span> (tanpa pasangan IN/OUT), dan{' '}
              <span className="font-bold text-purple-700">Transfer Rak Sama</span>.
            </p>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-5">
              <label className="block text-[11px] font-black text-slate-600 uppercase mb-1 ml-0.5 tracking-wider">
                Filter Berdasarkan SKU
              </label>
              <FilterDropdown
                value={skuInput}
                onChange={(val) => setSkuInput(val)}
                options={skuOptions}
                placeholder="Pilih SKU atau kosongkan untuk scan semua..."
              />
            </div>
            <div className="md:col-span-4">
              <label className="block text-[11px] font-black text-slate-600 uppercase mb-1 ml-0.5 tracking-wider">
                Cari Kata Kunci (Teks Bebas)
              </label>
              <div className="relative">
                <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari SKU, Rak, ID, atau catatan..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                />
              </div>
            </div>
            <div className="md:col-span-3 flex gap-2">
              <Button
                onClick={() => onRescan(skuInput)}
                disabled={isScanning}
                className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 active:scale-95 cursor-pointer"
              >
                {isScanning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span>{isScanning ? 'Memindai...' : 'Mulai Scan'}</span>
              </Button>
            </div>
          </div>
        </div>

        {/* 6 Metric Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
          <div className="bg-slate-100/80 border border-slate-200 p-3 rounded-xl">
            <div className="text-[10px] uppercase font-bold text-slate-500">Total Anomali</div>
            <div className="text-xl font-black text-slate-800 mt-0.5">{totalCount} <span className="text-xs font-normal">baris</span></div>
          </div>
          <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl">
            <div className="text-[10px] uppercase font-bold text-rose-700">Beda Nota Awal</div>
            <div className="text-xl font-black text-rose-700 mt-0.5">{initialMismatchCount} <span className="text-xs font-normal">baris</span></div>
          </div>
          <div className="bg-red-50 border border-red-200 p-3 rounded-xl">
            <div className="text-[10px] uppercase font-bold text-red-600">Duplikat Redundan</div>
            <div className="text-xl font-black text-red-700 mt-0.5">{redundantDuplicatesCount} <span className="text-xs font-normal">baris</span></div>
          </div>
          <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl">
            <div className="text-[10px] uppercase font-bold text-amber-600">Transfer Gantung</div>
            <div className="text-xl font-black text-amber-700 mt-0.5">{orphanCount} <span className="text-xs font-normal">baris</span></div>
          </div>
          <div className="bg-purple-50 border border-purple-200 p-3 rounded-xl">
            <div className="text-[10px] uppercase font-bold text-purple-600">Rak Sama (Loop)</div>
            <div className="text-xl font-black text-purple-700 mt-0.5">{sameRakCount} <span className="text-xs font-normal">baris</span></div>
          </div>
          <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl">
            <div className="text-[10px] uppercase font-bold text-blue-600">Terpilih Dihapus</div>
            <div className="text-xl font-black text-blue-700 mt-0.5">{selectedIds.size} <span className="text-xs font-normal">baris</span></div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
          <button
            onClick={() => setFilterTab('ALL')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filterTab === 'ALL' ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Semua ({totalCount})
          </button>
          <button
            onClick={() => setFilterTab('INITIAL_MISMATCH')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filterTab === 'INITIAL_MISMATCH' ? 'bg-rose-700 text-white shadow-sm' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
            }`}
          >
            Beda Nota Awal ({initialMismatchCount})
          </button>
          <button
            onClick={() => setFilterTab('DUPLICATE')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filterTab === 'DUPLICATE' ? 'bg-red-600 text-white shadow-sm' : 'bg-red-50 text-red-700 hover:bg-red-100'
            }`}
          >
            Duplikat Redundan ({redundantDuplicatesCount})
          </button>
          <button
            onClick={() => setFilterTab('ORPHAN')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filterTab === 'ORPHAN' ? 'bg-amber-600 text-white shadow-sm' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
            }`}
          >
            Transfer Gantung ({orphanCount})
          </button>
          <button
            onClick={() => setFilterTab('SAME_RAK')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filterTab === 'SAME_RAK' ? 'bg-purple-600 text-white shadow-sm' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
            }`}
          >
            Rak Sama ({sameRakCount})
          </button>
          {deficitCount > 0 && (
            <button
              onClick={() => setFilterTab('DEFICIT')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filterTab === 'DEFICIT' ? 'bg-yellow-600 text-white shadow-sm' : 'bg-yellow-50 text-yellow-800 hover:bg-yellow-100'
              }`}
            >
              Defisit ({deficitCount})
            </button>
          )}
        </div>

        {/* Interactive Table */}
        <div className="border border-slate-200 rounded-xl overflow-hidden flex-1 overflow-y-auto min-h-[300px] max-h-[460px]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-3 py-2.5 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={isAllVisibleSelected}
                    onChange={() => onSelectAllVisible(visibleIds)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                    title="Pilih semua yang tampil"
                  />
                </th>
                <th className="px-3 py-2.5">Diagnosa & Masalah</th>
                <th className="px-3 py-2.5">SKU</th>
                <th className="px-3 py-2.5 min-w-[210px]">📦 Barang Masuk Awal (Nota Asli)</th>
                <th className="px-3 py-2.5 min-w-[210px]">🔄 Data Transfer Terdata</th>
                <th className="px-3 py-2.5">ID Log</th>
                <th className="px-3 py-2.5 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white font-sans">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400 italic">
                    {isScanning ? 'Sedang memindai data...' : 'Tidak ada data transfer anomali yang cocok dengan filter.'}
                  </td>
                </tr>
              ) : (
                filteredList.map((item) => {
                  const isChecked = selectedIds.has(item.id);
                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        item.isRedundantDuplicate
                          ? 'bg-rose-50/40'
                          : isChecked
                          ? 'bg-indigo-50/40'
                          : ''
                      }`}
                    >
                      <td className="px-3 py-2 text-center align-top pt-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => onToggleSelect(item.id)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-2 align-top pt-2.5">
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap gap-1">
                            {item.anomalyType === 'DUPLICATE' && (
                              item.isRedundantDuplicate ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200">
                                  DUPLIKAT REDUNDAN
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-slate-200 text-slate-700 border border-slate-300">
                                  MASTER DUPLIKAT
                                </span>
                              )
                            )}
                            {item.anomalyType === 'INITIAL_MISMATCH' && (
                              <>
                                {item.initialMismatchType === 'NO_INITIAL' && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200">
                                    TANPA NOTA AWAL
                                  </span>
                                )}
                                {item.initialMismatchType === 'RAK_MISMATCH' && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-orange-100 text-orange-800 border border-orange-200">
                                    BEDA RAK NOTA
                                  </span>
                                )}
                                {item.initialMismatchType === 'DATE_MISMATCH' && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200">
                                    BEDA TGL / WAKTU
                                  </span>
                                )}
                                {item.initialMismatchType === 'OVER_QTY' && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-red-100 text-red-800 border border-red-200">
                                    OVER QTY NOTA
                                  </span>
                                )}
                              </>
                            )}
                            {item.anomalyType === 'ORPHAN' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200">
                                GANTUNG / TANPA PASANGAN
                              </span>
                            )}
                            {item.anomalyType === 'SAME_RAK' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-200">
                                TRANSFER RAK SAMA
                              </span>
                            )}
                            {item.anomalyType === 'DEFICIT' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-yellow-100 text-yellow-800 border border-yellow-200">
                                DEFISIT STOK
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-600 font-medium leading-tight">
                            {item.anomalyReason}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top pt-2.5">
                        <span className="font-mono font-bold text-slate-800 text-[11px] block">
                          {item.sku}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top pt-2">
                        {item.initialReceipt ? (
                          <div className="bg-emerald-50/60 border border-emerald-200 rounded-lg p-2 text-xs space-y-1 shadow-2xs">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-emerald-950 text-[11px]">
                                Rak: {item.initialReceipt.rak}
                                {item.initialReceipt.sub_rak && item.initialReceipt.sub_rak !== item.initialReceipt.rak && (
                                  <span className="text-[10px] text-emerald-700 font-normal ml-1">({item.initialReceipt.sub_rak})</span>
                                )}
                              </span>
                              <span className="font-black text-emerald-700 text-[11px]">
                                +{item.initialReceipt.jumlah}
                              </span>
                            </div>
                            <div className="text-[10px] text-emerald-800 font-mono flex items-center gap-1.5">
                              <span>📅 {item.initialReceipt.tgl_scan || item.initialReceipt.tgl}</span>
                              <span>⏰ {item.initialReceipt.waktu || '-'}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-rose-50 border border-rose-200 rounded-lg p-2 text-center text-[10px] font-bold text-rose-700">
                            ❌ TIDAK ADA NOTA AWAL
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top pt-2">
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs space-y-1 shadow-2xs">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-1.5">
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                                item.type === 'OUT' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                              }`}>
                                {item.type}
                              </span>
                              <span className="font-bold text-slate-800 text-[11px]">
                                Rak: {item.rak}
                                {item.sub_rak && item.sub_rak !== item.rak && (
                                  <span className="text-[10px] text-slate-500 font-normal ml-1">({item.sub_rak})</span>
                                )}
                              </span>
                            </div>
                            <span className={`font-black text-[11px] ${
                              item.type === 'OUT' ? 'text-rose-600' : 'text-emerald-600'
                            }`}>
                              {item.type === 'OUT' ? `-${item.jumlah}` : `+${item.jumlah}`}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5">
                            <span>📅 {item.tgl_scan || item.tgl}</span>
                            <span>⏰ {item.waktu || '-'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px] text-slate-400 align-top pt-3">
                        <span title={item.id}>{item.id.slice(0, 8)}...</span>
                      </td>
                      <td className="px-3 py-2 text-center align-top pt-2.5">
                        <button
                          onClick={() => onSingleDelete(item)}
                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-100/60 rounded-lg transition-colors cursor-pointer"
                          title="Hapus baris transfer ini"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer & Action Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
          <div className="flex items-center space-x-2 text-xs text-slate-600">
            <span className="font-bold">Terpilih: <span className="text-indigo-600 font-black">{selectedIds.size}</span> dari {totalCount} baris</span>
            {selectedIds.size > 0 && (
              <button
                onClick={onClearSelection}
                className="text-xs text-slate-500 hover:text-slate-800 underline ml-2 cursor-pointer"
              >
                Batal Pilih
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {initialMismatchCount > 0 && (
              <Button
                onClick={onSelectAllInitialMismatches}
                variant="secondary"
                className="h-9 px-3.5 text-xs font-bold border-rose-300 text-rose-700 hover:bg-rose-50 cursor-pointer"
              >
                <AlertCircle className="h-3.5 w-3.5 mr-1" />
                Pilih Semua Beda Nota ({initialMismatchCount})
              </Button>
            )}

            {redundantDuplicatesCount > 0 && (
              <>
                <Button
                  onClick={onSelectAllDuplicates}
                  variant="secondary"
                  className="h-9 px-3.5 text-xs font-bold border-red-300 text-red-700 hover:bg-red-50 cursor-pointer"
                >
                  <Copy className="h-3.5 w-3.5 mr-1" />
                  Pilih Semua Duplikat ({redundantDuplicatesCount})
                </Button>
                <Button
                  onClick={onAutoPurgeDuplicates}
                  className="h-9 px-3.5 text-xs font-black bg-red-600 hover:bg-red-700 text-white shadow-sm cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Hapus Duplikat Otomatis
                </Button>
              </>
            )}

            {selectedIds.size > 0 && (
              <Button
                onClick={onOpenDeleteConfirm}
                className="h-9 px-4 text-xs font-black bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 text-white shadow-md cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Hapus Terpilih ({selectedIds.size})
              </Button>
            )}

            <Button
              onClick={onClose}
              variant="secondary"
              className="h-9 px-5 text-xs font-bold cursor-pointer"
            >
              Tutup
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// --- TRANSFER DELETE CONFIRMATION MODAL ---
interface TransferDeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemsToDelete: TransferAnomalyItem[];
  isDeleting: boolean;
  onConfirmDelete: () => void;
}

function TransferDeleteConfirmModal({
  isOpen,
  onClose,
  itemsToDelete,
  isDeleting,
  onConfirmDelete
}: TransferDeleteConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Konfirmasi Penghapusan Log Transfer" size="xl">
      <div className="space-y-4">
        <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-rose-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-rose-900">
            <p className="font-bold mb-1">Peringatan Penghapusan Permanen:</p>
            <p>
              Anda akan menghapus sebanyak <strong>{itemsToDelete.length} baris</strong> transaksi log transfer dari tabel database. Data yang sudah dihapus tidak dapat dipulihkan kembali.
            </p>
          </div>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[300px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 font-bold text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left">SKU</th>
                <th className="px-3 py-2 text-center">Type</th>
                <th className="px-3 py-2 text-left">Rak</th>
                <th className="px-3 py-2 text-center">Qty</th>
                <th className="px-3 py-2 text-left">Tgl & Waktu</th>
                <th className="px-3 py-2 text-left">Alasan Anomali</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {itemsToDelete.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="px-3 py-1.5 font-bold font-mono text-slate-800">{item.sku}</td>
                  <td className="px-3 py-1.5 text-center">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                      item.type === 'IN' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {item.type}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-slate-600">{item.rak}</td>
                  <td className="px-3 py-1.5 text-center font-bold text-slate-800">{item.jumlah}</td>
                  <td className="px-3 py-1.5 font-mono text-[10px] text-slate-500">
                    {item.tgl} ({item.waktu || '-'})
                  </td>
                  <td className="px-3 py-1.5 text-slate-600 text-[10px]">{item.anomalyReason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
          <span className="text-xs text-slate-600 font-medium">
            Total Akan Dihapus: <strong className="text-rose-600">{itemsToDelete.length} Baris</strong>
          </span>
          <div className="flex space-x-2">
            <Button onClick={onClose} variant="secondary" disabled={isDeleting} className="h-9 px-4 text-xs">
              Batalkan
            </Button>
            <Button
              onClick={onConfirmDelete}
              disabled={isDeleting}
              className="h-9 px-5 text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg shadow flex items-center space-x-1.5"
            >
              {isDeleting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              <span>{isDeleting ? 'Menghapus...' : `Ya, Hapus Permanen (${itemsToDelete.length})`}</span>
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