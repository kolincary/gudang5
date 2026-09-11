import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Search,
  RefreshCw,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  Calendar,
  Clock,
  Package,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CheckSquare,
  Square
} from 'lucide-react';
import {
  TransferPurgeItem,
  TransferPurgeScanResult,
  PROTECTED_TRANSFER_RAKS
} from '../services/transferPurgeService';

interface TransferPurgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  scanResult: TransferPurgeScanResult | null;
  isScanning: boolean;
  isDeleting: boolean;
  onRescan: (sku?: string) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAllVisible: (ids: string[]) => void;
  onClearSelection: () => void;
  onDeleteSelected: (items?: TransferPurgeItem[]) => void;
  onDeleteAll: () => void;
  skuInput: string;
  setSkuInput: (sku: string) => void;
  skuOptions: string[];
}

export const TransferPurgeModal: React.FC<TransferPurgeModalProps> = ({
  isOpen,
  onClose,
  scanResult,
  isScanning,
  isDeleting,
  onRescan,
  selectedIds,
  onToggleSelect,
  onSelectAllVisible,
  onClearSelection,
  onDeleteSelected,
  onDeleteAll,
  skuInput,
  setSkuInput,
  skuOptions
}) => {
  const [filterTab, setFilterTab] = useState<'DELETABLE' | 'PROTECTED'>('DELETABLE');
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmModalItem, setConfirmModalItem] = useState<TransferPurgeItem | null>(null);
  const [confirmModalBulk, setConfirmModalBulk] = useState<'SELECTED' | 'ALL' | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const deletableList = useMemo(() => scanResult?.deletableLogs || [], [scanResult]);
  const protectedList = useMemo(() => scanResult?.protectedLogs || [], [scanResult]);

  const currentList = filterTab === 'DELETABLE' ? deletableList : protectedList;

  // Reset page to 1 when search or filterTab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterTab, scanResult]);

  const filteredList = useMemo(() => {
    if (!searchTerm.trim()) return currentList;
    const q = searchTerm.toLowerCase();
    return currentList.filter(item => {
      const matchSku = (item.sku || '').toLowerCase().includes(q);
      const matchRak = (item.rak || '').toLowerCase().includes(q);
      const matchSubRak = (item.sub_rak || '').toLowerCase().includes(q);
      const matchTgl = (item.tgl || '').includes(q) || (item.tgl_scan || '').includes(q);
      const matchUser = (item.user || '').toLowerCase().includes(q);
      return matchSku || matchRak || matchSubRak || matchTgl || matchUser;
    });
  }, [currentList, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredList.length / pageSize));

  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredList.slice(start, start + pageSize);
  }, [filteredList, currentPage, pageSize]);

  const currentPageDeletableIds = useMemo(() => {
    return paginatedList.filter(i => !i.isProtected).map(i => i.id);
  }, [paginatedList]);

  const allFilteredDeletableIds = useMemo(() => {
    return filteredList.filter(i => !i.isProtected).map(i => i.id);
  }, [filteredList]);

  const isPageAllSelected =
    currentPageDeletableIds.length > 0 &&
    currentPageDeletableIds.every(id => selectedIds.has(id));

  const totalDeletable = deletableList.length;
  const totalProtected = protectedList.length;
  const totalScanned = scanResult?.totalScanned || 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white border border-rose-200/80 w-full max-w-6xl h-[92vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden relative">
        {/* Top Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-rose-600 via-red-600 to-pink-600 text-white flex items-center justify-between shadow-md flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-white/20 rounded-2xl backdrop-blur-sm border border-white/20">
              <Trash2 className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-wide">Pembersihan Log Gudang TRANSFER</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-950/40 text-rose-100 border border-white/20 tracking-wider uppercase">
                  DevMode Purge
                </span>
              </div>
              <p className="text-xs text-rose-100/90 font-medium">
                Hapus transaksi TRANSFER (IN & OUT) dengan proteksi ketat rak khusus (LANTAI 2, 4, ECER, BLOK-I)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-full transition-colors cursor-pointer text-white/80 hover:text-white"
            title="Tutup Modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Action Controls & Metric Badges */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/70 space-y-3 flex-shrink-0">
          <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
            {/* SKU Input & Scan */}
            <div className="flex items-center gap-2 w-full md:w-auto flex-1 max-w-lg">
              <div className="relative flex-1">
                <input
                  type="text"
                  list="sku-options-purge"
                  placeholder="Ketik SKU spesifik (atau kosongkan untuk semua)..."
                  value={skuInput}
                  onChange={(e) => setSkuInput(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none bg-white font-mono"
                />
                <Package className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                <datalist id="sku-options-purge">
                  {skuOptions.slice(0, 100).map(s => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>

              <button
                onClick={() => onRescan(skuInput)}
                disabled={isScanning || isDeleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-md transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                <span>{isScanning ? 'Memindai...' : 'Pindai TRANSFER'}</span>
              </button>
            </div>

            {/* Quick Search in List */}
            <div className="relative w-full md:w-64">
              <input
                type="text"
                placeholder="Cari di hasil (SKU, rak, tgl)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none bg-white"
              />
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
            </div>

            {/* Batch Action Buttons */}
            <div className="flex items-center gap-2 w-full md:w-auto justify-end">
              <button
                onClick={() => setConfirmModalBulk('SELECTED')}
                disabled={selectedIds.size === 0 || isDeleting}
                className="px-4 py-2 bg-rose-500 hover:bg-rose-600 disabled:opacity-40 text-white rounded-xl text-xs font-black shadow-md transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Hapus Terpilih ({selectedIds.size})</span>
              </button>

              <button
                onClick={() => setConfirmModalBulk('ALL')}
                disabled={totalDeletable === 0 || isDeleting}
                className="px-4 py-2 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 disabled:opacity-40 text-white rounded-xl text-xs font-black shadow-md transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer whitespace-nowrap border border-red-400/30"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Hapus SEMUA ({totalDeletable})</span>
              </button>
            </div>
          </div>

          {/* Protected Racks Banner & Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5 pt-1">
            <div className="md:col-span-2 bg-emerald-50/80 border border-emerald-200 p-2.5 rounded-2xl flex items-center space-x-2.5 text-xs text-emerald-900">
              <ShieldCheck className="h-5 w-5 text-emerald-600 flex-shrink-0" />
              <div className="text-[11px] leading-tight text-emerald-800">
                Rak <strong className="text-emerald-950 font-mono">{PROTECTED_TRANSFER_RAKS.join(', ')}</strong> diproteksi & aman dari hapus.
              </div>
            </div>

            <div className="bg-white border border-slate-200 p-2.5 rounded-2xl shadow-sm flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase text-slate-400">Total Scan</span>
              <div className="text-lg font-black text-slate-800">
                {totalScanned} <span className="text-xs font-normal text-slate-500">baris</span>
              </div>
            </div>

            <div className="bg-rose-50 border border-rose-200 p-2.5 rounded-2xl shadow-sm flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase text-rose-700">Siap Hapus</span>
              <div className="text-lg font-black text-rose-800">
                {totalDeletable} <span className="text-xs font-normal text-rose-600">baris</span>
              </div>
            </div>

            <div className="bg-indigo-50 border border-indigo-200 p-2.5 rounded-2xl shadow-sm flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase text-indigo-700">Dipilih</span>
              <div className="text-lg font-black text-indigo-800">
                {selectedIds.size} <span className="text-xs font-normal text-indigo-600">baris</span>
              </div>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-2 border-b border-slate-200 pb-1">
            <button
              onClick={() => setFilterTab('DELETABLE')}
              className={`px-3 py-1.5 text-xs font-extrabold rounded-lg transition-all cursor-pointer ${
                filterTab === 'DELETABLE'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Siap Dihapus ({totalDeletable})
            </button>
            <button
              onClick={() => setFilterTab('PROTECTED')}
              className={`px-3 py-1.5 text-xs font-extrabold rounded-lg transition-all cursor-pointer ${
                filterTab === 'PROTECTED'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Diproteksi / Aman ({totalProtected})
            </button>
          </div>
        </div>

        {/* Selection Shortcuts Bar */}
        {filterTab === 'DELETABLE' && (
          <div className="px-5 py-2 bg-slate-100/70 border-b border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-600 flex-shrink-0">
            <div className="flex items-center gap-2">
              <button
                onClick={() => onSelectAllVisible(currentPageDeletableIds)}
                className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg text-[11px] font-bold text-slate-700 cursor-pointer shadow-2xs"
              >
                {isPageAllSelected ? 'Batal Pilih Halaman Ini' : 'Pilih Semua di Halaman Ini'}
              </button>
              <button
                onClick={() => onSelectAllVisible(allFilteredDeletableIds)}
                className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded-lg text-[11px] font-bold text-rose-800 cursor-pointer shadow-2xs"
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
        )}

        {/* Table Content (with optimized pagination) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {filteredList.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center">
              <div className="p-4 bg-slate-100 rounded-full border border-slate-200 mb-3">
                <CheckCircle2 className="h-10 w-10 text-slate-400" />
              </div>
              <h3 className="text-sm font-black text-slate-700">
                {isScanning ? 'Sedang memindai data TRANSFER...' : 'Tidak ada data TRANSFER yang ditemukan'}
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                {isScanning
                  ? 'Mengambil dan menganalisis log transaksi TRANSFER...'
                  : 'Tidak ditemukan baris transaksi TRANSFER yang sesuai dengan kriteria filter.'}
              </p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 sticky top-0 z-10 font-bold">
                  <tr>
                    {filterTab === 'DELETABLE' && (
                      <th className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={isPageAllSelected}
                          onChange={() => onSelectAllVisible(currentPageDeletableIds)}
                          className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 h-4 w-4 cursor-pointer"
                        />
                      </th>
                    )}
                    <th className="p-3">SKU Produk</th>
                    <th className="p-3 text-center">Tipe</th>
                    <th className="p-3 text-right">Qty</th>
                    <th className="p-3">Rak</th>
                    <th className="p-3">Sub Rak</th>
                    <th className="p-3">Tgl Scan & Tanggal</th>
                    <th className="p-3">User</th>
                    <th className="p-3 text-center">Aksi / Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedList.map((item) => {
                    const isSelected = selectedIds.has(item.id);
                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          isSelected ? 'bg-rose-50/50' : ''
                        }`}
                      >
                        {filterTab === 'DELETABLE' && (
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => onToggleSelect(item.id)}
                              className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 h-4 w-4 cursor-pointer"
                            />
                          </td>
                        )}
                        <td className="p-3 font-mono font-bold text-slate-900">
                          {item.sku}
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                              item.type === 'IN'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : 'bg-amber-100 text-amber-800 border border-amber-300'
                            }`}
                          >
                            {item.type}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-black text-slate-800">
                          {item.jumlah}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded-lg font-mono font-bold text-xs inline-block ${
                              item.isProtected
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : 'bg-slate-100 text-slate-800 border border-slate-200'
                            }`}
                          >
                            {item.rak}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-slate-600">
                          {item.sub_rak || '-'}
                        </td>
                        <td className="p-3 text-[11px] text-slate-600 whitespace-nowrap">
                          <div className="flex items-center gap-1 font-semibold text-slate-700">
                            <Calendar className="h-3 w-3 text-slate-400" />
                            <span>{item.tgl_scan || item.tgl}</span>
                          </div>
                          {item.waktu && (
                            <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
                              <Clock className="h-3 w-3 text-slate-300" />
                              <span>{item.waktu}</span>
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-[11px] text-slate-500 max-w-[120px] truncate">
                          {item.user || '-'}
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          {item.isProtected ? (
                            <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg font-bold text-[10px] inline-flex items-center gap-1">
                              <ShieldCheck className="h-3 w-3 text-emerald-600" />
                              Aman (Diproteksi)
                            </span>
                          ) : (
                            <button
                              onClick={() => setConfirmModalItem(item)}
                              disabled={isDeleting}
                              className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg font-bold text-[11px] transition-all cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                              title="Hapus baris ini saja untuk uji coba"
                            >
                              <Trash2 className="h-3 w-3" />
                              <span>Hapus 1 Baris</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Bottom Footer with Pagination & Actions */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
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
              className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
            >
              Tutup
            </button>
            <button
              onClick={() => setConfirmModalBulk('SELECTED')}
              disabled={selectedIds.size === 0 || isDeleting}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-xs font-black rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Hapus Terpilih ({selectedIds.size})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal - Single Item */}
      {confirmModalItem && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmModalItem(null);
          }}
        >
          <div className="relative z-[130] bg-white border border-rose-300 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4 pointer-events-auto">
            <div className="flex items-start space-x-3">
              <div className="p-3 bg-rose-100 text-rose-700 rounded-2xl flex-shrink-0">
                <Trash2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-800">Konfirmasi Hapus 1 Baris</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Anda akan menghapus log TRANSFER berikut dari database_log:
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5 font-mono">
              <div><strong>SKU:</strong> {confirmModalItem.sku}</div>
              <div><strong>Tipe:</strong> {confirmModalItem.type} | <strong>Qty:</strong> {confirmModalItem.jumlah}</div>
              <div><strong>Rak:</strong> {confirmModalItem.rak} (Sub: {confirmModalItem.sub_rak || '-'})</div>
              <div><strong>Tgl Scan:</strong> {confirmModalItem.tgl_scan || confirmModalItem.tgl}</div>
            </div>

            <p className="text-[11px] text-rose-700 font-semibold">
              ⚠️ Data yang dihapus tidak dapat dikembalikan. Lanjutkan penghapusan 1 baris ini?
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModalItem(null)}
                disabled={isDeleting}
                className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  const item = confirmModalItem;
                  setConfirmModalItem(null);
                  onDeleteSelected([item]);
                }}
                disabled={isDeleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl shadow-md cursor-pointer flex items-center gap-1.5 active:scale-95 transition-all"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Ya, Hapus Baris Ini</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal - Bulk */}
      {confirmModalBulk && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmModalBulk(null);
          }}
        >
          <div className="relative z-[130] bg-white border border-rose-300 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4 pointer-events-auto">
            <div className="flex items-start space-x-3">
              <div className="p-3 bg-rose-100 text-rose-700 rounded-2xl flex-shrink-0">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-800">
                  {confirmModalBulk === 'SELECTED' ? 'Konfirmasi Hapus Data Terpilih' : 'Konfirmasi Hapus SEMUA Data'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {confirmModalBulk === 'SELECTED'
                    ? `Menghapus ${selectedIds.size} baris log TRANSFER yang dipilih.`
                    : `Menghapus SEMUA (${totalDeletable}) baris log TRANSFER yang terdeteksi (rak diproteksi tetap aman).`}
                </p>
              </div>
            </div>

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 space-y-1">
              <p className="font-bold">Perhatian Penting:</p>
              <p className="text-[11px]">
                Operasi ini akan menghapus log TRANSFER permanen dari tabel database_log. Rak yang diproteksi ({PROTECTED_TRANSFER_RAKS.join(', ')}) tidak akan terhapus.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModalBulk(null)}
                disabled={isDeleting}
                className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  const mode = confirmModalBulk;
                  setConfirmModalBulk(null);
                  if (mode === 'SELECTED') {
                    onDeleteSelected();
                  } else {
                    onDeleteAll();
                  }
                }}
                disabled={isDeleting}
                className="px-4 py-2 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 text-white text-xs font-black rounded-xl shadow-md cursor-pointer flex items-center gap-1.5 active:scale-95 transition-all"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>
                  {confirmModalBulk === 'SELECTED'
                    ? `Ya, Hapus (${selectedIds.size}) Baris`
                    : `Ya, Hapus SEMUA (${totalDeletable}) Baris`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
