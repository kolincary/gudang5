import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Toast } from './ui/Toast';
import { Modal } from './ui/Modal';
import { Download, Upload, FileText, CheckCircle, Check, CheckCheck, X, Trash2, Edit2, Lock, ChevronDown, Calendar, CalendarX, Building2, User, UserCheck, Package, Trash, ArrowUpDown, ArrowUp, ArrowDown, Calculator, Search, AlertCircle, RefreshCw, Tag, Database, RotateCcw, ArrowRightLeft, History, Copy, CheckSquare, Square, Filter, Link, Layers, AlertTriangle, Wrench, Settings, Sparkles, Clipboard, ListFilter } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { saveExportHistory } from '../lib/exportHistoryService';
import { ExportHistoryModal } from './ExportHistoryModal';
import { skuConversionService } from '../services/skuConversionService';
import { TransferChainAuditModal } from './TransferChainAuditModal';
import { auditTransferChains, fixTransferChainLinks, ChainAuditSummary, BrokenChainLink } from '../services/transferChainService';
import { TransferPurgeModal } from './TransferPurgeModal';
import { TransferPurgeItem, TransferPurgeScanResult, scanTransferLogs, deleteTransferLogs, parseMultipleSkus } from '../services/transferPurgeService';
import { SyncOutRakModal } from './SyncOutRakModal';
import { MismatchedOutRakItem, SyncOutRakScanResult, scanMismatchedOutLogs, restoreOutRakLogs } from '../services/syncOutRakService';
import { SyncLt4Lt2Modal } from './SyncLt4Lt2Modal';
import { AdjustmentStockOutModal } from './AdjustmentStockOutModal';
import { SubsequentLogsModal } from './SubsequentLogsModal';
import { ScanDateAutoMatchModal } from './ScanDateAutoMatchModal';
import { SyncTransferOutScanDateModal } from './SyncTransferOutScanDateModal';
import { normalizeDate, normalizeTime, toTimestamp, getChronologicalDistance, isOutDateEligibleForIn } from '../services/scanDateMatchService';

const normRak = (r?: string) => (r || '').trim().toUpperCase().replace(/\./g, '');

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
  log_audit_saldo?: string;
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
  tgl?: string;
  log_audit_saldo?: string;
  isTimeAnomaly?: boolean;
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
  diagnosticType: 'SURPLUS' | 'BALANCED' | 'DEFICIT_FIXABLE_SAME_RAK' | 'DEFICIT_FIXABLE_OTHER_RAK' | 'DEFICIT_PURE_OVERCUT' | 'TIME_ANOMALY';
  recommendedAction: string;
  availableSurplusesSameRak: SurplusOption[];
  availableSurplusesOtherRak: SurplusOption[];
  earliestInTgl?: string;
  hasTimeAnomaly?: boolean;
  timeAnomalyCount?: number;
  timeAnomalyQty?: number;
  timeAnomalyOuts?: OutTransactionDetail[];
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

// Rak yang dilarang dipindahkan (baik sebagai rak asal maupun rak tujuan perpindahan)
export const FORBIDDEN_TRANSFER_RACKS = [
  'ECER-M',
  'ECER-N',
  'ECER-O',
  'LANTAI 2',
  'LANTAI 4',
  'BLOK-I'
];

export const isForbiddenTransferRack = (rak: string): boolean => {
  if (!rak) return false;
  const clean = rak.trim().toUpperCase().replace(/\s+/g, ' ');
  const compact = clean.replace(/[\s\-_\.]+/g, '');

  // Cek ECER / CER (ECER-M, ECER-N, ECER-O, CER-M, CER-N, CER-O)
  if (
    compact === 'ECERM' || compact.startsWith('ECERM') || compact === 'CERM' || compact.startsWith('CERM') ||
    compact === 'ECERN' || compact.startsWith('ECERN') || compact === 'CERN' || compact.startsWith('CERN') ||
    compact === 'ECERO' || compact.startsWith('ECERO') || compact === 'CERO' || compact.startsWith('CERO')
  ) {
    return true;
  }

  // Cek LANTAI 2 / 4 (LANTAI 2, LT 2, LT. 2, LANTAI 4, LT 4, LT. 4)
  if (
    compact === 'LANTAI2' || compact.startsWith('LANTAI2') || compact === 'LT2' || compact.startsWith('LT2') ||
    compact === 'LANTAI4' || compact.startsWith('LANTAI4') || compact === 'LT4' || compact.startsWith('LT4')
  ) {
    return true;
  }

  // Cek BLOK-I / BLOK-1 (BLOK-I, BLOK I, BLOK 1, BLOK-1)
  if (
    compact === 'BLOKI' || compact.startsWith('BLOKI') || compact === 'BLOK1' || compact.startsWith('BLOK1')
  ) {
    return true;
  }

  for (const forbidden of FORBIDDEN_TRANSFER_RACKS) {
    const fCompact = forbidden.replace(/[\s\-_\.]+/g, '');
    if (compact.includes(fCompact)) return true;
  }
  return false;
};

export const FORBIDDEN_DESTINATION_RACKS = FORBIDDEN_TRANSFER_RACKS;
export const isForbiddenDestinationRack = isForbiddenTransferRack;
export const isForbiddenRackAdjustment = isForbiddenTransferRack;

// Helper to extract redistribute info from log_update_user
export const getRedistributeMoveInfo = (logUpdateUser?: string) => {
  if (!logUpdateUser) return null;
  const match = logUpdateUser.match(/Redistribute\s+Move\s+([^\s->]+)\s*->\s*([^\s]+)/i);
  if (match) {
    return { fromRak: match[1], toRak: match[2] };
  }
  return null;
};

// Generate single move report sentence: [SKU] di rak [fromRak] seharusnya rak [toRak]
export const formatMoveReportSentence = (sku: string, fromRak: string, toRak: string) => {
  return `${sku} di rak ${fromRak} seharusnya rak ${toRak}`;
};

// Generate single deficit / lebih potong report sentence
export const formatDeficitReportSentence = (
  sku: string,
  rak: string,
  tglScan: string,
  deficitQty: number,
  totalIn?: number,
  totalOut?: number
) => {
  const inOutText = (totalIn !== undefined && totalOut !== undefined)
    ? ` (Total IN: ${totalIn.toLocaleString()}, OUT: ${totalOut.toLocaleString()})`
    : '';
  const tglText = tglScan ? ` (Tgl Scan: ${formatDateDisplay(tglScan)})` : '';
  return `${sku} di rak ${rak}${tglText} lebih potong ${Math.abs(deficitQty).toLocaleString()} pcs${inOutText}`;
};

export interface BatchGroupItem {
  id: string;
  sku: string;
  rak?: string;
  tglScan: string;
  rawTglScan: string;
  inEntries: DatabaseLogEntry[];
  outEntries: DatabaseLogEntry[];
  sortedEntries: (DatabaseLogEntry & { isRakMismatch?: boolean; mismatchInitialRaks?: string[]; isTimeAnomaly?: boolean })[];
  initialInRaks: Set<string>;
  initialInRaksList: string[];
  totalIn: number;
  totalOut: number;
  balance: number;
  hasRakMismatch: boolean;
  mismatchCount: number;
  hasTimeAnomaly?: boolean;
  timeAnomalyCount?: number;
  timeAnomalyOuts?: DatabaseLogEntry[];
  rakBreakdown?: { rak: string; inQty: number; outQty: number; balance: number }[];
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

  const [isDevToolsModalOpen, setIsDevToolsModalOpen] = useState(false);

  // Close DevTools modal with Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDevToolsModalOpen) {
        setIsDevToolsModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDevToolsModalOpen]);

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
  const [subsequentModal, setSubsequentModal] = useState<{
    isOpen: boolean;
    referenceEntry: DatabaseLogEntry | null;
  }>({
    isOpen: false,
    referenceEntry: null
  });

  const handleOpenSubsequentLogs = useCallback((entry: DatabaseLogEntry) => {
    setSubsequentModal({
      isOpen: true,
      referenceEntry: entry
    });
  }, []);

  const [isSubsequentPickerOpen, setIsSubsequentPickerOpen] = useState(false);
  const [pickerSkuInput, setPickerSkuInput] = useState('');
  const [recentTransfers, setRecentTransfers] = useState<DatabaseLogEntry[]>([]);
  const [isLoadingTransfers, setIsLoadingTransfers] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(100);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [isSyncingSubRak, setIsSyncingSubRak] = useState(false);
  const [subRakProgress, setSubRakProgress] = useState({ current: 0, total: 0 });
  const [isFixingTransferDates, setIsFixingTransferDates] = useState(false);
  const [transferFixProgress, setTransferFixProgress] = useState({ current: 0, total: 0, percent: 0 });

  // --- TOAST NOTIFICATION STATE & HANDLERS ---
  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
  }>({
    show: false,
    message: '',
    type: 'info'
  });

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    setToast({
      show: true,
      message,
      type
    });
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 5000);
  }, []);

  const hideToast = useCallback(() => {
    setToast(prev => ({ ...prev, show: false }));
  }, []);

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
    user: '',
    logUpdateUser: '',
    tanggal: '',
    tglScan: '',
    isAdjustment: '',
    onlySelected: false,
    excludeTransfer: false
  });

  const clearAllFilters = () => {
    setFilters({
      sku: '',
      type: '',
      gudang: initialGudangFilter || '',
      rak: '',
      subRak: '',
      waktu: '',
      user: '',
      logUpdateUser: '',
      tanggal: '',
      tglScan: '',
      isAdjustment: '',
      onlySelected: false,
      excludeTransfer: false
    });
    setActiveBulkSkuSearch([]);
    setBulkSkuSearchInput('');
    setCurrentPage(1);
  };

  useEffect(() => {
    if (initialGudangFilter) {
      setFilters(prev => ({ ...prev, gudang: initialGudangFilter }));
    }
  }, [initialGudangFilter]);

  // DevMode typing trigger: if user types "devmode" in any filter field, toggle devMode
  useEffect(() => {
    const term = (filters.sku || filters.gudang || filters.rak || '').toLowerCase().trim();
    if (term === 'devmode') {
      setShowFixDates(prev => {
        const next = !prev;
        if (next) {
          localStorage.setItem('devmode', 'true');
          showToast('DevMode Aktif! Tombol Riwayat Mutasi Setelahnya & Fitur Audit ditampilkan.', 'success');
        } else {
          localStorage.removeItem('devmode');
          showToast('DevMode Nonaktif. Tombol Riwayat Mutasi Setelahnya disembunyikan.', 'warning');
        }
        return next;
      });
      setFilters(prev => ({
        ...prev,
        sku: prev.sku.toLowerCase() === 'devmode' ? '' : prev.sku,
        gudang: prev.gudang.toLowerCase() === 'devmode' ? '' : prev.gudang,
        rak: prev.rak.toLowerCase() === 'devmode' ? '' : prev.rak
      }));
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
  const [isCopiedSku, setIsCopiedSku] = useState(false);

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



  // --- GROUPING (SKU + TGL SCAN + IN/OUT) & OUT RAK MISMATCH AUDIT STATE ---
  const [isGroupedMode, setIsGroupedMode] = useState(false);
  const [groupIncludeRak, setGroupIncludeRak] = useState(true);
  const [groupedSubFilter, setGroupedSubFilter] = useState<'ALL' | 'MISMATCH' | 'DEFICIT' | 'ANOMALY'>('ALL');

  // --- HAPUS TGL SCAN BATCH MINUS (DEFISIT) STATE ---
  const [isClearDeficitModalOpen, setIsClearDeficitModalOpen] = useState(false);
  const [isClearingDeficitScanDates, setIsClearingDeficitScanDates] = useState(false);

  // --- BULK SKU SEARCH STATE ---
  const [isBulkSkuModalOpen, setIsBulkSkuModalOpen] = useState(false);
  const [bulkSkuSearchInput, setBulkSkuSearchInput] = useState('');
  const [activeBulkSkuSearch, setActiveBulkSkuSearch] = useState<string[]>([]);
  const [bulkSkuSearchMode, setBulkSkuSearchMode] = useState<'exact' | 'partial'>('exact');

  const handleApplyBulkSkuSearch = useCallback((customInput?: string) => {
    const raw = customInput !== undefined ? customInput : bulkSkuSearchInput;
    const list = Array.from(
      new Set(
        raw
          .split(/[\r\n,]+/)
          .map(s => s.trim())
          .filter(Boolean)
      )
    );
    if (list.length === 0) {
      showToast('Silakan masukkan atau tempel setidaknya 1 SKU.', 'warning');
      return;
    }
    setActiveBulkSkuSearch(list);
    setIsBulkSkuModalOpen(false);
    setCurrentPage(1);
    showToast(`Pencarian massal aktif untuk ${list.length} SKU.`, 'success');
  }, [bulkSkuSearchInput, showToast]);

  const handleClearBulkSkuSearch = useCallback(() => {
    setActiveBulkSkuSearch([]);
    setBulkSkuSearchInput('');
    setCurrentPage(1);
    showToast('Filter pencarian massal SKU dinonaktifkan.', 'info');
  }, [showToast]);

  const batchGroupData = useMemo(() => {
    const groupsMap = new Map<string, {
      sku: string;
      rak?: string;
      tglScan: string;
      rawTglScan: string;
      entries: DatabaseLogEntry[];
    }>();

    filteredEntries.forEach(entry => {
      const normSku = (entry.sku || '').trim().toUpperCase();
      const rawScan = (entry.tgl_scan || '').trim();
      const normScan = formatDateDisplay(rawScan) || rawScan || 'Tanpa Tgl Scan';
      const entryNormRak = (entry.rak || 'Tanpa Rak').trim().toUpperCase();
      const key = groupIncludeRak ? `${normSku}|${entryNormRak}|${normScan}` : `${normSku}|${normScan}`;

      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          sku: entry.sku,
          rak: groupIncludeRak ? (entry.rak || 'Tanpa Rak').trim() : undefined,
          tglScan: normScan,
          rawTglScan: rawScan,
          entries: []
        });
      }
      groupsMap.get(key)!.entries.push(entry);
    });

    const result: BatchGroupItem[] = [];

    groupsMap.forEach((group, key) => {
      const inEntries: DatabaseLogEntry[] = [];
      const outEntries: DatabaseLogEntry[] = [];
      const initialInRaks = new Set<string>();

      group.entries.forEach(entry => {
        const type = (entry.type || '').toUpperCase();
        if (type === 'IN') {
          inEntries.push(entry);
          if (entry.rak && entry.rak.trim()) {
            initialInRaks.add(entry.rak.trim().toUpperCase());
          }
        } else {
          outEntries.push(entry);
        }
      });

      // Sort IN entries chronologically
      inEntries.sort((a, b) => {
        const dtA = `${a.tgl} ${a.waktu}`;
        const dtB = `${b.tgl} ${b.waktu}`;
        return dtA.localeCompare(dtB);
      });

      const initialInRaksList = Array.from(initialInRaks);
      let mismatchCount = 0;
      let timeAnomalyCount = 0;
      const timeAnomalyOuts: DatabaseLogEntry[] = [];
      const batchRefDate = normalizeDate(group.rawTglScan) || (inEntries.length > 0 ? normalizeDate(inEntries[0].tgl) : '');

      // Sort OUT entries chronologically and detect mismatch against IN racks and date anomalies
      const enrichedOutEntries = outEntries
        .sort((a, b) => {
          const dtA = `${a.tgl} ${a.waktu}`;
          const dtB = `${b.tgl} ${b.waktu}`;
          return dtA.localeCompare(dtB);
        })
        .map(entry => {
          const outRak = (entry.rak || '').trim().toUpperCase();
          const isRakMismatch = initialInRaks.size > 0 && !initialInRaks.has(outRak);
          if (isRakMismatch) {
            mismatchCount++;
          }

          const outDate = normalizeDate(entry.tgl);
          const isTimeAnomaly = Boolean(batchRefDate && outDate && outDate < batchRefDate);
          if (isTimeAnomaly) {
            timeAnomalyCount++;
            timeAnomalyOuts.push(entry);
          }

          return {
            ...entry,
            isRakMismatch,
            mismatchInitialRaks: initialInRaksList,
            isTimeAnomaly
          };
        });

      const enrichedInEntries = inEntries.map(entry => ({
        ...entry,
        isRakMismatch: false,
        mismatchInitialRaks: initialInRaksList,
        isTimeAnomaly: false
      }));

      const sortedEntries = [...enrichedInEntries, ...enrichedOutEntries];
      const totalIn = inEntries.reduce((sum, e) => sum + (Number(e.jumlah) || 0), 0);
      const totalOut = outEntries.reduce((sum, e) => sum + (Number(e.jumlah) || 0), 0);
      const balance = totalIn - totalOut;
      const hasRakMismatch = mismatchCount > 0;

      // Calculate breakdown per rak
      const rakBreakdownMap = new Map<string, { inQty: number; outQty: number }>();
      group.entries.forEach(e => {
        const r = (e.rak || 'Tanpa Rak').trim();
        if (!rakBreakdownMap.has(r)) rakBreakdownMap.set(r, { inQty: 0, outQty: 0 });
        const b = rakBreakdownMap.get(r)!;
        const q = Number(e.jumlah) || 0;
        if ((e.type || '').toUpperCase() === 'IN') b.inQty += q;
        else b.outQty += q;
      });
      const rakBreakdown = Array.from(rakBreakdownMap.entries()).map(([rakName, data]) => ({
        rak: rakName,
        inQty: data.inQty,
        outQty: data.outQty,
        balance: data.inQty - data.outQty
      }));

      result.push({
        id: key,
        sku: group.sku,
        rak: group.rak,
        tglScan: group.tglScan,
        rawTglScan: group.rawTglScan,
        inEntries,
        outEntries,
        sortedEntries,
        initialInRaks,
        initialInRaksList,
        totalIn,
        totalOut,
        balance,
        hasRakMismatch,
        mismatchCount,
        hasTimeAnomaly: timeAnomalyCount > 0,
        timeAnomalyCount,
        timeAnomalyOuts,
        rakBreakdown
      });
    });

    return result;
  }, [filteredEntries, groupIncludeRak]);

  const filteredBatchGroups = useMemo(() => {
    if (groupedSubFilter === 'MISMATCH') {
      return batchGroupData.filter(g => g.hasRakMismatch);
    }
    if (groupedSubFilter === 'DEFICIT') {
      return batchGroupData.filter(g => g.balance < 0);
    }
    if (groupedSubFilter === 'ANOMALY') {
      return batchGroupData.filter(g => g.hasTimeAnomaly);
    }
    return batchGroupData;
  }, [batchGroupData, groupedSubFilter]);

  const batchSummaryStats = useMemo(() => {
    const totalGroups = batchGroupData.length;
    const mismatchGroups = batchGroupData.filter(g => g.hasRakMismatch).length;
    const deficitGroups = batchGroupData.filter(g => g.balance < 0).length;
    const anomalyGroups = batchGroupData.filter(g => g.hasTimeAnomaly).length;
    const totalMismatchRows = batchGroupData.reduce((sum, g) => sum + g.mismatchCount, 0);
    const totalAnomalyRows = batchGroupData.reduce((sum, g) => sum + g.timeAnomalyCount, 0);
    return { totalGroups, mismatchGroups, deficitGroups, anomalyGroups, totalMismatchRows, totalAnomalyRows };
  }, [batchGroupData]);

  // --- STOCK BALANCE ANALYSIS & DEFICIT AUDIT STATE ---
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<BalanceAnalysisResult[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisSearchTerm, setAnalysisSearchTerm] = useState('');
  const [analysisSku, setAnalysisSku] = useState('');
  const [analysisSkuInputMode, setAnalysisSkuInputMode] = useState<'single' | 'bulk'>('single');
  const [bulkAnalysisSkuInput, setBulkAnalysisSkuInput] = useState('');
  const [analyzedSkusList, setAnalyzedSkusList] = useState<string[]>([]);
  const [analysisFilterTab, setAnalysisFilterTab] = useState<'ALL' | 'DEFICIT' | 'SURPLUS' | 'ANOMALY'>('ALL');
  const [expandedDeficitKeys, setExpandedDeficitKeys] = useState<Set<string>>(new Set());
  const [singleTargetSelections, setSingleTargetSelections] = useState<Record<string, { targetRak: string; targetRawTglScan: string }>>({});
  const [isProcessingRemediation, setIsProcessingRemediation] = useState(false);

  // --- REDISTRIBUTION (FIX LEBIH POTONG) STATE ---
  const [isRedistributeModalOpen, setIsRedistributeModalOpen] = useState(false);
  const [redistributeMoves, setRedistributeMoves] = useState<any[]>([]);
  const [isProcessingRedistribution, setIsProcessingRedistribution] = useState(false);
  const [excludedScanDates, setExcludedScanDates] = useState('');

  // --- BATCH AUTO-FIX PER SKU (ITERATIVE UNTIL KLOP) STATE ---
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
    iteration: 1,
    statusMessage: '',
    completedList: []
  });
  const stopBatchAutoFixRef = useRef<boolean>(false);

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

  // --- TRANSFER PURGE (HAPUS LOG TRANSFER DENGAN PROTEKSI) STATE ---
  const [isTransferPurgeModalOpen, setIsTransferPurgeModalOpen] = useState(false);
  const [purgeSkuInput, setPurgeSkuInput] = useState('');
  const [purgeScanResult, setPurgeScanResult] = useState<TransferPurgeScanResult | null>(null);
  const [isScanningPurge, setIsScanningPurge] = useState(false);
  const [isDeletingPurge, setIsDeletingPurge] = useState(false);
  const [selectedPurgeIds, setSelectedPurgeIds] = useState<Set<string>>(new Set());
  // --- DELETE TRANSFER FOR CEK SALDO STATE ---
  const [isDeleteTransferCekSaldoModalOpen, setIsDeleteTransferCekSaldoModalOpen] = useState(false);
  const [transferLogsForCekSaldo, setTransferLogsForCekSaldo] = useState<any[]>([]);
  const [selectedTransferIdsForCekSaldo, setSelectedTransferIdsForCekSaldo] = useState<Set<string>>(new Set());
  const [isLoadingTransferLogsForCekSaldo, setIsLoadingTransferLogsForCekSaldo] = useState(false);
  const [isDeletingTransferLogsForCekSaldo, setIsDeletingTransferLogsForCekSaldo] = useState(false);
  const [targetSkusForDeleteTransfer, setTargetSkusForDeleteTransfer] = useState<string[]>([]);

  // --- SINKRON RAK OUT NOTA MASUK (J & H) STATE ---
  const [isSyncOutRakModalOpen, setIsSyncOutRakModalOpen] = useState(false);
  const [syncOutSkuInput, setSyncOutSkuInput] = useState('');
  const [syncOutScanResult, setSyncOutScanResult] = useState<SyncOutRakScanResult | null>(null);
  const [isScanningSyncOut, setIsScanningSyncOut] = useState(false);
  const [isFixingSyncOut, setIsFixingSyncOut] = useState(false);
  const [selectedSyncOutIds, setSelectedSyncOutIds] = useState<Set<string>>(new Set());

  // --- SELARASKAN MUTASI LANTAI 4 -> LANTAI 2 STATE ---
  const [isSyncLt4Lt2ModalOpen, setIsSyncLt4Lt2ModalOpen] = useState(false);

  // --- DEVMODE: PENYESUAIAN STOK OUT STATE ---
  const [isAdjustmentStockOutModalOpen, setIsAdjustmentStockOutModalOpen] = useState(false);

  // --- SCAN DATE AUTO-MATCH MODAL STATE ---
  const [isScanDateAutoMatchModalOpen, setIsScanDateAutoMatchModalOpen] = useState(false);
  const [scanDateAutoMatchSku, setScanDateAutoMatchSku] = useState('');

  // --- SINKRONISASI TGL SCAN TRANSFER OUT (HISTORICAL FIX) STATE ---
  const [isSyncTransferOutModalOpen, setIsSyncTransferOutModalOpen] = useState(false);
  const [syncTransferOutSku, setSyncTransferOutSku] = useState('');

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

        // 3. Smart Diagnostics for this SKU: identify surplus pools, run Tahap 0 (Exact Qty Matching), and match deficits
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
        // Contoh: IN 2026-06-24 (1 pc, Rak UTAMA) & OUT 2026-06-24 (1 pc, Rak G14)
        // Pasangan ini harus dipasangkan terlebih dahulu agar tidak diserobot oleh batch IN lama!
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

            // Pastikan kandidat surplus hanya yang tanggal IN-nya <= tanggal transaksi OUT (tanggal OUT >= tanggal IN)
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

        // Deteksi transaksi OUT yang tidak sesuai rak/tgl_scan meskipun grupnya surplus (misal OUT 1 nyasar ke TEMP-C)
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
        setAnalysisFilterTab('DEFICIT'); // Automatically focus on deficits
        showToast(`Analisis selesai! Ditemukan ${deficitCount} kombinasi MINUS (Lebih Potong) pada ${targetSkus.length} SKU.`, 'warning');
      } else if (anomalyCount > 0) {
        setAnalysisFilterTab('ANOMALY'); // Automatically focus on time anomalies
        showToast(`Analisis selesai! Ditemukan ${anomalyCount} kombinasi dengan Anomali Tanggal (OUT < Tgl Scan IN) pada ${targetSkus.length} SKU.`, 'warning');
      } else {
        setAnalysisFilterTab('ALL');
        showToast(`Analisis selesai! Seluruh stok dari ${targetSkus.length} SKU aman & klop secara kuantitas dan tanggal.`, 'success');
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

    // Validasi ketat: data OUT tidak boleh berada di bawah tanggal IN
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

      // Refresh analysis & main table
      await handleAnalyzeStockBalance();
      loadLogEntries(currentPage, itemsPerPage, debouncedFilters);
    } catch (err: any) {
      console.error('Error applying single remediation:', err);
      showToast(`Gagal memindahkan data: ${err.message || 'unknown error'}`, 'error');
    } finally {
      setIsProcessingRemediation(false);
    }
  };

  const handleResetBatchAnomalyScanDates = async (item: BalanceAnalysisResult) => {
    const anomalyOuts = (item.timeAnomalyOuts || []).filter(e => Boolean(e.tgl_scan));
    if (anomalyOuts.length === 0) {
      showToast('Tidak ada transaksi OUT anomali yang memiliki Tgl Scan pada batch ini.', 'warning');
      return;
    }

    const outIds = anomalyOuts.map(e => e.id);
    const totalQty = anomalyOuts.reduce((sum, e) => sum + (e.jumlah || 0), 0);

    if (!confirm(`Lepas Tgl Scan untuk ${outIds.length} transaksi OUT anomali (${totalQty} pcs) pada ${item.sku} (Rak ${item.rak}, Tgl Scan ${item.tglScan})?\n\nTransaksi OUT ini memiliki tanggal transaksi lebih lampau daripada batch kedatangan IN, sehingga tidak sah memotong batch ini.\n\nSetelah dilepas (Tgl Scan menjadi kosong), transaksi OUT ini tidak akan lagi memotong batch ini dan saldo batch akan kembali seimbang.`)) {
      return;
    }

    try {
      setIsProcessingRemediation(true);
      const todayStr = new Date().toISOString().slice(0, 10);
      const chunkSize = 25;
      for (let i = 0; i < outIds.length; i += chunkSize) {
        const chunk = outIds.slice(i, i + chunkSize);
        const { error } = await supabase
          .from('database_log')
          .update({
            tgl_scan: null,
            log_update_user: `DEVMODE: Lepas Tgl Scan Anomali OUT < IN (${todayStr})`
          })
          .in('id', chunk);
        if (error) throw error;
      }

      showToast(`Sukses melepas Tgl Scan untuk ${outIds.length} transaksi OUT anomali!`, 'success');
      await handleAnalyzeStockBalance();
      loadLogEntries(currentPage, itemsPerPage, debouncedFilters);
    } catch (err: any) {
      console.error('Error resetting anomaly scan dates:', err);
      showToast(`Gagal melepas Tgl Scan anomali: ${err.message || 'unknown error'}`, 'error');
    } finally {
      setIsProcessingRemediation(false);
    }
  };

  const handleResetAllAnomalyScanDates = async () => {
    const allAnomalyOuts: OutTransactionDetail[] = [];
    analysisResults.forEach(r => {
      if (r.hasTimeAnomaly && r.timeAnomalyOuts) {
        r.timeAnomalyOuts.forEach(o => {
          if (o.tgl_scan) allAnomalyOuts.push(o);
        });
      }
    });

    if (allAnomalyOuts.length === 0) {
      showToast('Tidak ada transaksi OUT anomali bertanggal lampau yang memiliki Tgl Scan.', 'info');
      return;
    }

    const uniqueIds = Array.from(new Set(allAnomalyOuts.map(o => o.id)));
    const totalQty = allAnomalyOuts.reduce((sum, o) => sum + (o.jumlah || 0), 0);

    if (!confirm(`Lepas Tgl Scan untuk SEMUA ${uniqueIds.length} transaksi OUT anomali (${totalQty} pcs) di seluruh data analisis?\n\nTransaksi-transaksi ini terjadi pada tanggal transaksi lebih lampau daripada tanggal kedatangan batch IN (OUT < IN) yang telah disesuaikan sebelumnya.\n\nSetelah dilepas, Tgl Scan akan dikosongkan agar saldo batch kembali seimbang secara akurat.`)) {
      return;
    }

    try {
      setIsProcessingRemediation(true);
      const todayStr = new Date().toISOString().slice(0, 10);
      const chunkSize = 25;
      for (let i = 0; i < uniqueIds.length; i += chunkSize) {
        const chunk = uniqueIds.slice(i, i + chunkSize);
        const { error } = await supabase
          .from('database_log')
          .update({
            tgl_scan: null,
            log_update_user: `DEVMODE: Lepas Semua Tgl Scan Anomali OUT < IN (${todayStr})`
          })
          .in('id', chunk);
        if (error) throw error;
      }

      showToast(`Sukses melepas Tgl Scan untuk ${uniqueIds.length} transaksi OUT anomali!`, 'success');
      await handleAnalyzeStockBalance();
      loadLogEntries(currentPage, itemsPerPage, debouncedFilters);
    } catch (err: any) {
      console.error('Error resetting all anomaly scan dates:', err);
      showToast(`Gagal melepas semua Tgl Scan anomali: ${err.message || 'unknown error'}`, 'error');
    } finally {
      setIsProcessingRemediation(false);
    }
  };

  const handleResetSingleAnomalyOut = async (txId: string, skuName: string) => {
    try {
      setIsProcessingRemediation(true);
      const todayStr = new Date().toISOString().slice(0, 10);
      const { error } = await supabase
        .from('database_log')
        .update({
          tgl_scan: null,
          log_update_user: `DEVMODE: Lepas Tgl Scan Anomali OUT < IN (${todayStr})`
        })
        .eq('id', txId);

      if (error) throw error;
      showToast(`Tgl Scan untuk transaksi ${skuName} berhasil dilepas!`, 'success');
      await handleAnalyzeStockBalance();
      loadLogEntries(currentPage, itemsPerPage, debouncedFilters);
    } catch (err: any) {
      console.error('Error resetting single anomaly out:', err);
      showToast(`Gagal melepas Tgl Scan: ${err.message || 'unknown error'}`, 'error');
    } finally {
      setIsProcessingRemediation(false);
    }
  };

  const handlePrepareRedistribute = async () => {
    const skusToProcess = analyzedSkusList.length > 0
      ? analyzedSkusList
      : (analysisSku ? [analysisSku.trim().toUpperCase()] : []);

    if (skusToProcess.length === 0) {
      showToast('Tidak ada SKU yang dipilih untuk diperbaiki.', 'warning');
      return;
    }

    try {
      setIsAnalyzing(true);
      showToast(`Menghitung rekomendasi pemindahan data untuk ${skusToProcess.length} SKU...`, 'info');

      // 1. Fetch ALL relevant logs for the target SKUs
      let allLogs: any[] = [];
      if (skusToProcess.length === 1) {
        const { data, error } = await supabase
          .from('database_log')
          .select('id, sku, rak, sub_rak, tgl_scan, type, jumlah, tgl, waktu')
          .ilike('sku', skusToProcess[0])
          .or('type.ilike.%IN%,type.ilike.%OUT%')
          .order('id', { ascending: true });

        if (error) throw error;
        if (data) allLogs = data;
      } else {
        const skuBatchSize = 50;
        for (let i = 0; i < skusToProcess.length; i += skuBatchSize) {
          const chunk = skusToProcess.slice(i, i + skuBatchSize);
          const { data, error } = await supabase
            .from('database_log')
            .select('id, sku, rak, sub_rak, tgl_scan, type, jumlah, tgl, waktu')
            .in('sku', chunk)
            .or('type.ilike.%IN%,type.ilike.%OUT%')
            .order('id', { ascending: true });

          if (error) throw error;
          if (data) allLogs.push(...data);
        }
      }

      if (allLogs.length === 0) {
        showToast('Tidak ada data untuk diperbaiki.', 'warning');
        return;
      }

      const excludedList = excludedScanDates.split(',').map(d => d.trim().toUpperCase()).filter(Boolean);
      const checkIfExcluded = (targetTgl: string) => {
        const normTgl = (formatDateDisplay(targetTgl) || targetTgl || '').toUpperCase();
        return excludedList.some(excluded => {
          const normExcluded = formatDateDisplay(excluded).toUpperCase();
          return normTgl === normExcluded || normTgl === excluded.toUpperCase();
        });
      };

      // 2. Separate Inflow Buckets (Supply IN) and Outflow Candidates (Demand OUT)
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

      const logsBySku = new Map<string, any[]>();
      allLogs.forEach(log => {
        const normSku = (log.sku || '').trim().toUpperCase();
        if (!logsBySku.has(normSku)) logsBySku.set(normSku, []);
        logsBySku.get(normSku)!.push(log);
      });

      const moves: any[] = [];

      logsBySku.forEach((skuLogs, currentSku) => {
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

        // --- TAHAP 1: SAME-DAY EXACT QTY MATCH (Tgl Input Sama, SKU Sama, Qty Sama) ---
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

              // 1. Proximity Window: Jika salah satu dekat (<= 35 hari) dan yang lain jauh (> 35 hari), dahulukan yang dekat
              if (daysA <= 35 && daysB > 35) return -1;
              if (daysB <= 35 && daysA > 35) return 1;

              // 2. Same Input Date preference: jika tanggal input sama persis, dahulukan
              const aSameDate = a.tgl === bucket.tgl ? 0 : 1;
              const bSameDate = b.tgl === bucket.tgl ? 0 : 1;
              if (aSameDate !== bSameDate) return aSameDate - bSameDate;

              // 3. Jika rentang waktu mirip (selisih < 14 hari), dahulukan rak yang sama
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

        // 3. Kumpulkan rekomendasi pemindahan (HANYA untuk transaksi OUT yang berubah rak atau tgl_scan)
        outCandidates.forEach(c => {
          if (!c.isAssigned) {
            // Lepas tgl_scan jika transaksi OUT ini bertanggal lampau (anomali OUT < IN)
            const isAnomaly = c.oldTglScan && !isOutDateEligibleForIn(c.tgl, c.oldTglScan);
            if (isAnomaly) {
              moves.push({
                id: c.id,
                sku: currentSku,
                rak: c.rak,
                toRak: c.rak,
                fromTgl: c.oldTglScan,
                toTgl: null,
                jumlah: c.jumlah,
                type: 'CLEAR_ANOMALY'
              });
            }
            return;
          }
          const isRakChanged = normRak(c.rak) !== normRak(c.newRak);
          const isTglChanged = normalizeDate(c.oldTglScan) !== normalizeDate(c.newTglScan);

          if (isRakChanged || isTglChanged) {
            moves.push({
              id: c.id,
              sku: currentSku,
              rak: c.rak,
              toRak: c.newRak,
              fromTgl: c.oldTglScan,
              toTgl: c.newTglScan,
              jumlah: c.jumlah,
              type: isRakChanged ? 'CROSS_RAK' : 'SAME_RAK'
            });
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

      // Group moves by identical payload to avoid statement timeouts (500 Internal Server Error)
      const payloadGroups = new Map<string, { payload: Record<string, any>; ids: string[] }>();

      const todayStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
      redistributeMoves.forEach(move => {
        const isRakChanged = move.toRak && move.toRak !== move.rak;
        const isTglChanged = move.toTgl !== move.fromTgl;

        const payload: Record<string, any> = {
          log_audit_saldo: `LOCKED: Penyesuaian Cek Saldo (${todayStr})`
        };

        if (move.toTgl === null) {
          payload.tgl_scan = null;
          payload.log_audit_saldo = `LOCKED: Lepas Anomali Cek Saldo (${todayStr})`;
          payload.log_update_user = `DEVMODE: Lepas Tgl Scan Anomali OUT < IN (${todayStr.slice(0, 10)})`;
        } else if (isTglChanged && move.toTgl) {
          payload.tgl_scan = move.toTgl;
        }
        if (isRakChanged && move.toRak) {
          payload.rak = move.toRak;
          payload.sub_rak = move.toRak;
        }

        const key = JSON.stringify(payload);
        if (!payloadGroups.has(key)) {
          payloadGroups.set(key, { payload, ids: [] });
        }
        payloadGroups.get(key)!.ids.push(move.id);
      });

      let totalSuccess = 0;
      let totalError = 0;

      // Execute each group in safe chunks of 25 with retry
      for (const group of payloadGroups.values()) {
        const { payload, ids } = group;
        const chunkSize = 25;

        for (let i = 0; i < ids.length; i += chunkSize) {
          const chunkIds = ids.slice(i, i + chunkSize);
          let success = false;
          let attempts = 0;

          while (!success && attempts < 3) {
            attempts++;
            let { error } = await supabase
              .from('database_log')
              .update(payload)
              .in('id', chunkIds);

            if (error && error.message && error.message.includes('log_audit_saldo')) {
              // Kolom log_audit_saldo belum dibuat di Supabase, fallback tanpa kolom ini
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
              console.warn(`Update attempt ${attempts} failed for ${chunkIds.length} rows:`, error.message);
              if (attempts < 3) {
                await new Promise(r => setTimeout(r, 600));
              } else {
                totalError += chunkIds.length;
              }
            }
          }
        }
      }

      if (totalError === 0) {
        showToast(`Sukses memperbarui ${totalSuccess} data log tanpa error!`, 'success');
      } else {
        showToast(`Berhasil memperbarui ${totalSuccess} data log, ${totalError} data gagal.`, 'warning');
      }
      setIsRedistributeModalOpen(false);
      setRedistributeMoves([]);
      handleAnalyzeStockBalance();
      loadLogEntries(currentPage, itemsPerPage, debouncedFilters);
    } catch (error) {
      console.error('Error executing redistribution:', error);
      showToast('Terjadi kesalahan saat mengeksekusi perbaikan.', 'error');
    } finally {
      setIsProcessingRedistribution(false);
    }
  };

  // --- BATCH AUTO-FIX PER SKU (ITERATIVE UNTIL KLOP) FUNCTIONS ---
  const handleStopBatchAutoFix = useCallback(() => {
    stopBatchAutoFixRef.current = true;
    setBatchAutoFixProgress(prev => ({
      ...prev,
      isStopping: true,
      statusMessage: 'Menghentikan proses... Menyelesaikan batch saat ini.'
    }));
    showToast('Menghentikan proses Auto-Fix massal...', 'info');
  }, [showToast]);

  const autoFixSingleSku = async (
    sku: string,
    excludedDatesStr: string = ''
  ): Promise<{
    movesFixed: number;
    isKlop: boolean;
    message: string;
  }> => {
    const targetSku = sku.trim();
    if (!targetSku) {
      return { movesFixed: 0, isKlop: true, message: 'SKU kosong' };
    }

    // 1. Fetch ALL relevant logs for this SKU with pagination to avoid 1000-row limit truncation
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
        allLogs.push(...data);
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

    // 2. Aggregate logs to check if balance is already klop (no deficit)
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

    // Check if balance has deficit or time anomalies
    let hasTimeAnomaly = false;
    allLogs.forEach(log => {
      const normType = (log.type || '').trim().toUpperCase();
      if (normType.includes('OUT')) {
        const rawTglScan = (log.tgl_scan || '').trim();
        if (rawTglScan && !isOutDateEligibleForIn(log.tgl, rawTglScan)) {
          hasTimeAnomaly = true;
        }
      }
    });

    // 3. Prepare buckets for redistribution matching
    const excludedList = excludedDatesStr.split(',').map(d => d.trim().toUpperCase()).filter(Boolean);
    const checkIfExcluded = (targetTgl: string) => {
      const normTgl = (formatDateDisplay(targetTgl) || targetTgl || '').toUpperCase();
      return excludedList.some(excluded => {
        const normExcluded = formatDateDisplay(excluded).toUpperCase();
        return normTgl === normExcluded || normTgl === excluded.toUpperCase();
      });
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
        const rawTglScan = (log.tgl_scan || '').trim();
        const isAnomaly = rawTglScan ? !isOutDateEligibleForIn(log.tgl, rawTglScan) : false;
        // Jika sudah pernah disesuaikan (log_audit_saldo ada) dan tidak anomali tanggal, kunci posisinya
        const isLocked = Boolean(log.log_audit_saldo) && !isAnomaly;

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

    // --- TAHAP 1: SAME-DAY EXACT QTY MATCH (Tgl Input Sama, SKU Sama, Qty Sama) ---
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

          // 1. Proximity Window: Jika salah satu dekat (<= 35 hari) dan yang lain jauh (> 35 hari), dahulukan yang dekat
          if (daysA <= 35 && daysB > 35) return -1;
          if (daysB <= 35 && daysA > 35) return 1;

          // 2. Same Input Date preference: jika tanggal input sama persis, dahulukan
          const aSameDate = a.tgl === bucket.tgl ? 0 : 1;
          const bSameDate = b.tgl === bucket.tgl ? 0 : 1;
          if (aSameDate !== bSameDate) return aSameDate - bSameDate;

          // 3. Jika rentang waktu mirip (selisih < 14 hari), dahulukan rak yang sama
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
        // Jika transaksi OUT tidak berhasil dipasangkan ke batch masuk manapun:
        // Cek apakah sebelumnya ia menempel pada batch tgl_scan yang ANOMALI (tgl keluar < tgl scan masuk):
        // Jika ya, kita HARUS MELEPAS tgl_scan-nya (set null) agar tidak memotong batch masa depan secara tidak sah!
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
            // Kolom log_audit_saldo belum dibuat di Supabase, fallback tanpa kolom ini
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
            // No more moves can be made for this SKU
            break;
          }

          // Brief delay between iterations for database consistency
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

    // Refresh active analysis & database log
    if (analysisSkuInputMode === 'single' && analysisSku) {
      handleAnalyzeStockBalance(analysisSku);
    } else if (analyzedSkusList.length > 0) {
      handleAnalyzeStockBalance(analyzedSkusList);
    }
    loadLogEntries(currentPage, itemsPerPage, debouncedFilters);
  };

  // --- HANDLER HAPUS DATA GUDANG: TRANSFER UNTUK CEK SALDO ---
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

      // Otomatis refresh Cek Saldo dan tabel log utama
      if (analysisSkuInputMode === 'single' && analysisSku) {
        await handleAnalyzeStockBalance(analysisSku);
      } else if (targetSkusForDeleteTransfer.length > 0) {
        await handleAnalyzeStockBalance(targetSkusForDeleteTransfer);
      } else {
        await handleAnalyzeStockBalance();
      }
      loadLogEntries(currentPage, itemsPerPage, debouncedFilters);
    } catch (err: any) {
      console.error('Error executing delete transfer logs:', err);
      showToast('Gagal menghapus data transfer: ' + (err?.message || err), 'error');
    } finally {
      setIsDeletingTransferLogsForCekSaldo(false);
    }
  };



  const handleOpenSubsequentLogsFromTop = useCallback(async (customSku?: string) => {
    const targetSku = (customSku || filters.sku || '').trim();
    if (targetSku) {
      try {
        // Try in-memory filteredEntries first
        const inMemoryMatch = filteredEntries.find(
          (e) =>
            (e.sku || '').toUpperCase() === targetSku.toUpperCase() &&
            ((e.gudang || '').toUpperCase().includes('TRANSFER') || e.type === 'MOVE')
        ) || filteredEntries.find((e) => (e.sku || '').toUpperCase() === targetSku.toUpperCase());

        if (inMemoryMatch) {
          handleOpenSubsequentLogs(inMemoryMatch);
          setIsSubsequentPickerOpen(false);
          return;
        }

        // Query database for latest transfer log of this SKU
        const { data: transferData } = await supabase
          .from('database_log')
          .select('*')
          .ilike('sku', targetSku)
          .ilike('gudang', '%TRANSFER%')
          .order('tgl', { ascending: false })
          .order('waktu', { ascending: false })
          .limit(1);

        if (transferData && transferData.length > 0) {
          handleOpenSubsequentLogs(transferData[0]);
          setIsSubsequentPickerOpen(false);
          return;
        }

        // Fallback: any latest log for this SKU
        const { data: anyData } = await supabase
          .from('database_log')
          .select('*')
          .ilike('sku', targetSku)
          .order('tgl', { ascending: false })
          .order('waktu', { ascending: false })
          .limit(1);

        if (anyData && anyData.length > 0) {
          handleOpenSubsequentLogs(anyData[0]);
          setIsSubsequentPickerOpen(false);
          return;
        }

        showToast(`Tidak ditemukan data transaksi untuk SKU ${targetSku}`, 'warning');
      } catch (err: any) {
        console.error('Error opening subsequent logs from top:', err);
      }
    }

    // If no SKU provided or not found, open SubsequentLogsModal directly so user can search or pick inside the modal
    setSubsequentModal({
      isOpen: true,
      referenceEntry: null
    });
  }, [filters.sku, filteredEntries, handleOpenSubsequentLogs, showToast]);

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
              showToast('DevMode Aktif! Tombol Riwayat Mutasi Setelahnya & Fitur Audit ditampilkan.', 'success');
            } else {
              localStorage.removeItem('devmode');
              showToast('DevMode Nonaktif. Tombol Riwayat Mutasi Setelahnya disembunyikan.', 'warning');
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
        const rowNormRak = (row.rak || '').trim().toUpperCase();
        const normSubRak = (row.sub_rak || '').trim().toUpperCase();
        const qty = Number(row.jumlah || 0);
        const normTgl = (row.tgl || '').trim();
        const normTglScan = (row.tgl_scan || '').trim();
        const normWaktu = (row.waktu || '').trim();
        const key = `${normSku}|${normType}|${rowNormRak}|${normSubRak}|${qty}|${normTgl}|${normTglScan}|${normWaktu}`;

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

  // --- TRANSFER PURGE HANDLERS ---
  const handleScanTransferPurge = async (skuToScan?: string) => {
    try {
      setIsScanningPurge(true);
      setSelectedPurgeIds(new Set());
      const target = (skuToScan !== undefined ? skuToScan : purgeSkuInput).trim();
      const result = await scanTransferLogs(target || undefined);
      setPurgeScanResult(result);
      if (result.deletableLogs.length > 0) {
        showToast(`Ditemukan ${result.deletableLogs.length} baris log TRANSFER siap hapus (${result.protectedLogs.length} diproteksi).`, 'info');
      } else if (result.protectedLogs.length > 0) {
        showToast(`Semua ${result.protectedLogs.length} log TRANSFER diproteksi aman (tidak boleh dihapus).`, 'info');
      } else {
        showToast('Tidak ada data TRANSFER yang ditemukan.', 'success');
      }
    } catch (err: any) {
      console.error('Error scanning TRANSFER logs:', err);
      showToast('Gagal memindai log TRANSFER: ' + (err?.message || err), 'error');
    } finally {
      setIsScanningPurge(false);
    }
  };

  const handleToggleSelectPurge = (id: string) => {
    setSelectedPurgeIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllVisiblePurge = (visibleIds: string[]) => {
    setSelectedPurgeIds(prev => {
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

  const handleClearPurgeSelection = () => {
    setSelectedPurgeIds(new Set());
  };

  const handleDeleteSelectedPurge = async (items?: TransferPurgeItem[]) => {
    if (!purgeScanResult) return;
    const targets = items || purgeScanResult.deletableLogs.filter(item => selectedPurgeIds.has(item.id));
    if (targets.length === 0) {
      showToast('Pilih setidaknya satu baris TRANSFER untuk dihapus.', 'info');
      return;
    }

    try {
      setIsDeletingPurge(true);
      const targetIds = targets.map(t => t.id);
      const { successCount, errorCount } = await deleteTransferLogs(targetIds);
      if (errorCount === 0) {
        showToast(`Berhasil menghapus ${successCount} baris log TRANSFER!`, 'success');
      } else {
        showToast(`Berhasil menghapus ${successCount} baris, ${errorCount} gagal.`, 'warning');
      }

      await handleScanTransferPurge(purgeSkuInput);
      loadLogEntries(currentPage, itemsPerPage);
    } catch (err: any) {
      console.error('Error deleting TRANSFER logs:', err);
      showToast('Terjadi kesalahan saat menghapus data: ' + (err?.message || err), 'error');
    } finally {
      setIsDeletingPurge(false);
    }
  };

  const handleDeleteAllPurge = async () => {
    if (!purgeScanResult || purgeScanResult.deletableLogs.length === 0) {
      showToast('Tidak ada log TRANSFER yang dapat dihapus.', 'info');
      return;
    }
    await handleDeleteSelectedPurge(purgeScanResult.deletableLogs);
  };

  // --- SINKRON RAK OUT HANDLERS ---
  const handleScanSyncOut = async (skuToScan?: string) => {
    try {
      setIsScanningSyncOut(true);
      setSelectedSyncOutIds(new Set());
      const target = (skuToScan !== undefined ? skuToScan : syncOutSkuInput).trim();
      const result = await scanMismatchedOutLogs(target || undefined);
      setSyncOutScanResult(result);
      if (result.restorableItems.length > 0) {
        showToast(`Ditemukan ${result.restorableItems.length} baris transaksi OUT siap dikembalikan (${result.protectedItems.length} diproteksi).`, 'info');
      } else if (result.protectedItems.length > 0) {
        showToast(`Semua ${result.protectedItems.length} transaksi OUT diproteksi aman (tidak boleh diubah).`, 'info');
      } else {
        showToast('Semua transaksi OUT sudah sesuai dengan nota masuk Gudang J/H!', 'success');
      }
    } catch (err: any) {
      console.error('Error scanning mismatched OUT logs:', err);
      showToast('Gagal memindai rak OUT: ' + (err?.message || err), 'error');
    } finally {
      setIsScanningSyncOut(false);
    }
  };

  const handleToggleSelectSyncOut = (id: string) => {
    setSelectedSyncOutIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllVisibleSyncOut = (visibleIds: string[]) => {
    setSelectedSyncOutIds(prev => {
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

  const handleClearSyncOutSelection = () => {
    setSelectedSyncOutIds(new Set());
  };

  const handleFixSelectedSyncOut = async (items?: MismatchedOutRakItem[]) => {
    if (!syncOutScanResult) return;
    const candidates = items || syncOutScanResult.mismatchedItems.filter(item => selectedSyncOutIds.has(item.id));
    const targets = candidates.filter(item => !item.isProtected);

    if (targets.length === 0) {
      showToast('Pilih setidaknya satu baris transaksi OUT yang tidak diproteksi untuk dikembalikan raknya.', 'info');
      return;
    }

    try {
      setIsFixingSyncOut(true);
      const updatePayload = targets.map(t => ({
        id: t.id,
        correctRak: t.correctRak,
        correctSubRak: t.correctSubRak
      }));

      const { successCount, errorCount } = await restoreOutRakLogs(updatePayload);
      if (errorCount === 0) {
        showToast(`Berhasil mengembalikan rak ${successCount} transaksi OUT sesuai nota masuk!`, 'success');
      } else {
        showToast(`Berhasil mengembalikan ${successCount} baris, ${errorCount} gagal.`, 'warning');
      }

      await handleScanSyncOut(syncOutSkuInput);
      loadLogEntries(currentPage, itemsPerPage);
    } catch (err: any) {
      console.error('Error restoring OUT rak:', err);
      showToast('Terjadi kesalahan saat mengembalikan rak: ' + (err?.message || err), 'error');
    } finally {
      setIsFixingSyncOut(false);
    }
  };

  const handleFixAllSyncOut = async () => {
    if (!syncOutScanResult || syncOutScanResult.restorableItems.length === 0) {
      showToast('Tidak ada transaksi OUT yang dapat diperbaiki (semua diproteksi atau sudah sesuai).', 'info');
      return;
    }
    await handleFixSelectedSyncOut(syncOutScanResult.restorableItems);
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
        .select('*', { count: 'estimated', head: true });

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

      const hasSpecificFilter = Boolean(
        activeBulkSkuSearch.length > 0 ||
        currentFilters.sku || 
        currentFilters.type || 
        currentFilters.gudang || 
        currentFilters.rak || 
        currentFilters.subRak || 
        currentFilters.waktu || 
        currentFilters.user || 
        currentFilters.logUpdateUser || 
        currentFilters.tanggal || 
        currentFilters.tglScan ||
        currentFilters.excludeTransfer
      );
      const countMode = hasSpecificFilter ? 'exact' : 'estimated';

      let query = supabase
        .from('database_log')
        .select('*', { count: countMode })
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

      if (activeBulkSkuSearch.length > 0) {
        if (bulkSkuSearchMode === 'exact') {
          const termsSet = new Set<string>();
          activeBulkSkuSearch.forEach(t => {
            const trimmed = t.trim();
            if (trimmed) {
              termsSet.add(trimmed);
              termsSet.add(trimmed.toUpperCase());
              termsSet.add(trimmed.toLowerCase());
            }
          });
          query = query.in('sku', Array.from(termsSet));
        } else {
          const orTerms = activeBulkSkuSearch
            .map(t => t.trim().replace(/[,()%]/g, ''))
            .filter(Boolean)
            .slice(0, 50)
            .map(t => `sku.ilike.%${t}%`);
          if (orTerms.length > 0) {
            query = query.or(orTerms.join(','));
          }
        }
        if (currentFilters.sku) {
          query = query.ilike('sku', `%${currentFilters.sku}%`);
        }
      } else if (currentFilters.sku) {
        query = query.eq('sku', currentFilters.sku);
      }
      if (currentFilters.type) {
        query = query.eq('type', currentFilters.type);
      }
      if (currentFilters.gudang) {
        query = query.ilike('gudang', `%${currentFilters.gudang}%`);
      }
      if (currentFilters.excludeTransfer) {
        query = query.neq('gudang', 'TRANSFER');
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
      if (currentFilters.user) {
        query = query.ilike('user_name', `%${currentFilters.user}%`);
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
  }, [debouncedFilters, activeBulkSkuSearch, bulkSkuSearchMode, currentPage, itemsPerPage, sortConfig]);

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
        const entryRak = (entry.rak || '').trim().toUpperCase();
        const normJumlah = Math.abs(Number(entry.jumlah || 0));
        const key = `${normTgl}_${normWaktu}_${normSku}_${entryRak}_${normJumlah}`;
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

  const handleCopySelectedSkus = async () => {
    if (selectedIds.size === 0) {
      showToast('Pilih setidaknya satu data terlebih dahulu', 'warning');
      return;
    }

    try {
      setIsBulkOperationLoading(true);
      const selectedArray = Array.from(selectedIds);
      let skuList: string[] = [];

      // Check if all selected IDs are already present in current page `filteredEntries`
      const entriesMap = new Map<string, string>();
      filteredEntries.forEach(item => {
        if (item.id && item.sku) {
          entriesMap.set(item.id, item.sku);
        }
      });

      const allInCurrentPage = selectedArray.every(id => entriesMap.has(id));

      if (allInCurrentPage) {
        skuList = selectedArray.map(id => entriesMap.get(id) || '').filter(Boolean);
      } else {
        // Fetch SKUs in safe small batches (50 UUIDs max per GET request) to avoid 400 Bad Request / URL length limit
        const batchSize = 50;
        const batches: string[][] = [];
        for (let i = 0; i < selectedArray.length; i += batchSize) {
          batches.push(selectedArray.slice(i, i + batchSize));
        }

        // Process in concurrent pools of 6 requests for ultra fast completion
        const concurrency = 6;
        for (let i = 0; i < batches.length; i += concurrency) {
          const chunk = batches.slice(i, i + concurrency);
          await Promise.all(
            chunk.map(async (batchIds) => {
              const { data, error } = await supabase
                .from('database_log')
                .select('id, sku')
                .in('id', batchIds);

              if (error) throw error;
              if (data) {
                data.forEach((row: any) => {
                  if (row.sku) {
                    entriesMap.set(row.id, row.sku);
                  }
                });
              }
            })
          );
        }
        skuList = selectedArray.map(id => entriesMap.get(id) || '').filter(Boolean);
      }

      if (skuList.length === 0) {
        showToast('Tidak ada data SKU yang dapat disalin', 'warning');
        return;
      }

      // Format vertikal (newline \n) agar saat di-paste di Excel / Spreadsheet masuk ke baris kolom A1, A2, A3...
      const textToCopy = skuList.join('\n');

      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = textToCopy;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }

      setIsCopiedSku(true);
      showToast(`Berhasil menyalin ${skuList.length} SKU (format vertikal) ke clipboard!`, 'success');
      setTimeout(() => {
        setIsCopiedSku(false);
      }, 2500);
    } catch (err) {
      console.error('Error copying SKUs:', err);
      showToast('Gagal menyalin SKU ke clipboard', 'error');
    } finally {
      setIsBulkOperationLoading(false);
    }
  };

  const handleCopySelectedMoveReport = async () => {
    if (selectedIds.size === 0) {
      showToast('Pilih setidaknya satu data terlebih dahulu', 'warning');
      return;
    }

    try {
      setIsBulkOperationLoading(true);
      const selectedArray = Array.from(selectedIds);
      let selectedEntries: any[] = [];

      const entriesMap = new Map<string, any>();
      filteredEntries.forEach(item => {
        if (item.id) entriesMap.set(item.id, item);
      });

      const allInCurrentPage = selectedArray.every(id => entriesMap.has(id));
      if (allInCurrentPage) {
        selectedEntries = selectedArray.map(id => entriesMap.get(id)).filter(Boolean);
      } else {
        const batchSize = 50;
        for (let i = 0; i < selectedArray.length; i += batchSize) {
          const chunk = selectedArray.slice(i, i + batchSize);
          const { data, error } = await supabase
            .from('database_log')
            .select('id, sku, rak, sub_rak, tgl, tgl_scan, type, jumlah, log_update_user')
            .in('id', chunk);
          if (error) throw error;
          if (data) selectedEntries.push(...data);
        }
      }

      const lines: string[] = [];
      selectedEntries.forEach(e => {
        const redistInfo = getRedistributeMoveInfo(e.log_update_user);
        if (redistInfo) {
          lines.push(formatMoveReportSentence(e.sku, redistInfo.fromRak, redistInfo.toRak));
        } else {
          lines.push(`${e.sku} di rak ${e.rak || '-'}`);
        }
      });

      const uniqueLines = Array.from(new Set(lines));
      if (uniqueLines.length === 0) {
        showToast('Tidak ada data yang dapat disalin', 'warning');
        return;
      }

      const textToCopy = uniqueLines.join('\n');
      await navigator.clipboard.writeText(textToCopy);
      showToast(`Berhasil menyalin ${uniqueLines.length} baris Laporan Pindah Rak ke clipboard!`, 'success');
    } catch (err: any) {
      console.error('Error copying move report:', err);
      showToast(`Gagal menyalin laporan: ${err.message}`, 'error');
    } finally {
      setIsBulkOperationLoading(false);
    }
  };

  const handleCopySelectedDeficitReport = async () => {
    if (selectedIds.size === 0) {
      showToast('Pilih setidaknya satu data terlebih dahulu', 'warning');
      return;
    }

    try {
      setIsBulkOperationLoading(true);
      const selectedArray = Array.from(selectedIds);
      let selectedEntries: any[] = [];

      const entriesMap = new Map<string, any>();
      filteredEntries.forEach(item => {
        if (item.id) entriesMap.set(item.id, item);
      });

      const allInCurrentPage = selectedArray.every(id => entriesMap.has(id));
      if (allInCurrentPage) {
        selectedEntries = selectedArray.map(id => entriesMap.get(id)).filter(Boolean);
      } else {
        const batchSize = 50;
        for (let i = 0; i < selectedArray.length; i += batchSize) {
          const chunk = selectedArray.slice(i, i + batchSize);
          const { data, error } = await supabase
            .from('database_log')
            .select('id, sku, rak, sub_rak, tgl, tgl_scan, type, jumlah, log_update_user')
            .in('id', chunk);
          if (error) throw error;
          if (data) selectedEntries.push(...data);
        }
      }

      // Group by SKU + Rak + Tgl Scan to compute net deficit
      const map = new Map<string, { sku: string; rak: string; tglScan: string; inQty: number; outQty: number }>();
      selectedEntries.forEach(e => {
        const key = `${e.sku}|${e.rak}|${e.tgl_scan || ''}`;
        if (!map.has(key)) {
          map.set(key, { sku: e.sku, rak: e.rak, tglScan: e.tgl_scan || '', inQty: 0, outQty: 0 });
        }
        const g = map.get(key)!;
        if ((e.type || '').toUpperCase() === 'IN') g.inQty += (e.jumlah || 0);
        else g.outQty += (e.jumlah || 0);
      });

      const lines: string[] = [];
      map.forEach(g => {
        const balance = g.inQty - g.outQty;
        if (balance < 0) {
          lines.push(formatDeficitReportSentence(g.sku, g.rak, g.tglScan, balance, g.inQty, g.outQty));
        }
      });

      if (lines.length === 0) {
        // Fallback: list selected OUT rows
        selectedEntries.filter(e => (e.type || '').toUpperCase() === 'OUT').forEach(e => {
          lines.push(`${e.sku} di rak ${e.rak} (Tgl Scan: ${formatDateDisplay(e.tgl_scan || e.tgl)}) Qty OUT: ${e.jumlah} pcs`);
        });
      }

      if (lines.length === 0) {
        showToast('Tidak ditemukan transaksi pemotongan (OUT) / lebih potong pada data terpilih.', 'warning');
        return;
      }

      const textToCopy = lines.join('\n');
      await navigator.clipboard.writeText(textToCopy);
      showToast(`Berhasil menyalin ${lines.length} baris Laporan Lebih Potong ke clipboard!`, 'success');
    } catch (err: any) {
      console.error('Error copying deficit report:', err);
      showToast(`Gagal menyalin laporan lebih potong: ${err.message}`, 'error');
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

  const handleBulkClearTglScan = async () => {
    if (selectedIds.size === 0) return;

    if (!confirm(`Apakah Anda yakin ingin menghapus / mengosongkan Tgl Scan untuk ${selectedIds.size} data terpilih?`)) {
      return;
    }

    try {
      setIsBulkOperationLoading(true);
      const selectedArray = Array.from(selectedIds);
      const batchSize = 100;
      let totalSuccess = 0;
      let totalError = 0;
      const todayStr = new Date().toISOString().slice(0, 10);

      for (let i = 0; i < selectedArray.length; i += batchSize) {
        const batchIds = selectedArray.slice(i, i + batchSize);
        const { error: updateError } = await supabase
          .from('database_log')
          .update({
            tgl_scan: null,
            log_update_user: `DEVMODE: Hapus Tgl Scan (${todayStr})`
          })
          .in('id', batchIds);

        if (updateError) {
          console.error('Error clearing tgl_scan:', updateError);
          totalError += batchIds.length;
        } else {
          totalSuccess += batchIds.length;
        }
      }

      if (totalError === 0) {
        showToast(`Berhasil mengosongkan Tgl Scan untuk ${totalSuccess} data!`, 'success');
      } else {
        showToast(`Berhasil mengosongkan Tgl Scan untuk ${totalSuccess} data, ${totalError} gagal.`, 'warning');
      }

      clearSelection();
      loadLogEntries(currentPage, itemsPerPage);
    } catch (error: any) {
      console.error('Error in handleBulkClearTglScan:', error);
      showToast(`Terjadi kesalahan saat mengosongkan Tgl Scan: ${error?.message || error}`, 'error');
    } finally {
      setIsBulkOperationLoading(false);
    }
  };

  // --- HANDLER HAPUS TGL SCAN BATCH MINUS / DEFISIT (MASSAL & SATU PERSATU) ---
  const handleOpenClearDeficitModal = () => {
    const deficitBatches = batchGroupData.filter(g => g.balance < 0);
    if (deficitBatches.length === 0) {
      showToast('Tidak ditemukan batch yang berstatus minus (defisit).', 'info');
      return;
    }
    const outWithScan = deficitBatches.flatMap(g => g.outEntries.filter(e => Boolean(e.tgl_scan)));
    if (outWithScan.length === 0) {
      showToast('Seluruh batch minus sudah tidak memiliki Tgl Scan pada transaksi OUT-nya.', 'info');
      return;
    }
    setIsClearDeficitModalOpen(true);
  };

  const handleExecuteClearDeficitBatches = async (selectedGroupIds: string[]) => {
    if (selectedGroupIds.length === 0) {
      showToast('Pilih minimal 1 batch minus untuk dikosongkan Tgl Scan-nya.', 'warning');
      return;
    }

    const targetGroups = batchGroupData.filter(g => selectedGroupIds.includes(g.id));
    const outEntriesToClear = targetGroups.flatMap(g => g.outEntries.filter(e => Boolean(e.tgl_scan)));
    const outIdsToClear = outEntriesToClear.map(e => e.id);

    if (outIdsToClear.length === 0) {
      showToast('Tidak ada transaksi OUT dengan Tgl Scan pada batch terpilih.', 'info');
      return;
    }

    try {
      setIsClearingDeficitScanDates(true);
      const batchSize = 100;
      let totalSuccess = 0;
      let totalError = 0;
      const todayStr = new Date().toISOString().slice(0, 10);

      for (let i = 0; i < outIdsToClear.length; i += batchSize) {
        const chunkIds = outIdsToClear.slice(i, i + batchSize);
        const { error: updateError } = await supabase
          .from('database_log')
          .update({
            tgl_scan: null,
            log_update_user: `DEVMODE: Hapus Tgl Scan Batch Minus (${todayStr})`
          })
          .in('id', chunkIds);

        if (updateError) {
          console.error('Error clearing deficit batch tgl_scan:', updateError);
          totalError += chunkIds.length;
        } else {
          totalSuccess += chunkIds.length;
        }
      }

      if (totalError === 0) {
        showToast(`Berhasil mengosongkan Tgl Scan untuk ${totalSuccess} transaksi OUT pada ${targetGroups.length} batch minus!`, 'success');
      } else {
        showToast(`Berhasil mengosongkan Tgl Scan untuk ${totalSuccess} data, ${totalError} gagal.`, 'warning');
      }

      setIsClearDeficitModalOpen(false);
      clearSelection();
      loadLogEntries(currentPage, itemsPerPage);
    } catch (error: any) {
      console.error('Error in handleExecuteClearDeficitBatches:', error);
      showToast(`Terjadi kesalahan saat mengosongkan Tgl Scan batch minus: ${error?.message || error}`, 'error');
    } finally {
      setIsClearingDeficitScanDates(false);
    }
  };

  const handleClearTglScanForBatch = async (group: BatchGroupItem) => {
    const outEntriesToClear = group.outEntries.filter(e => Boolean(e.tgl_scan));
    if (outEntriesToClear.length === 0) {
      showToast('Tidak ada transaksi OUT dengan Tgl Scan di batch ini.', 'warning');
      return;
    }

    const outIdsToClear = outEntriesToClear.map(e => e.id);
    const totalPcs = outEntriesToClear.reduce((sum, e) => sum + (Number(e.jumlah) || 0), 0);

    const rakText = group.rak ? `Rak: ${group.rak}, ` : '';
    if (!confirm(`Hapus Tgl Scan untuk ${outIdsToClear.length} transaksi OUT (${totalPcs} pcs) pada Batch ${group.sku} (${rakText}Tgl Scan: ${group.tglScan}) yang defisit ${group.balance} pcs?\n\nSetelah dikosongkan, transaksi OUT ini tidak lagi membebani batch tanggal ${group.tglScan}.`)) {
      return;
    }

    try {
      setIsBulkOperationLoading(true);
      const todayStr = new Date().toISOString().slice(0, 10);
      const { error: updateError } = await supabase
        .from('database_log')
        .update({
          tgl_scan: null,
          log_update_user: `DEVMODE: Hapus Tgl Scan Batch Minus (${todayStr})`
        })
        .in('id', outIdsToClear);

      if (updateError) {
        throw updateError;
      }

      showToast(`Berhasil mengosongkan Tgl Scan untuk ${outIdsToClear.length} transaksi OUT pada batch ${group.sku}!`, 'success');
      loadLogEntries(currentPage, itemsPerPage);
    } catch (error: any) {
      console.error('Error clearing batch tgl_scan:', error);
      showToast(`Gagal mengosongkan Tgl Scan batch: ${error?.message || error}`, 'error');
    } finally {
      setIsBulkOperationLoading(false);
    }
  };

  const handleResetBatchAnomaly = async (group: BatchGroupItem) => {
    const anomalyOuts = (group.timeAnomalyOuts || group.sortedEntries.filter(e => e.isTimeAnomaly && e.type === 'OUT'))
      .filter(e => Boolean(e.tgl_scan));

    if (anomalyOuts.length === 0) {
      showToast('Tidak ada transaksi OUT anomali bertanggal lampau dengan Tgl Scan di batch ini.', 'warning');
      return;
    }

    const outIdsToClear = anomalyOuts.map(e => e.id);
    const totalPcs = anomalyOuts.reduce((sum, e) => sum + (Number(e.jumlah) || 0), 0);
    const rakText = group.rak ? `Rak: ${group.rak}, ` : '';

    if (!confirm(`Lepas Tgl Scan untuk ${outIdsToClear.length} transaksi OUT ANOMALI (${totalPcs} pcs) pada Batch ${group.sku} (${rakText}Tgl Scan: ${group.tglScan})?\n\nTransaksi-transaksi ini memiliki tanggal transaksi OUT yang LEBIH LAMPAU daripada tanggal IN Batch (${group.tglScan}), yang menyebabkan saldo batch ini minus semu.\n\nSetelah dilepas (tgl_scan menjadi kosong), transaksi OUT ini tidak akan lagi memotong batch ini.`)) {
      return;
    }

    try {
      setIsBulkOperationLoading(true);
      const todayStr = new Date().toISOString().slice(0, 10);
      const { error: updateError } = await supabase
        .from('database_log')
        .update({
          tgl_scan: null,
          log_update_user: `DEVMODE: Lepas Tgl Scan Anomali OUT < IN (${todayStr})`
        })
        .in('id', outIdsToClear);

      if (updateError) {
        throw updateError;
      }

      showToast(`Berhasil melepas Tgl Scan untuk ${outIdsToClear.length} transaksi OUT anomali pada batch ${group.sku}!`, 'success');
      loadLogEntries(currentPage, itemsPerPage);
    } catch (error: any) {
      console.error('Error clearing batch anomaly tgl_scan:', error);
      showToast(`Gagal melepas Tgl Scan transaksi anomali: ${error?.message || error}`, 'error');
    } finally {
      setIsBulkOperationLoading(false);
    }
  };

  const handleClearAllAnomalyOuts = async () => {
    const anomalyGroups = batchGroupData.filter(g => g.hasTimeAnomaly);
    const allAnomalyOuts: DatabaseLogEntry[] = [];
    anomalyGroups.forEach(g => {
      const outs = (g.timeAnomalyOuts || g.sortedEntries.filter(e => e.isTimeAnomaly && e.type === 'OUT'))
        .filter(e => Boolean(e.tgl_scan));
      allAnomalyOuts.push(...outs);
    });

    if (allAnomalyOuts.length === 0) {
      showToast('Tidak ada transaksi OUT anomali bertanggal lampau yang memiliki Tgl Scan.', 'warning');
      return;
    }

    const uniqueIds = Array.from(new Set(allAnomalyOuts.map(e => e.id)));
    const totalPcs = allAnomalyOuts.reduce((sum, e) => sum + (Number(e.jumlah) || 0), 0);

    if (!confirm(`Lepas Tgl Scan untuk SEMUA ${uniqueIds.length} transaksi OUT ANOMALI (${totalPcs} pcs) pada ${anomalyGroups.length} batch?\n\nTransaksi-transaksi ini terjadi pada tanggal transaksi OUT yang LEBIH LAMPAU daripada kedatangan Batch IN, sehingga menyebabkan saldo batch minus semu.\n\nSetelah dilepas (tgl_scan menjadi kosong), transaksi OUT ini akan kembali normal dan tidak lagi memotong batch yang salah.`)) {
      return;
    }

    try {
      setIsBulkOperationLoading(true);
      const batchSize = 100;
      let totalSuccess = 0;
      let totalError = 0;
      const todayStr = new Date().toISOString().slice(0, 10);

      for (let i = 0; i < uniqueIds.length; i += batchSize) {
        const chunkIds = uniqueIds.slice(i, i + batchSize);
        const { error: updateError } = await supabase
          .from('database_log')
          .update({
            tgl_scan: null,
            log_update_user: `DEVMODE: Lepas Massal Tgl Scan Anomali OUT < IN (${todayStr})`
          })
          .in('id', chunkIds);

        if (updateError) {
          console.error('Error clearing bulk anomaly tgl_scan:', updateError);
          totalError += chunkIds.length;
        } else {
          totalSuccess += chunkIds.length;
        }
      }

      if (totalError === 0) {
        showToast(`Berhasil melepas Tgl Scan untuk seluruh ${totalSuccess} transaksi OUT anomali!`, 'success');
      } else {
        showToast(`Berhasil melepas Tgl Scan untuk ${totalSuccess} transaksi, ${totalError} gagal.`, 'warning');
      }

      loadLogEntries(currentPage, itemsPerPage);
    } catch (error: any) {
      console.error('Error clearing bulk anomaly tgl_scan:', error);
      showToast(`Gagal melepas Tgl Scan transaksi anomali: ${error?.message || error}`, 'error');
    } finally {
      setIsBulkOperationLoading(false);
    }
  };

  const handleClearSingleEntryTglScan = async (entry: DatabaseLogEntry) => {
    if (!entry.tgl_scan) return;

    if (!confirm(`Hapus Tgl Scan (${entry.tgl_scan}) pada transaksi OUT ${entry.sku} (${entry.jumlah} pcs di rak ${entry.rak})?`)) {
      return;
    }

    try {
      setIsBulkOperationLoading(true);
      const todayStr = new Date().toISOString().slice(0, 10);
      const { error: updateError } = await supabase
        .from('database_log')
        .update({
          tgl_scan: null,
          log_update_user: `DEVMODE: Hapus Tgl Scan Transaksi (${todayStr})`
        })
        .eq('id', entry.id);

      if (updateError) {
        throw updateError;
      }

      showToast(`Tgl Scan (${entry.tgl_scan}) berhasil dikosongkan!`, 'success');
      loadLogEntries(currentPage, itemsPerPage);
    } catch (error: any) {
      console.error('Error clearing single tgl_scan:', error);
      showToast(`Gagal mengosongkan Tgl Scan: ${error?.message || error}`, 'error');
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
        if (activeBulkSkuSearch.length > 0) {
          if (bulkSkuSearchMode === 'exact') {
            const termsSet = new Set<string>();
            activeBulkSkuSearch.forEach(t => {
              const trimmed = t.trim();
              if (trimmed) {
                termsSet.add(trimmed);
                termsSet.add(trimmed.toUpperCase());
                termsSet.add(trimmed.toLowerCase());
              }
            });
            countQuery = countQuery.in('sku', Array.from(termsSet));
          } else {
            const orTerms = activeBulkSkuSearch
              .map(t => t.trim().replace(/[,()%]/g, ''))
              .filter(Boolean)
              .slice(0, 50)
              .map(t => `sku.ilike.%${t}%`);
            if (orTerms.length > 0) {
              countQuery = countQuery.or(orTerms.join(','));
            }
          }
          if (filters.sku) countQuery = countQuery.ilike('sku', `%${filters.sku}%`);
        } else if (filters.sku) {
          countQuery = countQuery.eq('sku', filters.sku);
        }
        if (filters.type) countQuery = countQuery.eq('type', filters.type);
        if (filters.gudang) countQuery = countQuery.ilike('gudang', `%${filters.gudang}%`);
        if (filters.excludeTransfer) countQuery = countQuery.neq('gudang', 'TRANSFER');
        if (filters.rak) countQuery = countQuery.ilike('rak', `%${filters.rak}%`);
        if (filters.subRak) countQuery = countQuery.ilike('sub_rak', `%${filters.subRak}%`);
        if (filters.waktu) {
          const rawW = filters.waktu.trim();
          const colonW = rawW.replace(/\./g, ':');
          const dotW = rawW.replace(/:/g, '.');
          countQuery = countQuery.or(`waktu.ilike.%${rawW}%,waktu.ilike.%${colonW}%,waktu.ilike.%${dotW}%`);
        }
        if (filters.logUpdateUser) countQuery = countQuery.ilike('log_update_user', `%${filters.logUpdateUser}%`);
        if (filters.user) countQuery = countQuery.ilike('user_name', `%${filters.user}%`);
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
          if (activeBulkSkuSearch.length > 0) {
            if (bulkSkuSearchMode === 'exact') {
              const termsSet = new Set<string>();
              activeBulkSkuSearch.forEach(t => {
                const trimmed = t.trim();
                if (trimmed) {
                  termsSet.add(trimmed);
                  termsSet.add(trimmed.toUpperCase());
                  termsSet.add(trimmed.toLowerCase());
                }
              });
              batchQuery = batchQuery.in('sku', Array.from(termsSet));
            } else {
              const orTerms = activeBulkSkuSearch
                .map(t => t.trim().replace(/[,()%]/g, ''))
                .filter(Boolean)
                .slice(0, 50)
                .map(t => `sku.ilike.%${t}%`);
              if (orTerms.length > 0) {
                batchQuery = batchQuery.or(orTerms.join(','));
              }
            }
            if (filters.sku) batchQuery = batchQuery.ilike('sku', `%${filters.sku}%`);
          } else if (filters.sku) {
            batchQuery = batchQuery.eq('sku', filters.sku);
          }
          if (filters.type) batchQuery = batchQuery.eq('type', filters.type);
          if (filters.gudang) batchQuery = batchQuery.ilike('gudang', `%${filters.gudang}%`);
          if (filters.excludeTransfer) batchQuery = batchQuery.neq('gudang', 'TRANSFER');
          if (filters.rak) batchQuery = batchQuery.ilike('rak', `%${filters.rak}%`);
          if (filters.subRak) batchQuery = batchQuery.ilike('sub_rak', `%${filters.subRak}%`);
          if (filters.waktu) {
            const rawW = filters.waktu.trim();
            const colonW = rawW.replace(/\./g, ':');
            const dotW = rawW.replace(/:/g, '.');
            batchQuery = batchQuery.or(`waktu.ilike.%${rawW}%,waktu.ilike.%${colonW}%,waktu.ilike.%${dotW}%`);
          }
          if (filters.user) batchQuery = batchQuery.ilike('user_name', `%${filters.user}%`);
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

      {/* DEV TOOLS MODAL DIALOG - 100% RESPONSIVE & UNCONSTRAINED */}
      {isDevToolsModalOpen && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsDevToolsModalOpen(false);
          }}
        >
          <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 text-left normal-case">
            {/* Modal Header */}
            <div className="p-4 sm:p-6 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-400/30">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                    Panel Alat Pemeliharaan & Audit
                    <span className="px-2 py-0.5 rounded-lg bg-amber-400/20 text-amber-300 text-[10px] font-black border border-amber-400/30">
                      DevMode
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    Kumpulan alat diagnosa saldo stok, audit transfer, dan perbaikan data log database
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDevToolsModalOpen(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-6 custom-scrollbar">
              {/* Section 1: Sinkronisasi & Perbaikan Tanggal */}
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-2 mb-3">
                  <Calendar className="w-4 h-4" /> 1. Sinkronisasi & Perbaikan Tanggal
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={handleFixDates}
                    disabled={isMigrating || isRepairing || isSyncingSubRak || isFixingTransferDates}
                    className="p-3.5 sm:p-4 rounded-2xl bg-slate-800/70 hover:bg-amber-500/15 border border-slate-700/80 hover:border-amber-400/50 transition-all active:scale-[0.98] text-left flex items-start gap-3 group disabled:opacity-50 cursor-pointer"
                  >
                    <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-400/30 group-hover:bg-amber-500 group-hover:text-white transition-colors shrink-0">
                      <ArrowUpDown className={`h-5 w-5 ${isMigrating ? 'animate-spin' : ''}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-black text-white group-hover:text-amber-200">
                        {isMigrating 
                          ? (migrationProgress.total > 0 ? `Fixing ${Math.round((migrationProgress.current / migrationProgress.total) * 100)}%` : 'Fixing...')
                          : 'Fix Date'}
                      </div>
                      <div className="text-xs text-slate-400 font-medium mt-0.5">Perbaiki sinkronisasi tanggal log sesuai nota barang masuk</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={handleFixScanDates}
                    disabled={isMigrating || isRepairing || isSyncingSubRak || isFixingTransferDates}
                    className="p-3.5 sm:p-4 rounded-2xl bg-slate-800/70 hover:bg-indigo-500/15 border border-slate-700/80 hover:border-indigo-400/50 transition-all active:scale-[0.98] text-left flex items-start gap-3 group disabled:opacity-50 cursor-pointer"
                  >
                    <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-400/30 group-hover:bg-indigo-500 group-hover:text-white transition-colors shrink-0">
                      <Calendar className={`h-5 w-5 ${isRepairing ? 'animate-spin' : ''}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-black text-white group-hover:text-indigo-200">
                        {isRepairing 
                          ? (migrationProgress.total > 0 ? `Repair ${Math.round((migrationProgress.current / migrationProgress.total) * 100)}%` : 'Repairing...')
                          : 'Fix Scan'}
                      </div>
                      <div className="text-xs text-slate-400 font-medium mt-0.5">Perbaiki tanggal scan barcode QR di database log</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={handleSyncAllSubRakWithRak}
                    disabled={isMigrating || isRepairing || isSyncingSubRak || isFixingTransferDates}
                    className="p-3.5 sm:p-4 rounded-2xl bg-slate-800/70 hover:bg-teal-500/15 border border-slate-700/80 hover:border-teal-400/50 transition-all active:scale-[0.98] text-left flex items-start gap-3 group disabled:opacity-50 cursor-pointer"
                    title="Samakan SEMUA Sub Rak = Rak di database_log"
                  >
                    <div className="p-2.5 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-400/30 group-hover:bg-teal-500 group-hover:text-white transition-colors shrink-0">
                      <RefreshCw className={`h-5 w-5 ${isSyncingSubRak ? 'animate-spin' : ''}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-black text-white group-hover:text-teal-200">
                        {isSyncingSubRak 
                          ? (subRakProgress.total > 0 ? `Sync ${Math.round((subRakProgress.current / subRakProgress.total) * 100)}%` : 'Syncing...')
                          : 'Fix Sub Rak'}
                      </div>
                      <div className="text-xs text-slate-400 font-medium mt-0.5">Samakan seluruh kolom Sub Rak = Rak di database log</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={handleFixAllTransferDates}
                    disabled={isMigrating || isRepairing || isSyncingSubRak || isFixingTransferDates}
                    className="p-3.5 sm:p-4 rounded-2xl bg-slate-800/70 hover:bg-purple-500/15 border border-slate-700/80 hover:border-purple-400/50 transition-all active:scale-[0.98] text-left flex items-start gap-3 group disabled:opacity-50 cursor-pointer"
                    title="Perbaiki Tanggal Log TRANSFER Sesuai Tanggal Barang Masuk Asli"
                  >
                    <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-400/30 group-hover:bg-purple-500 group-hover:text-white transition-colors shrink-0">
                      <Calendar className={`h-5 w-5 ${isFixingTransferDates ? 'animate-spin' : ''}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-black text-white group-hover:text-purple-200">
                        {isFixingTransferDates 
                          ? `Fixing ${transferFixProgress.percent}%` 
                          : 'Fix Transfer Date'}
                      </div>
                      <div className="text-xs text-slate-400 font-medium mt-0.5">Perbaiki tanggal log transfer (IN & OUT berpasangan)</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Section 2: Audit & Diagnosa Stok */}
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-indigo-400 flex items-center gap-2 mb-3">
                  <Calculator className="w-4 h-4" /> 2. Audit & Diagnosa Stok
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsDevToolsModalOpen(false);
                      setIsAnalysisModalOpen(true);
                      const targetSku = filters.sku || analysisSku;
                      if (targetSku) {
                        setAnalysisSku(targetSku);
                        handleAnalyzeStockBalance(targetSku);
                      } else {
                        setAnalysisResults([]);
                      }
                    }}
                    className="p-3.5 sm:p-4 rounded-2xl bg-slate-800/70 hover:bg-teal-500/15 border border-slate-700/80 hover:border-teal-400/50 transition-all active:scale-[0.98] text-left flex flex-col gap-2.5 group cursor-pointer"
                    title="Cek Saldo Stok & Diagnosa Data Minus / Lebih Potong"
                  >
                    <div className="p-2.5 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-400/30 group-hover:bg-teal-500 group-hover:text-white transition-colors w-fit">
                      <Calculator className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-black text-white group-hover:text-teal-200">Cek Saldo / Audit Minus</div>
                      <div className="text-xs text-slate-400 font-medium mt-0.5">Diagnosa saldo stok dan deteksi data minus</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsDevToolsModalOpen(false);
                      const target = filters.sku || '';
                      setScanDateAutoMatchSku(target);
                      setIsScanDateAutoMatchModalOpen(true);
                    }}
                    className="p-3.5 sm:p-4 rounded-2xl bg-slate-800/70 hover:bg-cyan-500/15 border border-slate-700/80 hover:border-cyan-400/50 transition-all active:scale-[0.98] text-left flex flex-col gap-2.5 group cursor-pointer"
                    title="Klop Tgl Scan & Rak OUT (Auto-Match Tgl Masuk IN)"
                  >
                    <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-400/30 group-hover:bg-cyan-500 group-hover:text-white transition-colors w-fit">
                      <CheckCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-black text-white group-hover:text-cyan-200">Klop Tgl Scan & Rak OUT</div>
                      <div className="text-xs text-slate-400 font-medium mt-0.5">Selaraskan tgl scan & rak OUT otomatis sesuai nota masuk IN terdekat</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsDevToolsModalOpen(false);
                      const target = filters.sku || '';
                      setSyncTransferOutSku(target);
                      setIsSyncTransferOutModalOpen(true);
                    }}
                    className="p-3.5 sm:p-4 rounded-2xl bg-slate-800/70 hover:bg-amber-500/15 border border-slate-700/80 hover:border-amber-400/50 transition-all active:scale-[0.98] text-left flex flex-col gap-2.5 group cursor-pointer"
                    title="Sinkronkan Tgl Scan TRANSFER OUT (Klop Rak Asal)"
                  >
                    <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-400/30 group-hover:bg-amber-500 group-hover:text-white transition-colors w-fit">
                      <ArrowRightLeft className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-black text-white group-hover:text-amber-200">Sinkron TRANSFER OUT</div>
                      <div className="text-xs text-slate-400 font-medium mt-0.5">Selaraskan tgl scan TRANSFER OUT ke tgl barang masuk rak asal (TRANSFER IN tetap real-time)</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsDevToolsModalOpen(false);
                      setIsTransferAuditModalOpen(true);
                      const targetSku = filters.sku || transferAuditSku;
                      if (targetSku) {
                        setTransferAuditSku(targetSku);
                        handleScanTransferAnomalies(targetSku);
                      } else {
                        handleScanTransferAnomalies('');
                      }
                    }}
                    className="p-3.5 sm:p-4 rounded-2xl bg-slate-800/70 hover:bg-indigo-500/15 border border-slate-700/80 hover:border-indigo-400/50 transition-all active:scale-[0.98] text-left flex flex-col gap-2.5 group cursor-pointer"
                    title="Audit Anomali Data Transfer (Duplikat, Gantung, & Selisih)"
                  >
                    <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-400/30 group-hover:bg-indigo-500 group-hover:text-white transition-colors w-fit">
                      <ArrowRightLeft className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-black text-white group-hover:text-indigo-200">Audit Transfer (IN/OUT)</div>
                      <div className="text-xs text-slate-400 font-medium mt-0.5">Deteksi anomali transfer duplikat & selisih</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsDevToolsModalOpen(false);
                      setIsChainAuditModalOpen(true);
                      const targetSku = filters.sku || chainAuditSku;
                      if (targetSku) {
                        setChainAuditSku(targetSku);
                        handleScanTransferChains(targetSku);
                      } else {
                        handleScanTransferChains('');
                      }
                    }}
                    className="p-3.5 sm:p-4 rounded-2xl bg-slate-800/70 hover:bg-violet-500/15 border border-slate-700/80 hover:border-violet-400/50 transition-all active:scale-[0.98] text-left flex flex-col gap-2.5 group cursor-pointer"
                    title="Audit & Perbaiki Rantai Transfer (Chain) & Potong Stok Keluar"
                  >
                    <div className="p-2.5 rounded-xl bg-violet-500/20 text-violet-400 border border-violet-400/30 group-hover:bg-violet-500 group-hover:text-white transition-colors w-fit">
                      <Link className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-black text-white group-hover:text-violet-200">Audit Transfer Chain</div>
                      <div className="text-xs text-slate-400 font-medium mt-0.5">Audit & perbaiki rantai transfer bertingkat</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsDevToolsModalOpen(false);
                      handleOpenSubsequentLogsFromTop();
                    }}
                    className="p-3.5 sm:p-4 rounded-2xl bg-slate-800/70 hover:bg-purple-500/15 border border-slate-700/80 hover:border-purple-400/50 transition-all active:scale-[0.98] text-left flex flex-col gap-2.5 group cursor-pointer"
                    title="Riwayat Mutasi Setelahnya & Perbaiki Salah Rak Transfer"
                  >
                    <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-400/30 group-hover:bg-purple-500 group-hover:text-white transition-colors w-fit">
                      <History className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-black text-white group-hover:text-purple-200">Riwayat Mutasi Setelahnya</div>
                      <div className="text-xs text-slate-400 font-medium mt-0.5">Analisis alur mutasi & perbaiki salah rak transfer</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Section 3: Pembersihan & Penyesuaian Data */}
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-rose-400 flex items-center gap-2 mb-3">
                  <Layers className="w-4 h-4" /> 3. Pembersihan & Penyesuaian Data
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsDevToolsModalOpen(false);
                      setIsTransferPurgeModalOpen(true);
                      const targetSku = filters.sku || purgeSkuInput;
                      setPurgeSkuInput(targetSku || '');
                      handleScanTransferPurge(targetSku || '');
                    }}
                    className="p-3.5 sm:p-4 rounded-2xl bg-slate-800/70 hover:bg-rose-500/15 border border-slate-700/80 hover:border-rose-400/50 transition-all active:scale-[0.98] text-left flex items-start gap-3 group cursor-pointer"
                    title="Pembersihan & Hapus Log TRANSFER (Dengan Proteksi Rak Khusus)"
                  >
                    <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-400/30 group-hover:bg-rose-500 group-hover:text-white transition-colors shrink-0">
                      <Trash2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-black text-white group-hover:text-rose-200">Hapus Log Transfer</div>
                      <div className="text-xs text-slate-400 font-medium mt-0.5">Pembersihan log transfer dengan proteksi rak khusus</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsDevToolsModalOpen(false);
                      setIsSyncOutRakModalOpen(true);
                      const targetSku = (filters.sku || syncOutSkuInput || '').trim();
                      setSyncOutSkuInput(targetSku);
                      if (targetSku) {
                        handleScanSyncOut(targetSku);
                      }
                    }}
                    className="p-3.5 sm:p-4 rounded-2xl bg-slate-800/70 hover:bg-emerald-500/15 border border-slate-700/80 hover:border-emerald-400/50 transition-all active:scale-[0.98] text-left flex items-start gap-3 group cursor-pointer"
                    title="Sinkron / Kembalikan Rak OUT Sesuai Nota Masuk Asli (Gudang J/H)"
                  >
                    <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-400/30 group-hover:bg-emerald-500 group-hover:text-white transition-colors shrink-0">
                      <RotateCcw className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-black text-white group-hover:text-emerald-200">Sinkron Rak OUT Nota</div>
                      <div className="text-xs text-slate-400 font-medium mt-0.5">Kembalikan rak OUT sesuai nota masuk asli</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsDevToolsModalOpen(false);
                      setIsSyncLt4Lt2ModalOpen(true);
                    }}
                    className="p-3.5 sm:p-4 rounded-2xl bg-slate-800/70 hover:bg-indigo-500/15 border border-slate-700/80 hover:border-indigo-400/50 transition-all active:scale-[0.98] text-left flex items-start gap-3 group cursor-pointer"
                    title="Penyelarasan Tanggal Mutasi Transfer LANTAI 4 ke LANTAI 2 (Accurate Tetap Aman)"
                  >
                    <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-400/30 group-hover:bg-indigo-500 group-hover:text-white transition-colors shrink-0">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-black text-white group-hover:text-indigo-200">Mutasi LT4 ➔ LT2</div>
                      <div className="text-xs text-slate-400 font-medium mt-0.5">Penyelarasan tanggal mutasi transfer Lantai 4 ke Lantai 2</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsDevToolsModalOpen(false);
                      setIsAdjustmentStockOutModalOpen(true);
                    }}
                    className="p-3.5 sm:p-4 rounded-2xl bg-slate-800/70 hover:bg-orange-500/15 border border-slate-700/80 hover:border-orange-400/50 transition-all active:scale-[0.98] text-left flex items-start gap-3 group cursor-pointer"
                    title="Pencarian Single/Massal SKU Stok Tersedia & Penyesuaian Stok OUT"
                  >
                    <div className="p-2.5 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-400/30 group-hover:bg-orange-500 group-hover:text-white transition-colors shrink-0">
                      <Layers className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-black text-white group-hover:text-orange-200">Penyesuaian Stok OUT</div>
                      <div className="text-xs text-slate-400 font-medium mt-0.5">Pencarian stok tersedia & penyesuaian stok keluar massal</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
          {/* PREMIUM IMMERSIVE HEADER (min-h 310px) */}
          <div className="flex flex-col mb-8 lg:mb-12 uppercase">
            <div className="bg-gradient-to-br from-blue-700 via-indigo-800 to-slate-900 -mx-3 lg:-mx-8 pt-[90px] lg:pt-0 lg:min-h-[310px] pb-[75px] lg:pb-0 px-6 lg:px-12 rounded-b-[40px] lg:rounded-b-[55px] shadow-2xl shadow-blue-900/40 relative overflow-hidden transition-all duration-500 flex flex-col justify-center">

              {/* Decorative Background Icon */}
              <div className="absolute -top-12 -right-12 text-white opacity-5 pointer-events-none">
                <Database className="w-72 h-72 lg:w-[480px] lg:h-[480px]" />
              </div>

              {/* Decorative Floating Elements */}
              <div className="absolute top-1/4 right-1/3 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl animate-pulse pointer-events-none"></div>
              <div className="absolute bottom-10 left-10 w-20 h-20 bg-indigo-500/10 rounded-3xl rotate-12 blur-xl pointer-events-none"></div>

              {/* Text Content */}
              <div className="relative z-10 w-full flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 lg:gap-8 uppercase">
                <div className="max-w-2xl">
                  <div className="flex items-center gap-2 mb-3 lg:mb-4 opacity-90">
                    <div className="w-10 h-[2px] bg-blue-400 rounded-full"></div>
                    <span className="text-[10px] lg:text-[12px] font-black tracking-[0.4em] text-blue-100">System Activity Repository</span>
                  </div>
                  <h1 className="text-[32px] sm:text-[40px] lg:text-[62px] font-black text-white tracking-tighter leading-[1] mb-3 uppercase">
                    Database <span className="text-blue-400">Log</span>
                  </h1>
                  <div className="text-blue-100/80 font-medium text-[13px] sm:text-[15px] lg:text-[18px] leading-relaxed max-w-[90%] normal-case flex flex-wrap items-center gap-2 sm:gap-3">
                    <div className="px-3 py-1 bg-white/10 rounded-full backdrop-blur-sm border border-white/10 flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                      </span>
                      <span className="text-[11px] font-bold tracking-widest uppercase">Live Monitoring</span>
                    </div>
                    <span className="opacity-60 hidden sm:inline">|</span>
                    <span className="text-[12px] sm:text-[14px] lg:text-[16px]">Pantau dan kelola riwayat transaksi data secara transparan</span>
                  </div>
                </div>

                {/* Global Actions Container - Fully Responsive */}
                <div className="relative z-10 flex flex-wrap gap-2 sm:gap-2.5 lg:gap-3 lg:mb-2 items-center">
                  {(loading || exportProgress.isExporting || importProgress.isImporting || isMigrating || isRepairing) && (
                    <div className="px-4 sm:px-5 py-2 sm:py-2.5 bg-blue-500/20 backdrop-blur-md border border-white/20 rounded-2xl flex items-center gap-2 sm:gap-3">
                      <RefreshCw className="w-4 h-4 text-white animate-spin" />
                      <span className="text-[10px] sm:text-[11px] font-black text-white tracking-[0.2em] uppercase">Processing</span>
                    </div>
                  )}

                  {showFixDates && (
                    <button
                      type="button"
                      onClick={() => setIsDevToolsModalOpen(true)}
                      className="h-11 sm:h-12 px-3.5 sm:px-4.5 bg-gradient-to-r from-amber-500/20 via-indigo-500/20 to-purple-500/20 hover:from-amber-500/30 hover:to-purple-500/30 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 border border-white/30 backdrop-blur-xl cursor-pointer"
                      title="Buka Panel Alat Pemeliharaan & Audit Data (DevMode)"
                    >
                      <Wrench className="h-4 w-4 text-amber-300" />
                      <span className="uppercase text-[10px] sm:text-[11px] font-black tracking-wider">Dev Tools</span>
                      <span className="px-1.5 py-0.5 rounded-md bg-amber-400/20 text-amber-300 text-[9px] sm:text-[10px] font-black border border-amber-400/30">11</span>
                    </button>
                  )}

                  <button
                    onClick={handleImport}
                    className="h-11 sm:h-12 px-4 sm:px-5 bg-white/10 hover:bg-white/20 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 border border-white/30 backdrop-blur-xl cursor-pointer"
                  >
                    <Upload className="h-4 w-4" />
                    <span className="uppercase text-[10px] sm:text-[11px] font-black">Import</span>
                  </button>

                  <button
                    onClick={() => setIsHistoryModalOpen(true)}
                    className="h-11 sm:h-12 px-4 sm:px-5 bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-black rounded-2xl shadow-[0_8px_25px_rgba(192,38,211,0.4)] transition-all active:scale-95 flex items-center justify-center gap-2 border border-fuchsia-400/50 cursor-pointer"
                  >
                    <History className="h-4 w-4" />
                    <span className="uppercase text-[10px] sm:text-[11px] font-black">Riwayat Export</span>
                  </button>

                  {showFixDates && (
                    <button
                      type="button"
                      onClick={() => handleOpenSubsequentLogsFromTop()}
                      className="h-11 sm:h-12 px-4 sm:px-5 bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-800 hover:from-purple-600 hover:to-indigo-600 text-white font-black rounded-2xl shadow-[0_8px_25px_rgba(147,51,234,0.4)] transition-all active:scale-95 flex items-center justify-center gap-2 border border-purple-400/50 cursor-pointer"
                      title="Buka Riwayat Mutasi Setelahnya & Perbaiki Salah Rak Transfer"
                    >
                      <History className="h-4 w-4 text-purple-200" />
                      <span className="uppercase text-[10px] sm:text-[11px] font-black tracking-wide">
                        Riwayat Mutasi Setelahnya
                      </span>
                    </button>
                  )}

                  <button
                    onClick={handleExport}
                    className="h-11 sm:h-12 px-4 sm:px-5 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-2xl shadow-[0_8px_25px_rgba(37,99,235,0.4)] transition-all active:scale-95 flex items-center justify-center gap-2 border border-blue-400/50 cursor-pointer"
                  >
                    <Download className="h-4 w-4" />
                    <span className="uppercase text-[10px] sm:text-[11px] font-black">Export</span>
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

            {/* QUICK FILTER BAR */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200/90 p-3 rounded-2xl shadow-sm mb-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mr-1">
                  <Filter className="w-3.5 h-3.5 text-blue-600" /> Filter Cepat:
                </span>

                <button
                  type="button"
                  onClick={() => {
                    if (filters.user === 'System (Cek Rak)') {
                      setFilters(prev => ({ ...prev, user: '' }));
                    } else {
                      setFilters(prev => ({ ...prev, user: 'System (Cek Rak)' }));
                    }
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer border ${
                    filters.user === 'System (Cek Rak)'
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm ring-2 ring-emerald-300'
                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-300'
                  }`}
                  title="Filter khusus log dari user System (Cek Rak)"
                >
                  <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>User: System (Cek Rak)</span>
                  {filters.user === 'System (Cek Rak)' && (
                    <span className="ml-1 bg-white/25 text-white px-1.5 py-0.2 rounded text-[10px] font-black uppercase">
                      AKTIF
                    </span>
                  )}
                </button>

                {/* TOGGLE MODE GROUPING (SKU + RAK + TGL SCAN + IN/OUT) */}
                <button
                  type="button"
                  onClick={() => setIsGroupedMode(prev => !prev)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer border ${
                    isGroupedMode
                      ? 'bg-gradient-to-r from-blue-700 to-indigo-700 text-white border-blue-600 shadow-sm ring-2 ring-blue-300'
                      : 'bg-blue-50 hover:bg-blue-100 text-blue-900 border-blue-300'
                  }`}
                  title="Kelompokkan data berdasarkan SKU, Rak, Tgl Scan, dan Type (IN di atas, OUT di bawah) dengan subtotal saldo"
                >
                  <Layers className="w-3.5 h-3.5 text-blue-500" />
                  <span>Mode Kelompok ({groupIncludeRak ? 'SKU + Rak + Tgl Scan' : 'SKU + Tgl Scan'})</span>
                  {isGroupedMode && (
                    <span className="ml-1 bg-white/25 text-white px-1.5 py-0.2 rounded text-[10px] font-black uppercase">
                      {batchSummaryStats.totalGroups} BATCH
                    </span>
                  )}
                </button>

                {/* PILIHAN PRESISI KELOMPOK (RAK + SCAN vs SCAN SAJA) */}
                {isGroupedMode && (
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setGroupIncludeRak(true)}
                      className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                        groupIncludeRak
                          ? 'bg-white text-blue-900 shadow-xs border border-blue-200'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Hitung saldo dan kelompokkan data per SKU + Rak + Tgl Scan (Saldo akurat tiap rak)"
                    >
                      <Package className="w-3 h-3 text-blue-600" />
                      <span>Sama Rak & Tgl Scan</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setGroupIncludeRak(false)}
                      className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                        !groupIncludeRak
                          ? 'bg-white text-blue-900 shadow-xs border border-blue-200'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Kelompokkan data per SKU + Tgl Scan saja (menggabungkan seluruh rak di tanggal scan yang sama)"
                    >
                      <Calendar className="w-3 h-3 text-slate-500" />
                      <span>Tgl Scan Saja</span>
                    </button>
                  </div>
                )}

                {/* TOMBOL RIWAYAT MUTASI SETELAHNYA */}
                {showFixDates && (
                  <button
                    type="button"
                    onClick={() => handleOpenSubsequentLogsFromTop()}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer border bg-gradient-to-r from-purple-50 to-indigo-50 hover:from-purple-100 hover:to-indigo-100 text-purple-900 border-purple-300 shadow-xs"
                    title="Buka Riwayat Mutasi Setelahnya untuk melihat dan memperbaiki rantai mutasi transfer"
                  >
                    <History className="w-3.5 h-3.5 text-purple-600" />
                    <span>Riwayat Mutasi Setelahnya</span>
                    {filters.sku && (
                      <span className="ml-1 bg-purple-200 text-purple-800 px-1.5 py-0.2 rounded text-[10px] font-mono font-bold truncate max-w-[120px]">
                        {filters.sku}
                      </span>
                    )}
                  </button>
                )}

                {isGroupedMode && (
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setGroupedSubFilter('ALL')}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                        groupedSubFilter === 'ALL'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Semua ({batchSummaryStats.totalGroups})
                    </button>
                    <button
                      type="button"
                      onClick={() => setGroupedSubFilter('MISMATCH')}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all flex items-center gap-1 ${
                        groupedSubFilter === 'MISMATCH'
                          ? 'bg-amber-500 text-white shadow-xs'
                          : 'text-amber-800 hover:text-amber-900'
                      }`}
                    >
                      <AlertTriangle className="w-3 h-3" />
                      Rak Beda ({batchSummaryStats.mismatchGroups})
                    </button>
                    <button
                      type="button"
                      onClick={() => setGroupedSubFilter('DEFICIT')}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                        groupedSubFilter === 'DEFICIT'
                          ? 'bg-red-600 text-white shadow-xs'
                          : 'text-red-700 hover:text-red-900'
                      }`}
                    >
                      Defisit ({batchSummaryStats.deficitGroups})
                    </button>
                    <button
                      type="button"
                      onClick={() => setGroupedSubFilter('ANOMALY')}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all flex items-center gap-1 ${
                        groupedSubFilter === 'ANOMALY'
                          ? 'bg-rose-700 text-white shadow-xs'
                          : 'text-rose-700 hover:text-rose-900'
                      }`}
                    >
                      <AlertTriangle className="w-3 h-3" />
                      Anomali Tgl ({batchSummaryStats.anomalyGroups})
                    </button>
                  </div>
                )}

                {isGroupedMode && batchSummaryStats.mismatchGroups > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const mismatchGroups = batchGroupData.filter(g => g.hasRakMismatch);
                      const lines: string[] = [];
                      mismatchGroups.forEach(g => {
                        const outRaks = Array.from(new Set(g.outEntries.filter(e => e.isRakMismatch).map(e => e.rak)));
                        const inRak = g.initialInRaksList[0] || 'UTAMA';
                        outRaks.forEach(r => {
                          lines.push(formatMoveReportSentence(g.sku, r, inRak));
                        });
                      });
                      const unique = Array.from(new Set(lines));
                      if (unique.length === 0) return;
                      navigator.clipboard.writeText(unique.join('\n'));
                      showToast(`${unique.length} baris Laporan Rak Beda disalin!`, 'success');
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer border bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300 shadow-xs"
                    title="Salin kalimat laporan semua rak beda untuk tim crosscheck (format: [SKU] di rak [OUT] seharusnya rak [IN])"
                  >
                    <Copy className="w-3.5 h-3.5 text-amber-600" />
                    <span>Copy Laporan Rak</span>
                  </button>
                )}

                {isGroupedMode && batchSummaryStats.deficitGroups > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const deficitGroups = batchGroupData.filter(g => g.balance < 0);
                      const lines = deficitGroups.map(g => {
                        const rak = g.initialInRaksList[0] || g.sortedEntries[0]?.rak || '-';
                        return formatDeficitReportSentence(g.sku, rak, g.tglScan, g.balance, g.totalIn, g.totalOut);
                      });
                      if (lines.length === 0) return;
                      navigator.clipboard.writeText(lines.join('\n'));
                      showToast(`${lines.length} baris Laporan Lebih Potong disalin!`, 'success');
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer border bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-300 shadow-xs"
                    title="Salin kalimat laporan semua batch defisit / lebih potong"
                  >
                    <Copy className="w-3.5 h-3.5 text-rose-600" />
                    <span>Copy Laporan Lebih Potong</span>
                  </button>
                )}

                {batchSummaryStats.deficitGroups > 0 && (
                  <button
                    type="button"
                    onClick={handleOpenClearDeficitModal}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer border bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white border-red-700 shadow-md animate-pulse"
                    title="Deteksi otomatis & kosongkan Tgl Scan untuk transaksi OUT pada seluruh batch minus (defisit)"
                  >
                    <CalendarX className="w-3.5 h-3.5" />
                    <span>Hapus Tgl Scan Batch Minus ({batchSummaryStats.deficitGroups})</span>
                  </button>
                )}

                {batchSummaryStats.anomalyGroups > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllAnomalyOuts}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer border bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-700 hover:to-rose-700 text-white border-amber-700 shadow-md"
                    title="Lepas Tgl Scan untuk seluruh transaksi OUT yang memiliki tanggal lampau (mendahului batch IN)"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Lepas Tgl Scan Anomali ({batchSummaryStats.anomalyGroups})</span>
                  </button>
                )}
              </div>

              {Boolean(activeBulkSkuSearch.length > 0 || filters.sku || filters.type || filters.gudang || filters.rak || filters.user || filters.tanggal || filters.tglScan || filters.waktu || filters.subRak || filters.logUpdateUser || filters.isAdjustment) && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-xs text-rose-600 hover:text-rose-800 font-bold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <RotateCcw className="w-3 h-3" /> Reset Semua Filter
                </button>
              )}
            </div>

            {/* Banner Pencarian Massal SKU Aktif */}
            {activeBulkSkuSearch.length > 0 && (
              <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-sm animate-in fade-in mb-4">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="px-2.5 py-1 bg-indigo-600 text-white text-xs font-black rounded-lg shadow-sm">
                    Pencarian Massal SKU Aktif
                  </span>
                  <span className="text-xs font-bold text-indigo-950">
                    {activeBulkSkuSearch.length} SKU dicari &bull; Ditemukan {totalCount.toLocaleString()} baris log
                  </span>
                  <span className="text-[11px] text-indigo-700 font-medium hidden sm:inline">
                    (Mode: {bulkSkuSearchMode === 'exact' ? 'Sesuai Persis / Exact' : 'Mengandung Kata / Partial'})
                  </span>
                  {batchSummaryStats.deficitGroups > 0 && (
                    <span className="px-2.5 py-0.5 rounded-lg bg-rose-100 text-rose-800 border border-rose-300 font-bold text-[11px] flex items-center gap-1 shadow-xs">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                      {batchSummaryStats.deficitGroups} Batch Minus Terdeteksi
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setAnalysisSkuInputMode('bulk');
                      setBulkAnalysisSkuInput(activeBulkSkuSearch.join('\n'));
                      setIsAnalysisModalOpen(true);
                      handleAnalyzeStockBalance(activeBulkSkuSearch);
                    }}
                    disabled={isAnalyzing}
                    className="px-3 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 border border-teal-500 disabled:opacity-50"
                    title="Cek Saldo & Diagnosa data minus secara massal untuk semua SKU yang sedang dicari"
                  >
                    {isAnalyzing ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Calculator className="h-3.5 w-3.5" />
                    )}
                    <span>Cek Saldo Massal ({activeBulkSkuSearch.length} SKU)</span>
                  </button>
                  {batchSummaryStats.deficitGroups > 0 && (
                    <button
                      type="button"
                      onClick={handleOpenClearDeficitModal}
                      className="px-3.5 py-1.5 text-xs font-black text-white bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 border border-red-700"
                      title="Deteksi otomatis & kosongkan Tgl Scan transaksi OUT pada seluruh batch minus untuk SKU yang dicari"
                    >
                      <CalendarX className="h-3.5 w-3.5" />
                      <span>Hapus Tgl Scan Batch Minus ({batchSummaryStats.deficitGroups})</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsBulkSkuModalOpen(true)}
                    className="px-3 py-1.5 text-xs font-bold text-indigo-700 hover:text-indigo-900 bg-white hover:bg-indigo-100/50 rounded-xl border border-indigo-300 transition-all cursor-pointer shadow-sm"
                  >
                    Ubah Daftar SKU ({activeBulkSkuSearch.length})
                  </button>
                  <button
                    type="button"
                    onClick={handleClearBulkSkuSearch}
                    className="px-3 py-1.5 text-xs font-bold text-rose-700 hover:text-rose-900 bg-white hover:bg-rose-50 rounded-xl border border-rose-300 transition-all cursor-pointer shadow-sm flex items-center gap-1"
                  >
                    <X className="h-3.5 w-3.5" />
                    Hapus Filter Massal
                  </button>
                </div>
              </div>
            )}

            <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 ${showFixDates ? 'xl:grid-cols-5' : 'xl:grid-cols-7'} gap-4`}>
              <div>
                <div className="bg-blue-600 text-white px-3 py-2 rounded-t-md flex items-center justify-between">
                  <span className="font-medium">SKU</span>
                  <button
                    type="button"
                    onClick={() => setIsBulkSkuModalOpen(true)}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                      activeBulkSkuSearch.length > 0
                        ? 'bg-amber-400 text-amber-950 font-black shadow-xs'
                        : 'bg-white/20 hover:bg-white/30 text-white'
                    }`}
                    title="Pencarian Massal SKU (Paste banyak SKU sekaligus dari Excel/Catatan)"
                  >
                    <Clipboard className="h-3 w-3" />
                    <span>Cari Massal</span>
                    {activeBulkSkuSearch.length > 0 && (
                      <span className="bg-amber-950 text-white text-[9px] px-1 rounded-full font-black">
                        {activeBulkSkuSearch.length}
                      </span>
                    )}
                  </button>
                </div>
                <FilterDropdown
                  value={filters.sku}
                  onChange={(value) => setFilters({ ...filters, sku: value })}
                  options={allSkus}
                  placeholder="Cari SKU..."
                  loading={dropdownsLoading}
                />
                {showFixDates && filters.sku && (
                  <button
                    type="button"
                    onClick={() => handleOpenSubsequentLogsFromTop(filters.sku)}
                    className="w-full mt-1.5 px-2.5 py-1.5 bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 text-white text-[11px] font-black rounded-lg shadow-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    title={`Buka Riwayat Mutasi Setelahnya untuk ${filters.sku}`}
                  >
                    <History className="w-3.5 h-3.5" />
                    <span className="truncate">Riwayat Mutasi ({filters.sku})</span>
                  </button>
                )}
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
                <div className="relative" onClick={() => { try { tanggalInputRef.current?.showPicker(); } catch (_) {} }}>
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
                <div className="relative" onClick={() => { try { tglScanInputRef.current?.showPicker(); } catch (_) {} }}>
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

              {/* FILTER USER */}
              <div>
                <div className="bg-blue-600 text-white px-3 py-2 rounded-t-md flex items-center justify-between">
                  <span className="font-medium">User</span>
                  {filters.user && (
                    <span className="text-[10px] bg-blue-800 px-1.5 py-0.2 rounded font-bold">Aktif</span>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={filters.user}
                    onChange={(e) => setFilters({ ...filters, user: e.target.value })}
                    placeholder="Cari User..."
                    className="w-full px-3 py-2 border border-gray-300 border-t-0 rounded-b-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white pr-8 text-sm"
                  />
                  {filters.user && (
                    <button
                      type="button"
                      onClick={() => setFilters({ ...filters, user: '' })}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-md"
                      title="Hapus Filter User"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (filters.user === 'System (Cek Rak)') {
                        setFilters({ ...filters, user: '' });
                      } else {
                        setFilters({ ...filters, user: 'System (Cek Rak)' });
                      }
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer flex items-center gap-1 ${
                      filters.user === 'System (Cek Rak)'
                        ? 'bg-emerald-600 text-white border-emerald-700'
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                    }`}
                    title="Klik untuk filter System (Cek Rak)"
                  >
                    <UserCheck className="w-3 h-3" />
                    <span>System (Cek Rak)</span>
                  </button>
                </div>
              </div>

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

              <div className="flex items-end gap-2 col-span-1 sm:col-span-2 xl:col-span-2">
                <button
                  type="button"
                  onClick={() => {
                    setFilters(prev => ({
                      ...prev,
                      excludeTransfer: !prev.excludeTransfer,
                      gudang: !prev.excludeTransfer && prev.gudang.toUpperCase() === 'TRANSFER' ? '' : prev.gudang
                    }));
                    setCurrentPage(1);
                  }}
                  disabled={!dataLoaded}
                  className={`flex-1 min-w-0 px-3.5 h-[42px] font-black rounded-xl shadow-sm transition-all duration-200 transform hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 border text-xs tracking-wider disabled:opacity-50 cursor-pointer ${
                    filters.excludeTransfer
                      ? 'bg-amber-600 text-white border-amber-700 shadow-amber-600/30 ring-2 ring-amber-400'
                      : 'bg-amber-50 hover:bg-amber-100 active:bg-amber-200 text-amber-800 border-amber-300'
                  }`}
                  title={filters.excludeTransfer ? "Filter 'Tanpa Transfer' Aktif (gudang != 'TRANSFER'). Klik untuk menonaktifkan" : "Filter data agar tidak menampilkan gudang TRANSFER (gudang != 'TRANSFER')"}
                >
                  <ArrowRightLeft className={`w-3.5 h-3.5 shrink-0 ${filters.excludeTransfer ? 'text-white' : 'text-amber-600'}`} />
                  <span className="whitespace-nowrap uppercase font-black text-[11px] sm:text-xs">
                    {filters.excludeTransfer ? 'Non-Transfer ✓' : 'Tanpa Transfer'}
                  </span>
                </button>

                <button
                  onClick={clearAllFilters}
                  disabled={!dataLoaded}
                  className="px-4 h-[42px] bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 font-black rounded-xl shadow-sm transition-all duration-200 transform hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-1.5 border border-rose-300 disabled:opacity-50 cursor-pointer shrink-0"
                  title="Bersihkan Semua Filter"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <span className="tracking-wider uppercase text-[11px] font-black whitespace-nowrap">Clear</span>
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
                      onClick={handleCopySelectedSkus}
                      className="h-9 px-3.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-bold rounded-lg shadow-md transition-all flex items-center justify-center border border-blue-400/30"
                      disabled={isBulkOperationLoading}
                      title="Salin semua SKU dari baris data terpilih (format vertikal ke bawah untuk Excel / Spreadsheet)"
                    >
                      {isCopiedSku ? (
                        <>
                          <Check className="h-3.5 w-3.5 mr-1.5 text-white" />
                          <span className="text-[10px] uppercase tracking-wider font-extrabold">Tersalin!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5 mr-1.5" />
                          <span className="text-[10px] uppercase tracking-wider font-extrabold">Salin SKU</span>
                        </>
                      )}
                    </Button>
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
                      onClick={handleBulkClearTglScan}
                      className="h-9 px-3.5 bg-gradient-to-r from-rose-500 to-amber-600 hover:from-rose-600 hover:to-amber-700 text-white font-bold rounded-lg shadow-md transition-all flex items-center justify-center border border-rose-400/30"
                      disabled={isBulkOperationLoading}
                      title="Hapus / Kosongkan Tanggal Scan pada seluruh data terpilih"
                    >
                      <CalendarX className="h-3.5 w-3.5 mr-1.5" />
                      <span className="text-[10px] uppercase tracking-wider font-extrabold">Hapus Tgl Scan</span>
                    </Button>
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
                      onClick={handleCopySelectedMoveReport}
                      className="h-9 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-lg border border-emerald-200 shadow-sm transition-all flex items-center justify-center"
                      disabled={isBulkOperationLoading}
                      title="Salin kalimat laporan pindah rak (format: SKU di rak [asal] seharusnya rak [tujuan])"
                    >
                      <Copy className="h-3.5 w-3.5 mr-1.5" />
                      <span className="text-[10px] uppercase tracking-wider font-extrabold">Copy Laporan Rak</span>
                    </Button>
                    <Button
                      onClick={handleCopySelectedDeficitReport}
                      className="h-9 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-lg border border-rose-200 shadow-sm transition-all flex items-center justify-center"
                      disabled={isBulkOperationLoading}
                      title="Salin laporan data lebih potong / minus dari baris terpilih"
                    >
                      <Copy className="h-3.5 w-3.5 mr-1.5" />
                      <span className="text-[10px] uppercase tracking-wider font-extrabold">Copy Laporan Lebih Potong</span>
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
                        {isGroupedMode ? (
                          filteredBatchGroups.map((group, groupIdx) => {
                            return (
                              <React.Fragment key={group.id}>
                                {/* GROUP HEADER BAR */}
                                <tr className="bg-slate-800 text-white text-xs border-t-4 border-t-blue-600">
                                  <td colSpan={13} className="px-4 py-2.5">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                      <div className="flex flex-wrap items-center gap-2.5">
                                        <span className="bg-blue-600 text-white font-black px-2.5 py-0.5 rounded text-[11px] uppercase tracking-wider shadow-2xs">
                                          Batch #{groupIdx + 1}
                                        </span>
                                        <span className="font-mono font-black text-sm text-yellow-300">
                                          {group.sku}
                                        </span>
                                        <span className="text-slate-400">|</span>
                                        {group.rak && (
                                          <>
                                            <span className="text-slate-200 font-medium flex items-center gap-1">
                                              <Package className="w-3.5 h-3.5 text-cyan-400" />
                                              Rak: <strong className="text-cyan-300 font-bold">{group.rak}</strong>
                                            </span>
                                            <span className="text-slate-400">|</span>
                                          </>
                                        )}
                                        <span className="text-slate-200 font-medium flex items-center gap-1">
                                          <Calendar className="w-3.5 h-3.5 text-blue-400" />
                                          Tgl Scan: <strong className="text-white">{group.tglScan}</strong>
                                        </span>
                                        {group.initialInRaksList.length > 0 && !group.rak && (
                                          <span className="bg-slate-700/90 text-slate-200 px-2.5 py-0.5 rounded text-[11px] font-medium border border-slate-600">
                                            Rak Masuk (IN): <strong className="text-emerald-300 font-bold">{group.initialInRaksList.join(', ')}</strong>
                                          </span>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-2 text-xs">
                                        {group.hasRakMismatch ? (
                                          <div className="flex items-center gap-1.5">
                                            <span className="bg-amber-500/25 text-amber-300 border border-amber-500/40 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 shadow-2xs">
                                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                                              {group.mismatchCount} Rak OUT Berbeda
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const mismatchOutEntries = group.outEntries.filter(e => e.isRakMismatch);
                                                const inRak = group.initialInRaksList[0] || 'UTAMA';
                                                const lines = mismatchOutEntries.map(e => formatMoveReportSentence(group.sku, e.rak, inRak));
                                                const text = Array.from(new Set(lines)).join('\n');
                                                navigator.clipboard.writeText(text);
                                                showToast(`Laporan Pindah Rak disalin: "${text}"`, 'success');
                                              }}
                                              className="px-2 py-0.5 bg-amber-400/20 hover:bg-amber-400/30 text-amber-300 rounded border border-amber-400/40 transition-all flex items-center gap-1 text-[10px] font-bold cursor-pointer"
                                              title="Salin kalimat laporan rak beda untuk tim crosscheck"
                                            >
                                              <Copy className="w-3 h-3" />
                                              <span>Copy Laporan</span>
                                            </button>
                                          </div>
                                        ) : (
                                          <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 shadow-2xs">
                                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                                            Rak Sesuai
                                          </span>
                                        )}
                                        {group.hasTimeAnomaly && (
                                          <div className="flex items-center gap-1.5">
                                            <span className="bg-red-500/25 text-red-300 border border-red-500/40 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 shadow-2xs">
                                              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                                              {group.timeAnomalyCount} OUT &lt; IN
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => handleResetBatchAnomaly(group)}
                                              className="px-2 py-0.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded border border-red-500/40 transition-all flex items-center gap-1 text-[10px] font-bold cursor-pointer"
                                              title="Lepas Tgl Scan transaksi OUT anomali yang mendahului batch ini"
                                            >
                                              <Trash2 className="w-3 h-3" />
                                              <span>Lepas Anomali</span>
                                            </button>
                                          </div>
                                        )}
                                        <span className="text-slate-400 font-mono text-[11px]">
                                          ({group.sortedEntries.length} Transaksi: {group.inEntries.length} IN, {group.outEntries.length} OUT)
                                        </span>
                                      </div>
                                    </div>
                                  </td>
                                </tr>

                                {/* GROUP ROWS */}
                                {group.sortedEntries.map((entry) => {
                                  const isSelected = selectedIds.has(entry.id);
                                  const isTransfer = (entry.gudang || '').toUpperCase().includes('TRANSFER') || (entry.type === 'MOVE');
                                  const isMismatch = entry.isRakMismatch;

                                  const rowClass = isSelected
                                    ? 'bg-blue-200 hover:bg-blue-300'
                                    : isMismatch
                                      ? 'bg-amber-50/90 hover:bg-amber-100/90 border-l-4 border-l-amber-500'
                                      : entry.is_adjustment
                                        ? 'bg-amber-50/50 hover:bg-amber-100/60'
                                        : isTransfer
                                          ? 'bg-purple-50/50 hover:bg-purple-100/60 border-l-4 border-l-purple-400'
                                          : entry.type === 'IN'
                                            ? 'bg-emerald-50/20 hover:bg-emerald-50/50'
                                            : 'bg-white hover:bg-slate-50';

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
                                        <div className="flex flex-col items-center gap-0.5">
                                          <span>{formatDateDisplay(entry.tgl)}</span>
                                          {entry.isTimeAnomaly && (
                                            <span
                                              className="inline-flex items-center gap-1 bg-red-100 text-red-700 border border-red-300 text-[10px] font-bold px-1.5 py-0.2 rounded shadow-2xs"
                                              title={`Anomali Tanggal: Transaksi OUT ini terjadi pada ${entry.tgl}, mendahului kedatangan barang batch IN (${group.tglScan})`}
                                            >
                                              <AlertTriangle className="w-2.5 h-2.5 text-red-600" />
                                              OUT &lt; IN
                                            </span>
                                          )}
                                        </div>
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
                                      </td>
                                      <td className="px-4 py-2 text-sm text-center border-r border-gray-200 font-black text-gray-900">
                                        {entry.jumlah}
                                      </td>
                                      <td className="px-4 py-2 text-center border-r border-gray-200">
                                        <span className={`px-2.5 py-1 rounded text-xs font-bold ${
                                          entry.type === 'IN' ? 'bg-green-100 text-green-800 border border-green-300' :
                                          entry.type === 'OUT' ? 'bg-red-100 text-red-800 border border-red-300' :
                                          'bg-blue-100 text-blue-800 border border-blue-300'
                                        }`}>
                                          {entry.type}
                                        </span>
                                      </td>
                                      <td className="px-4 py-2 text-sm border-r border-gray-200">
                                        {isTransfer ? (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300 shadow-2xs">
                                            {entry.gudang}
                                          </span>
                                        ) : (
                                          entry.gudang
                                        )}
                                      </td>
                                      <td className="px-4 py-2 text-sm border-r border-gray-200 font-medium">
                                        {isMismatch ? (
                                          <div className="flex flex-col gap-0.5">
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 text-amber-950 border border-amber-300 rounded-lg text-xs font-black shadow-2xs w-fit">
                                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                              <span>{entry.rak}</span>
                                            </span>
                                            <span className="text-[10px] text-amber-800 font-bold whitespace-nowrap">
                                              ⚠ Beda dr IN ({group.initialInRaksList.join(', ')})
                                            </span>
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
                                      <td
                                        className="px-4 py-2 text-sm border-r border-gray-200 text-gray-700 cursor-pointer hover:bg-blue-100 transition-colors font-medium"
                                        onClick={() => setFilters({ ...filters, user: entry.user || '' })}
                                        title="Klik untuk filter User ini"
                                      >
                                        {entry.user === 'System (Cek Rak)' ? (
                                          <span className="inline-flex items-center gap-1 font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                            <UserCheck className="w-3 h-3 text-emerald-600" />
                                            {entry.user}
                                          </span>
                                        ) : (
                                          entry.user
                                        )}
                                      </td>
                                      <td className="px-4 py-2 text-sm border-r border-gray-200 text-gray-600">{entry.sub_rak}</td>
                                      <td className="px-4 py-2 text-sm border-r border-gray-200 text-gray-600 font-mono text-xs">{entry.log_update_user}</td>
                                      <td className="px-4 py-2 text-center">
                                        <div className="flex justify-center space-x-1.5">
                                          {(() => {
                                            const redistInfo = getRedistributeMoveInfo(entry.log_update_user);
                                            if (redistInfo) {
                                              const reportText = formatMoveReportSentence(entry.sku, redistInfo.fromRak, redistInfo.toRak);
                                              return (
                                                <Button
                                                  onClick={() => {
                                                    navigator.clipboard.writeText(reportText);
                                                    showToast(`Laporan Pindah Rak disalin: "${reportText}"`, 'success');
                                                  }}
                                                  className="h-8 w-8 p-0 bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-700 rounded-lg transition-all border border-emerald-300 flex items-center justify-center cursor-pointer shadow-2xs"
                                                  title={`Salin Laporan Pindah Rak: "${reportText}"`}
                                                >
                                                  <Copy className="h-4 w-4" />
                                                </Button>
                                              );
                                            }
                                            return null;
                                          })()}
                                          <Button
                                            onClick={() => handleOpenSubsequentLogs(entry)}
                                            className="h-8 w-8 p-0 bg-purple-500/10 hover:bg-purple-500/25 text-purple-700 rounded-lg transition-all border border-purple-200 backdrop-blur-sm flex items-center justify-center cursor-pointer"
                                            title="Cek Riwayat Mutasi Setelahnya (Subsequent Logs)"
                                          >
                                            <History className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            onClick={() => handleEdit(entry)}
                                            className="h-8 w-8 p-0 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 rounded-lg transition-all border border-blue-200 backdrop-blur-sm flex items-center justify-center"
                                            title="Edit Transaksi"
                                          >
                                            <Edit2 className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            onClick={() => handleDelete(entry.id)}
                                            className="h-8 w-8 p-0 bg-red-500/10 hover:bg-red-500/20 text-red-600 rounded-lg transition-all border border-red-200 backdrop-blur-sm flex items-center justify-center"
                                            title="Hapus Transaksi"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}

                                {/* GROUP SUBTOTAL / SUMMARY ROW */}
                                <tr className="bg-slate-100/95 border-b-4 border-b-slate-300 text-xs font-bold text-slate-800">
                                  <td colSpan={4} className="px-4 py-2.5 text-left border-r border-slate-300">
                                    <div>
                                      <span className="font-black text-slate-700 uppercase tracking-wider">
                                        Total {group.sku} {group.rak ? `(Rak: ${group.rak}, ${group.tglScan})` : `(${group.tglScan})`}:
                                      </span>
                                      {group.rakBreakdown && group.rakBreakdown.length > 1 && (
                                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                          <span className="text-[10px] text-slate-500 font-bold">Saldo per Rak:</span>
                                          {group.rakBreakdown.map(rb => (
                                            <span
                                              key={rb.rak}
                                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                                rb.balance < 0
                                                  ? 'bg-red-50 text-red-700 border-red-300'
                                                  : rb.balance > 0
                                                  ? 'bg-blue-50 text-blue-700 border-blue-300'
                                                  : 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                              }`}
                                            >
                                              {rb.rak}: {rb.balance > 0 ? `+${rb.balance}` : rb.balance}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2.5 text-center border-r border-slate-300">
                                    <div className="flex items-center justify-center gap-1.5 font-mono text-xs">
                                      <span className="text-emerald-700 font-black">IN: {group.totalIn.toLocaleString()}</span>
                                      <span className="text-slate-400">|</span>
                                      <span className="text-rose-700 font-black">OUT: {group.totalOut.toLocaleString()}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2.5 text-center border-r border-slate-300">
                                    {group.balance === 0 ? (
                                      <span className="inline-flex px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 font-black text-[11px] border border-emerald-300">
                                        Sisa: 0 (Pas)
                                      </span>
                                    ) : group.balance > 0 ? (
                                      <span className="inline-flex px-2.5 py-1 rounded-md bg-blue-100 text-blue-800 font-black text-[11px] border border-blue-300">
                                        Sisa: +{group.balance.toLocaleString()}
                                      </span>
                                    ) : (
                                      <div className="inline-flex items-center gap-1.5 justify-center">
                                        <span className="inline-flex px-2.5 py-1 rounded-md bg-red-100 text-red-800 font-black text-[11px] border border-red-300">
                                          Sisa: {group.balance.toLocaleString()}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const primaryRak = group.rak || group.initialInRaksList[0] || group.sortedEntries[0]?.rak || '-';
                                            const text = formatDeficitReportSentence(group.sku, primaryRak, group.tglScan, group.balance, group.totalIn, group.totalOut);
                                            navigator.clipboard.writeText(text);
                                            showToast(`Laporan Lebih Potong disalin: "${text}"`, 'success');
                                          }}
                                          className="p-1 bg-red-100 hover:bg-red-200 text-red-800 rounded border border-red-300 transition-all cursor-pointer shadow-2xs"
                                          title="Salin kalimat laporan lebih potong ini"
                                        >
                                          <Copy className="w-3.5 h-3.5" />
                                        </button>
                                        {group.outEntries.some(e => Boolean(e.tgl_scan)) && (
                                          <button
                                            type="button"
                                            onClick={() => handleClearTglScanForBatch(group)}
                                            className="p-1 px-1.5 bg-rose-200 hover:bg-rose-300 text-rose-900 rounded border border-rose-400 transition-all cursor-pointer shadow-2xs flex items-center gap-1 text-[11px] font-bold"
                                            title="Hapus Tgl Scan pada transaksi OUT di batch minus ini"
                                          >
                                            <CalendarX className="w-3.5 h-3.5 text-rose-800" />
                                            <span>Hapus Tgl Scan Batch</span>
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                  <td colSpan={7} className="px-4 py-2.5 text-left text-slate-600">
                                    <div className="flex flex-col gap-1.5">
                                      {group.hasRakMismatch ? (
                                        <span className="text-amber-900 font-bold flex items-center gap-1">
                                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                          Ditemukan {group.mismatchCount} transaksi OUT pada rak berbeda dari nota masuk awal ({group.initialInRaksList.join(', ')})
                                        </span>
                                      ) : (
                                        <span className="text-emerald-800 font-medium flex items-center gap-1">
                                          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                                          Seluruh transaksi OUT sesuai dengan rak nota masuk awal ({group.initialInRaksList.join(', ') || group.rak || '-'})
                                        </span>
                                      )}
                                      {group.hasTimeAnomaly && (
                                        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded px-2.5 py-1 text-red-900 text-xs font-semibold">
                                          <span className="flex items-center gap-1.5">
                                            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                                            Ditemukan {group.timeAnomalyCount} transaksi OUT bertanggal lampau (&lt; {group.tglScan}). Mengakibatkan defisit semu pada batch ini.
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => handleResetBatchAnomaly(group)}
                                            className="ml-2 px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-bold transition-all shrink-0 cursor-pointer shadow-sm flex items-center gap-1"
                                            title="Lepas Tgl Scan transaksi OUT anomali yang mendahului batch ini"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                            <span>Lepas Tgl Scan Anomali</span>
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              </React.Fragment>
                            );
                          })
                        ) : (
                          dataLoaded && filteredEntries.map((entry, index) => {
                          const isSelected = selectedIds.has(entry.id);
                          const isTransfer = (entry.gudang || '').toUpperCase().includes('TRANSFER') || (entry.type === 'MOVE');

                          // Row styling: Selected > Adjustment > Transfer Highlight > Zebra
                          const rowClass = isSelected
                            ? 'bg-blue-200 hover:bg-blue-300'
                            : entry.is_adjustment
                              ? 'bg-amber-50 hover:bg-amber-100'
                              : isTransfer
                                ? 'bg-purple-50/50 hover:bg-purple-100/60 border-l-4 border-l-purple-400'
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
                                <span className={`px-2.5 py-1 rounded text-xs font-bold ${
                                  entry.type === 'IN' ? 'bg-green-100 text-green-800 border border-green-300' :
                                  entry.type === 'OUT' ? 'bg-red-100 text-red-800 border border-red-300' :
                                  'bg-blue-100 text-blue-800 border border-blue-300'
                                }`}>
                                  {entry.type}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-sm border-r border-gray-200">
                                {isTransfer ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300 shadow-2xs">
                                    {entry.gudang}
                                  </span>
                                ) : (
                                  entry.gudang
                                )}
                              </td>
                              <td className="px-4 py-2 text-sm border-r border-gray-200 font-medium">
                                {entry.rak}
                              </td>
                              <td
                                className="px-4 py-2 text-sm border-r border-gray-200 cursor-pointer hover:bg-blue-200 transition-colors font-medium"
                                onClick={() => setFilters({ ...filters, tglScan: entry.tgl_scan || '' })}
                                title="Klik untuk filter Tgl Scan"
                              >
                                {formatDateDisplay(entry.tgl_scan)}
                              </td>
                              <td
                                className="px-4 py-2 text-sm border-r border-gray-200 text-gray-700 cursor-pointer hover:bg-blue-100 transition-colors font-medium"
                                onClick={() => setFilters({ ...filters, user: entry.user || '' })}
                                title="Klik untuk filter User ini"
                              >
                                {entry.user === 'System (Cek Rak)' ? (
                                  <span className="inline-flex items-center gap-1 font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                    <UserCheck className="w-3 h-3 text-emerald-600" />
                                    {entry.user}
                                  </span>
                                ) : (
                                  entry.user
                                )}
                              </td>
                              <td className="px-4 py-2 text-sm border-r border-gray-200 text-gray-600">{entry.sub_rak}</td>
                              <td className="px-4 py-2 text-sm border-r border-gray-200 text-gray-600 font-mono text-xs">{entry.log_update_user}</td>
                              <td className="px-4 py-2 text-center">
                                <div className="flex justify-center space-x-1.5">
                                  {(() => {
                                    const redistInfo = getRedistributeMoveInfo(entry.log_update_user);
                                    if (redistInfo) {
                                      const reportText = formatMoveReportSentence(entry.sku, redistInfo.fromRak, redistInfo.toRak);
                                      return (
                                        <Button
                                          onClick={() => {
                                            navigator.clipboard.writeText(reportText);
                                            showToast(`Laporan Pindah Rak disalin: "${reportText}"`, 'success');
                                          }}
                                          className="h-8 w-8 p-0 bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-700 rounded-lg transition-all border border-emerald-300 flex items-center justify-center cursor-pointer shadow-2xs"
                                          title={`Salin Laporan Pindah Rak: "${reportText}"`}
                                        >
                                          <Copy className="h-4 w-4" />
                                        </Button>
                                      );
                                    }
                                    return null;
                                  })()}
                                  <Button
                                    onClick={() => handleOpenSubsequentLogs(entry)}
                                    className="h-8 w-8 p-0 bg-purple-500/10 hover:bg-purple-500/25 text-purple-700 rounded-lg transition-all border border-purple-200 backdrop-blur-sm flex items-center justify-center cursor-pointer"
                                    title="Cek Riwayat Mutasi Setelahnya (Subsequent Logs)"
                                  >
                                    <History className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    onClick={() => handleEdit(entry)}
                                    className="h-8 w-8 p-0 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 rounded-lg transition-all border border-blue-200 backdrop-blur-sm flex items-center justify-center"
                                    title="Edit Transaksi"
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    onClick={() => handleDelete(entry.id)}
                                    className="h-8 w-8 p-0 bg-red-500/10 hover:bg-red-500/20 text-red-600 rounded-lg transition-all border border-red-200 backdrop-blur-sm flex items-center justify-center"
                                    title="Hapus Transaksi"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                        )}
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
                      {isGroupedMode ? (
                        filteredBatchGroups.map((group, groupIdx) => (
                          <div key={group.id} className="bg-slate-50 border-b-4 border-slate-300">
                            {/* Mobile Group Header */}
                            <div className="bg-slate-800 text-white p-3.5 space-y-2 border-t-4 border-t-blue-600">
                              <div className="flex items-center justify-between gap-2">
                                <span className="bg-blue-600 text-white font-black px-2 py-0.5 rounded text-[10px] uppercase tracking-wider">
                                  Batch #{groupIdx + 1}
                                </span>
                                <span className="font-mono font-black text-sm text-yellow-300">
                                  {group.sku}
                                </span>
                              </div>
                              <div className="text-xs text-slate-300 flex items-center justify-between">
                                <span>
                                  {group.rak && (
                                    <span className="mr-2">Rak: <strong className="text-cyan-300">{group.rak}</strong></span>
                                  )}
                                  Scan: <strong>{group.tglScan}</strong>
                                </span>
                                {group.hasRakMismatch ? (
                                  <span className="bg-amber-500/25 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded font-bold text-[10px] flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                                    {group.mismatchCount} Rak Beda
                                  </span>
                                ) : (
                                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded font-bold text-[10px] flex items-center gap-1">
                                    <Check className="w-3 h-3 text-emerald-400" />
                                    Rak Sesuai
                                  </span>
                                )}
                              </div>
                              {group.initialInRaksList.length > 0 && !group.rak && (
                                <div className="text-[11px] text-slate-300 bg-slate-700/80 px-2 py-1 rounded border border-slate-600">
                                  Rak Masuk (IN): <strong className="text-emerald-300">{group.initialInRaksList.join(', ')}</strong>
                                </div>
                              )}
                            </div>

                            {/* Mobile Group Rows */}
                            <div className="divide-y divide-gray-200">
                              {group.sortedEntries.map((entry) => {
                                const isSelected = selectedIds.has(entry.id);
                                const isTransfer = (entry.gudang || '').toUpperCase().includes('TRANSFER') || (entry.type === 'MOVE');
                                const isMismatch = entry.isRakMismatch;

                                return (
                                  <div
                                    key={entry.id}
                                    className={`p-3.5 ${
                                      isSelected
                                        ? 'bg-blue-100'
                                        : isMismatch
                                          ? 'bg-amber-50/90 border-l-4 border-l-amber-500'
                                          : entry.is_adjustment
                                            ? 'bg-amber-50'
                                            : isTransfer
                                              ? 'bg-purple-50/50 border-l-4 border-l-purple-400'
                                              : entry.type === 'IN'
                                                ? 'bg-emerald-50/30'
                                                : 'bg-white'
                                    } transition-colors relative`}
                                  >
                                    <div className="flex items-start gap-3">
                                      <div className="pt-1">
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => handleCheckboxChange(entry.id)}
                                          className="w-5 h-5 cursor-pointer rounded"
                                        />
                                      </div>
                                      <div className="flex-1 space-y-2.5">
                                        {/* Header Card: Type, Waktu, Qty */}
                                        <div className="flex justify-between items-center">
                                          <div className="flex items-center gap-2">
                                            <span className={`px-2.5 py-0.5 rounded text-xs font-bold ${
                                              entry.type === 'IN' ? 'bg-green-100 text-green-800 border border-green-300' :
                                              entry.type === 'OUT' ? 'bg-red-100 text-red-800 border border-red-300' :
                                              'bg-blue-100 text-blue-800 border border-blue-300'
                                            }`}>
                                              {entry.type}
                                            </span>
                                            <span className="text-xs font-mono text-gray-500">{entry.waktu}</span>
                                          </div>
                                          <span className="font-black text-sm text-gray-900">{entry.jumlah} Unit</span>
                                        </div>

                                        {/* Rak & Gudang */}
                                        <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50/90 p-2.5 rounded-lg border border-gray-100">
                                          <div>
                                            <p className="text-[10px] uppercase font-bold text-gray-400">Lokasi Rak</p>
                                            {isMismatch ? (
                                              <div className="mt-0.5">
                                                <span className="inline-flex items-center gap-1 font-black text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded text-xs">
                                                  <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                                                  {entry.rak}
                                                </span>
                                                <p className="text-[10px] text-amber-800 font-bold mt-0.5">
                                                  ⚠ Beda dr IN ({group.initialInRaksList.join(', ')})
                                                </p>
                                              </div>
                                            ) : (
                                              <p className="font-bold text-blue-600 text-xs mt-0.5">{entry.rak}</p>
                                            )}
                                          </div>
                                          <div>
                                            <p className="text-[10px] uppercase font-bold text-gray-400">Gudang</p>
                                            <p className="font-medium text-gray-700 text-xs mt-0.5">{entry.gudang}</p>
                                          </div>
                                        </div>

                                        {/* Tanggal & User */}
                                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                                          <span>Nota: {formatDateDisplay(entry.tgl)}</span>
                                          <span>User: {entry.user}</span>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex justify-end gap-1.5 pt-1">
                                          <Button
                                            onClick={() => handleOpenSubsequentLogs(entry)}
                                            className="h-8 px-2 bg-purple-50 text-purple-700 rounded-lg font-bold text-xs flex items-center justify-center border border-purple-200 flex-1"
                                            title="Cek Riwayat Mutasi Setelahnya"
                                          >
                                            <History className="h-3.5 w-3.5 mr-1" /> Setelahnya
                                          </Button>
                                          {entry.type === 'OUT' && Boolean(entry.tgl_scan) && (
                                            <Button
                                              onClick={() => handleClearSingleEntryTglScan(entry)}
                                              className="h-8 px-2 bg-rose-50 text-rose-600 rounded-lg font-bold text-xs flex items-center justify-center border border-rose-200 flex-1"
                                              title={`Hapus Tgl Scan (${entry.tgl_scan}) baris ini`}
                                            >
                                              <CalendarX className="h-3.5 w-3.5 mr-1" /> Hapus Scan
                                            </Button>
                                          )}
                                          <Button
                                            onClick={() => handleEdit(entry)}
                                            className="h-8 px-2 bg-blue-50 text-blue-600 rounded-lg font-bold text-xs flex items-center justify-center border border-blue-100 flex-1"
                                          >
                                            <Edit2 className="h-3.5 w-3.5 mr-1" /> Edit
                                          </Button>
                                          <Button
                                            onClick={() => handleDelete(entry.id)}
                                            className="h-8 px-2 bg-red-50 text-red-600 rounded-lg font-bold text-xs flex items-center justify-center border border-red-100 flex-1"
                                          >
                                            <Trash2 className="h-3.5 w-3.5 mr-1" /> Hapus
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Mobile Group Subtotal Footer */}
                            <div className="bg-slate-100 p-3 text-xs space-y-1.5 border-t border-slate-200">
                              <div className="flex items-center justify-between font-bold">
                                <span className="text-slate-700 uppercase">
                                  Subtotal {group.sku} {group.rak ? `(${group.rak})` : ''}:
                                </span>
                                <div className="flex items-center gap-2 font-mono">
                                  <span className="text-emerald-700">IN: {group.totalIn}</span>
                                  <span className="text-slate-400">|</span>
                                  <span className="text-rose-700">OUT: {group.totalOut}</span>
                                </div>
                              </div>
                              {group.rakBreakdown && group.rakBreakdown.length > 1 && (
                                <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-slate-200/60">
                                  <span className="text-[10px] text-slate-500 font-bold">Saldo Rak:</span>
                                  {group.rakBreakdown.map(rb => (
                                    <span
                                      key={rb.rak}
                                      className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${
                                        rb.balance < 0
                                          ? 'bg-red-50 text-red-700 border-red-300'
                                          : rb.balance > 0
                                          ? 'bg-blue-50 text-blue-700 border-blue-300'
                                          : 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                      }`}
                                    >
                                      {rb.rak}: {rb.balance > 0 ? `+${rb.balance}` : rb.balance}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div className="flex items-center justify-between pt-1 border-t border-slate-200/80">
                                <span className="text-slate-600">Sisa Stok:</span>
                                {group.balance === 0 ? (
                                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-black border border-emerald-300">
                                    0 (Pas)
                                  </span>
                                ) : group.balance > 0 ? (
                                  <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-black border border-blue-300">
                                    +{group.balance.toLocaleString()}
                                  </span>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 font-black border border-red-300">
                                      {group.balance.toLocaleString()}
                                    </span>
                                    {group.outEntries.some(e => Boolean(e.tgl_scan)) && (
                                      <button
                                        type="button"
                                        onClick={() => handleClearTglScanForBatch(group)}
                                        className="p-1 px-1.5 bg-rose-200 hover:bg-rose-300 text-rose-900 rounded border border-rose-400 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                                      >
                                        <CalendarX className="w-3 h-3 text-rose-800" />
                                        <span>Hapus Scan</span>
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        dataLoaded && filteredEntries.map((entry, index) => {
                        const isSelected = selectedIds.has(entry.id);
                        const isTransfer = (entry.gudang || '').toUpperCase().includes('TRANSFER') || (entry.type === 'MOVE');

                        return (
                          <div
                            key={entry.id}
                            className={`p-4 ${
                              isSelected
                                ? 'bg-blue-100'
                                : entry.is_adjustment
                                  ? 'bg-amber-50'
                                  : isTransfer
                                    ? 'bg-purple-50/50 border-l-4 border-l-purple-400'
                                    : 'bg-white'
                            } active:bg-blue-50 transition-colors relative`}
                          >
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
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] uppercase font-bold text-gray-400 mb-0.5">Gudang</p>
                                    <p className="text-sm font-medium text-gray-700">
                                      {isTransfer ? (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300">
                                          {entry.gudang}
                                        </span>
                                      ) : (
                                        entry.gudang
                                      )}
                                    </p>
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
                                <div className="flex justify-end gap-1.5 pt-2">
                                  <Button
                                    onClick={() => handleOpenSubsequentLogs(entry)}
                                    className="h-9 px-2.5 bg-purple-50 text-purple-700 rounded-lg font-bold text-xs flex items-center justify-center border border-purple-200 flex-1"
                                    title="Cek Riwayat Mutasi Setelahnya"
                                  >
                                    <History className="h-3.5 w-3.5 mr-1" />
                                    Setelahnya
                                  </Button>
                                  <Button
                                    onClick={() => handleEdit(entry)}
                                    className="h-9 px-2.5 bg-blue-50 text-blue-600 rounded-lg font-bold text-xs flex items-center justify-center border border-blue-100 flex-1"
                                  >
                                    <Edit2 className="h-3.5 w-3.5 mr-1" />
                                    Edit
                                  </Button>
                                  <Button
                                    onClick={() => handleDelete(entry.id)}
                                    className="h-9 px-2.5 bg-red-50 text-red-600 rounded-lg font-bold text-xs flex items-center justify-center border border-red-100 flex-1"
                                  >
                                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                                    Hapus
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                      )}
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
                        <option value={1000}>1000 per halaman</option>
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
        size="8xl"
        className="w-[96vw] max-w-[1580px]"
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
                      loading={dropdownsLoading}
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

                {/* Baris Tombol Aksi Single SKU - Luas, Terorganisir & Responsif */}
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
                          } else {
                            handlePrepareRedistribute();
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
                            } else {
                              handlePrepareRedistribute();
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
          {/* Banner Info */}
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start space-x-3">
            <AlertTriangle className="h-5 w-5 text-rose-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-rose-900 leading-relaxed">
              <p className="font-bold text-rose-950 mb-1">
                Pembersihan Data Log Mutasi/Transfer Gudang Bermasalah:
              </p>
              <p>
                Fitur ini menghapus baris transaksi dengan <strong>Gudang: TRANSFER</strong> (baik type <strong>IN</strong> maupun <strong>OUT</strong>) untuk SKU yang dipilih.
                Gunakan ini jika data transfer tersebut salah/anomali sehingga merusak perhitungan saldo stok.
                Setelah dihapus, sistem akan <strong>otomatis menganalisis ulang saldo stok</strong> agar Anda dapat mencocokkan tgl scan yang bersih.
              </p>
              {targetSkusForDeleteTransfer.length > 0 && (
                <div className="mt-2 font-mono text-[11px] bg-white/70 px-2 py-1 rounded border border-rose-200 text-rose-800">
                  Target SKU ({targetSkusForDeleteTransfer.length}): {targetSkusForDeleteTransfer.slice(0, 5).join(', ')}{targetSkusForDeleteTransfer.length > 5 ? '...' : ''}
                </div>
              )}
            </div>
          </div>

          {isLoadingTransferLogsForCekSaldo ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="h-8 w-8 text-rose-600 animate-spin" />
              <p className="text-sm font-bold text-slate-600">Memuat data log gudang TRANSFER...</p>
            </div>
          ) : transferLogsForCekSaldo.length === 0 ? (
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
            <>
              {/* Summary Badges */}
              {(() => {
                const inLogs = transferLogsForCekSaldo.filter(l => (l.type || '').toUpperCase().includes('IN'));
                const outLogs = transferLogsForCekSaldo.filter(l => (l.type || '').toUpperCase().includes('OUT'));
                const inQty = inLogs.reduce((s, l) => s + Number(l.jumlah || 0), 0);
                const outQty = outLogs.reduce((s, l) => s + Number(l.jumlah || 0), 0);
                const allSelected = transferLogsForCekSaldo.length > 0 && transferLogsForCekSaldo.every(l => selectedTransferIdsForCekSaldo.has(l.id));

                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div className="bg-slate-100 rounded-xl p-2.5 border border-slate-200 text-center">
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">Total Data</span>
                        <span className="text-base font-black text-slate-800">{transferLogsForCekSaldo.length} baris</span>
                      </div>
                      <div className="bg-emerald-50 rounded-xl p-2.5 border border-emerald-200 text-center">
                        <span className="text-[10px] font-bold text-emerald-600 uppercase block">Transfer IN</span>
                        <span className="text-base font-black text-emerald-700">{inLogs.length} baris ({inQty} pcs)</span>
                      </div>
                      <div className="bg-rose-50 rounded-xl p-2.5 border border-rose-200 text-center">
                        <span className="text-[10px] font-bold text-rose-600 uppercase block">Transfer OUT</span>
                        <span className="text-base font-black text-rose-700">{outLogs.length} baris ({outQty} pcs)</span>
                      </div>
                      <div className="bg-indigo-50 rounded-xl p-2.5 border border-indigo-200 text-center">
                        <span className="text-[10px] font-bold text-indigo-600 uppercase block">Dipilih Hapus</span>
                        <span className="text-base font-black text-indigo-700">{selectedTransferIdsForCekSaldo.size} baris</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between px-1">
                      <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTransferIdsForCekSaldo(new Set(transferLogsForCekSaldo.map(l => l.id)));
                            } else {
                              setSelectedTransferIdsForCekSaldo(new Set());
                            }
                          }}
                          className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                        />
                        <span>Pilih Semua ({transferLogsForCekSaldo.length} baris)</span>
                      </label>
                      <span className="text-[11px] text-slate-400">
                        Klik baris atau centang kotak untuk memilih data yang akan dihapus
                      </span>
                    </div>

                    {/* Table Preview */}
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
                            <th className="p-2">User / Info</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                          {transferLogsForCekSaldo.map((row) => {
                            const isSelected = selectedTransferIdsForCekSaldo.has(row.id);
                            const isOut = (row.type || '').toUpperCase().includes('OUT');
                            return (
                              <tr
                                key={row.id}
                                onClick={() => {
                                  setSelectedTransferIdsForCekSaldo(prev => {
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
                                      setSelectedTransferIdsForCekSaldo(prev => {
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
                                <td className="p-2 text-slate-500 max-w-[140px] truncate" title={row.user_name || row.log_update_user || ''}>
                                  {row.user_name || row.log_update_user || '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <Button
              type="button"
              onClick={() => setIsDeleteTransferCekSaldoModalOpen(false)}
              disabled={isDeletingTransferLogsForCekSaldo}
              className="h-10 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer transition-all"
            >
              Batal
            </Button>

            {transferLogsForCekSaldo.length > 0 && (
              <Button
                type="button"
                onClick={handleExecuteDeleteTransferForCekSaldo}
                disabled={isDeletingTransferLogsForCekSaldo || selectedTransferIdsForCekSaldo.size === 0}
                className="h-10 px-5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-rose-600/30 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isDeletingTransferLogsForCekSaldo ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Menghapus Data...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    <span>Hapus {selectedTransferIdsForCekSaldo.size} Data Transfer Sekarang</span>
                  </>
                )}
              </Button>
            )}
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

      {/* DEVMODE: MODAL PEMBERSIHAN LOG TRANSFER */}
      <TransferPurgeModal
        isOpen={isTransferPurgeModalOpen}
        onClose={() => setIsTransferPurgeModalOpen(false)}
        scanResult={purgeScanResult}
        isScanning={isScanningPurge}
        isDeleting={isDeletingPurge}
        onRescan={handleScanTransferPurge}
        selectedIds={selectedPurgeIds}
        onToggleSelect={handleToggleSelectPurge}
        onSelectAllVisible={handleSelectAllVisiblePurge}
        onClearSelection={handleClearPurgeSelection}
        onDeleteSelected={handleDeleteSelectedPurge}
        onDeleteAll={handleDeleteAllPurge}
        skuInput={purgeSkuInput}
        setSkuInput={setPurgeSkuInput}
        skuOptions={allSkus}
      />

      {/* DEVMODE: MODAL SINKRONISASI RAK OUT NOTA MASUK */}
      <SyncOutRakModal
        isOpen={isSyncOutRakModalOpen}
        onClose={() => setIsSyncOutRakModalOpen(false)}
        scanResult={syncOutScanResult}
        isScanning={isScanningSyncOut}
        isFixing={isFixingSyncOut}
        onRescan={handleScanSyncOut}
        selectedIds={selectedSyncOutIds}
        onToggleSelect={handleToggleSelectSyncOut}
        onSelectAllVisible={handleSelectAllVisibleSyncOut}
        onClearSelection={handleClearSyncOutSelection}
        onFixSelected={handleFixSelectedSyncOut}
        onFixAll={handleFixAllSyncOut}
        skuInput={syncOutSkuInput}
        setSkuInput={setSyncOutSkuInput}
        skuOptions={allSkus}
      />

      {/* DEVMODE: MODAL PENYELARASAN MUTASI LT4 -> LT2 */}
      <SyncLt4Lt2Modal
        isOpen={isSyncLt4Lt2ModalOpen}
        onClose={() => setIsSyncLt4Lt2ModalOpen(false)}
        onSuccess={(msg) => {
          showToast(msg, 'success');
          loadLogEntries(currentPage, itemsPerPage, debouncedFilters);
        }}
        currentUser={userName || 'Admin'}
      />

      {/* DEVMODE: MODAL PENYESUAIAN STOK OUT */}
      <AdjustmentStockOutModal
        isOpen={isAdjustmentStockOutModalOpen}
        onClose={() => setIsAdjustmentStockOutModalOpen(false)}
        onSuccess={() => {
          showToast('Penyesuaian stok OUT berhasil diproses!', 'success');
          loadLogEntries(currentPage, itemsPerPage, debouncedFilters);
        }}
        defaultSku={filters.sku || ''}
      />

      {/* MODAL RIWAYAT TRANSAKSI SETELAHNYA (SUBSEQUENT LOGS) */}
      <SubsequentLogsModal
        isOpen={subsequentModal.isOpen}
        onClose={() => setSubsequentModal({ isOpen: false, referenceEntry: null })}
        referenceEntry={subsequentModal.referenceEntry}
        onLogUpdated={() => {
          loadLogEntries(currentPage, itemsPerPage);
        }}
      />

      {/* MODAL KLOP TGL SCAN OUT (AUTO-MATCH TGL MASUK IN) */}
      <ScanDateAutoMatchModal
        isOpen={isScanDateAutoMatchModalOpen}
        onClose={() => setIsScanDateAutoMatchModalOpen(false)}
        initialSku={scanDateAutoMatchSku || filters.sku || ''}
        allSkus={allSkus}
        currentLogs={filteredEntries}
        showToast={showToast}
        onSuccessUpdate={() => {
          loadLogEntries(currentPage, itemsPerPage);
        }}
      />

      {/* MODAL SINKRONISASI TGL SCAN TRANSFER OUT (KLOP RAK ASAL) */}
      <SyncTransferOutScanDateModal
        isOpen={isSyncTransferOutModalOpen}
        onClose={() => setIsSyncTransferOutModalOpen(false)}
        initialSku={syncTransferOutSku || filters.sku || ''}
        showToast={showToast}
        onSuccessUpdate={() => {
          loadLogEntries(currentPage, itemsPerPage);
        }}
      />

{/* MODAL PENCARIAN MASSAL SKU */}
      <Modal
        isOpen={isBulkSkuModalOpen}
        onClose={() => setIsBulkSkuModalOpen(false)}
        title="Pencarian Data Massal SKU (Database Log)"
        size="lg"
      >
        <div className="space-y-4">
          {/* Guidance Banner */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-4 flex items-start space-x-3">
            <FileText className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-blue-900 leading-relaxed">
              <p className="font-bold text-blue-950 mb-1">Cari Banyak SKU Sekaligus di Database Log:</p>
              <p>
                Tempel (paste) daftar SKU yang ingin Anda cari dari Excel, Google Sheet, atau catatan teks.
                Sistem akan memfilter seluruh log riwayat transaksi (IN, OUT, mutasi) yang sesuai dengan SKU tersebut.
              </p>
            </div>
          </div>

          {/* Input Box & Toolbar */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-700 uppercase">
                Daftar SKU:
              </label>
              <div className="flex items-center gap-2">
                {(() => {
                  const detected = Array.from(new Set(bulkSkuSearchInput.split(/[\r\n,]+/).map(s => s.trim()).filter(Boolean)));
                  return detected.length > 0 ? (
                    <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 text-[11px] font-black rounded-lg border border-blue-200">
                      {detected.length} SKU Terdeteksi
                    </span>
                  ) : null;
                })()}
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText();
                      if (text) setBulkSkuSearchInput(text);
                    } catch {
                      showToast('Tidak dapat mengakses clipboard. Silakan gunakan tombol Ctrl+V.', 'info');
                    }
                  }}
                  className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 hover:underline cursor-pointer"
                >
                  <Clipboard className="h-3.5 w-3.5" />
                  Tempel Clipboard
                </button>
                {bulkSkuSearchInput && (
                  <button
                    type="button"
                    onClick={() => setBulkSkuSearchInput('')}
                    className="text-xs text-slate-400 hover:text-rose-600 cursor-pointer font-bold"
                  >
                    Bersihkan
                  </button>
                )}
              </div>
            </div>

            <textarea
              value={bulkSkuSearchInput}
              onChange={(e) => setBulkSkuSearchInput(e.target.value)}
              rows={8}
              placeholder={"Tempel nama produk/SKU di sini (satu per baris atau dipisahkan koma):\nBAG-RSB-100-7X10\nBAG-RSB-102-20X15/1PC\nBOOK-GB-2833R-7\nDESKSET-DS-20"}
              className="w-full p-3 border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 bg-white shadow-inner"
            />
          </div>

          {/* Mode Pencocokan */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-bold text-slate-700">Mode Pencocokan SKU:</span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="bulkSkuSearchMatchMode"
                  value="exact"
                  checked={bulkSkuSearchMode === 'exact'}
                  onChange={() => setBulkSkuSearchMode('exact')}
                  className="text-blue-600"
                />
                <span>Sesuai Persis / Exact (Rekomendasi)</span>
              </label>
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="bulkSkuSearchMatchMode"
                  value="partial"
                  checked={bulkSkuSearchMode === 'partial'}
                  onChange={() => setBulkSkuSearchMode('partial')}
                  className="text-blue-600"
                />
                <span>Mengandung Kata / Partial</span>
              </label>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div>
              {activeBulkSkuSearch.length > 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    handleClearBulkSkuSearch();
                    setIsBulkSkuModalOpen(false);
                  }}
                  className="h-10 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 font-bold"
                >
                  Hapus Pencarian Massal
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsBulkSkuModalOpen(false)}
                className="h-10 text-xs font-bold"
              >
                Batal
              </Button>
              <Button
                type="button"
                onClick={() => handleApplyBulkSkuSearch()}
                disabled={!bulkSkuSearchInput.trim()}
                className="h-10 px-5 text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white shadow-md active:scale-95 disabled:opacity-50"
              >
                <Search className="h-3.5 w-3.5 mr-1" />
                <span>Terapkan Pencarian</span>
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* MODAL HAPUS TGL SCAN BATCH MINUS (MASSAL & TERPILIH) */}
      <ClearDeficitScanDatesModal
        isOpen={isClearDeficitModalOpen}
        onClose={() => setIsClearDeficitModalOpen(false)}
        deficitGroups={batchGroupData.filter(g => g.balance < 0)}
        isProcessing={isClearingDeficitScanDates}
        onConfirmClear={handleExecuteClearDeficitBatches}
      />

      {/* MODAL PICKER SKU UNTUK RIWAYAT MUTASI SETELAHNYA */}
      <Modal
        isOpen={isSubsequentPickerOpen}
        onClose={() => setIsSubsequentPickerOpen(false)}
        hideHeader
        size="8xl"
        className="w-[96vw] max-w-[1550px]"
      >
        <div className="space-y-4">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-purple-800 via-indigo-900 to-slate-900 text-white p-5 sm:p-6 rounded-2xl shadow-lg border border-purple-500/30">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-purple-500/20 text-purple-300 rounded-xl border border-purple-400/30 shrink-0">
                  <History className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-black tracking-wide uppercase text-white flex items-center gap-2">
                    Buka Riwayat Mutasi Setelahnya
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-500/30 text-purple-200 border border-purple-400/40">
                      Subsequent Chain
                    </span>
                  </h3>
                  <p className="text-xs sm:text-sm text-purple-200/80 font-medium mt-0.5">
                    Pilih transaksi transfer acuan atau masukkan SKU untuk melihat riwayat mutasi dan perbaiki salah potong rak.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSubsequentPickerOpen(false)}
                className="p-2 text-purple-200 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Form Input SKU */}
          <div className="bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200 space-y-2.5 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
              <label className="text-xs font-black uppercase text-slate-700 block">
                Cari Berdasarkan SKU Produk:
              </label>
              {filters.sku && (
                <button
                  type="button"
                  onClick={() => setPickerSkuInput(filters.sku)}
                  className="text-[11px] text-purple-700 hover:text-purple-900 font-bold underline cursor-pointer self-start"
                >
                  Gunakan SKU Filter Aktif: <strong className="font-mono">{filters.sku}</strong>
                </button>
              )}
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={pickerSkuInput}
                  onChange={(e) => setPickerSkuInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && pickerSkuInput.trim()) {
                      handleOpenSubsequentLogsFromTop(pickerSkuInput.trim());
                    }
                  }}
                  placeholder="Ketik SKU... (Contoh: BOOK-PAD-1000)"
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono font-bold text-slate-900 shadow-2xs"
                />
              </div>
              <Button
                variant="primary"
                onClick={() => {
                  if (pickerSkuInput.trim()) {
                    handleOpenSubsequentLogsFromTop(pickerSkuInput.trim());
                  } else {
                    showToast('Masukkan SKU terlebih dahulu.', 'warning');
                  }
                }}
                className="bg-purple-700 hover:bg-purple-800 text-white font-black text-xs px-6 py-2.5 rounded-xl cursor-pointer shadow-md gap-1.5 justify-center"
              >
                <History className="w-4 h-4" />
                <span>Buka Riwayat Mutasi</span>
              </Button>
            </div>
          </div>

          {/* Daftar Transaksi Transfer Terkini */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-slate-700 tracking-wider">
                Atau Pilih Transaksi Transfer Terkini:
              </span>
              {isLoadingTransfers && (
                <span className="text-[11px] text-purple-600 font-semibold flex items-center gap-1">
                  <RefreshCw className="w-3 h-3 animate-spin" /> Memuat data transfer...
                </span>
              )}
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
              <div className="max-h-[420px] overflow-y-auto overflow-x-auto">
                <table className="w-full text-xs text-left min-w-[700px]">
                  <thead className="bg-slate-800 text-white text-[11px] font-bold uppercase sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3 text-center border-r border-slate-700 w-10">No</th>
                      <th className="py-2.5 px-3 border-r border-slate-700">Tanggal & Waktu</th>
                      <th className="py-2.5 px-3 border-r border-slate-700">SKU</th>
                      <th className="py-2.5 px-3 text-center border-r border-slate-700 w-16">Tipe</th>
                      <th className="py-2.5 px-3 border-r border-slate-700">Gudang</th>
                      <th className="py-2.5 px-3 border-r border-slate-700">Rak / Sub Rak</th>
                      <th className="py-2.5 px-3 text-center border-r border-slate-700">Qty</th>
                      <th className="py-2.5 px-3 border-r border-slate-700">User</th>
                      <th className="py-2.5 px-3 text-center w-28">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {recentTransfers.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-slate-400">
                          {isLoadingTransfers ? 'Memuat transaksi transfer...' : 'Tidak ada transaksi transfer terkini ditemukan.'}
                        </td>
                      </tr>
                    ) : (
                      recentTransfers.map((t, idx) => (
                        <tr key={t.id} className="hover:bg-purple-50/60 transition-colors">
                          <td className="py-2 px-3 text-center border-r border-slate-200 text-slate-500 font-mono text-[11px]">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3 font-mono border-r border-slate-200 whitespace-nowrap">
                            {t.tgl} <span className="text-slate-400 text-[11px]">({t.waktu})</span>
                          </td>
                          <td className="py-2 px-3 font-mono font-bold text-purple-950 border-r border-slate-200">
                            {t.sku}
                          </td>
                          <td className="py-2 px-3 text-center border-r border-slate-200">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-black border ${
                                t.type === 'IN'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : 'bg-rose-100 text-rose-800 border-rose-300'
                              }`}
                            >
                              {t.type}
                            </span>
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 font-semibold text-slate-700">
                            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded font-bold text-[10px] border border-purple-300">
                              {t.gudang}
                            </span>
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 font-bold text-slate-900">
                            {t.rak || '-'} {t.sub_rak && t.sub_rak !== t.rak ? `(${t.sub_rak})` : ''}
                          </td>
                          <td className="py-2 px-3 text-center border-r border-slate-200 font-black text-slate-900">
                            {t.jumlah}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 text-slate-600 text-[11px] truncate max-w-[120px]" title={t.user}>
                            {t.user || '-'}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                setIsSubsequentPickerOpen(false);
                                handleOpenSubsequentLogs(t);
                              }}
                              className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-bold rounded-lg cursor-pointer transition-all shadow-xs flex items-center justify-center gap-1 mx-auto"
                            >
                              <History className="w-3 h-3" />
                              <span>Pilih</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs text-slate-500">
            <div>
              Menampilkan <strong className="text-slate-800">{recentTransfers.length}</strong> transaksi transfer terkini
            </div>
            <Button
              variant="secondary"
              onClick={() => setIsSubsequentPickerOpen(false)}
              className="text-xs font-bold cursor-pointer px-5"
            >
              Tutup
            </Button>
          </div>
        </div>
      </Modal>

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
                  <th className="px-3 py-2.5 text-center w-12">Salin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {moves.map((m, i) => {
                  const isClearAnomaly = m.type === 'CLEAR_ANOMALY' || m.toTgl === null;
                  const isCrossRak = !isClearAnomaly && m.toRak && m.toRak !== m.rak;
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <div className="font-bold text-slate-900">{m.sku}</div>
                        <span className={`inline-block mt-0.5 text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${
                          isClearAnomaly ? 'bg-rose-100 text-rose-800' : isCrossRak ? 'bg-indigo-100 text-indigo-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {isClearAnomaly ? 'LEPAS TGL ANOMALI' : isCrossRak ? 'PINDAH RAK & TGL' : 'GANTI TGL SCAN'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">
                        <div className="font-medium">Rak: {m.rak}</div>
                        <div className="text-xs text-red-500 font-mono">Tgl: {m.fromTgl || '(KOSONG)'}</div>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">
                        <div className="font-bold text-emerald-700">Rak: {m.toRak || m.rak}</div>
                        <div className={`text-xs font-mono font-bold ${isClearAnomaly ? 'text-amber-600' : 'text-emerald-600'}`}>
                          Tgl: {m.toTgl ? m.toTgl : '(DIKOSONGKAN)'}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center font-black text-blue-700">{m.jumlah} pcs</td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            const text = `${m.sku} di rak ${m.rak} seharusnya rak ${m.toRak || m.rak}`;
                            navigator.clipboard.writeText(text);
                            alert(`Tersalin: "${text}"`);
                          }}
                          className="p-1 hover:bg-emerald-50 text-slate-400 hover:text-emerald-700 rounded transition-all cursor-pointer"
                          title={`Salin: "${m.sku} di rak ${m.rak} seharusnya rak ${m.toRak || m.rak}"`}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
          <div className="text-sm font-medium text-gray-700">
            Total Rekomendasi: <span className="text-blue-600 font-bold">{moves.length} baris transaksi</span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              type="button"
              onClick={() => {
                const rackMoves = moves.filter(m => m.toRak && m.toRak.toUpperCase() !== m.rak.toUpperCase());
                const targetMoves = rackMoves.length > 0 ? rackMoves : moves;
                if (targetMoves.length === 0) return;
                const lines = targetMoves.map(m => `${m.sku} di rak ${m.rak} seharusnya rak ${m.toRak || m.rak}`);
                navigator.clipboard.writeText(lines.join('\n'));
                alert(`${lines.length} baris laporan pindah rak disalin ke clipboard!`);
              }}
              variant="secondary"
              className="flex items-center space-x-1.5 font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 cursor-pointer text-xs"
              title="Salin semua kalimat laporan pindah rak"
            >
              <Copy className="h-3.5 w-3.5" />
              <span>Copy Laporan Pindah Rak</span>
            </Button>
            <Button onClick={onClose} variant="secondary" disabled={isProcessing} className="cursor-pointer text-xs">
              Batal
            </Button>
            <Button
              onClick={onConfirm}
              disabled={isProcessing}
              className="px-6 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold rounded-xl shadow-lg flex items-center space-x-2 cursor-pointer text-xs"
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

// --- MODAL HAPUS TGL SCAN BATCH MINUS (DEFISIT) ---
interface ClearDeficitScanDatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  deficitGroups: BatchGroupItem[];
  isProcessing: boolean;
  onConfirmClear: (selectedGroupIds: string[]) => void;
}

function ClearDeficitScanDatesModal({
  isOpen,
  onClose,
  deficitGroups,
  isProcessing,
  onConfirmClear
}: ClearDeficitScanDatesModalProps) {
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');

  // Sinkronisasi pilihan saat modal dibuka
  useEffect(() => {
    if (isOpen) {
      setSelectedGroupIds(new Set(deficitGroups.map(g => g.id)));
      setSearchTerm('');
    }
  }, [isOpen, deficitGroups]);

  // Filter batch berdasarkan pencarian
  const filteredBatches = useMemo(() => {
    if (!searchTerm.trim()) return deficitGroups;
    const term = searchTerm.toLowerCase();
    return deficitGroups.filter(g =>
      g.sku.toLowerCase().includes(term) ||
      (g.rak && g.rak.toLowerCase().includes(term)) ||
      g.tglScan.toLowerCase().includes(term) ||
      g.initialInRaksList.some(r => r.toLowerCase().includes(term)) ||
      g.outEntries.some(o => (o.rak || '').toLowerCase().includes(term))
    );
  }, [deficitGroups, searchTerm]);

  // Hitung total OUT transaksi yang akan dikosongkan
  const selectedBatchesList = useMemo(() => {
    return deficitGroups.filter(g => selectedGroupIds.has(g.id));
  }, [deficitGroups, selectedGroupIds]);

  const totalOutRowsToClear = useMemo(() => {
    return selectedBatchesList.reduce(
      (sum, g) => sum + g.outEntries.filter(e => Boolean(e.tgl_scan)).length,
      0
    );
  }, [selectedBatchesList]);

  const totalOutQtyToClear = useMemo(() => {
    return selectedBatchesList.reduce(
      (sum, g) =>
        sum +
        g.outEntries
          .filter(e => Boolean(e.tgl_scan))
          .reduce((s, e) => s + (Number(e.jumlah) || 0), 0),
      0
    );
  }, [selectedBatchesList]);

  const isAllSelected = filteredBatches.length > 0 && filteredBatches.every(g => selectedGroupIds.has(g.id));

  const handleToggleAll = () => {
    if (isAllSelected) {
      const next = new Set(selectedGroupIds);
      filteredBatches.forEach(g => next.delete(g.id));
      setSelectedGroupIds(next);
    } else {
      const next = new Set(selectedGroupIds);
      filteredBatches.forEach(g => next.add(g.id));
      setSelectedGroupIds(next);
    }
  };

  const handleToggleBatch = (id: string) => {
    const next = new Set(selectedGroupIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedGroupIds(next);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Hapus Tgl Scan Batch Minus (Defisit)" size="xl">
      <div className="space-y-4 text-xs">
        {/* Info Banner */}
        <div className="bg-gradient-to-r from-rose-50 via-red-50 to-amber-50 border border-rose-200 p-4 rounded-xl flex items-start gap-3 shadow-xs">
          <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-md">
            <CalendarX className="w-5 h-5" />
          </div>
          <div className="flex-1 space-y-1">
            <h4 className="text-sm font-black text-rose-950">
              Deteksi Otomatis &amp; Pembersihan Tgl Scan Batch Minus
            </h4>
            <p className="text-rose-800 leading-relaxed text-[11px]">
              Sistem menemukan <strong>{deficitGroups.length} batch</strong> dengan saldo minus (Total IN &lt; Total OUT pada rak &amp; tgl scan yang sama).
              Mengosongkan kolom <code>tgl_scan</code> pada transaksi OUT yang surplus/kelebihan akan melepaskan transaksi tersebut dari batch tanggal scan ini sehingga saldo tidak lagi minus.
            </p>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
            <p className="text-[10px] uppercase font-bold text-slate-500">Total Batch Minus</p>
            <p className="text-lg font-black text-slate-900 mt-0.5">{deficitGroups.length} Batch</p>
          </div>
          <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl">
            <p className="text-[10px] uppercase font-bold text-rose-700">Transaksi OUT Dipilih</p>
            <p className="text-lg font-black text-rose-900 mt-0.5">{totalOutRowsToClear} Baris</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl">
            <p className="text-[10px] uppercase font-bold text-amber-700">Total Qty OUT Terpilih</p>
            <p className="text-lg font-black text-amber-900 mt-0.5">{totalOutQtyToClear.toLocaleString()} Pcs</p>
          </div>
        </div>

        {/* Search & Actions Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Cari SKU, Tgl Scan, atau Rak..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleAll}
              className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
            >
              {isAllSelected ? 'Batalkan Semua' : 'Pilih Semua'}
            </button>
          </div>
        </div>

        {/* Batches Table List */}
        <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[340px] overflow-y-auto shadow-inner bg-white">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 text-slate-700 sticky top-0 font-bold border-b border-slate-200 z-10">
              <tr>
                <th className="px-3 py-2 text-center w-10">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={handleToggleAll}
                    className="w-4 h-4 cursor-pointer rounded"
                  />
                </th>
                <th className="px-3 py-2 text-left">SKU</th>
                <th className="px-3 py-2 text-left">Rak</th>
                <th className="px-3 py-2 text-left">Tgl Scan</th>
                <th className="px-3 py-2 text-center">IN / OUT</th>
                <th className="px-3 py-2 text-center">Sisa (Defisit)</th>
                <th className="px-3 py-2 text-center">Data OUT Dikosongkan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    Tidak ditemukan batch minus yang sesuai pencarian.
                  </td>
                </tr>
              ) : (
                filteredBatches.map(group => {
                  const isChecked = selectedGroupIds.has(group.id);
                  const outWithScan = group.outEntries.filter(e => Boolean(e.tgl_scan));
                  const outQty = outWithScan.reduce((s, e) => s + (Number(e.jumlah) || 0), 0);
                  const inRaks = group.initialInRaksList.join(', ') || '-';
                  const outRaks = Array.from(new Set(group.outEntries.map(e => e.rak))).join(', ') || '-';

                  return (
                    <tr
                      key={group.id}
                      onClick={() => handleToggleBatch(group.id)}
                      className={`cursor-pointer transition-colors ${
                        isChecked ? 'bg-rose-50/60 hover:bg-rose-100/60' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="px-3 py-2 text-center" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleBatch(group.id)}
                          className="w-4 h-4 cursor-pointer rounded"
                        />
                      </td>
                      <td className="px-3 py-2 font-mono font-bold text-slate-900">{group.sku}</td>
                      <td className="px-3 py-2 text-slate-700">
                        {group.rak ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-[11px] bg-slate-100 text-slate-900 border border-slate-300">
                            <Package className="w-3 h-3 text-cyan-600" />
                            {group.rak}
                          </span>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-emerald-800">
                              IN: <strong>{inRaks}</strong>
                            </span>
                            <span className="text-[10px] text-rose-800">
                              OUT: <strong>{outRaks}</strong>
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-700">{group.tglScan}</td>
                      <td className="px-3 py-2 text-center font-mono font-bold">
                        <span className="text-emerald-700">{group.totalIn}</span>
                        <span className="text-slate-400 mx-1">/</span>
                        <span className="text-rose-700">{group.totalOut}</span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className="inline-flex px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-black text-[10px] border border-red-300">
                          {group.balance} Pcs
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-bold text-[10px] border border-slate-200">
                          <CalendarX className="w-3 h-3 text-rose-600" />
                          {outWithScan.length} Baris ({outQty} Pcs)
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
          <div className="text-slate-600 text-[11px]">
            Terpilih: <strong className="text-rose-700">{selectedGroupIds.size} batch</strong> (
            <strong>{totalOutRowsToClear} transaksi OUT</strong> / <strong>{totalOutQtyToClear.toLocaleString()} pcs</strong>)
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isProcessing}
              className="h-9 px-4 text-xs font-bold"
            >
              Batal
            </Button>
            <Button
              type="button"
              onClick={() => onConfirmClear(Array.from(selectedGroupIds))}
              disabled={isProcessing || selectedGroupIds.size === 0 || totalOutRowsToClear === 0}
              className="h-9 px-4 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-md flex items-center gap-1.5"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Mengosongkan...</span>
                </>
              ) : (
                <>
                  <CalendarX className="w-3.5 h-3.5" />
                  <span>Kosongkan Tgl Scan ({totalOutRowsToClear} Baris OUT)</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
