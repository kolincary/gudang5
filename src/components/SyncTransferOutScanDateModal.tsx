import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import {
  ArrowRightLeft,
  Search,
  RefreshCw,
  Sparkles,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Layers,
  Copy,
  Check,
  ShieldCheck,
  Package,
  X
} from 'lucide-react';
import {
  scanTransferOutDiscrepancies,
  executeBatchSyncTransferOut,
  TransferOutSyncResult,
  TransferOutSyncItem
} from '../services/syncTransferOutScanDateService';

interface SyncTransferOutScanDateModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSku?: string;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onSuccessUpdate?: () => void;
}

type TabFilter = 'ALL' | 'NEEDS_SYNC' | 'ALREADY_MATCHED';

export const SyncTransferOutScanDateModal: React.FC<SyncTransferOutScanDateModalProps> = ({
  isOpen,
  onClose,
  initialSku,
  showToast,
  onSuccessUpdate
}) => {
  const [skuFilter, setSkuFilter] = useState(initialSku || '');
  const [isLoading, setIsLoading] = useState(false);
  const [scanResult, setScanResult] = useState<TransferOutSyncResult | null>(null);

  // Table filter & search
  const [activeTab, setActiveTab] = useState<TabFilter>('NEEDS_SYNC');
  const [tableSearch, setTableSearch] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Execution state
  const [isConfirming, setIsConfirming] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, percent: 0 });
  const [copiedWA, setCopiedWA] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSkuFilter(initialSku || '');
      setTableSearch('');
      setActiveTab('NEEDS_SYNC');
      setCurrentPage(1);
      setIsConfirming(false);
      setIsExecuting(false);
      handleRunScan(initialSku || '');
    }
  }, [isOpen, initialSku]);

  const handleRunScan = useCallback(
    async (skuToFilter: string) => {
      setIsLoading(true);
      try {
        const res = await scanTransferOutDiscrepancies(skuToFilter);
        setScanResult(res);
        setCurrentPage(1);

        // Otomatis centang seluruh baris yang butuh sync
        const needsSyncIds = new Set(res.items.filter(i => i.status === 'NEEDS_SYNC').map(i => i.id));
        setSelectedIds(needsSyncIds);

        if (res.summary.totalNeedsSync > 0) {
          showToast(
            `Ditemukan ${res.summary.totalNeedsSync} baris TRANSFER OUT (${res.summary.totalQtyNeedsSync.toLocaleString()} pcs) yang tgl_scan-nya perlu disinkronkan ke rak asal!`,
            'warning'
          );
        } else {
          showToast('Seluruh data TRANSFER OUT sudah 100% klop dengan tgl barang masuk di rak asal!', 'success');
        }
      } catch (err: any) {
        console.error('Error scanning transfer out discrepancies:', err);
        showToast('Gagal memindai data TRANSFER OUT: ' + (err.message || 'Error'), 'error');
      } finally {
        setIsLoading(false);
      }
    },
    [showToast]
  );

  // Filtered items
  const filteredItems = useMemo(() => {
    if (!scanResult) return [];
    let items = scanResult.items;

    if (activeTab === 'NEEDS_SYNC') {
      items = items.filter(i => i.status === 'NEEDS_SYNC');
    } else if (activeTab === 'ALREADY_MATCHED') {
      items = items.filter(i => i.status === 'ALREADY_MATCHED');
    }

    if (tableSearch.trim()) {
      const q = tableSearch.toLowerCase();
      items = items.filter(
        i =>
          i.sku.toLowerCase().includes(q) ||
          i.rak.toLowerCase().includes(q) ||
          i.currentTglScan.toLowerCase().includes(q) ||
          i.targetTglScan.toLowerCase().includes(q) ||
          i.matchedInRak.toLowerCase().includes(q) ||
          i.jumlah.toString().includes(q)
      );
    }

    return items;
  }, [scanResult, activeTab, tableSearch]);

  // Pagination
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredItems.slice(start, start + itemsPerPage);
  }, [filteredItems, currentPage, itemsPerPage]);

  // Toggle Checkbox
  const handleToggleSelectAllVisible = () => {
    const next = new Set(selectedIds);
    const visibleNeedsSync = paginatedItems.filter(i => i.status === 'NEEDS_SYNC');
    const allSelected = visibleNeedsSync.every(i => next.has(i.id));

    if (allSelected) {
      visibleNeedsSync.forEach(i => next.delete(i.id));
    } else {
      visibleNeedsSync.forEach(i => next.add(i.id));
    }
    setSelectedIds(next);
  };

  const handleToggleRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  // Salin Rangkuman WA
  const handleCopyWA = () => {
    if (!scanResult) return;
    const s = scanResult.summary;
    const text = `🔄 *SINKRONISASI TGL SCAN TRANSFER OUT* 🔄
━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 *Target Filter:* ${s.filteredSku || 'Semua SKU'}
📊 *Total TRANSFER OUT Diperiksa:* ${s.totalScanned.toLocaleString()} baris
⚠️ *Perlu Diselaraskan:* ${s.totalNeedsSync.toLocaleString()} baris (${s.totalQtyNeedsSync.toLocaleString()} pcs)
✅ *Sudah Klop:* ${s.totalAlreadyMatched.toLocaleString()} baris
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Log TRANSFER OUT akan diselaraskan ke tanggal scan barang masuk asli di rak asal. TRANSFER IN (ke rak TEMP) tetap real-time.`;

    navigator.clipboard.writeText(text);
    setCopiedWA(true);
    showToast('Rangkuman analisis disalin ke clipboard!', 'success');
    setTimeout(() => setCopiedWA(false), 2500);
  };

  // Eksekusi Batch Update
  const handleExecuteSync = async () => {
    if (!scanResult) return;
    const targetItems = scanResult.items.filter(i => selectedIds.has(i.id) && i.status === 'NEEDS_SYNC');

    if (targetItems.length === 0) {
      showToast('Tidak ada baris yang dipilih untuk disinkronkan.', 'warning');
      setIsConfirming(false);
      return;
    }

    setIsExecuting(true);
    setProgress({ current: 0, total: targetItems.length, percent: 0 });

    try {
      const res = await executeBatchSyncTransferOut(targetItems, (cur, tot, pct) => {
        setProgress({ current: cur, total: tot, percent: pct });
      });

      if (res.errorCount === 0) {
        showToast(
          `Sukses memperbarui ${res.successCount} log TRANSFER OUT! Tgl scan kini telah klop dengan rak asal.`,
          'success'
        );
        setIsConfirming(false);
        if (onSuccessUpdate) onSuccessUpdate();
        // Refresh analisis
        handleRunScan(skuFilter);
      } else {
        showToast(
          `Selesai sebagian: ${res.successCount} berhasil, ${res.errorCount} gagal.`,
          'warning'
        );
      }
    } catch (err: any) {
      console.error('Error applying batch sync:', err);
      showToast('Terjadi kesalahan: ' + (err.message || 'Error'), 'error');
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
        {/* HEADER */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-gradient-to-r from-slate-950 via-slate-900 to-purple-950/40 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-400/30 shadow-inner">
              <Calendar className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-white tracking-wide">
                  Sinkronisasi Tgl Scan TRANSFER OUT
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-400/30 rounded-md">
                  OPSI 3 - DEV TOOLS
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Menyelaraskan tgl scan log TRANSFER OUT agar klop dengan tgl barang masuk di rak asal (TRANSFER IN ke rak TEMP tetap real-time)
              </p>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-1.5 focus-within:border-purple-400 transition-all">
              <Search className="h-4 w-4 text-slate-400 mr-2" />
              <input
                type="text"
                placeholder="Semua SKU atau filter SKU..."
                value={skuFilter}
                onChange={e => setSkuFilter(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleRunScan(skuFilter);
                }}
                className="bg-transparent border-none text-white text-xs sm:text-sm font-semibold outline-none w-44 sm:w-56"
              />
              {skuFilter && (
                <button onClick={() => setSkuFilter('')} className="text-slate-400 hover:text-white">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <Button
              onClick={() => handleRunScan(skuFilter)}
              disabled={isLoading}
              className="h-10 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-purple-600/20 flex items-center gap-2 transition-all active:scale-95"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'Memindai...' : 'Scan & Diagnosa'}</span>
            </Button>
          </div>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* BANNER ATURAN */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-gradient-to-r from-purple-950/40 via-slate-900 to-indigo-950/30 border border-purple-800/40 flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-slate-300 leading-relaxed space-y-1">
              <p className="font-bold text-white text-xs sm:text-sm">
                Logika Sinkronisasi Data TRANSFER yang Sudah Terlanjur:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-slate-300">
                <p>
                  • <strong>TRANSFER OUT (Rak Asal)</strong>: Tgl scan diselaraskan ke tanggal barang masuk di rak asal tersebut, sehingga di rak asal saldo tanggal aslinya langsung <strong>KLOP PAS (0 pcs)</strong>.
                </p>
                <p>
                  • <strong>TRANSFER IN (Rak TEMP Tujuan)</strong>: <strong>TETAP REAL-TIME / TGL HARI INI</strong>, tidak disentuh atau diubah sama sekali.
                </p>
                <p>
                  • <strong>Aman Tanpa Selisih</strong>: Menghilangkan defisit palsu di tanggal hari ini sekaligus membersihkan surplus gantung di tanggal lama.
                </p>
                <p>
                  • <strong>Mode Preview Aman</strong>: Database Supabase tidak akan berubah sebelum Anda menekan tombol "Terapkan Sinkronisasi".
                </p>
              </div>
            </div>
          </div>

          {/* SUMMARY CARDS */}
          {scanResult && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80">
                <div className="text-[11px] font-semibold text-slate-400">Total TRANSFER OUT Dicek</div>
                <div className="text-lg sm:text-xl font-black text-white mt-0.5">
                  {scanResult.summary.totalScanned.toLocaleString()}{' '}
                  <span className="text-xs font-normal text-slate-400">baris</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {scanResult.summary.filteredSku ? `SKU: ${scanResult.summary.filteredSku}` : 'Semua SKU'}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-700/60">
                <div className="text-[11px] font-semibold text-amber-300">Perlu Diselaraskan</div>
                <div className="text-lg sm:text-xl font-black text-amber-400 mt-0.5">
                  {scanResult.summary.totalNeedsSync.toLocaleString()}{' '}
                  <span className="text-xs font-normal text-slate-400">baris</span>
                </div>
                <div className="text-[10px] text-amber-300/70 mt-0.5">
                  Total {scanResult.summary.totalQtyNeedsSync.toLocaleString()} pcs
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-700/60">
                <div className="text-[11px] font-semibold text-emerald-300">Sudah Klop / Akurat</div>
                <div className="text-lg sm:text-xl font-black text-emerald-400 mt-0.5">
                  {scanResult.summary.totalAlreadyMatched.toLocaleString()}{' '}
                  <span className="text-xs font-normal text-slate-400">baris</span>
                </div>
                <div className="text-[10px] text-emerald-300/70 mt-0.5">
                  Tgl scan sudah sesuai rak asal
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80">
                <div className="text-[11px] font-semibold text-slate-400">Tidak Ditemukan IN</div>
                <div className="text-lg sm:text-xl font-black text-slate-300 mt-0.5">
                  {scanResult.summary.totalNoInFound.toLocaleString()}{' '}
                  <span className="text-xs font-normal text-slate-400">baris</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Tidak ada riwayat IN di database
                </div>
              </div>
            </div>
          )}

          {/* TABLE CONTROLS */}
          {scanResult && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              {/* Tab Filters */}
              <div className="flex items-center gap-1.5 p-1 bg-slate-950/80 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('NEEDS_SYNC');
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    activeTab === 'NEEDS_SYNC'
                      ? 'bg-amber-600 text-white shadow'
                      : 'text-amber-400 hover:text-amber-300'
                  }`}
                >
                  <span>Perlu Diselaraskan</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-900/80 text-amber-200">
                    {scanResult.summary.totalNeedsSync}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('ALREADY_MATCHED');
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeTab === 'ALREADY_MATCHED'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-emerald-400 hover:text-emerald-300'
                  }`}
                >
                  Sudah Klop ({scanResult.summary.totalAlreadyMatched})
                </button>
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
                  Semua ({scanResult.items.length})
                </button>
              </div>

              {/* Search, Page Size, Copy WA */}
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-xl px-2.5 py-1.5 focus-within:border-purple-500 transition-all">
                  <Search className="h-3.5 w-3.5 text-slate-500 mr-2" />
                  <input
                    type="text"
                    placeholder="Cari SKU, rak..."
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
                  onClick={handleCopyWA}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition-colors"
                  title="Salin ke WhatsApp"
                >
                  {copiedWA ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedWA ? 'Disalin' : 'Salin WA'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TABLE PREVIEW */}
          {scanResult ? (
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60 shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-800 select-none">
                    <tr>
                      <th className="py-2.5 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={
                            paginatedItems.filter(i => i.status === 'NEEDS_SYNC').length > 0 &&
                            paginatedItems.filter(i => i.status === 'NEEDS_SYNC').every(i => selectedIds.has(i.id))
                          }
                          onChange={handleToggleSelectAllVisible}
                          className="rounded border-slate-700 text-purple-500 focus:ring-0 cursor-pointer"
                        />
                      </th>
                      <th className="py-2.5 px-3">SKU Barang</th>
                      <th className="py-2.5 px-3">Rak Asal</th>
                      <th className="py-2.5 px-3 text-right">Jumlah (Qty)</th>
                      <th className="py-2.5 px-3">Tgl Scan Saat Ini</th>
                      <th className="py-2.5 px-3">Tgl Scan Target (Rak Asal)</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Keterangan & Rak Masuk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 font-medium">
                    {paginatedItems.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-500">
                          Tidak ada data yang sesuai dengan filter.
                        </td>
                      </tr>
                    ) : (
                      paginatedItems.map((item, idx) => {
                        const isSelected = selectedIds.has(item.id);
                        return (
                          <tr
                            key={item.id}
                            className={`transition-colors ${
                              item.status === 'NEEDS_SYNC'
                                ? 'bg-amber-950/15 hover:bg-amber-950/30'
                                : 'hover:bg-slate-850'
                            }`}
                          >
                            {/* Checkbox */}
                            <td className="py-2.5 px-3 text-center">
                              {item.status === 'NEEDS_SYNC' ? (
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleRow(item.id)}
                                  className="rounded border-slate-700 text-purple-500 focus:ring-0 cursor-pointer"
                                />
                              ) : (
                                <span className="text-slate-600 text-[10px]">
                                  {(currentPage - 1) * itemsPerPage + idx + 1}
                                </span>
                              )}
                            </td>

                            {/* SKU */}
                            <td className="py-2.5 px-3 font-bold text-white">
                              {item.sku}
                            </td>

                            {/* Rak Asal */}
                            <td className="py-2.5 px-3 font-semibold text-slate-200">
                              <div>{item.rak || '-'}</div>
                              {item.sub_rak && (
                                <div className="text-[10px] text-slate-400 font-mono">Sub: {item.sub_rak}</div>
                              )}
                            </td>

                            {/* Qty */}
                            <td className="py-2.5 px-3 text-right font-black text-rose-300 text-sm">
                              {item.jumlah.toLocaleString()}
                            </td>

                            {/* Tgl Scan Saat Ini (Lama) */}
                            <td className="py-2.5 px-3 font-mono">
                              {item.currentTglScan ? (
                                <span
                                  className={
                                    item.status === 'NEEDS_SYNC'
                                      ? 'line-through text-rose-400 bg-rose-950/40 px-1.5 py-0.5 rounded'
                                      : 'text-slate-300'
                                  }
                                >
                                  {item.currentTglScan}
                                </span>
                              ) : (
                                <span className="text-slate-500 italic">(kosong)</span>
                              )}
                            </td>

                            {/* Tgl Scan Target */}
                            <td className="py-2.5 px-3 font-mono">
                              <span
                                className={`px-1.5 py-0.5 rounded font-bold ${
                                  item.status === 'NEEDS_SYNC'
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                                    : 'text-slate-300'
                                }`}
                              >
                                {item.targetTglScan}
                              </span>
                            </td>

                            {/* Status */}
                            <td className="py-2.5 px-3">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${item.badgeBg} ${item.badgeText} ${item.badgeBorder}`}
                              >
                                {item.statusLabel}
                              </span>
                            </td>

                            {/* Reason */}
                            <td className="py-2.5 px-3 text-slate-300 text-[11px] leading-snug">
                              <div>{item.reason}</div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* PAGINATION */}
              <div className="p-3 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                <div>
                  Menampilkan{' '}
                  <strong className="text-white">
                    {filteredItems.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}
                  </strong>{' '}
                  -{' '}
                  <strong className="text-white">
                    {Math.min(currentPage * itemsPerPage, filteredItems.length)}
                  </strong>{' '}
                  dari <strong className="text-white">{filteredItems.length}</strong> baris
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
                Klik "Scan & Diagnosa" untuk memindai log TRANSFER OUT yang salah tanggal scan.
              </p>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            {scanResult && (
              <span>
                Dipilih{' '}
                <strong className="text-amber-400">
                  {scanResult.items.filter(i => selectedIds.has(i.id) && i.status === 'NEEDS_SYNC').length}
                </strong>{' '}
                baris untuk diselaraskan ke database.
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

            {scanResult && scanResult.summary.totalNeedsSync > 0 && !isConfirming && (
              <Button
                onClick={() => setIsConfirming(true)}
                disabled={
                  isExecuting ||
                  scanResult.items.filter(i => selectedIds.has(i.id) && i.status === 'NEEDS_SYNC').length === 0
                }
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold text-xs shadow-lg shadow-purple-600/30 flex items-center gap-2 transition-all active:scale-95"
              >
                <ArrowRightLeft className="h-4 w-4" />
                <span>
                  Terapkan Sinkronisasi (
                  {scanResult.items.filter(i => selectedIds.has(i.id) && i.status === 'NEEDS_SYNC').length} Baris)
                </span>
              </Button>
            )}

            {/* CONFIRMATION */}
            {isConfirming && (
              <div className="flex items-center gap-2 bg-slate-900 border border-purple-500/50 p-1.5 rounded-xl">
                <span className="text-xs text-purple-300 font-semibold px-2">
                  Yakin sinkronkan{' '}
                  {scanResult?.items.filter(i => selectedIds.has(i.id) && i.status === 'NEEDS_SYNC').length} data?
                </span>
                <Button
                  onClick={handleExecuteSync}
                  disabled={isExecuting}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow"
                >
                  {isExecuting ? `Memproses ${progress.percent}%...` : 'Ya, Sinkronkan Sekarang!'}
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

        {/* PROGRESS OVERLAY */}
        {isExecuting && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center z-50 p-6">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl text-center space-y-4">
              <div className="p-3 bg-purple-500/20 text-purple-400 rounded-2xl w-fit mx-auto border border-purple-400/30 animate-pulse">
                <RefreshCw className="h-8 w-8 animate-spin" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">Menyelaraskan Tgl Scan TRANSFER OUT</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Sedang memperbarui baris data log ke Supabase secara batch...
                </p>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-700">
                  <div
                    className="bg-gradient-to-r from-purple-500 to-indigo-500 h-full transition-all duration-300"
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
