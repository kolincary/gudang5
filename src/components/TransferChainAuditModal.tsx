import React, { useState, useMemo, useEffect } from 'react';
import { 
  X, 
  Search, 
  RefreshCw, 
  Link, 
  ArrowRight, 
  CheckSquare, 
  Square, 
  Wrench, 
  AlertTriangle, 
  ArrowRightLeft, 
  Package, 
  CheckCircle2,
  Calendar,
  Clock,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';
import { BrokenChainLink, ChainAuditSummary } from '../services/transferChainService';

interface TransferChainAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: ChainAuditSummary | null;
  isScanning: boolean;
  isFixing: boolean;
  onRescan: (sku?: string) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAllVisible: (ids: string[]) => void;
  onClearSelection: () => void;
  onFixSelected: (items?: BrokenChainLink[]) => void;
  onFixAll: () => void;
  skuInput: string;
  setSkuInput: (sku: string) => void;
  skuOptions: string[];
  filterTab: 'ALL' | 'TRANSFERS' | 'NON_TRANSFER_OUTS';
  setFilterTab: (tab: 'ALL' | 'TRANSFERS' | 'NON_TRANSFER_OUTS') => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
}

export const TransferChainAuditModal: React.FC<TransferChainAuditModalProps> = ({
  isOpen,
  onClose,
  summary,
  isScanning,
  isFixing,
  onRescan,
  selectedIds,
  onToggleSelect,
  onSelectAllVisible,
  onClearSelection,
  onFixSelected,
  onFixAll,
  skuInput,
  setSkuInput,
  skuOptions,
  filterTab,
  setFilterTab,
  searchTerm,
  setSearchTerm
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const allBroken = useMemo(() => {
    if (!summary) return [];
    return [...summary.brokenTransfers, ...summary.brokenNonTransferOuts];
  }, [summary]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterTab, summary]);

  const filteredList = useMemo(() => {
    return allBroken.filter(item => {
      if (filterTab === 'TRANSFERS' && item.gudang !== 'TRANSFER') return false;
      if (filterTab === 'NON_TRANSFER_OUTS' && item.gudang === 'TRANSFER') return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchSku = (item.sku || '').toLowerCase().includes(q);
        const matchCurRak = (item.currentRak || '').toLowerCase().includes(q);
        const matchCorRak = (item.correctRak || '').toLowerCase().includes(q);
        const matchDesc = (item.issueDescription || '').toLowerCase().includes(q);
        const matchTgl = (item.tgl || '').includes(q) || (item.tgl_scan || '').includes(q);
        return matchSku || matchCurRak || matchCorRak || matchDesc || matchTgl;
      }
      return true;
    });
  }, [allBroken, filterTab, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredList.length / pageSize));

  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredList.slice(start, start + pageSize);
  }, [filteredList, currentPage, pageSize]);

  const currentPageIds = useMemo(() => paginatedList.map(i => i.id), [paginatedList]);
  const allFilteredIds = useMemo(() => filteredList.map(i => i.id), [filteredList]);

  const isPageAllSelected =
    currentPageIds.length > 0 && currentPageIds.every(id => selectedIds.has(id));

  const totalTransfers = summary?.brokenTransfers.length || 0;
  const totalOuts = summary?.brokenNonTransferOuts.length || 0;
  const totalBroken = allBroken.length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 w-full max-w-6xl h-[92vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden relative">
        
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-violet-900 via-purple-900 to-indigo-950 text-white flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-violet-500/20 border border-violet-400/30 rounded-2xl backdrop-blur-md">
              <Link className="h-6 w-6 text-violet-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tight">Audit & Perbaikan Rantai Transfer (Transfer Chain)</h2>
                <span className="px-2.5 py-0.5 text-[10px] font-extrabold uppercase bg-violet-400/20 text-violet-200 rounded-full border border-violet-400/30">
                  DevMode
                </span>
              </div>
              <p className="text-xs text-violet-200/80 mt-0.5">
                Mendeteksi transfer OUT yang asal raknya tidak masuk akal & menyelaraskan pemotongan barang keluar dengan rak tujuan akhir.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-violet-200 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Filter & Action Toolbar */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/70 flex flex-col gap-3 flex-shrink-0">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            {/* SKU Input */}
            <div className="flex items-center gap-2 flex-1 min-w-[260px] max-w-md">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Ketik SKU spesifik (kosongkan untuk SEMUA)..."
                  value={skuInput}
                  onChange={(e) => setSkuInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onRescan(skuInput);
                  }}
                  className="w-full pl-9 pr-8 py-2 text-xs bg-white border border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono"
                />
                <Package className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                {skuInput && (
                  <button
                    onClick={() => {
                      setSkuInput('');
                      onRescan('');
                    }}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <button
                onClick={() => onRescan(skuInput)}
                disabled={isScanning || isFixing}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                <span>{isScanning ? 'Memindai...' : 'Scan Rantai'}</span>
              </button>
            </div>

            {/* Search Filter */}
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <input
                type="text"
                placeholder="Cari hasil (SKU, Rak, Diagnosa)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500 font-medium"
              />
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => onFixSelected()}
                disabled={selectedIds.size === 0 || isFixing}
                className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-black transition-all shadow-md active:scale-95 flex items-center gap-1.5 disabled:opacity-40 cursor-pointer whitespace-nowrap"
              >
                <Wrench className={`h-3.5 w-3.5 ${isFixing ? 'animate-spin' : ''}`} />
                <span>Perbaiki Terpilih ({selectedIds.size})</span>
              </button>

              <button
                onClick={onFixAll}
                disabled={totalBroken === 0 || isFixing}
                className="px-4 py-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-xl text-xs font-black transition-all shadow-md active:scale-95 flex items-center gap-1.5 disabled:opacity-40 cursor-pointer whitespace-nowrap"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Perbaiki SEMUA ({totalBroken})</span>
              </button>
            </div>
          </div>

          {/* Metric Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
            <div className="bg-white border border-slate-200 p-2.5 rounded-2xl shadow-sm">
              <span className="text-[10px] font-extrabold uppercase text-slate-400">Total Anomali</span>
              <div className="text-lg font-black text-slate-800 mt-0.5">
                {totalBroken} <span className="text-xs font-normal text-slate-500">baris</span>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-2xl shadow-sm">
              <span className="text-[10px] font-extrabold uppercase text-amber-700">Transfer OUT Ngaco</span>
              <div className="text-lg font-black text-amber-800 mt-0.5">
                {totalTransfers} <span className="text-xs font-normal text-amber-600">baris</span>
              </div>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 p-2.5 rounded-2xl shadow-sm">
              <span className="text-[10px] font-extrabold uppercase text-indigo-700">Potong Tertinggal</span>
              <div className="text-lg font-black text-indigo-800 mt-0.5">
                {totalOuts} <span className="text-xs font-normal text-indigo-600">baris</span>
              </div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-2xl shadow-sm">
              <span className="text-[10px] font-extrabold uppercase text-emerald-700">Dipilih</span>
              <div className="text-lg font-black text-emerald-800 mt-0.5">
                {selectedIds.size} <span className="text-xs font-normal text-emerald-600">baris</span>
              </div>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-2 border-b border-slate-200 pb-1">
            <button
              onClick={() => setFilterTab('ALL')}
              className={`px-3 py-1.5 text-xs font-extrabold rounded-lg transition-all cursor-pointer ${
                filterTab === 'ALL'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Semua Anomali ({totalBroken})
            </button>
            <button
              onClick={() => setFilterTab('TRANSFERS')}
              className={`px-3 py-1.5 text-xs font-extrabold rounded-lg transition-all cursor-pointer ${
                filterTab === 'TRANSFERS'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Transfer OUT Ngaco ({totalTransfers})
            </button>
            <button
              onClick={() => setFilterTab('NON_TRANSFER_OUTS')}
              className={`px-3 py-1.5 text-xs font-extrabold rounded-lg transition-all cursor-pointer ${
                filterTab === 'NON_TRANSFER_OUTS'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Potong Keluar Tertinggal ({totalOuts})
            </button>
          </div>
        </div>

        {/* Selection Shortcuts Bar */}
        <div className="px-5 py-2 bg-slate-100/70 border-b border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-600 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onSelectAllVisible(currentPageIds)}
              className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg text-[11px] font-bold text-slate-700 cursor-pointer shadow-2xs"
            >
              {isPageAllSelected ? 'Batal Pilih Halaman Ini' : 'Pilih Semua di Halaman Ini'}
            </button>
            <button
              onClick={() => onSelectAllVisible(allFilteredIds)}
              className="px-2.5 py-1 bg-violet-50 hover:bg-violet-100 border border-violet-300 rounded-lg text-[11px] font-bold text-violet-800 cursor-pointer shadow-2xs"
            >
              Pilih SEMUA Hasil Filter ({filteredList.length})
            </button>
            {selectedIds.size > 0 && (
              <button
                onClick={onClearSelection}
                className="px-2.5 py-1 text-slate-600 hover:text-slate-800 font-bold text-[11px] cursor-pointer"
              >
                Kosongkan Pilihan
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">Tampilkan per halaman:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-2 py-0.5 border border-slate-300 rounded-md text-[11px] bg-white font-bold text-slate-700"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>
        </div>

        {/* Anomaly Table (Paginated) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {filteredList.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center">
              <div className="p-4 bg-emerald-50 rounded-full border border-emerald-200 mb-3">
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              </div>
              <h3 className="text-sm font-black text-slate-700">
                {isScanning ? 'Sedang memindai data alur transfer...' : 'Rantai Transfer Sempurna & Masuk Akal!'}
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                {isScanning 
                  ? 'Menganalisis riwayat alur perpindahan rak dan kesesuaian potong stok...' 
                  : 'Tidak ditemukan transfer keluar (OUT) dari rak yang belum memiliki stok, ataupun potong keluar yang tertinggal di rak lama.'}
              </p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 sticky top-0 z-10 font-bold">
                  <tr>
                    <th className="p-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={isPageAllSelected}
                        onChange={() => onSelectAllVisible(currentPageIds)}
                        className="rounded border-slate-300 text-violet-600 focus:ring-violet-500 h-4 w-4 cursor-pointer"
                      />
                    </th>
                    <th className="p-3">Tipe & Diagnosa Masalah</th>
                    <th className="p-3">SKU Produk</th>
                    <th className="p-3">Nota Masuk Asal</th>
                    <th className="p-3">🛑 Rak Sekarang (Salah)</th>
                    <th className="p-3">➡️ Rak Seharusnya</th>
                    <th className="p-3 text-right">Qty</th>
                    <th className="p-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedList.map((item) => {
                    const isSelected = selectedIds.has(item.id);
                    const isTransfer = item.gudang === 'TRANSFER';

                    return (
                      <tr 
                        key={item.id} 
                        className={`hover:bg-slate-50/80 transition-colors ${isSelected ? 'bg-violet-50/50' : ''}`}
                      >
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onToggleSelect(item.id)}
                            className="rounded border-slate-300 text-violet-600 focus:ring-violet-500 h-4 w-4 cursor-pointer"
                          />
                        </td>
                        <td className="p-3 max-w-[280px]">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                              isTransfer 
                                ? 'bg-amber-100 text-amber-800 border border-amber-300' 
                                : 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                            }`}>
                              {isTransfer ? 'TRANSFER OUT NGACO' : 'POTONG OUT TERTINGGAL'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
                            {item.issueDescription}
                          </p>
                        </td>
                        <td className="p-3 font-mono font-bold text-slate-800">
                          {item.sku}
                        </td>
                        <td className="p-3 text-[11px] text-slate-500 whitespace-nowrap">
                          <div className="flex items-center gap-1 font-semibold text-slate-700">
                            <Calendar className="h-3 w-3 text-slate-400" />
                            <span>{item.batchInfo.receiptDate || item.tgl_scan || item.tgl}</span>
                          </div>
                          {item.batchInfo.receiptTime && (
                            <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
                              <Clock className="h-3 w-3 text-slate-300" />
                              <span>{item.batchInfo.receiptTime}</span>
                              {item.batchInfo.receiptRak && (
                                <span className="ml-1 text-slate-500 font-bold">(@ {item.batchInfo.receiptRak})</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-3">
                          <span className="px-2.5 py-1 bg-red-100 text-red-700 border border-red-200 rounded-lg font-mono font-black text-xs inline-block">
                            {item.currentRak}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            <ArrowRight className="h-3.5 w-3.5 text-emerald-500" />
                            <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg font-mono font-black text-xs inline-block">
                              {item.correctRak}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 text-right font-black text-slate-800">
                          {item.jumlah}
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          <button
                            onClick={() => onFixSelected([item])}
                            disabled={isFixing}
                            className="px-2.5 py-1 bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 rounded-lg font-bold text-[11px] transition-all cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                            title="Perbaiki baris ini saja"
                          >
                            <Wrench className="h-3 w-3" />
                            <span>Fix</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Bottom Footer with Pagination */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
          {/* Pagination Controls */}
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
              title="Halaman Pertama"
            >
              <ChevronsLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
              title="Halaman Sebelumnya"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>

            <span className="px-2 text-xs font-semibold text-slate-700">
              Hal <strong className="text-slate-900">{currentPage}</strong> dari <strong>{totalPages}</strong> ({filteredList.length} baris)
            </span>

            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
              title="Halaman Selanjutnya"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
              title="Halaman Terakhir"
            >
              <ChevronsRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Tutup
            </button>
            {selectedIds.size > 0 && (
              <button
                onClick={() => onFixSelected()}
                disabled={isFixing}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all shadow-md active:scale-95 flex items-center gap-1.5 cursor-pointer"
              >
                <Wrench className={`h-3.5 w-3.5 ${isFixing ? 'animate-spin' : ''}`} />
                <span>Perbaiki {selectedIds.size} Data Terpilih</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
