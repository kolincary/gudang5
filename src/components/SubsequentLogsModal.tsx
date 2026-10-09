import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import {
  History,
  RefreshCw,
  Copy,
  Check,
  Download,
  Search,
  AlertCircle,
  ArrowRightLeft,
  Wrench,
  Scale,
  AlertTriangle,
  CheckCircle2,
  X,
  ArrowRight
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { DatabaseLogEntry } from './DatabaseLog';
import {
  auditSubsequentTransferMismatch,
  executeSubsequentTransferFix,
  TransferMismatchDiagnosis,
  TransferMismatchItem
} from '../services/transferSubsequentFixService';

interface SubsequentLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  referenceEntry: DatabaseLogEntry | null;
  onLogUpdated?: () => void;
}

const normalizeDateForCompare = (dateStr: string): string => {
  if (!dateStr) return '';
  let clean = dateStr.trim();
  if (clean.includes(' ') || clean.includes('T')) {
    clean = clean.split(/[ T]/)[0];
  }
  if (/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.test(clean)) {
    const m = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  if (/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.test(clean)) {
    const m = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (m) {
      let d = m[1];
      let mo = m[2];
      const y = m[3];
      if (parseInt(mo) > 12 && parseInt(d) <= 12) [d, mo] = [mo, d];
      return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }
  return clean;
};

const normalizeTimeForCompare = (timeStr: string): string => {
  if (!timeStr) return '00:00:00';
  const clean = timeStr.trim().replace(/\./g, ':');
  const parts = clean.split(':');
  const h = (parts[0] || '00').padStart(2, '0');
  const m = (parts[1] || '00').padStart(2, '0');
  const s = (parts[2] || '00').padStart(2, '0');
  return `${h}:${m}:${s}`;
};

export const SubsequentLogsModal: React.FC<SubsequentLogsModalProps> = ({
  isOpen,
  onClose,
  referenceEntry,
  onLogUpdated
}) => {
  // Active Entry state (allows seamless in-modal SKU & transfer switching)
  const [activeEntry, setActiveEntry] = useState<DatabaseLogEntry | null>(referenceEntry);
  const [skuSearchInput, setSkuSearchInput] = useState('');
  const [isSearchingSku, setIsSearchingSku] = useState(false);
  const [skuSearchError, setSkuSearchError] = useState<string | null>(null);
  const [availableTransfers, setAvailableTransfers] = useState<DatabaseLogEntry[]>([]);
  const [recentTransferSkus, setRecentTransferSkus] = useState<string[]>([]);
  const [recentTransferEntries, setRecentTransferEntries] = useState<DatabaseLogEntry[]>([]);
  const [isLoadingRecentTransfers, setIsLoadingRecentTransfers] = useState(false);
  const [recentTransferFilter, setRecentTransferFilter] = useState('');

  const [logs, setLogs] = useState<DatabaseLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [isCopied, setIsCopied] = useState(false);

  // Diagnosis & Fix states
  const [diagnosis, setDiagnosis] = useState<TransferMismatchDiagnosis | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [isDiagnosisModalOpen, setIsDiagnosisModalOpen] = useState(false);
  const [selectedFixIds, setSelectedFixIds] = useState<Set<string>>(new Set());
  const [fixNotification, setFixNotification] = useState<{ message: string; type: 'success' | 'warning' } | null>(null);

  // Sync activeEntry when modal opens or referenceEntry changes
  useEffect(() => {
    if (isOpen) {
      if (referenceEntry) {
        setActiveEntry(referenceEntry);
        setSkuSearchInput(referenceEntry.sku || '');
        setSkuSearchError(null);
      } else {
        // If opened without reference, keep current activeEntry or allow picker
        if (!activeEntry) {
          setSkuSearchInput('');
          setSkuSearchError(null);
        }
      }
    }
  }, [isOpen, referenceEntry]);

  // Load recent transfer data (entries & SKUs) for autocomplete and visual picker
  useEffect(() => {
    if (!isOpen) return;
    const fetchRecentTransferData = async () => {
      try {
        setIsLoadingRecentTransfers(true);
        const { data } = await supabase
          .from('database_log')
          .select('*')
          .or('gudang.ilike.%TRANSFER%,type.eq.MOVE')
          .order('tgl', { ascending: false })
          .order('waktu', { ascending: false })
          .limit(100);

        if (data && data.length > 0) {
          const list = data as DatabaseLogEntry[];
          setRecentTransferEntries(list);
          const unique = Array.from(new Set(list.map((d) => d.sku?.trim()).filter(Boolean))) as string[];
          setRecentTransferSkus(unique.slice(0, 30));
        }
      } catch (e) {
        console.warn('Failed to load recent transfer data:', e);
      } finally {
        setIsLoadingRecentTransfers(false);
      }
    };
    fetchRecentTransferData();
  }, [isOpen]);

  const refDateNorm = useMemo(() => {
    return activeEntry ? normalizeDateForCompare(activeEntry.tgl) : '';
  }, [activeEntry]);

  const refTimeNorm = useMemo(() => {
    return activeEntry ? normalizeTimeForCompare(activeEntry.waktu) : '';
  }, [activeEntry]);

  // Check if an entry is part of the reference baseline
  const isBaselineEntry = useCallback(
    (entry: DatabaseLogEntry) => {
      if (!activeEntry) return false;
      if (entry.id === activeEntry.id) return true;
      const entryDateNorm = normalizeDateForCompare(entry.tgl);
      const entryTimeNorm = normalizeTimeForCompare(entry.waktu);
      const isRefTransfer =
        (activeEntry.gudang || '').toUpperCase().includes('TRANSFER') ||
        activeEntry.type === 'MOVE';

      if (
        isRefTransfer &&
        entryDateNorm === refDateNorm &&
        entryTimeNorm === refTimeNorm &&
        ((entry.gudang || '').toUpperCase().includes('TRANSFER') || entry.type === 'MOVE')
      ) {
        return true;
      }
      return false;
    },
    [activeEntry, refDateNorm, refTimeNorm]
  );

  const runAudit = useCallback(
    async (candidateLogs?: DatabaseLogEntry[]) => {
      if (!activeEntry) return;
      try {
        setIsAuditing(true);
        const res = await auditSubsequentTransferMismatch(activeEntry, candidateLogs);
        setDiagnosis(res);
        if (res.mismatches.length > 0) {
          setSelectedFixIds(new Set(res.mismatches.map((m) => m.id)));
        } else {
          setSelectedFixIds(new Set());
        }
      } catch (err) {
        console.error('Audit mismatch error:', err);
      } finally {
        setIsAuditing(false);
      }
    },
    [activeEntry]
  );

  const loadSubsequentLogs = useCallback(async () => {
    if (!activeEntry || !activeEntry.sku) return;

    try {
      setLoading(true);
      setErrorMsg(null);

      const targetSku = activeEntry.sku.trim();
      const targetDate = refDateNorm || activeEntry.tgl;

      // Query database_log using indexed SKU without brittle SQL date-string comparisons
      const { data, error } = await supabase
        .from('database_log')
        .select('*')
        .ilike('sku', targetSku)
        .order('id', { ascending: false });

      if (error) {
        throw error;
      }

      const rawList = (data || []) as DatabaseLogEntry[];

      // Populate available transfers for this SKU so user can switch between them
      const transfers = rawList.filter(
        (l) => (l.gudang || '').toUpperCase().includes('TRANSFER') || l.type === 'MOVE'
      );
      setAvailableTransfers(transfers);

      // If reference entry is transfer, identify if there's an earlier connected transfer on the same day
      const isRefTransfer =
        (activeEntry.gudang || '').toUpperCase().includes('TRANSFER') ||
        activeEntry.type === 'MOVE';

      let baselineDateNorm = refDateNorm;
      let baselineTimeNorm = refTimeNorm;

      if (isRefTransfer) {
        const sameDayTransfers = rawList.filter(
          (l) =>
            ((l.gudang || '').toUpperCase().includes('TRANSFER') || l.type === 'MOVE') &&
            normalizeDateForCompare(l.tgl) === refDateNorm
        );

        if (sameDayTransfers.length > 0) {
          sameDayTransfers.sort((a, b) => {
            const ta = normalizeTimeForCompare(a.waktu);
            const tb = normalizeTimeForCompare(b.waktu);
            return ta.localeCompare(tb);
          });
          const earliestTime = normalizeTimeForCompare(sameDayTransfers[0].waktu);
          if (earliestTime < baselineTimeNorm) {
            baselineTimeNorm = earliestTime;
          }
        }
      }

      // In-memory precision filter: keep records that happened AT or AFTER baseline timestamp
      const filtered = rawList.filter((item) => {
        // Always include exact reference item
        if (item.id === activeEntry.id) return true;

        const itemDateNorm = normalizeDateForCompare(item.tgl);
        const itemTimeNorm = normalizeTimeForCompare(item.waktu);

        // If transfer partner (same date, transfer gudang/type)
        if (
          isRefTransfer &&
          itemDateNorm === refDateNorm &&
          ((item.gudang || '').toUpperCase().includes('TRANSFER') || item.type === 'MOVE')
        ) {
          return true;
        }

        // Subsequent dates
        if (itemDateNorm > baselineDateNorm) return true;

        // Same date: time must be >= baseline time
        if (itemDateNorm === baselineDateNorm) {
          return itemTimeNorm >= baselineTimeNorm;
        }

        return false;
      });

      // Sort DESC: newest transaction at top, down to the baseline reference transaction at the bottom
      filtered.sort((a, b) => {
        const dateA = normalizeDateForCompare(a.tgl);
        const dateB = normalizeDateForCompare(b.tgl);
        if (dateA !== dateB) return dateB.localeCompare(dateA);

        const timeA = normalizeTimeForCompare(a.waktu);
        const timeB = normalizeTimeForCompare(b.waktu);
        if (timeA !== timeB) return timeB.localeCompare(timeA);

        const createdA = a.created_at || '';
        const createdB = b.created_at || '';
        return createdB.localeCompare(createdA);
      });

      setLogs(filtered);

      // Automatically audit for transfer mismatch after loading
      runAudit(filtered);
    } catch (err: any) {
      console.error('Error loading subsequent logs:', err);
      setErrorMsg(err.message || 'Gagal memuat log transaksi setelahnya');
    } finally {
      setLoading(false);
    }
  }, [activeEntry, refDateNorm, refTimeNorm, runAudit]);

  // Seamless SKU search inside the modal
  const handleSearchSku = async (querySku?: string) => {
    const clean = (querySku || skuSearchInput).trim();
    if (!clean) return;

    try {
      setIsSearchingSku(true);
      setSkuSearchError(null);

      // 1. Check exact or ilike transfer logs for this SKU
      const { data: transferLogs, error: tErr } = await supabase
        .from('database_log')
        .select('*')
        .ilike('sku', clean)
        .or('gudang.ilike.%TRANSFER%,type.eq.MOVE')
        .order('tgl', { ascending: false })
        .order('waktu', { ascending: false });

      if (tErr) throw tErr;

      if (transferLogs && transferLogs.length > 0) {
        const targetEntry = transferLogs[0] as DatabaseLogEntry;
        setAvailableTransfers(transferLogs as DatabaseLogEntry[]);
        setSkuSearchInput(targetEntry.sku);
        if (activeEntry?.id === targetEntry.id) {
          loadSubsequentLogs();
        } else {
          setActiveEntry(targetEntry);
        }
        return;
      }

      // 2. If no transfer log with exact match, try any log for this exact SKU
      const { data: anyLogs, error: aErr } = await supabase
        .from('database_log')
        .select('*')
        .ilike('sku', clean)
        .order('tgl', { ascending: false })
        .order('waktu', { ascending: false })
        .limit(1);

      if (aErr) throw aErr;

      if (anyLogs && anyLogs.length > 0) {
        const targetEntry = anyLogs[0] as DatabaseLogEntry;
        setAvailableTransfers([]);
        setSkuSearchInput(targetEntry.sku);
        if (activeEntry?.id === targetEntry.id) {
          loadSubsequentLogs();
        } else {
          setActiveEntry(targetEntry);
        }
        return;
      }

      // 3. Partial match search (e.g. user typed "690/BROWN" instead of full "BOOK-NB-690/BROWN")
      const { data: partialLogs } = await supabase
        .from('database_log')
        .select('*')
        .ilike('sku', `%${clean}%`)
        .order('tgl', { ascending: false })
        .order('waktu', { ascending: false })
        .limit(30);

      if (partialLogs && partialLogs.length > 0) {
        const matchingTransfers = partialLogs.filter(
          (l) => (l.gudang || '').toUpperCase().includes('TRANSFER') || l.type === 'MOVE'
        );
        const bestMatch = (matchingTransfers.length > 0 ? matchingTransfers[0] : partialLogs[0]) as DatabaseLogEntry;
        setAvailableTransfers(matchingTransfers as DatabaseLogEntry[]);
        setSkuSearchInput(bestMatch.sku);
        if (activeEntry?.id === bestMatch.id) {
          loadSubsequentLogs();
        } else {
          setActiveEntry(bestMatch);
        }
        return;
      }

      setSkuSearchError(`Tidak ditemukan transaksi untuk SKU "${clean}"`);
    } catch (err: any) {
      console.error('Error switching SKU:', err);
      setSkuSearchError(err.message || 'Gagal mencari SKU');
    } finally {
      setIsSearchingSku(false);
    }
  };

  // Filtered recent transfers for the in-modal picker view
  const filteredRecentTransfers = useMemo(() => {
    if (!recentTransferFilter.trim()) return recentTransferEntries;
    const term = recentTransferFilter.toLowerCase();
    return recentTransferEntries.filter(
      (e) =>
        (e.sku || '').toLowerCase().includes(term) ||
        (e.rak || '').toLowerCase().includes(term) ||
        (e.sub_rak || '').toLowerCase().includes(term) ||
        (e.gudang || '').toLowerCase().includes(term) ||
        (e.user || '').toLowerCase().includes(term) ||
        (e.tgl || '').toLowerCase().includes(term) ||
        (e.waktu || '').toLowerCase().includes(term)
    );
  }, [recentTransferEntries, recentTransferFilter]);

  useEffect(() => {
    if (isOpen && activeEntry) {
      setSearchTerm('');
      setTypeFilter('ALL');
      setDiagnosis(null);
      setFixNotification(null);
      loadSubsequentLogs();
    } else if (!isOpen) {
      setLogs([]);
      setErrorMsg(null);
      setDiagnosis(null);
      setFixNotification(null);
    }
  }, [isOpen, activeEntry, loadSubsequentLogs]);

  // Mismatch map for quick row lookup
  const mismatchMap = useMemo(() => {
    const map = new Map<string, TransferMismatchItem>();
    if (diagnosis && diagnosis.mismatches) {
      diagnosis.mismatches.forEach((m) => map.set(m.id, m));
    }
    return map;
  }, [diagnosis]);

  // Filtered entries for search & type filter
  const displayedEntries = useMemo(() => {
    return logs.filter((entry) => {
      if (typeFilter !== 'ALL' && entry.type !== typeFilter) return false;
      if (!searchTerm.trim()) return true;

      const term = searchTerm.toLowerCase();
      const tgl = (entry.tgl || '').toLowerCase();
      const waktu = (entry.waktu || '').toLowerCase();
      const rak = (entry.rak || '').toLowerCase();
      const subRak = (entry.sub_rak || '').toLowerCase();
      const gudang = (entry.gudang || '').toLowerCase();
      const user = (entry.user || '').toLowerCase();
      return (
        tgl.includes(term) ||
        waktu.includes(term) ||
        rak.includes(term) ||
        subRak.includes(term) ||
        gudang.includes(term) ||
        user.includes(term)
      );
    });
  }, [logs, searchTerm, typeFilter]);

  // Summary statistics
  const stats = useMemo(() => {
    let subsequentCount = 0;
    let totalIn = 0;
    let totalOut = 0;

    logs.forEach((entry) => {
      const isBase = isBaselineEntry(entry);
      if (!isBase) {
        subsequentCount++;
        if (entry.type === 'IN') totalIn += entry.jumlah || 0;
        if (entry.type === 'OUT') totalOut += entry.jumlah || 0;
      }
    });

    return {
      subsequentCount,
      totalIn,
      totalOut,
      netDelta: totalIn - totalOut,
      totalAllRows: logs.length
    };
  }, [logs, isBaselineEntry]);

  // Copy text in the format user specified:
  // YYYY-MM-DD | HH.MM.SS | SKU | TYPE | GUDANG | RAK
  const handleCopyFormattedText = () => {
    if (displayedEntries.length === 0) return;

    const lines = displayedEntries.map((e) => {
      const cleanTime = (e.waktu || '').replace(/:/g, '.');
      return `${e.tgl} | ${cleanTime} | ${e.sku} | ${e.type} | ${e.gudang || '-'} | ${e.rak || '-'}${e.sub_rak ? ' (' + e.sub_rak + ')' : ''}`;
    });

    const textToCopy = lines.join('\n');
    navigator.clipboard.writeText(textToCopy);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Export to CSV
  const handleExportCsv = () => {
    if (displayedEntries.length === 0) return;

    const headers = ['Tanggal', 'Waktu', 'SKU', 'Tipe', 'Gudang', 'Rak', 'Sub Rak', 'Jumlah', 'Tgl Scan', 'User', 'Catatan'];
    const rows = displayedEntries.map((e) => {
      const isBase = isBaselineEntry(e) ? 'TITIK ACUAN TRANSFER' : 'SETELAHNYA';
      return [
        `"${e.tgl || ''}"`,
        `"${e.waktu || ''}"`,
        `"${e.sku || ''}"`,
        `"${e.type || ''}"`,
        `"${e.gudang || ''}"`,
        `"${e.rak || ''}"`,
        `"${e.sub_rak || ''}"`,
        e.jumlah || 0,
        `"${e.tgl_scan || ''}"`,
        `"${e.user || ''}"`,
        `"${isBase}"`
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `riwayat-setelahnya-${activeEntry?.sku || 'sku'}-${activeEntry?.tgl || 'tgl'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Toggle selection in diagnosis modal
  const handleToggleSelectFix = (id: string) => {
    setSelectedFixIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllFix = () => {
    if (!diagnosis) return;
    if (selectedFixIds.size === diagnosis.mismatches.length) {
      setSelectedFixIds(new Set());
    } else {
      setSelectedFixIds(new Set(diagnosis.mismatches.map((m) => m.id)));
    }
  };

  // Execute fix for selected mismatches
  const handleExecuteFix = async (specificItems?: TransferMismatchItem[]) => {
    if (!diagnosis) return;
    const targetItems = specificItems || diagnosis.mismatches.filter((m) => selectedFixIds.has(m.id));

    if (targetItems.length === 0) return;

    try {
      setIsFixing(true);
      const res = await executeSubsequentTransferFix(targetItems, 'DevMode Admin');

      if (res.success) {
        setFixNotification({
          message: `Berhasil memperbaiki ${res.updatedCount} transaksi salah rak! Stok rak ${diagnosis.transferOriginRak} dan ${diagnosis.transferDestinationRak} kini telah seimbang.`,
          type: 'success'
        });
      } else {
        setFixNotification({
          message: `Berhasil memperbaiki ${res.updatedCount} transaksi, namun ada beberapa baris gagal.`,
          type: 'warning'
        });
      }

      setIsDiagnosisModalOpen(false);

      // Reload logs to reflect the updated rack values
      await loadSubsequentLogs();

      // Trigger parent callback to refresh DatabaseLog table behind modal
      if (onLogUpdated) {
        onLogUpdated();
      }
    } catch (err: any) {
      console.error('Error executing transfer fix:', err);
      setErrorMsg(err.message || 'Gagal mengeksekusi perbaikan salah rak');
    } finally {
      setIsFixing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        hideHeader
        size="8xl"
        className="w-[96vw] max-w-[1600px]"
      >
        <div className="space-y-4">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-purple-800 via-indigo-900 to-slate-900 text-white p-5 rounded-2xl shadow-lg border border-purple-500/30">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="p-2 bg-purple-500/20 text-purple-300 rounded-xl border border-purple-400/30">
                    <History className="w-5 h-5" />
                  </span>
                  <div>
                    <h3 className="text-lg font-black tracking-wide uppercase text-white flex items-center gap-2">
                      Riwayat Mutasi Setelahnya
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-500/30 text-purple-200 border border-purple-400/40">
                        Subsequent Chain
                      </span>
                    </h3>
                    <p className="text-xs text-purple-200/80 font-medium">
                      Menampilkan seluruh transaksi untuk SKU ini yang terjadi setelah transaksi acuan terpilih.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 self-start md:self-center">
                {/* TOMBOL CEK & PERBAIKI SALAH RAK SETELAH TRANSFER */}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setIsDiagnosisModalOpen(true);
                    runAudit(logs);
                  }}
                  disabled={loading || isAuditing}
                  className={`text-xs font-bold gap-1.5 transition-all shadow-md cursor-pointer ${
                    diagnosis && diagnosis.mismatches.length > 0
                      ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 border-amber-300 font-black ring-2 ring-amber-300/40 animate-pulse'
                      : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
                  }`}
                  title="Cek saldo rak & perbaiki pemotongan OUT salah rak setelah transfer"
                >
                  <Scale className={`w-3.5 h-3.5 ${isAuditing ? 'animate-spin' : ''}`} />
                  <span>Cek & Perbaiki Salah Rak</span>
                  {diagnosis && diagnosis.mismatches.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-black">
                      {diagnosis.mismatches.length} Salah
                    </span>
                  )}
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={loadSubsequentLogs}
                  disabled={loading}
                  className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs font-bold gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </Button>

                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 text-purple-200 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer shrink-0 ml-1"
                  title="Tutup Modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* In-Modal SKU Search & Switcher Bar */}
            <div className="mt-4 pt-3 border-t border-purple-500/30 space-y-2.5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 max-w-xl">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-purple-300 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      list="subsequent-recent-skus"
                      value={skuSearchInput}
                      onChange={(e) => {
                        setSkuSearchInput(e.target.value);
                        if (skuSearchError) setSkuSearchError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSearchSku(skuSearchInput);
                      }}
                      placeholder="Ketik SKU lain untuk dicek tanpa tutup modal (Enter)..."
                      className="w-full pl-9 pr-8 py-2 text-xs bg-black/40 border border-purple-400/40 focus:border-purple-300 rounded-xl text-white placeholder-purple-300/60 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-purple-400/50 shadow-inner"
                    />
                    {skuSearchInput && (
                      <button
                        type="button"
                        onClick={() => setSkuSearchInput('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-purple-300 hover:text-white"
                        title="Hapus ketikan"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <datalist id="subsequent-recent-skus">
                      {recentTransferSkus.map((sku) => (
                        <option key={sku} value={sku} />
                      ))}
                    </datalist>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSearchSku(skuSearchInput)}
                    disabled={isSearchingSku || !skuSearchInput.trim()}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs transition-all shadow-md cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                  >
                    {isSearchingSku ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Mencari...</span>
                      </>
                    ) : (
                      <>
                        <Search className="w-3.5 h-3.5" />
                        <span>Cari & Ganti SKU</span>
                      </>
                    )}
                  </button>

                  {activeEntry && (
                    <button
                      type="button"
                      onClick={() => setActiveEntry(null)}
                      className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-purple-200 hover:text-white font-bold text-xs transition-all shadow-md cursor-pointer border border-white/20 flex items-center gap-1.5 shrink-0"
                      title="Lihat daftar semua transfer terkini untuk memilih SKU lain"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      <span>Daftar Transfer</span>
                    </button>
                  )}
                </div>

                {/* Status message or shortcut helper */}
                {skuSearchError ? (
                  <span className="text-xs text-rose-300 font-bold bg-rose-500/20 px-3 py-1 rounded-lg border border-rose-400/30 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    {skuSearchError}
                  </span>
                ) : (
                  <span className="text-[11px] text-purple-200/70 hidden lg:inline-block">
                    💡 Tekan <strong>Enter</strong> atau klik rekomendasi SKU di bawah untuk cek langsung.
                  </span>
                )}
              </div>

              {/* Quick SKU Recommendation Badges */}
              {recentTransferSkus.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full text-[11px] scrollbar-thin">
                  <span className="text-purple-300 font-bold shrink-0 text-[10px] uppercase">Rekomendasi SKU Transfer:</span>
                  {recentTransferSkus.slice(0, 10).map((sku) => (
                    <button
                      key={sku}
                      type="button"
                      onClick={() => {
                        setSkuSearchInput(sku);
                        handleSearchSku(sku);
                      }}
                      className={`px-2.5 py-0.5 rounded-full font-mono text-[11px] font-bold border transition-all cursor-pointer shrink-0 ${
                        activeEntry?.sku === sku
                          ? 'bg-yellow-400 text-slate-950 border-yellow-300 font-black ring-1 ring-yellow-300'
                          : 'bg-white/10 hover:bg-white/20 text-purple-200 border-white/20 hover:text-white'
                      }`}
                      title={`Klik untuk langsung audit & mutasi SKU ${sku}`}
                    >
                      {sku}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Reference Baseline Info Card */}
            {activeEntry && (
              <div className="mt-3 pt-3 border-t border-purple-500/20 grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
                <div className="bg-black/30 p-2.5 rounded-xl border border-purple-400/20">
                  <span className="text-[10px] uppercase font-bold text-purple-300 block">SKU Aktif</span>
                  <span className="font-mono font-black text-sm text-yellow-300 truncate block" title={activeEntry.sku}>
                    {activeEntry.sku}
                  </span>
                </div>

                <div className="bg-black/30 p-2.5 rounded-xl border border-purple-400/20">
                  <span className="text-[10px] uppercase font-bold text-purple-300 block">Waktu Acuan</span>
                  <span className="font-bold text-white block">
                    {activeEntry.tgl} <span className="font-mono text-purple-200">({activeEntry.waktu})</span>
                  </span>
                </div>

                <div className="bg-black/30 p-2.5 rounded-xl border border-purple-400/20">
                  <span className="text-[10px] uppercase font-bold text-purple-300 block">
                    {availableTransfers.length > 1 ? 'Pilih Titik Acuan Transfer' : 'Lokasi & Tipe Acuan'}
                  </span>
                  {availableTransfers.length > 1 ? (
                    <select
                      value={activeEntry.id}
                      onChange={(e) => {
                        const chosen = availableTransfers.find((t) => t.id === e.target.value);
                        if (chosen) setActiveEntry(chosen);
                      }}
                      className="w-full bg-purple-950/80 border border-purple-400/40 text-yellow-200 text-xs rounded-lg px-2 py-1 font-bold focus:outline-none focus:ring-1 focus:ring-purple-400 mt-0.5 cursor-pointer"
                    >
                      {availableTransfers.map((t) => (
                        <option key={t.id} value={t.id} className="bg-slate-900 text-white">
                          {t.tgl} {t.waktu} • {t.rak} ({t.type} {t.gudang}) - {t.jumlah} Unit
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="font-bold text-white block truncate">
                      {activeEntry.rak} ({activeEntry.type} - {activeEntry.gudang})
                    </span>
                  )}
                </div>

                <div className="bg-black/30 p-2.5 rounded-xl border border-purple-400/20">
                  <span className="text-[10px] uppercase font-bold text-purple-300 block">Jumlah Qty Acuan</span>
                  <span className="font-black text-white block">
                    {activeEntry.jumlah.toLocaleString()} Unit
                  </span>
                </div>
              </div>
            )}
          </div>

          {activeEntry ? (
            <>
              {/* Alert Notification Banner for Detected Mismatch */}
              {diagnosis && diagnosis.mismatches.length > 0 && (
                <div className="bg-gradient-to-r from-amber-500/15 via-rose-500/15 to-amber-500/15 border-2 border-amber-400/70 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-md animate-in fade-in duration-200">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 bg-amber-500/20 text-amber-700 rounded-xl shrink-0 mt-0.5 border border-amber-400/50">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-amber-950 uppercase tracking-wide flex items-center gap-2">
                        Terdeteksi Transaksi Salah Rak Setelah Transfer
                        <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black">
                          {diagnosis.mismatches.length} Transaksi Terpengaruh
                        </span>
                      </h4>
                      <p className="text-xs text-slate-700 mt-1 leading-relaxed">
                        Stok telah ditransfer ke rak{' '}
                        <strong className="text-emerald-700 font-black">{diagnosis.transferDestinationRak}</strong>, namun staf
                        gudang memotong stok keluar (OUT) dari rak asal{' '}
                        <strong className="text-rose-700 font-black">{diagnosis.transferOriginRak}</strong>.
                        Hal ini menyebabkan rak {diagnosis.transferOriginRak} mengalami defisit (
                        <span className="text-rose-600 font-bold">{diagnosis.originRakBalance} unit</span>) dan rak{' '}
                        {diagnosis.transferDestinationRak} surplus (
                        <span className="text-emerald-600 font-bold">+{diagnosis.destinationRakBalance} unit</span>).
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setIsDiagnosisModalOpen(true)}
                    className="bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-xs rounded-xl shadow-md border border-amber-300 gap-1.5 shrink-0 whitespace-nowrap cursor-pointer"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>Perbaiki ke Rak {diagnosis.transferDestinationRak}</span>
                  </Button>
                </div>
              )}

              {/* Success Notification */}
              {fixNotification && (
                <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 text-xs flex items-center justify-between gap-2 font-medium">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{fixNotification.message}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFixNotification(null)}
                    className="p-1 text-emerald-700 hover:text-emerald-900 rounded cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Stats KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Mutasi Setelahnya</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-xl font-black text-slate-800">{stats.subsequentCount}</span>
                    <span className="text-xs text-slate-400 font-semibold">transaksi</span>
                  </div>
                </div>

                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200 shadow-xs">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Total IN Setelahnya</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-xl font-black text-emerald-800">+{stats.totalIn.toLocaleString()}</span>
                    <span className="text-xs text-emerald-600 font-semibold">unit</span>
                  </div>
                </div>

                <div className="bg-rose-50 p-3 rounded-xl border border-rose-200 shadow-xs">
                  <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block">Total OUT Setelahnya</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-xl font-black text-rose-800">-{stats.totalOut.toLocaleString()}</span>
                    <span className="text-xs text-rose-600 font-semibold">unit</span>
                  </div>
                </div>

                <div
                  className={`p-3 rounded-xl border shadow-xs ${
                    stats.netDelta >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'
                  }`}
                >
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider block ${
                      stats.netDelta >= 0 ? 'text-blue-700' : 'text-amber-800'
                    }`}
                  >
                    Saldo Netto Mutasi
                  </span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className={`text-xl font-black ${stats.netDelta >= 0 ? 'text-blue-900' : 'text-amber-900'}`}>
                      {stats.netDelta >= 0 ? `+${stats.netDelta.toLocaleString()}` : stats.netDelta.toLocaleString()}
                    </span>
                    <span className="text-xs font-semibold opacity-70">unit</span>
                  </div>
                </div>
              </div>

              {/* Toolbar & Filter Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Cari rak, user, gudang, tgl..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium text-slate-800"
                    />
                  </div>

                  <div className="flex items-center bg-white border border-slate-300 rounded-lg p-0.5 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setTypeFilter('ALL')}
                      className={`px-2.5 py-1 rounded-md transition-colors ${
                        typeFilter === 'ALL' ? 'bg-purple-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      Semua
                    </button>
                    <button
                      type="button"
                      onClick={() => setTypeFilter('IN')}
                      className={`px-2.5 py-1 rounded-md transition-colors ${
                        typeFilter === 'IN' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      IN
                    </button>
                    <button
                      type="button"
                      onClick={() => setTypeFilter('OUT')}
                      className={`px-2.5 py-1 rounded-md transition-colors ${
                        typeFilter === 'OUT' ? 'bg-rose-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      OUT
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={handleCopyFormattedText}
                    disabled={displayedEntries.length === 0}
                    className="h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 transition-all cursor-pointer disabled:opacity-50"
                    title="Salin list dalam format: Tgl | Waktu | SKU | Type | Gudang | Rak"
                  >
                    {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{isCopied ? 'Tersalin!' : 'Salin Format'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportCsv}
                    disabled={displayedEntries.length === 0}
                    className="h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white transition-all cursor-pointer disabled:opacity-50"
                    title="Unduh data dalam format CSV"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export CSV</span>
                  </button>
                </div>
              </div>

              {/* Error Notification */}
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 text-xs flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Table Container */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <div className="max-h-[460px] overflow-y-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="bg-slate-800 text-white sticky top-0 z-10 text-[11px] font-bold uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3 text-center border-r border-slate-700 w-10">No</th>
                        <th className="py-2.5 px-3 text-center border-r border-slate-700">Tanggal</th>
                        <th className="py-2.5 px-3 text-center border-r border-slate-700">Waktu</th>
                        <th className="py-2.5 px-3 border-r border-slate-700">SKU</th>
                        <th className="py-2.5 px-3 text-center border-r border-slate-700 w-16">Tipe</th>
                        <th className="py-2.5 px-3 text-center border-r border-slate-700">Gudang</th>
                        <th className="py-2.5 px-3 border-r border-slate-700">Rak</th>
                        <th className="py-2.5 px-3 border-r border-slate-700">Sub Rak</th>
                        <th className="py-2.5 px-3 text-center border-r border-slate-700">Qty</th>
                        <th className="py-2.5 px-3 text-center border-r border-slate-700">Tgl Scan</th>
                        <th className="py-2.5 px-3 border-r border-slate-700">User</th>
                        <th className="py-2.5 px-3 text-center">Status Transaksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-medium">
                      {loading ? (
                        <tr>
                          <td colSpan={12} className="py-12 text-center text-slate-500">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <RefreshCw className="w-6 h-6 animate-spin text-purple-600" />
                              <span className="text-xs font-semibold">Memuat riwayat transaksi setelahnya...</span>
                            </div>
                          </td>
                        </tr>
                      ) : displayedEntries.length === 0 ? (
                        <tr>
                          <td colSpan={12} className="py-10 text-center text-slate-400 text-xs">
                            Tidak ada transaksi yang ditemukan setelah waktu acuan ini.
                          </td>
                        </tr>
                      ) : (
                        displayedEntries.map((item, idx) => {
                          const isBase = isBaselineEntry(item);
                          const isTransfer =
                            (item.gudang || '').toUpperCase().includes('TRANSFER') || item.type === 'MOVE';
                          const mismatch = mismatchMap.get(item.id);

                          return (
                            <tr
                              key={item.id}
                              className={`transition-colors ${
                                isBase
                                  ? 'bg-purple-100/80 hover:bg-purple-200/80 border-l-4 border-l-purple-600 font-bold'
                                  : mismatch
                                  ? 'bg-amber-50 hover:bg-amber-100 border-l-4 border-l-amber-500'
                                  : idx % 2 === 0
                                  ? 'bg-white hover:bg-slate-50'
                                  : 'bg-slate-50/70 hover:bg-slate-100/70'
                              }`}
                            >
                              <td className="py-2 px-3 text-center border-r border-slate-200 text-slate-500 font-mono text-[11px]">
                                {idx + 1}
                              </td>
                              <td className="py-2 px-3 text-center border-r border-slate-200 font-mono">{item.tgl}</td>
                              <td className="py-2 px-3 text-center border-r border-slate-200 font-mono text-[11px]">
                                {item.waktu}
                              </td>
                              <td className="py-2 px-3 border-r border-slate-200 font-mono font-bold text-slate-900">
                                {item.sku}
                              </td>
                              <td className="py-2 px-3 text-center border-r border-slate-200">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-black ${
                                    item.type === 'IN'
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                      : item.type === 'OUT'
                                      ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                      : 'bg-blue-100 text-blue-800 border border-blue-300'
                                  }`}
                                >
                                  {item.type}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-center border-r border-slate-200">
                                {isTransfer ? (
                                  <span className="inline-flex px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 font-bold text-[10px] border border-purple-300">
                                    {item.gudang}
                                  </span>
                                ) : (
                                  <span className="text-slate-700">{item.gudang || '-'}</span>
                                )}
                              </td>
                              <td className="py-2 px-3 border-r border-slate-200 font-bold text-slate-900">
                                {mismatch ? (
                                  <div className="flex flex-col">
                                    <span className="line-through text-rose-600 font-bold">{item.rak || '-'}</span>
                                    <span className="text-emerald-700 font-black text-[10px] flex items-center gap-0.5">
                                      ➔ {mismatch.suggestedRak}
                                    </span>
                                  </div>
                                ) : (
                                  item.rak || '-'
                                )}
                              </td>
                              <td className="py-2 px-3 border-r border-slate-200 text-slate-600">{item.sub_rak || '-'}</td>
                              <td className="py-2 px-3 text-center border-r border-slate-200 font-black text-slate-900">
                                {item.jumlah}
                              </td>
                              <td className="py-2 px-3 text-center border-r border-slate-200 text-slate-600 font-mono text-[11px]">
                                {item.tgl_scan || '-'}
                              </td>
                              <td
                                className="py-2 px-3 border-r border-slate-200 text-slate-600 text-[11px] truncate max-w-[120px]"
                                title={item.user}
                              >
                                {item.user || '-'}
                              </td>
                              <td className="py-2 px-3 text-center">
                                {isBase ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-600 text-white font-black text-[10px] shadow-xs">
                                    <ArrowRightLeft className="w-3 h-3" />
                                    TITIK ACUAN
                                  </span>
                                ) : mismatch ? (
                                  <div className="flex items-center justify-center gap-1">
                                    {mismatch.reason.includes('nyelip') ? (
                                      <span
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-black border border-amber-300"
                                        title={mismatch.reason}
                                      >
                                        <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
                                        SALAH RAK (NYELIP)
                                      </span>
                                    ) : (
                                      <span
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-black border border-rose-300"
                                        title={mismatch.reason}
                                      >
                                        <AlertTriangle className="w-2.5 h-2.5 text-rose-600" />
                                        SALAH RAK
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleExecuteFix([mismatch])}
                                      disabled={isFixing}
                                      className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black transition-all cursor-pointer shadow-xs"
                                      title={`Pindahkan pemotongan ini ke rak ${mismatch.suggestedRak}`}
                                    >
                                      Perbaiki
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-[10px] font-bold text-slate-500 uppercase">Mutasi Setelahnya</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            /* In-Modal Recent Transfer Picker View */
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-black text-slate-800 uppercase tracking-wide flex items-center gap-2">
                    Pilih Transaksi Acuan Transfer Terkini
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                      {filteredRecentTransfers.length} Data Tersedia
                    </span>
                  </h4>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Silakan pilih salah satu transaksi transfer di bawah ini atau ketik SKU pada kolom pencarian di atas untuk memulai analisis.
                  </p>
                </div>

                <div className="relative w-full sm:w-72">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={recentTransferFilter}
                    onChange={(e) => setRecentTransferFilter(e.target.value)}
                    placeholder="Filter SKU, rak, user..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium text-slate-800"
                  />
                </div>
              </div>

              {/* Table of Recent Transfers */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs bg-white">
                <div className="max-h-[460px] overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-800 text-white sticky top-0 z-10 text-[11px] font-bold uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3 text-center border-r border-slate-700 w-10">No</th>
                        <th className="py-2.5 px-3 text-center border-r border-slate-700">Tanggal & Waktu</th>
                        <th className="py-2.5 px-3 border-r border-slate-700">SKU</th>
                        <th className="py-2.5 px-3 text-center border-r border-slate-700 w-16">Tipe</th>
                        <th className="py-2.5 px-3 text-center border-r border-slate-700">Gudang</th>
                        <th className="py-2.5 px-3 border-r border-slate-700">Rak / Sub Rak</th>
                        <th className="py-2.5 px-3 text-center border-r border-slate-700">Qty</th>
                        <th className="py-2.5 px-3 border-r border-slate-700">User</th>
                        <th className="py-2.5 px-3 text-center w-28">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-medium">
                      {isLoadingRecentTransfers ? (
                        <tr>
                          <td colSpan={9} className="py-12 text-center text-slate-500">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <RefreshCw className="w-6 h-6 animate-spin text-purple-600" />
                              <span className="text-xs font-semibold">Memuat transaksi transfer terkini...</span>
                            </div>
                          </td>
                        </tr>
                      ) : filteredRecentTransfers.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-10 text-center text-slate-400 text-xs">
                            Tidak ada transaksi transfer yang cocok. Silakan gunakan kolom pencarian SKU di atas.
                          </td>
                        </tr>
                      ) : (
                        filteredRecentTransfers.map((item, idx) => (
                          <tr key={item.id} className="hover:bg-purple-50/60 transition-colors">
                            <td className="py-2 px-3 text-center border-r border-slate-200 text-slate-500 font-mono text-[11px]">
                              {idx + 1}
                            </td>
                            <td className="py-2 px-3 text-center border-r border-slate-200 font-mono whitespace-nowrap">
                              {item.tgl} <span className="text-slate-400 text-[11px]">({item.waktu})</span>
                            </td>
                            <td className="py-2 px-3 font-mono font-bold text-purple-950 border-r border-slate-200">
                              {item.sku}
                            </td>
                            <td className="py-2 px-3 text-center border-r border-slate-200">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-black border ${
                                  item.type === 'IN'
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                    : 'bg-rose-100 text-rose-800 border-rose-300'
                                }`}
                              >
                                {item.type}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center border-r border-slate-200">
                              <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded font-bold text-[10px] border border-purple-300">
                                {item.gudang}
                              </span>
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200 font-bold text-slate-900">
                              {item.rak || '-'} {item.sub_rak && item.sub_rak !== item.rak ? `(${item.sub_rak})` : ''}
                            </td>
                            <td className="py-2 px-3 text-center border-r border-slate-200 font-black text-slate-900">
                              {item.jumlah}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200 text-slate-600 text-[11px] truncate max-w-[120px]" title={item.user}>
                              {item.user || '-'}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveEntry(item);
                                  setSkuSearchInput(item.sku);
                                }}
                                className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-bold rounded-lg cursor-pointer transition-all shadow-xs flex items-center justify-center gap-1 mx-auto"
                              >
                                <History className="w-3 h-3" />
                                <span>Pilih & Proses</span>
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
          )}

          {/* Modal Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs text-slate-500">
            <div>
              Total data ditampilkan:{' '}
              <strong className="text-slate-800">
                {activeEntry ? displayedEntries.length : filteredRecentTransfers.length}
              </strong>{' '}
              baris
            </div>
            <Button variant="secondary" onClick={onClose} className="px-5 font-bold cursor-pointer">
              Tutup
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL DIAGNOSA & KONFIRMASI PERBAIKAN SALAH RAK */}
      <Modal
        isOpen={isDiagnosisModalOpen}
        onClose={() => setIsDiagnosisModalOpen(false)}
        hideHeader
        size="7xl"
        className="w-[96vw] max-w-6xl"
      >
        <div className="space-y-4">
          {/* Header Dialog */}
          <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-rose-700 text-white p-5 rounded-2xl shadow-lg border border-amber-400/30">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-sm border border-white/30">
                  <Wrench className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-wide uppercase text-white flex items-center gap-2">
                    Diagnosa & Perbaikan Salah Rak Transfer
                  </h3>
                  <p className="text-xs text-amber-100 font-medium">
                    Menyelaraskan transaksi pemotongan barang (OUT) yang keliru dipotong dari rak asal setelah transfer.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDiagnosisModalOpen(false)}
                className="p-2 text-amber-100 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer shrink-0"
                title="Tutup Diagnosa"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Info Kartu Transfer & Saldo */}
            {diagnosis && (
              <div className="mt-4 pt-3 border-t border-white/20 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="bg-black/30 p-2.5 rounded-xl border border-white/10">
                  <span className="text-[10px] uppercase font-bold text-amber-200 block">Titik Acuan Transfer</span>
                  <span className="font-bold text-white block mt-0.5">
                    {diagnosis.transferOriginRak || 'Asal'} ➔ {diagnosis.transferDestinationRak || 'Tujuan'}
                  </span>
                  <span className="text-[10px] text-amber-200 font-mono">
                    {diagnosis.transferDate} ({diagnosis.transferTime}) • {diagnosis.transferQty} Unit
                  </span>
                </div>

                <div className="bg-black/30 p-2.5 rounded-xl border border-white/10">
                  <span className="text-[10px] uppercase font-bold text-amber-200 block">
                    Saldo Rak Asal ({diagnosis.transferOriginRak})
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={`text-base font-black ${
                        diagnosis.originRakBalance < 0 ? 'text-rose-400' : 'text-white'
                      }`}
                    >
                      {diagnosis.originRakBalance} Unit
                    </span>
                    {diagnosis.originRakBalance < 0 && (
                      <span className="text-[10px] bg-rose-500/30 text-rose-300 px-1.5 py-0.2 rounded border border-rose-400/40">
                        Defisit (Minus)
                      </span>
                    )}
                  </div>
                </div>

                <div className="bg-black/30 p-2.5 rounded-xl border border-white/10">
                  <span className="text-[10px] uppercase font-bold text-amber-200 block">
                    Saldo Rak Tujuan ({diagnosis.transferDestinationRak})
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={`text-base font-black ${
                        diagnosis.destinationRakBalance > 0 ? 'text-emerald-300' : 'text-white'
                      }`}
                    >
                      +{diagnosis.destinationRakBalance} Unit
                    </span>
                    {diagnosis.destinationRakBalance > 0 && (
                      <span className="text-[10px] bg-emerald-500/30 text-emerald-300 px-1.5 py-0.2 rounded border border-emerald-400/40">
                        Surplus Fisik
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Body Content */}
          {isAuditing ? (
            <div className="py-12 text-center text-slate-500">
              <div className="flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-8 h-8 animate-spin text-amber-600" />
                <span className="text-xs font-semibold">Menganalisis saldo rak dan riwayat transfer...</span>
              </div>
            </div>
          ) : !diagnosis || diagnosis.mismatches.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
              <h4 className="text-sm font-black text-slate-800">Saldo Rak Sudah Seimbang & Sesuai!</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Tidak terdeteksi pemotongan logistik salah rak setelah transfer untuk SKU ini. Seluruh alur barang berjalan normal.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider">
                    Daftar Transaksi Perlu Diperbaiki ({diagnosis.mismatches.length})
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Pilih baris transaksi yang akan dipindahkan lokasi raknya ke rak tujuan transfer.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSelectAllFix}
                  className="text-xs text-purple-700 font-bold hover:underline cursor-pointer"
                >
                  {selectedFixIds.size === diagnosis.mismatches.length ? 'Batal Pilih Semua' : 'Pilih Semua'}
                </button>
              </div>

              {/* Table of Candidate Fixes */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-700 text-[11px] font-bold uppercase border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3 text-center w-8">
                        <input
                          type="checkbox"
                          checked={selectedFixIds.size === diagnosis.mismatches.length && diagnosis.mismatches.length > 0}
                          onChange={handleSelectAllFix}
                          className="rounded text-purple-600 focus:ring-purple-500"
                        />
                      </th>
                      <th className="py-2 px-3">Tanggal & Waktu</th>
                      <th className="py-2 px-3">Tipe / Gudang</th>
                      <th className="py-2 px-3 text-center">Rak Terdata</th>
                      <th className="py-2 px-3 text-center">Rak Seharusnya</th>
                      <th className="py-2 px-3 text-center">Qty</th>
                      <th className="py-2 px-3">User</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {diagnosis.mismatches.map((item) => {
                      const isSelected = selectedFixIds.has(item.id);
                      return (
                        <tr
                          key={item.id}
                          className={`hover:bg-slate-50 transition-colors ${isSelected ? 'bg-amber-50/50' : ''}`}
                        >
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectFix(item.id)}
                              className="rounded text-purple-600 focus:ring-purple-500"
                            />
                          </td>
                          <td className="py-2.5 px-3 font-mono">
                            {item.tgl} <span className="text-slate-400">({item.waktu})</span>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex flex-col">
                              <div className="flex items-center">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300 mr-1.5">
                                  {item.type}
                                </span>
                                <span className="text-slate-600 font-semibold">{item.gudang}</span>
                              </div>
                              {item.reason.includes('nyelip') && (
                                <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-black text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                  ⚠️ Nyelip di {item.currentRak} setelah transfer
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="line-through text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                              {item.currentRak}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="inline-flex items-center gap-1 font-black text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-300">
                              <ArrowRight className="w-3 h-3 text-emerald-600" /> {item.suggestedRak}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center font-black text-slate-800">
                            {item.jumlah} Unit
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 text-[11px] truncate max-w-[100px]" title={item.user}>
                            {item.user || '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Simulation Box */}
              <div className="bg-slate-900 text-white p-4 rounded-xl space-y-2 border border-slate-800 text-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Simulasi Saldo Setelah Eksekusi Perbaikan:
                </span>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
                    <span className="text-[11px] text-slate-400 block font-semibold">
                      Rak Asal ({diagnosis.transferOriginRak})
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="line-through text-rose-400 font-mono font-bold">
                        {diagnosis.originRakBalance} Unit
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-emerald-400 font-mono font-black text-sm">0 Unit (Seimbang ✅)</span>
                    </div>
                  </div>

                  <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
                    <span className="text-[11px] text-slate-400 block font-semibold">
                      Rak Tujuan ({diagnosis.transferDestinationRak})
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="line-through text-amber-300 font-mono font-bold">
                        +{diagnosis.destinationRakBalance} Unit
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-emerald-400 font-mono font-black text-sm">0 Unit (Seimbang ✅)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <Button
              variant="secondary"
              onClick={() => setIsDiagnosisModalOpen(false)}
              className="text-xs font-bold cursor-pointer"
            >
              Batal
            </Button>

            {diagnosis && diagnosis.mismatches.length > 0 && (
              <Button
                variant="primary"
                onClick={() => handleExecuteFix()}
                disabled={isFixing || selectedFixIds.size === 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black px-5 py-2.5 rounded-xl shadow-lg gap-2 cursor-pointer disabled:opacity-50"
              >
                {isFixing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Mengeksekusi Perbaikan...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      Eksekusi Perbaikan ({selectedFixIds.size} Transaksi ke Rak {diagnosis.transferDestinationRak})
                    </span>
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
};
