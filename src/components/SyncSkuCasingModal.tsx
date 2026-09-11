import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Database,
  ArrowRight,
  Sparkles,
  Layers,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Check
} from 'lucide-react';
import {
  auditSkuCasing,
  executeSkuCasingSync,
  SkuCasingAuditResult,
  SkuCasingMismatchItem,
  SyncSkuCasingProgress
} from '../services/syncSkuCasingService';

interface SyncSkuCasingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const SyncSkuCasingModal: React.FC<SyncSkuCasingModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [auditResult, setAuditResult] = useState<SkuCasingAuditResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncSkuCasingProgress | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  useEffect(() => {
    if (isOpen) {
      handleRunAudit();
    } else {
      setAuditResult(null);
      setProgress(null);
      setStatusMessage(null);
      setSearchTerm('');
      setCurrentPage(1);
    }
  }, [isOpen]);

  const handleRunAudit = async () => {
    try {
      setIsLoading(true);
      setStatusMessage(null);
      const result = await auditSkuCasing((p) => setProgress(p));
      setAuditResult(result);
      setCurrentPage(1);
      if (result.totalMismatchSkus === 0) {
        setStatusMessage({
          text: 'Semua nama SKU di Data Gudang dan Database Log sudah 100% cocok dengan Master Data SKU!',
          type: 'success'
        });
      } else {
        setStatusMessage({
          text: `Ditemukan ${result.totalMismatchSkus} SKU (${result.totalStockMismatchRows} baris stok & ${result.totalLogMismatchRows} baris log) yang berbeda huruf besar/kecil.`,
          type: 'info'
        });
      }
    } catch (err: any) {
      console.error('Audit failed:', err);
      setStatusMessage({
        text: `Gagal melakukan audit: ${err.message}`,
        type: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteSync = async () => {
    if (!auditResult || auditResult.items.length === 0) return;

    const confirmMsg = `Konfirmasi Sinkronisasi:\n\n` +
      `Sistem akan memperbarui nama produk untuk ${auditResult.totalMismatchSkus} SKU ` +
      `(${auditResult.totalStockMismatchRows} baris Data Gudang dan ${auditResult.totalLogMismatchRows} baris Database Log) ` +
      `agar sama persis dengan Master Data SKU.\n\nLanjutkan?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      setIsSyncing(true);
      const res = await executeSkuCasingSync(auditResult.items, (p) => setProgress(p));
      if (res.success) {
        setStatusMessage({
          text: `Berhasil menyelaraskan ${res.updatedStockRows} baris Data Gudang dan ${res.updatedLogRows} baris Database Log!`,
          type: 'success'
        });
        // Re-run audit to confirm 0 mismatches left
        const recheck = await auditSkuCasing();
        setAuditResult(recheck);
        onSuccess?.();
      } else {
        setStatusMessage({
          text: `Gagal saat sinkronisasi: ${res.error}`,
          type: 'error'
        });
      }
    } catch (err: any) {
      setStatusMessage({
        text: `Error sinkronisasi: ${err.message}`,
        type: 'error'
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const filteredItems = useMemo(() => {
    if (!auditResult) return [];
    if (!searchTerm.trim()) return auditResult.items;
    const term = searchTerm.toLowerCase().trim();
    return auditResult.items.filter(
      (item) =>
        item.currentName.toLowerCase().includes(term) ||
        item.targetName.toLowerCase().includes(term) ||
        item.idBarang.toLowerCase().includes(term) ||
        item.racks.some((r) => r.toLowerCase().includes(term))
    );
  }, [auditResult, searchTerm]);

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredItems.slice(start, start + itemsPerPage);
  }, [filteredItems, currentPage, itemsPerPage]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="relative px-6 py-5 bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-300 rounded-2xl border border-emerald-400/30 shadow-inner">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight text-white">
                  SINKRONISASI CASING SKU (HURUF BESAR / KECIL)
                </h2>
                <span className="px-2.5 py-0.5 text-xs font-semibold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 rounded-full">
                  DevMode Master Sync
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Menyelaraskan nama SKU di Data Gudang & Database Log agar sama persis dengan Master Data SKU.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isSyncing}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Status / Message Banner */}
        {statusMessage && (
          <div
            className={`px-6 py-3 flex items-center gap-2 text-sm border-b font-medium ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
                : statusMessage.type === 'error'
                ? 'bg-rose-50 text-rose-800 border-rose-100'
                : 'bg-blue-50 text-blue-800 border-blue-100'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            ) : statusMessage.type === 'error' ? (
              <AlertTriangle className="h-4 w-4 text-rose-600 flex-shrink-0" />
            ) : (
              <Layers className="h-4 w-4 text-blue-600 flex-shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Progress Bar */}
        {(isLoading || isSyncing) && progress && (
          <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-100 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs text-slate-600 font-medium">
              <span>{progress.message}</span>
              <span>
                {progress.current} / {progress.total}
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                style={{
                  width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`
                }}
              />
            </div>
          </div>
        )}

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-6 bg-slate-50/50 border-b border-slate-100">
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Total Master SKU
            </span>
            <span className="text-xl font-bold text-slate-800 mt-1">
              {auditResult ? auditResult.totalMaster.toLocaleString() : '...'}
            </span>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              SKU Berbeda Casing
            </span>
            <span className="text-xl font-bold text-amber-600 mt-1">
              {auditResult ? auditResult.totalMismatchSkus.toLocaleString() : '...'}
            </span>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Baris Data Gudang Terdampak
            </span>
            <span className="text-xl font-bold text-blue-600 mt-1">
              {auditResult ? auditResult.totalStockMismatchRows.toLocaleString() : '...'}
            </span>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Baris Database Log Terdampak
            </span>
            <span className="text-xl font-bold text-purple-600 mt-1">
              {auditResult ? auditResult.totalLogMismatchRows.toLocaleString() : '...'}
            </span>
          </div>
        </div>

        {/* Search & Actions Toolbar */}
        <div className="p-4 bg-white border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Cari SKU, ID Barang, atau Rak..."
              className="w-full pl-9 pr-8 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRunAudit}
              disabled={isLoading || isSyncing}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs flex items-center gap-2 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Audit Ulang</span>
            </button>

            <button
              onClick={handleExecuteSync}
              disabled={isLoading || isSyncing || !auditResult || auditResult.totalMismatchSkus === 0}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-md shadow-emerald-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ShieldCheck className="h-4 w-4" />
              <span>
                {isSyncing
                  ? 'Menyelaraskan Data...'
                  : `Sinkronkan Semua (${auditResult?.totalMismatchSkus || 0} SKU)`}
              </span>
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-50/30">
          {isLoading && !auditResult ? (
            <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-400">
              <RefreshCw className="h-8 w-8 animate-spin text-emerald-500" />
              <p className="text-sm font-medium">Memindai perbedaan huruf besar/kecil di seluruh database...</p>
            </div>
          ) : auditResult && auditResult.totalMismatchSkus === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center gap-3 text-emerald-600">
              <div className="p-4 bg-emerald-50 rounded-full border border-emerald-100">
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              </div>
              <p className="text-base font-bold text-slate-800">Database Sudah 100% Sinkron</p>
              <p className="text-xs text-slate-500 max-w-md text-center">
                Semua SKU di Data Gudang dan Database Log telah menggunakan format huruf besar/kecil yang sama persis dengan Master Data SKU.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4 w-12 text-center">No</th>
                    <th className="py-3 px-4 w-24">ID Barang</th>
                    <th className="py-3 px-4">Nama di Data Gudang (Saat Ini)</th>
                    <th className="py-3 px-4 w-8 text-center">➔</th>
                    <th className="py-3 px-4">Target Nama Master SKU (Besar/Kecil)</th>
                    <th className="py-3 px-4 text-center w-28">Baris Gudang</th>
                    <th className="py-3 px-4 text-center w-28">Baris Log</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedItems.map((item, index) => {
                    const rowNumber = (currentPage - 1) * itemsPerPage + index + 1;
                    return (
                      <tr key={item.currentName} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-4 text-center font-medium text-slate-400">
                          {rowNumber}
                        </td>
                        <td className="py-2.5 px-4 font-mono font-bold text-slate-700">
                          {item.idBarang}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-rose-700 bg-rose-50/40 rounded">
                          {item.currentName}
                        </td>
                        <td className="py-2.5 px-4 text-center text-slate-400 font-bold">
                          <ArrowRight className="h-3.5 w-3.5 inline" />
                        </td>
                        <td className="py-2.5 px-4 font-mono font-semibold text-emerald-700 bg-emerald-50/40 rounded">
                          {item.targetName}
                        </td>
                        <td className="py-2.5 px-4 text-center font-semibold text-blue-700">
                          <span className="px-2 py-0.5 bg-blue-50 border border-blue-200 rounded-md">
                            {item.stockRows} baris
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-center font-semibold text-purple-700">
                          <span className="px-2 py-0.5 bg-purple-50 border border-purple-200 rounded-md">
                            {item.logRows} log
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination Footer */}
        <div className="px-6 py-3 bg-white border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span>Tampilkan</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-700 focus:outline-none"
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={500}>500 (Semua)</option>
            </select>
            <span>
              dari <strong>{filteredItems.length}</strong> data tidak cocok
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-semibold text-slate-700">
              Halaman {currentPage} dari {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
