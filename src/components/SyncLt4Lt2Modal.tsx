import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Layers,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  CheckSquare,
  Square,
  Building2
} from 'lucide-react';
import {
  Lt4Lt2TransferItem,
  Lt4Lt2ScanResult,
  scanLt4Lt2Transfers,
  syncSingleLt4Lt2Transfer,
  syncBatchLt4Lt2Transfers
} from '../services/syncLt4Lt2TransferService';

interface SyncLt4Lt2ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  currentUser?: string;
}

export const SyncLt4Lt2Modal: React.FC<SyncLt4Lt2ModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  currentUser
}) => {
  const [loading, setLoading] = useState(false);
  const [scanResult, setScanResult] = useState<Lt4Lt2ScanResult | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'mismatch' | 'matched'>('mismatch');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    mode: 'single' | 'selected' | 'all';
    item?: Lt4Lt2TransferItem;
    count?: number;
  }>({ isOpen: false, mode: 'all' });

  const [executing, setExecuting] = useState(false);

  // Initial scan on modal open
  useEffect(() => {
    if (isOpen) {
      handleScan();
    } else {
      setScanResult(null);
      setSelectedIds(new Set());
      setSearchQuery('');
      setCurrentPage(1);
    }
  }, [isOpen]);

  const handleScan = async () => {
    setLoading(true);
    try {
      const res = await scanLt4Lt2Transfers(searchQuery);
      setScanResult(res);
      // Auto-select all mismatch items
      const newSelected = new Set<string>();
      res.items.filter(i => i.isMismatch).forEach(i => newSelected.add(i.id));
      setSelectedIds(newSelected);
      setCurrentPage(1);
    } catch (err) {
      console.error('Scan error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter items by tab and search
  const filteredItems = useMemo(() => {
    if (!scanResult) return [];
    let list = scanResult.items;

    if (activeTab === 'mismatch') {
      list = list.filter(i => i.isMismatch);
    } else {
      list = list.filter(i => !i.isMismatch);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(i =>
        i.sku.toLowerCase().includes(q) ||
        i.rak.toLowerCase().includes(q) ||
        i.currentScanDate.includes(q) ||
        i.targetScanDate.includes(q)
      );
    }

    return list;
  }, [scanResult, activeTab, searchQuery]);

  // Client-side pagination
  const totalPages = Math.ceil(filteredItems.length / pageSize) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  // Selection handlers
  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleSelectAllCurrentPage = () => {
    const next = new Set(selectedIds);
    const allPageSelected = paginatedItems.every(i => next.has(i.id));
    if (allPageSelected) {
      paginatedItems.forEach(i => next.delete(i.id));
    } else {
      paginatedItems.forEach(i => next.add(i.id));
    }
    setSelectedIds(next);
  };

  // Execution Handlers
  const handleExecuteSingle = async (item: Lt4Lt2TransferItem) => {
    setExecuting(true);
    try {
      const res = await syncSingleLt4Lt2Transfer(item, currentUser);
      if (res.success) {
        onSuccess(`✓ Berhasil menyelaraskan tgl_scan [${item.sku}] menjadi ${item.targetScanDate}`);
        await handleScan();
      } else {
        alert(`Gagal: ${res.error}`);
      }
    } finally {
      setExecuting(false);
      setConfirmDialog({ isOpen: false, mode: 'single' });
    }
  };

  const handleExecuteBatch = async (itemsToSync: Lt4Lt2TransferItem[]) => {
    if (itemsToSync.length === 0) return;
    setExecuting(true);
    try {
      const res = await syncBatchLt4Lt2Transfers(itemsToSync, currentUser);
      if (res.successCount > 0) {
        onSuccess(`✓ Berhasil menyelaraskan ${res.successCount} baris mutasi LANTAI 4 ➔ LANTAI 2!`);
      }
      if (res.failCount > 0) {
        alert(`Ada ${res.failCount} baris gagal diperbarui.`);
      }
      await handleScan();
    } finally {
      setExecuting(false);
      setConfirmDialog({ isOpen: false, mode: 'all' });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-indigo-950/80 via-slate-900 to-purple-950/80 border-b border-indigo-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/20 border border-indigo-500/40 rounded-xl text-indigo-400">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white tracking-wide">
                  Penyelarasan Mutasi Transfer LANTAI 4 ➔ LANTAI 2
                </h2>
                <span className="px-2.5 py-0.5 text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full">
                  DevMode Khusus
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Menyelaraskan tanggal scan dummy 2025 ke tanggal nota masuk resmi tanpa menghapus data Accurate
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats Summary Cards */}
        <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-900/50 border-b border-slate-800">
          <div className="p-3 bg-slate-800/40 border border-slate-700/50 rounded-xl">
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>Total Log Transfer</span>
            </div>
            <div className="text-lg font-bold text-white">
              {scanResult?.totalScanned || 0} <span className="text-xs font-normal text-slate-400">baris</span>
            </div>
          </div>

          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
            <div className="flex items-center gap-2 text-xs text-amber-400 mb-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Perlu Diselaraskan</span>
            </div>
            <div className="text-lg font-bold text-amber-300">
              {scanResult?.mismatchCount || 0} <span className="text-xs font-normal text-amber-400/70">baris (2025)</span>
            </div>
          </div>

          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
            <div className="flex items-center gap-2 text-xs text-emerald-400 mb-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Sudah Selaras</span>
            </div>
            <div className="text-lg font-bold text-emerald-300">
              {scanResult?.matchedCount || 0} <span className="text-xs font-normal text-emerald-400/70">baris</span>
            </div>
          </div>

          <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl">
            <div className="flex items-center gap-2 text-xs text-purple-400 mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Total Qty Mutasi</span>
            </div>
            <div className="text-lg font-bold text-purple-300">
              {scanResult?.totalQtyTransferred.toLocaleString('id-ID') || 0} <span className="text-xs font-normal text-purple-400/70">pcs</span>
            </div>
          </div>
        </div>

        {/* Toolbar & Filters */}
        <div className="p-4 bg-slate-900/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
            <button
              onClick={() => { setActiveTab('mismatch'); setCurrentPage(1); }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                activeTab === 'mismatch'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>Perlu Diselaraskan ({scanResult?.mismatchCount || 0})</span>
            </button>
            <button
              onClick={() => { setActiveTab('matched'); setCurrentPage(1); }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                activeTab === 'matched'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Sudah Selaras ({scanResult?.matchedCount || 0})</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="flex items-center gap-2 flex-1 max-w-sm">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                placeholder="Cari SKU atau Tanggal..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-800/60 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <button
              onClick={handleScan}
              disabled={loading}
              className="p-2 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/30 rounded-xl transition-colors disabled:opacity-50"
              title="Refresh / Pindai Ulang"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Table Area */}
        <div className="flex-1 overflow-auto bg-slate-950/40 relative">
          {loading ? (
            <div className="p-12 flex flex-col items-center justify-center text-slate-400 gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
              <p className="text-sm font-medium">Memindai data mutasi transfer LANTAI 4 ➔ LANTAI 2...</p>
            </div>
          ) : paginatedItems.length === 0 ? (
            <div className="p-12 flex flex-col items-center justify-center text-slate-500 gap-2">
              <ShieldCheck className="w-10 h-10 text-slate-600" />
              <p className="text-sm">Tidak ada data ditemukan pada filter ini.</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-900/90 text-slate-400 font-semibold border-b border-slate-800 sticky top-0 z-10 backdrop-blur-sm">
                <tr>
                  <th className="p-3 w-10 text-center">
                    <button
                      onClick={handleSelectAllCurrentPage}
                      className="text-slate-400 hover:text-white"
                      title="Pilih Semua Halaman Ini"
                    >
                      {paginatedItems.every(i => selectedIds.has(i.id)) ? (
                        <CheckSquare className="w-4 h-4 text-indigo-400" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="p-3">SKU & JML</th>
                  <th className="p-3">TIPE & RAK</th>
                  <th className="p-3">🛑 TGL SCAN SEKARANG</th>
                  <th className="p-3">➡️ TGL NOTA SEHARUSNYA</th>
                  <th className="p-3">SUMBER NOTA</th>
                  <th className="p-3 text-right">AKSI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {paginatedItems.map(item => {
                  const isSelected = selectedIds.has(item.id);
                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        item.isMismatch ? 'bg-amber-950/10' : ''
                      } ${isSelected ? 'bg-indigo-950/30' : ''}`}
                    >
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleToggleSelect(item.id)}
                          className="text-slate-400 hover:text-white"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-indigo-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-600" />
                          )}
                        </button>
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-white">{item.sku}</div>
                        <div className="text-[11px] text-slate-400">
                          Qty: <span className="font-semibold text-slate-200">{item.jumlah} pcs</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              item.type === 'OUT'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            }`}
                          >
                            {item.type}
                          </span>
                          <span className="font-medium text-slate-300">{item.rak}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className={`font-mono text-xs ${item.isMismatch ? 'text-rose-400 font-bold' : 'text-slate-400'}`}>
                          {item.currentScanDate}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />
                          <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                            {item.targetScanDate}
                          </span>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="text-[11px] text-slate-400 max-w-[220px] truncate" title={item.matchReason}>
                          {item.matchReason}
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        {item.isMismatch ? (
                          <button
                            onClick={() => setConfirmDialog({ isOpen: true, mode: 'single', item })}
                            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-semibold transition-all shadow-sm shadow-indigo-600/30"
                          >
                            Selaraskan 1 Baris
                          </button>
                        ) : (
                          <span className="text-[11px] text-emerald-400 font-semibold flex items-center justify-end gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Cocok
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination & Footer Action Bar */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          {/* Pagination Controls */}
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>Halaman {currentPage} dari {totalPages} ({filteredItems.length} data)</span>
            <div className="flex items-center gap-1 ml-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg disabled:opacity-40 disabled:hover:bg-slate-800"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg disabled:opacity-40 disabled:hover:bg-slate-800"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors"
            >
              Tutup
            </button>

            {scanResult && scanResult.mismatchCount > 0 && (
              <>
                <button
                  onClick={() => {
                    const selectedItems = scanResult.items.filter(i => selectedIds.has(i.id) && i.isMismatch);
                    if (selectedItems.length === 0) {
                      alert('Pilih setidaknya 1 baris yang perlu diselaraskan.');
                      return;
                    }
                    setConfirmDialog({
                      isOpen: true,
                      mode: 'selected',
                      count: selectedItems.length
                    });
                  }}
                  disabled={selectedIds.size === 0 || executing}
                  className="px-4 py-2 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 rounded-xl text-xs font-semibold transition-colors disabled:opacity-40"
                >
                  Selaraskan Terpilih ({selectedIds.size})
                </button>

                <button
                  onClick={() => {
                    const allMismatches = scanResult.items.filter(i => i.isMismatch);
                    setConfirmDialog({
                      isOpen: true,
                      mode: 'all',
                      count: allMismatches.length
                    });
                  }}
                  disabled={executing}
                  className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/30"
                >
                  ⚡ Selaraskan SEMUA ({scanResult.mismatchCount} Baris)
                </button>
              </>
            )}
          </div>
        </div>

      </div>

      {/* Confirmation Dialog with High z-index (z-[120]) */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-150 relative">
            <div className="flex items-center gap-3 text-indigo-400 mb-3">
              <div className="p-2.5 bg-indigo-500/20 border border-indigo-500/30 rounded-xl">
                <Sparkles className="w-5 h-5 text-indigo-400" />
              </div>
              <h3 className="text-base font-bold text-white">
                Konfirmasi Penyelarasan Mutasi
              </h3>
            </div>

            <div className="text-xs text-slate-300 space-y-2 mb-5">
              {confirmDialog.mode === 'single' && confirmDialog.item ? (
                <p>
                  Apakah Anda yakin ingin menyelaraskan tanggal scan untuk SKU{' '}
                  <strong className="text-white">{confirmDialog.item.sku}</strong> ({confirmDialog.item.jumlah} pcs) dari{' '}
                  <span className="text-rose-400 line-through font-mono">{confirmDialog.item.currentScanDate}</span> menjadi{' '}
                  <span className="text-emerald-400 font-bold font-mono">{confirmDialog.item.targetScanDate}</span>?
                </p>
              ) : (
                <p>
                  Apakah Anda yakin ingin menyelaraskan tanggal scan sebanyak{' '}
                  <strong className="text-indigo-400 font-bold text-sm">
                    {confirmDialog.count} baris
                  </strong>{' '}
                  mutasi transfer LANTAI 4 ➔ LANTAI 2?
                </p>
              )}

              <div className="p-2.5 bg-indigo-950/40 border border-indigo-500/20 rounded-lg text-[11px] text-indigo-300">
                💡 <strong>Catatan:</strong> Seluruh data log transfer dan jumlah pcs di Accurate tetap utuh dan aman 100%. Hanya kolom <code className="font-mono">tgl_scan</code> yang diselaraskan agar saldo per tanggal menjadi klop 0.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmDialog({ isOpen: false, mode: 'all' })}
                disabled={executing}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-colors"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  if (confirmDialog.mode === 'single' && confirmDialog.item) {
                    handleExecuteSingle(confirmDialog.item);
                  } else if (confirmDialog.mode === 'selected' && scanResult) {
                    const selected = scanResult.items.filter(i => selectedIds.has(i.id) && i.isMismatch);
                    handleExecuteBatch(selected);
                  } else if (confirmDialog.mode === 'all' && scanResult) {
                    const allMismatches = scanResult.items.filter(i => i.isMismatch);
                    handleExecuteBatch(allMismatches);
                  }
                }}
                disabled={executing}
                className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/30 flex items-center gap-2"
              >
                {executing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Memproses...
                  </>
                ) : (
                  'Ya, Selaraskan Sekarang'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
