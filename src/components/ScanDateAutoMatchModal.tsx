import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import {
  CheckCheck,
  Search,
  RefreshCw,
  Sparkles,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
  Layers,
  Copy,
  Check,
  Filter,
  ShieldCheck,
  Package,
  Calendar,
  X,
  Lock,
  Shuffle,
  MapPin
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { DatabaseLogEntry } from './DatabaseLog';
import {
  analyzeAndMatchScanDates,
  executeBatchScanDateUpdates,
  ScanDateMatchResult,
  MatchedScanDateItem
} from '../services/scanDateMatchService';

interface ScanDateAutoMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSku: string;
  allSkus: string[];
  currentLogs: DatabaseLogEntry[];
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onSuccessUpdate?: () => void;
}

type FilterTab = 'ALL' | 'CHANGED' | 'EXACT' | 'FIFO' | 'DEFICIT';

export const ScanDateAutoMatchModal: React.FC<ScanDateAutoMatchModalProps> = ({
  isOpen,
  onClose,
  initialSku,
  allSkus,
  currentLogs,
  showToast,
  onSuccessUpdate
}) => {
  const [selectedSku, setSelectedSku] = useState(initialSku || '');
  const [searchSkuInput, setSearchSkuInput] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Mode Pencocokan Rak & Filter Rak Spesifik
  const [strictSameRak, setStrictSameRak] = useState(true);
  const [selectedRakFilter, setSelectedRakFilter] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [matchResult, setMatchResult] = useState<ScanDateMatchResult | null>(null);

  // Search & Filter di dalam preview table
  const [tableSearch, setTableSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  // Checkbox pilihan baris yang akan diaplikasikan
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  // Eksekusi State
  const [isConfirming, setIsConfirming] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, percent: 0 });
  const [copiedWA, setCopiedWA] = useState(false);

  // Inisialisasi saat modal dibuka
  useEffect(() => {
    if (isOpen) {
      const target = initialSku || (allSkus.length > 0 ? allSkus[0] : '');
      setSelectedSku(target);
      setSearchSkuInput('');
      setTableSearch('');
      setActiveTab('ALL');
      setCurrentPage(1);
      setIsConfirming(false);
      setIsExecuting(false);
      setStrictSameRak(true);
      setSelectedRakFilter('');

      if (target) {
        handleRunAnalysis(target, true, '');
      } else {
        setMatchResult(null);
      }
    }
  }, [isOpen, initialSku]);

  // Handler Analisis
  const handleRunAnalysis = useCallback(
    async (skuToAnalyze: string, overrideStrict?: boolean, overrideRak?: string) => {
      const cleanSku = skuToAnalyze.trim();
      if (!cleanSku) {
        showToast('Pilih SKU terlebih dahulu.', 'warning');
        return;
      }

      const isStrict = overrideStrict !== undefined ? overrideStrict : strictSameRak;
      const rakFilter = overrideRak !== undefined ? overrideRak : selectedRakFilter;

      setIsLoading(true);
      try {
        // Ambil data log lengkap SKU ini dari database agar 100% akurat
        const { data: dbLogs, error } = await supabase
          .from('database_log')
          .select('*')
          .ilike('sku', cleanSku)
          .order('tgl', { ascending: true })
          .order('waktu', { ascending: true });

        if (error) throw error;

        const sourceLogs = dbLogs && dbLogs.length > 0 ? dbLogs : currentLogs;
        const result = analyzeAndMatchScanDates(sourceLogs as DatabaseLogEntry[], cleanSku, {
          strictSameRak: isStrict,
          targetRak: rakFilter
        });

        setMatchResult(result);
        setCurrentPage(1);

        // Otomatis centang seluruh baris yang berubah
        const changedIds = new Set(result.items.filter(i => i.isChanged).map(i => i.id));
        setSelectedItemIds(changedIds);

        const modeLabel = isStrict ? '🔒 Wajib Sama Rak' : '🔄 Boleh Lintas Rak';
        const rakLabel = rakFilter ? `Rak: ${rakFilter}` : 'Semua Rak';

        if (result.summary.totalChanged > 0) {
          showToast(
            `Analisis selesai! [${modeLabel} | ${rakLabel}] Ditemukan ${result.summary.totalChanged} transaksi OUT yang dapat disinkronkan (${result.summary.totalTglScanChanged} tgl scan, ${result.summary.totalRakChanged} rak).`,
            'info'
          );
        } else {
          showToast(
            `Analisis selesai! [${modeLabel} | ${rakLabel}] Seluruh tgl scan dan rak untuk SKU ${cleanSku} sudah klop.`,
            'success'
          );
        }
      } catch (err: any) {
        console.error('Error running scan date matching:', err);
        showToast('Gagal memuat atau menganalisis data log: ' + (err.message || 'Unknown error'), 'error');
      } finally {
        setIsLoading(false);
      }
    },
    [currentLogs, showToast, strictSameRak, selectedRakFilter]
  );

  // Filter daftar SKU dropdown
  const filteredSkuOptions = useMemo(() => {
    if (!searchSkuInput.trim()) return allSkus.slice(0, 50);
    const q = searchSkuInput.toLowerCase();
    return allSkus.filter(s => s.toLowerCase().includes(q)).slice(0, 50);
  }, [allSkus, searchSkuInput]);

  // Filter Baris Tabel berdasarkan Tab & Search
  const filteredTableItems = useMemo(() => {
    if (!matchResult) return [];
    let items = matchResult.items;

    // Filter Tab
    if (activeTab === 'CHANGED') {
      items = items.filter(i => i.isChanged);
    } else if (activeTab === 'EXACT') {
      items = items.filter(i => i.status === 'EXACT_MATCH' || i.status === 'EXACT_QTY_DIFF_RAK');
    } else if (activeTab === 'FIFO') {
      items = items.filter(i => i.status === 'FIFO_MATCH');
    } else if (activeTab === 'DEFICIT') {
      items = items.filter(i => i.status === 'DEFICIT_UNMATCHED');
    }

    // Filter Search
    if (tableSearch.trim()) {
      const q = tableSearch.toLowerCase();
      items = items.filter(
        i =>
          i.tgl.toLowerCase().includes(q) ||
          i.rak.toLowerCase().includes(q) ||
          (i.sub_rak && i.sub_rak.toLowerCase().includes(q)) ||
          i.gudang.toLowerCase().includes(q) ||
          i.oldTglScan.toLowerCase().includes(q) ||
          i.newTglScan.toLowerCase().includes(q) ||
          i.statusLabel.toLowerCase().includes(q) ||
          i.matchReason.toLowerCase().includes(q) ||
          i.jumlah.toString().includes(q)
      );
    }

    return items;
  }, [matchResult, activeTab, tableSearch]);

  // Paginasi
  const totalPages = Math.ceil(filteredTableItems.length / itemsPerPage) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredTableItems.slice(start, start + itemsPerPage);
  }, [filteredTableItems, currentPage, itemsPerPage]);

  // Checkbox toggle helpers
  const handleToggleSelectAllVisible = () => {
    const next = new Set(selectedItemIds);
    const visibleChanged = paginatedItems.filter(i => i.isChanged);
    const allSelected = visibleChanged.every(i => next.has(i.id));

    if (allSelected) {
      visibleChanged.forEach(i => next.delete(i.id));
    } else {
      visibleChanged.forEach(i => next.add(i.id));
    }
    setSelectedItemIds(next);
  };

  const handleToggleRow = (id: string) => {
    const next = new Set(selectedItemIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedItemIds(next);
  };

  // Salin Rangkuman ke WhatsApp
  const handleCopyWaSummary = () => {
    if (!matchResult) return;
    const s = matchResult.summary;
    const modeLabel = s.strictSameRak ? '🔒 Wajib Sama Rak Saja (Strict)' : '🔄 Boleh Lintas Rak (Cross-Rak)';
    const rakLabel = s.targetRak ? `Rak ${s.targetRak}` : 'Semua Rak';
    const text = `🔄 *SINKRONISASI TGL SCAN & RAK OUT (KLOP TGL MASUK)* 🔄
━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 *SKU:* ${s.sku}
🎯 *Mode Pencocokan:* ${modeLabel}
📍 *Filter Rak:* ${rakLabel}
📊 *Total IN:* ${s.totalInQty.toLocaleString()} pcs (${s.totalInRows} baris)
📤 *Total OUT:* ${s.totalOutQty.toLocaleString()} pcs (${s.totalOutRows} baris)
⚖️ *Saldo Net Gudang:* ${s.netBalance >= 0 ? '+' : ''}${s.netBalance.toLocaleString()} pcs
━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ *Hasil Klop Tgl Scan & Rak:*
• Total OUT Diproses: ${s.totalOutCleared} baris
• Total Baris Berubah: ${s.totalChanged} baris
• Perubahan Tgl Scan: ${s.totalTglScanChanged} baris
• Perubahan/Pindah Rak: ${s.totalRakChanged} baris
• Klop Pas (Sama Rak): ${s.exactMatchCount} baris
• Klop Alokasi FIFO: ${s.fifoMatchCount} baris
• Dilindungi Pra-Transfer: ${s.protectedPreTransferCount} baris
• Sisa Defisit: ${s.unmatchedDeficitCount} baris (${s.unmatchedDeficitQty} pcs)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Data siap disinkronkan ke sistem Kalindo Gudang 5.`;

    navigator.clipboard.writeText(text);
    setCopiedWA(true);
    showToast('Rangkuman analisis berhasil disalin ke clipboard!', 'success');
    setTimeout(() => setCopiedWA(false), 2500);
  };

  // Eksekusi Batch Update ke Supabase
  const handleExecuteUpdates = async () => {
    if (!matchResult) return;

    // Ambil item yang dicentang dan memang mengalami perubahan
    const targetItems = matchResult.items.filter(i => selectedItemIds.has(i.id) && i.isChanged);

    if (targetItems.length === 0) {
      showToast('Tidak ada baris yang dipilih untuk diperbarui.', 'warning');
      setIsConfirming(false);
      return;
    }

    setIsExecuting(true);
    setProgress({ current: 0, total: targetItems.length, percent: 0 });

    try {
      const res = await executeBatchScanDateUpdates(targetItems, (cur, tot, pct) => {
        setProgress({ current: cur, total: tot, percent: pct });
      });

      if (res.errorCount === 0) {
        showToast(
          `Sukses memperbarui ${res.successCount} transaksi OUT! Tgl scan dan rak kini telah klop dengan barang masuk.`,
          'success'
        );
        setIsConfirming(false);
        if (onSuccessUpdate) onSuccessUpdate();
        // Refresh analisis ulang
        handleRunAnalysis(selectedSku);
      } else {
        showToast(
          `Sebagian berhasil: ${res.successCount} sukses, ${res.errorCount} gagal diupdate.`,
          'warning'
        );
      }
    } catch (err: any) {
      console.error('Error applying batch updates:', err);
      showToast('Terjadi kesalahan saat menyimpan ke database: ' + (err.message || 'Error'), 'error');
    } finally {
      setIsExecuting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isExecuting) onClose();
      }}
      title=""
      size="full"
    >
      <div className="flex flex-col h-[90vh] max-h-[920px] bg-slate-900/95 text-slate-100 rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
        {/* HEADER MODAL */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-gradient-to-r from-slate-950 via-slate-900 to-cyan-950/40 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-400/30 shadow-inner">
              <CheckCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-white tracking-wide">
                  Klop Tgl Scan & Rak OUT (Auto-Match Tgl Masuk IN)
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 rounded-md">
                  DEV TOOLS
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Menyelaraskan tgl scan dan rak transaksi OUT agar klop sesuai dengan nota masuk IN (Prioritas Rak Sama & Tanggal Terdekat)
              </p>
            </div>
          </div>

          {/* SKU Picker, Rak Filter, Mode Toggle & Trigger Button */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* SKU Input & Dropdown */}
            <div className="relative">
              <div className="flex items-center bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-1.5 focus-within:border-cyan-400 transition-all">
                <Search className="h-4 w-4 text-slate-400 mr-2" />
                <input
                  type="text"
                  placeholder="Ketik/Pilih SKU..."
                  value={selectedSku}
                  onChange={e => {
                    setSelectedSku(e.target.value);
                    setSearchSkuInput(e.target.value);
                    setIsDropdownOpen(true);
                  }}
                  onFocus={() => setIsDropdownOpen(true)}
                  className="bg-transparent border-none text-white text-xs sm:text-sm font-semibold outline-none w-36 sm:w-48"
                />
                {selectedSku && (
                  <button
                    onClick={() => {
                      setSelectedSku('');
                      setSearchSkuInput('');
                    }}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Dropdown Options */}
              {isDropdownOpen && filteredSkuOptions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-slate-800 border border-slate-700 rounded-xl max-h-56 overflow-y-auto shadow-2xl z-50 py-1">
                  {filteredSkuOptions.map(sku => (
                    <button
                      key={sku}
                      type="button"
                      onClick={() => {
                        setSelectedSku(sku);
                        setIsDropdownOpen(false);
                        handleRunAnalysis(sku, strictSameRak, selectedRakFilter);
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-cyan-500/20 hover:text-cyan-300 transition-colors font-medium flex items-center justify-between"
                    >
                      <span>{sku}</span>
                      {selectedSku === sku && <Check className="h-3.5 w-3.5 text-cyan-400" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Filter Rak Dropdown */}
            <div className="flex items-center bg-slate-800/90 border border-slate-700 rounded-xl px-2.5 py-1.5 focus-within:border-cyan-400 transition-all">
              <MapPin className="h-4 w-4 text-cyan-400 mr-1.5 flex-shrink-0" />
              <select
                value={selectedRakFilter}
                onChange={e => {
                  const newRak = e.target.value;
                  setSelectedRakFilter(newRak);
                  if (selectedSku) {
                    handleRunAnalysis(selectedSku, strictSameRak, newRak);
                  }
                }}
                className="bg-transparent border-none text-white text-xs font-semibold outline-none cursor-pointer pr-1"
                title="Pilih filter rak tertentu untuk dianalisis"
              >
                <option value="" className="bg-slate-900 text-slate-100">
                  Semua Rak {matchResult?.summary.availableRaks?.length ? `(${matchResult.summary.availableRaks.length})` : ''}
                </option>
                {matchResult?.summary.availableRaks?.map(r => (
                  <option key={r} value={r} className="bg-slate-900 text-slate-100">
                    Rak: {r}
                  </option>
                ))}
              </select>
            </div>

            {/* Mode Pencocokan Segmented Control */}
            <div className="flex items-center p-1 bg-slate-950/80 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => {
                  if (!strictSameRak) {
                    setStrictSameRak(true);
                    if (selectedSku) {
                      handleRunAnalysis(selectedSku, true, selectedRakFilter);
                    }
                  }
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  strictSameRak
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-700/30 border border-emerald-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Hanya cocokkan OUT ke IN di rak yang sama persis (Tidak boleh comot kuota dari rak lain)"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>Wajib Sama Rak</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (strictSameRak) {
                    setStrictSameRak(false);
                    if (selectedSku) {
                      handleRunAnalysis(selectedSku, false, selectedRakFilter);
                    }
                  }
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  !strictSameRak
                    ? 'bg-amber-600 text-white shadow-md shadow-amber-700/30 border border-amber-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Izinkan sisa kuota OUT dipasangkan ke kuota IN rak lain jika kuota rak aslinya habis (Otomatis Pindah Rak)"
              >
                <Shuffle className="h-3.5 w-3.5" />
                <span>Boleh Lintas Rak</span>
              </button>
            </div>

            {/* Trigger Button */}
            <Button
              onClick={() => handleRunAnalysis(selectedSku, strictSameRak, selectedRakFilter)}
              disabled={isLoading || !selectedSku}
              className="h-10 px-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg shadow-cyan-600/20 flex items-center gap-2 transition-all active:scale-95"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'Menganalisis...' : 'Mulai Analisis'}</span>
            </Button>
          </div>
        </div>

        {/* BODY AREA */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* BANNER ATURAN BISNIS */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-gradient-to-r from-cyan-950/40 via-slate-900 to-indigo-950/30 border border-cyan-800/40 flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-cyan-400 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-slate-300 leading-relaxed space-y-2 w-full">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-white text-xs sm:text-sm">
                  Aturan & Logika Pencocokan Otomatis (Auto-Match Tgl Scan & Rak):
                </p>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-md text-[11px] font-black border flex items-center gap-1 ${
                      strictSameRak
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    }`}
                  >
                    {strictSameRak ? <Lock className="h-3 w-3" /> : <Shuffle className="h-3 w-3" />}
                    <span>{strictSameRak ? 'MODE: WAJIB SAMA RAK' : 'MODE: BOLEH LINTAS RAK'}</span>
                  </span>
                  {selectedRakFilter && (
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                      Filter: Rak {selectedRakFilter}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-slate-300">
                <p>
                  • <strong>Tgl Nota Asli Aman</strong>: Kolom <code>tgl</code> nota transaksi tidak diubah sama sekali.
                </p>
                <p>
                  • <strong>{strictSameRak ? '🔒 Wajib Sama Rak' : '🔄 Boleh Lintas Rak'}</strong>:{' '}
                  {strictSameRak
                    ? 'OUT hanya dicocokkan dengan IN di rak yang sama. Jika kuota rak habis, statusnya Defisit di Rak Ini (Rak TIDAK dipindah).'
                    : 'OUT yang kehabisan stok di rak aslinya diizinkan mengambil sisa kuota IN dari rak lain (Pindah Rak).'}
                </p>
                <p>
                  • <strong>Prioritas Exact Qty</strong>: Mencari OUT dengan Qty yang sama persis terlebih dahulu (Klop Sisa 0).
                </p>
                <p>
                  • <strong>✨ Tanggal Nota Terdekat</strong>: Jika Qty sama, mendahulukan OUT yang tanggal notanya paling dekat dengan nota IN.
                </p>
                <p>
                  • <strong>Logika TRANSFER</strong>: Jika ada pemindahan rak (gudang <code>TRANSFER</code>), hanya OUT setelah transfer yang di-reset.
                </p>
                <p>
                  • <strong>Mode Preview Aman</strong>: Database belum berubah sampai Anda menekan tombol "Terapkan Perubahan".
                </p>
              </div>
            </div>
          </div>

          {/* SUMMARY CARDS */}
          {matchResult && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
              <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/80">
                <div className="text-[11px] font-semibold text-slate-400">Total Masuk (IN)</div>
                <div className="text-base sm:text-lg font-black text-emerald-400 mt-0.5">
                  {matchResult.summary.totalInQty.toLocaleString()}{' '}
                  <span className="text-xs font-normal text-slate-400">pcs</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {matchResult.summary.totalInRows} baris nota masuk
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/80">
                <div className="text-[11px] font-semibold text-slate-400">Total Keluar (OUT)</div>
                <div className="text-base sm:text-lg font-black text-rose-400 mt-0.5">
                  {matchResult.summary.totalOutQty.toLocaleString()}{' '}
                  <span className="text-xs font-normal text-slate-400">pcs</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {matchResult.summary.totalOutRows} baris nota keluar
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/80">
                <div className="text-[11px] font-semibold text-slate-400">Saldo Net Gudang</div>
                <div
                  className={`text-base sm:text-lg font-black mt-0.5 ${
                    matchResult.summary.netBalance > 0
                      ? 'text-teal-400'
                      : matchResult.summary.netBalance === 0
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                  }`}
                >
                  {matchResult.summary.netBalance >= 0 ? '+' : ''}
                  {matchResult.summary.netBalance.toLocaleString()}{' '}
                  <span className="text-xs font-normal text-slate-400">pcs</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {matchResult.summary.netBalance === 0
                    ? 'Status Klop Pas'
                    : matchResult.summary.netBalance > 0
                    ? 'Stok Tersedia'
                    : 'Defisit Minus'}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-cyan-950/40 border border-cyan-800/60">
                <div className="text-[11px] font-semibold text-cyan-300">Akan Diperbarui</div>
                <div className="text-base sm:text-lg font-black text-cyan-400 mt-0.5">
                  {matchResult.summary.totalChanged}{' '}
                  <span className="text-xs font-normal text-slate-400">baris</span>
                </div>
                <div className="text-[10px] text-cyan-300/70 mt-0.5">
                  {matchResult.summary.totalTglScanChanged} Scan, {matchResult.summary.totalRakChanged} Rak
                </div>
              </div>

              <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/60">
                <div className="text-[11px] font-semibold text-emerald-300">Klop Pas (Exact)</div>
                <div className="text-base sm:text-lg font-black text-emerald-400 mt-0.5">
                  {matchResult.summary.exactMatchCount}{' '}
                  <span className="text-xs font-normal text-slate-400">baris</span>
                </div>
                <div className="text-[10px] text-emerald-300/70 mt-0.5">
                  Qty sama & nota terdekat
                </div>
              </div>

              <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-800/60">
                <div className="text-[11px] font-semibold text-rose-300">Sisa / Defisit</div>
                <div className="text-base sm:text-lg font-black text-rose-400 mt-0.5">
                  {matchResult.summary.unmatchedDeficitCount}{' '}
                  <span className="text-xs font-normal text-slate-400">baris</span>
                </div>
                <div className="text-[10px] text-rose-300/70 mt-0.5">
                  {matchResult.summary.unmatchedDeficitQty} pcs tanpa kuota IN
                </div>
              </div>
            </div>
          )}

          {/* STATUS TRANSFER NOTIFICATION */}
          {matchResult && matchResult.summary.hasTransfer && (
            <div className="px-3.5 py-2.5 rounded-xl bg-indigo-950/40 border border-indigo-700/50 flex items-center justify-between text-xs text-indigo-300">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-indigo-400 flex-shrink-0" />
                <span>
                  SKU ini memiliki <strong>{matchResult.summary.transferCount} transaksi TRANSFER</strong> (terakhir:{' '}
                  <code>
                    {matchResult.summary.transferDate} {matchResult.summary.transferTime}
                  </code>
                  ). Sistem memproteksi {matchResult.summary.protectedPreTransferCount} transaksi OUT sebelum waktu transfer.
                </span>
              </div>
              <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-bold">
                TRANSFER LOGIC AKTIF
              </span>
            </div>
          )}

          {/* TABLE CONTROLS & FILTER TABS */}
          {matchResult && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              {/* Tab Filters */}
              <div className="flex items-center gap-1.5 p-1 bg-slate-950/80 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('ALL');
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeTab === 'ALL'
                      ? 'bg-slate-700 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Semua ({matchResult.items.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('CHANGED');
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    activeTab === 'CHANGED'
                      ? 'bg-cyan-600 text-white shadow'
                      : 'text-cyan-400 hover:text-cyan-300'
                  }`}
                >
                  <span>Hanya Berubah</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-cyan-900/80 text-cyan-200">
                    {matchResult.summary.totalChanged}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('EXACT');
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeTab === 'EXACT'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-emerald-400 hover:text-emerald-300'
                  }`}
                >
                  Klop Pas ({matchResult.summary.exactMatchCount})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('FIFO');
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeTab === 'FIFO'
                      ? 'bg-sky-600 text-white shadow'
                      : 'text-sky-400 hover:text-sky-300'
                  }`}
                >
                  FIFO Terdekat ({matchResult.summary.fifoMatchCount})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('DEFICIT');
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeTab === 'DEFICIT'
                      ? 'bg-rose-600 text-white shadow'
                      : 'text-rose-400 hover:text-rose-300'
                  }`}
                >
                  Defisit ({matchResult.summary.unmatchedDeficitCount})
                </button>
              </div>

              {/* Search & Page Size */}
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-xl px-2.5 py-1.5 focus-within:border-cyan-500 transition-all">
                  <Search className="h-3.5 w-3.5 text-slate-500 mr-2" />
                  <input
                    type="text"
                    placeholder="Cari tgl, rak, status..."
                    value={tableSearch}
                    onChange={e => {
                      setTableSearch(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="bg-transparent border-none text-white text-xs outline-none w-36 sm:w-48"
                  />
                  {tableSearch && (
                    <button onClick={() => setTableSearch('')} className="text-slate-400 hover:text-white">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span>Baris:</span>
                  <select
                    value={itemsPerPage}
                    onChange={e => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-2 py-1 outline-none"
                  >
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                  </select>
                </div>

                <button
                  onClick={handleCopyWaSummary}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition-colors"
                  title="Salin rekap ke WhatsApp"
                >
                  {copiedWA ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedWA ? 'Disalin' : 'Salin WA'}</span>
                </button>
              </div>
            </div>
          )}

          {/* PREVIEW TABLE */}
          {matchResult ? (
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60 shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-800 select-none">
                    <tr>
                      <th className="py-2.5 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={
                            paginatedItems.filter(i => i.isChanged).length > 0 &&
                            paginatedItems.filter(i => i.isChanged).every(i => selectedItemIds.has(i.id))
                          }
                          onChange={handleToggleSelectAllVisible}
                          className="rounded border-slate-700 text-cyan-500 focus:ring-0 cursor-pointer"
                          title="Pilih semua baris yang berubah di halaman ini"
                        />
                      </th>
                      <th className="py-2.5 px-3">Tgl & Waktu Nota</th>
                      <th className="py-2.5 px-3 text-center">Type</th>
                      <th className="py-2.5 px-3 text-right">Jumlah</th>
                      <th className="py-2.5 px-3">Gudang</th>
                      <th className="py-2.5 px-3">Rak (Asal ➔ Tujuan)</th>
                      <th className="py-2.5 px-3">Tgl Scan Lama</th>
                      <th className="py-2.5 px-3">Tgl Scan Baru</th>
                      <th className="py-2.5 px-3">Status Klop</th>
                      <th className="py-2.5 px-3">Alasan & Referensi IN</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 font-medium">
                    {paginatedItems.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-8 text-center text-slate-500">
                          Tidak ada data yang sesuai dengan filter.
                        </td>
                      </tr>
                    ) : (
                      paginatedItems.map((item, idx) => {
                        const isSelected = selectedItemIds.has(item.id);
                        return (
                          <tr
                            key={item.id}
                            className={`transition-colors ${
                              item.type === 'IN'
                                ? 'bg-emerald-950/15 hover:bg-emerald-950/30'
                                : item.isChanged
                                ? 'bg-cyan-950/15 hover:bg-cyan-950/30'
                                : 'hover:bg-slate-850'
                            }`}
                          >
                            {/* Checkbox */}
                            <td className="py-2.5 px-3 text-center">
                              {item.type === 'OUT' && item.isChanged ? (
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleRow(item.id)}
                                  className="rounded border-slate-700 text-cyan-500 focus:ring-0 cursor-pointer"
                                />
                              ) : (
                                <span className="text-slate-600 text-[10px]">
                                  {(currentPage - 1) * itemsPerPage + idx + 1}
                                </span>
                              )}
                            </td>

                            {/* Tgl & Waktu Nota Asli */}
                            <td className="py-2.5 px-3 font-mono">
                              <div className="text-slate-200 font-bold">{item.tgl}</div>
                              <div className="text-[10px] text-slate-400">{item.waktu}</div>
                            </td>

                            {/* Type Badge */}
                            <td className="py-2.5 px-3 text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                                  item.type === 'IN'
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                }`}
                              >
                                {item.type}
                              </span>
                            </td>

                            {/* Qty */}
                            <td className="py-2.5 px-3 text-right font-black text-sm">
                              <span className={item.type === 'IN' ? 'text-emerald-300' : 'text-rose-300'}>
                                {item.jumlah.toLocaleString()}
                              </span>
                            </td>

                            {/* Gudang */}
                            <td className="py-2.5 px-3">
                              <span className="text-slate-300 text-xs font-semibold">
                                {item.gudang || '-'}
                              </span>
                            </td>

                            {/* Rak & Sub Rak */}
                            <td className="py-2.5 px-3">
                              {item.type === 'OUT' && item.isRakChanged ? (
                                <div>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="line-through text-rose-400 text-xs font-semibold bg-rose-950/40 px-1 py-0.5 rounded">
                                      {item.rak || '-'}
                                    </span>
                                    <ArrowRight className="h-3.5 w-3.5 text-cyan-400 flex-shrink-0" />
                                    <span className="font-bold text-cyan-300 bg-cyan-950/80 px-1.5 py-0.5 rounded border border-cyan-400/40 shadow-xs">
                                      {item.newRak}
                                    </span>
                                  </div>
                                  {item.newSubRak && item.newSubRak !== item.newRak && (
                                    <div className="text-[10px] text-cyan-400/80 font-mono mt-0.5">
                                      Sub: {item.newSubRak}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div>
                                  <div className="font-bold text-slate-200">{item.rak || '-'}</div>
                                  {item.sub_rak && (
                                    <div className="text-[10px] text-slate-400 font-mono">Sub: {item.sub_rak}</div>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Tgl Scan Lama */}
                            <td className="py-2.5 px-3 font-mono">
                              {item.oldTglScan ? (
                                <span
                                  className={
                                    item.isChanged
                                      ? 'line-through text-rose-400/80 bg-rose-950/40 px-1.5 py-0.5 rounded'
                                      : 'text-slate-300'
                                  }
                                >
                                  {item.oldTglScan}
                                </span>
                              ) : (
                                <span className="text-slate-500 italic">(kosong)</span>
                              )}
                            </td>

                            {/* Tgl Scan Baru */}
                            <td className="py-2.5 px-3 font-mono">
                              {item.newTglScan ? (
                                <span
                                  className={`px-1.5 py-0.5 rounded font-bold ${
                                    item.isChanged
                                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30'
                                      : 'text-slate-200'
                                  }`}
                                >
                                  {item.newTglScan}
                                </span>
                              ) : (
                                <span className="text-rose-400/90 italic">(dikosongkan)</span>
                              )}
                            </td>

                            {/* Status Klop Badge */}
                            <td className="py-2.5 px-3">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${item.badgeBg} ${item.badgeText} ${item.badgeBorder}`}
                              >
                                {item.statusLabel}
                              </span>
                            </td>

                            {/* Match Reason */}
                            <td className="py-2.5 px-3 text-slate-300 text-[11px] leading-snug">
                              <div>{item.matchReason}</div>
                              {item.matchedInRef && (
                                <div className="text-[10px] text-cyan-400/80 mt-0.5 font-mono">
                                  Ref IN: {item.matchedInRef.tgl} ({item.matchedInRef.rak})
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* PAGINATION CONTROLS */}
              <div className="p-3 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                <div>
                  Menampilkan{' '}
                  <strong className="text-white">
                    {filteredTableItems.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}
                  </strong>{' '}
                  -{' '}
                  <strong className="text-white">
                    {Math.min(currentPage * itemsPerPage, filteredTableItems.length)}
                  </strong>{' '}
                  dari <strong className="text-white">{filteredTableItems.length}</strong> baris
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-40 disabled:hover:bg-slate-800 transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  <span className="font-semibold text-slate-200 px-2">
                    Halaman {currentPage} dari {totalPages}
                  </span>

                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-40 disabled:hover:bg-slate-800 transition-colors"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-16 text-center text-slate-500 flex flex-col items-center justify-center">
              <Package className="h-12 w-12 text-slate-600 mb-3" />
              <p className="text-sm font-semibold text-slate-400">
                Pilih SKU di atas dan klik "Mulai Analisis" untuk melihat pratinjau sinkronisasi tgl scan.
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Data akan dianalisis dan dicocokkan otomatis sebelum Anda menyetujui perubahan.
              </p>
            </div>
          )}
        </div>

        {/* FOOTER ACTIONS */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            {matchResult && (
              <span>
                Dipilih{' '}
                <strong className="text-cyan-400">
                  {matchResult.items.filter(i => selectedItemIds.has(i.id) && i.isChanged).length}
                </strong>{' '}
                baris untuk diperbarui ke database.
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={onClose}
              disabled={isExecuting}
              className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
            >
              Tutup / Batal
            </Button>

            {matchResult && matchResult.summary.totalChanged > 0 && !isConfirming && (
              <Button
                onClick={() => setIsConfirming(true)}
                disabled={
                  isExecuting ||
                  matchResult.items.filter(i => selectedItemIds.has(i.id) && i.isChanged).length === 0
                }
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 via-teal-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-extrabold text-xs shadow-lg shadow-cyan-600/30 flex items-center gap-2 transition-all active:scale-95"
              >
                <CheckCheck className="h-4 w-4" />
                <span>
                  Terapkan Perubahan (
                  {matchResult.items.filter(i => selectedItemIds.has(i.id) && i.isChanged).length} Baris)
                </span>
              </Button>
            )}

            {/* CONFIRMATION STATE */}
            {isConfirming && (
              <div className="flex items-center gap-2 bg-slate-900 border border-cyan-500/50 p-1.5 rounded-xl">
                <span className="text-xs text-cyan-300 font-semibold px-2">
                  Yakin update{' '}
                  {matchResult?.items.filter(i => selectedItemIds.has(i.id) && i.isChanged).length} data?
                </span>
                <Button
                  onClick={handleExecuteUpdates}
                  disabled={isExecuting}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow"
                >
                  {isExecuting ? `Memproses ${progress.percent}%...` : 'Ya, Update Sekarang!'}
                </Button>
                <button
                  type="button"
                  disabled={isExecuting}
                  onClick={() => setIsConfirming(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Batal
                </button>
              </div>
            )}
          </div>
        </div>

        {/* PROGRESS OVERLAY SAAT EKSEKUSI */}
        {isExecuting && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center z-50 p-6">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl text-center space-y-4">
              <div className="p-3 bg-cyan-500/20 text-cyan-400 rounded-2xl w-fit mx-auto border border-cyan-400/30 animate-pulse">
                <RefreshCw className="h-8 w-8 animate-spin" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">Menyimpan Perubahan Tgl Scan & Rak</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Sedang memperbarui tgl scan & rak transaksi OUT ke Supabase secara batch...
                </p>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-700">
                  <div
                    className="bg-gradient-to-r from-cyan-500 to-emerald-500 h-full transition-all duration-300"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                  <span>
                    {progress.current} / {progress.total} baris
                  </span>
                  <span>{progress.percent}%</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
