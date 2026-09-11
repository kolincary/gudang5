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
  Square,
  FileText,
  ListPlus
} from 'lucide-react';
import {
  TransferPurgeItem,
  TransferPurgeScanResult,
  PROTECTED_TRANSFER_RAKS,
  parseMultipleSkus
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
  const [isMultiLineInput, setIsMultiLineInput] = useState(false);
  const [confirmModalItem, setConfirmModalItem] = useState<TransferPurgeItem | null>(null);
  const [confirmModalBulk, setConfirmModalBulk] = useState<'SELECTED' | 'ALL' | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Parse multi-SKU from skuInput
  const detectedSkus = useMemo(() => {
    return parseMultipleSkus(skuInput);
  }, [skuInput]);

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
                Hapus transaksi TRANSFER (IN & OUT) dengan pencarian multi-SKU & proteksi rak khusus (LANTAI 2, 4, ECER, BLOK-I)
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
          <div className="flex flex-col md:flex-row gap-3 items-start justify-between">
            {/* Multi-SKU Input & Scan */}
            <div className="w-full md:w-auto flex-1 max-w-xl space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <div className="flex items-center gap-1.5 font-medium">
                  <Package className="h-3.5 w-3.5 text-rose-600" />
                  <span>Cari SKU (Bisa Banyak SKU sekaligus)</span>
                  {detectedSkus.length > 1 && (
                    <span className="px-2 py-0.5 bg-rose-100 text-rose-700 font-bold rounded-full text-[10px] border border-rose-200">
                      {detectedSkus.length} SKU Terdeteksi
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsMultiLineInput(!isMultiLineInput)}
                    className="text-rose-600 hover:text-rose-800 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <ListPlus className="w-3 h-3" />
                    {isMultiLineInput ? 'Mode Baris Tunggal' : 'Mode Paste Banyak Baris'}
                  </button>
                  {skuInput && (
                    <button
                      type="button"
                      onClick={() => setSkuInput('')}
                      className="text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-2">
                <div className="relative flex-1">
                  {isMultiLineInput ? (
                    <textarea
                      rows={3}
                      placeholder="Paste banyak SKU di sini (pisahkan dengan baris baru, koma, atau titik koma)...&#10;Contoh:&#10;PAINT-OP-12S&#10;PAINT-OP-24S&#10;LAMINATING-LM-01"
                      value={skuInput}
                      onChange={(e) => setSkuInput(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none bg-white font-mono shadow-inner resize-y"
                    />
                  ) : (
                    <div className="relative">
                      <input
                        type="text"
                        list="sku-options-purge"
                        placeholder="Ketik SKU atau paste beberapa SKU (pisahkan koma)..."
                        value={skuInput}
                        onChange={(e) => setSkuInput(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none bg-white font-mono shadow-sm"
                      />
                      <Package className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                      <datalist id="sku-options-purge">
                        {skuOptions.slice(0, 100).map(s => (
                          <option key={s} value={s} />
                        ))}
                      </datalist>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => onRescan(skuInput)}
                  disabled={isScanning || isDeleting}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-md transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer whitespace-nowrap h-9 self-start"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                  <span>
                    {isScanning 
                      ? 'Memindai...' 
                      : detectedSkus.length > 1 
                        ? `Pindai (${detectedSkus.length} SKU)` 
                        : 'Pindai TRANSFER'}
                  </span>
                </button>
              </div>
            </div>

            {/* Quick Search in List & Batch Actions */}
            <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto">
              <div className="relative w-full sm:w-56">
                <input
                  type="text"
                  placeholder="Filter tabel hasil..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none bg-white shadow-sm"
                />
                <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
              </div>

              <button
                onClick={() => setConfirmModalBulk('SELECTED')}
                disabled={selectedIds.size === 0 || isDeleting}
                className="w-full sm:w-auto px-3.5 py-2 bg-rose-500 hover:bg-rose-600 disabled:opacity-40 text-white rounded-xl text-xs font-black shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Hapus Terpilih ({selectedIds.size})</span>
              </button>

              <button
                onClick={() => setConfirmModalBulk('ALL')}
                disabled={totalDeletable === 0 || isDeleting}
                className="w-full sm:w-auto px-3.5 py-2 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 disabled:opacity-40 text-white rounded-xl text-xs font-black shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap border border-red-400/30"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>
                  {detectedSkus.length > 0
                    ? `Hapus Hasil Pencarian (${totalDeletable})`
                    : `Hapus SEMUA (${totalDeletable})`}
                </span>
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

          {/* Tab Filter Switcher */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-200/80">
            <div className="flex space-x-1.5">
              <button
                onClick={() => setFilterTab('DELETABLE')}
                className={`px-4 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                  filterTab === 'DELETABLE'
                    ? 'bg-rose-600 text-white shadow-md'
                    : 'bg-slate-200/80 text-slate-700 hover:bg-slate-300'
                }`}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Siap Dihapus ({totalDeletable})</span>
              </button>

              <button
                onClick={() => setFilterTab('PROTECTED')}
                className={`px-4 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                  filterTab === 'PROTECTED'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-slate-200/80 text-slate-700 hover:bg-slate-300'
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Diproteksi / Aman ({totalProtected})</span>
              </button>
            </div>

            {/* Pagination Controls in Header */}
            {totalPages > 1 && (
              <div className="flex items-center space-x-1.5 text-xs text-slate-500 font-medium">
                <span>Hal. {currentPage}/{totalPages} ({filteredList.length} data)</span>
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="p-1 rounded-lg hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent"
                  title="Halaman Pertama"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1 rounded-lg hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent"
                  title="Halaman Sebelumnya"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1 rounded-lg hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent"
                  title="Halaman Selanjutnya"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="p-1 rounded-lg hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent"
                  title="Halaman Terakhir"
                >
                  <ChevronsRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Content Table Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 relative bg-slate-50/40">
          {isScanning ? (
            <div className="h-64 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="h-8 w-8 text-rose-600 animate-spin" />
              <p className="text-sm font-bold text-slate-600">Memindai data log TRANSFER di database...</p>
            </div>
          ) : paginatedList.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center space-y-2 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="text-sm font-black text-slate-700">
                {filterTab === 'DELETABLE'
                  ? 'Tidak ada data log TRANSFER siap hapus.'
                  : 'Tidak ada data TRANSFER yang termasuk daftar rak diproteksi.'}
              </p>
              {searchTerm && <p className="text-xs text-slate-400">Coba ubah kata kunci pencarian Anda.</p>}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100/90 text-slate-600 font-black border-b border-slate-200 sticky top-0 z-10 backdrop-blur-sm">
                  <tr>
                    {filterTab === 'DELETABLE' && (
                      <th className="p-3 w-10 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            if (isPageAllSelected) {
                              onSelectAllVisible(
                                Array.from(selectedIds).filter(id => !currentPageDeletableIds.includes(id))
                              );
                            } else {
                              onSelectAllVisible(
                                Array.from(new Set([...Array.from(selectedIds), ...currentPageDeletableIds]))
                              );
                            }
                          }}
                          className="text-slate-500 hover:text-slate-800 cursor-pointer"
                          title={isPageAllSelected ? 'Batal Pilih Halaman Ini' : 'Pilih Semua Halaman Ini'}
                        >
                          {isPageAllSelected ? (
                            <CheckSquare className="h-4 w-4 text-rose-600" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                      </th>
                    )}
                    <th className="p-3">SKU & JML</th>
                    <th className="p-3">TIPE & GUDANG</th>
                    <th className="p-3">RAK & SUB RAK</th>
                    <th className="p-3">TGL / TGL SCAN</th>
                    <th className="p-3">WAKTU & USER</th>
                    <th className="p-3">STATUS</th>
                    {filterTab === 'DELETABLE' && <th className="p-3 text-right">AKSI</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedList.map(item => {
                    const isSelected = selectedIds.has(item.id);
                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          isSelected ? 'bg-rose-50/60' : ''
                        }`}
                      >
                        {filterTab === 'DELETABLE' && (
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => onToggleSelect(item.id)}
                              className="text-slate-400 hover:text-slate-700 cursor-pointer"
                            >
                              {isSelected ? (
                                <CheckSquare className="h-4 w-4 text-rose-600" />
                              ) : (
                                <Square className="h-4 w-4" />
                              )}
                            </button>
                          </td>
                        )}
                        <td className="p-3">
                          <div className="font-mono font-bold text-slate-800">{item.sku}</div>
                          <div className="text-[11px] text-slate-500">
                            Jumlah: <span className="font-bold text-slate-700">{item.jumlah} pcs</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                item.type === 'OUT'
                                  ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                  : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                              }`}
                            >
                              {item.type}
                            </span>
                            <span className="font-bold text-slate-700">{item.gudang}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-slate-800">{item.rak || '-'}</div>
                          {item.sub_rak && item.sub_rak !== item.rak && (
                            <div className="text-[10px] text-slate-400 font-mono">Sub: {item.sub_rak}</div>
                          )}
                        </td>
                        <td className="p-3 font-mono text-[11px]">
                          <div>Tgl: {item.tgl || '-'}</div>
                          <div className="text-slate-400">Scan: {item.tgl_scan || '-'}</div>
                        </td>
                        <td className="p-3 text-[11px] text-slate-500">
                          <div>{item.waktu || '-'}</div>
                          <div className="truncate max-w-[140px] text-[10px] text-slate-400">{item.user || '-'}</div>
                        </td>
                        <td className="p-3">
                          {item.isProtected ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <ShieldCheck className="h-3 w-3 text-emerald-600" />
                              Aman (Diproteksi)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                              <AlertTriangle className="h-3 w-3 text-rose-600" />
                              Siap Dihapus
                            </span>
                          )}
                        </td>
                        {filterTab === 'DELETABLE' && (
                          <td className="p-3 text-right">
                            <button
                              onClick={() => setConfirmModalItem(item)}
                              disabled={isDeleting}
                              className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-[11px] font-bold transition-all active:scale-95 cursor-pointer inline-flex items-center gap-1"
                              title="Hapus baris ini saja untuk uji coba"
                            >
                              <Trash2 className="h-3 w-3" />
                              <span>Hapus 1 Baris</span>
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer / Pagination Bar */}
        <div className="p-4 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 flex-shrink-0 text-xs">
          <div className="flex items-center gap-3 text-slate-500">
            <span>
              Menampilkan {paginatedList.length} dari {filteredList.length} baris
            </span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none cursor-pointer"
            >
              <option value={25}>25 per halaman</option>
              <option value={50}>50 per halaman</option>
              <option value={100}>100 per halaman</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-all cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>

      {/* CONFIRMATION MODAL - SINGLE ITEM (z-[120]) */}
      {confirmModalItem && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="p-3 bg-rose-100 rounded-2xl">
                <Trash2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Konfirmasi Hapus 1 Baris</h3>
                <p className="text-xs text-slate-500">Uji coba hapus satu baris transaksi TRANSFER</p>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-1 text-xs">
              <div>
                <span className="text-slate-400">SKU:</span>{' '}
                <strong className="font-mono text-slate-800">{confirmModalItem.sku}</strong>
              </div>
              <div>
                <span className="text-slate-400">Tipe / Gudang:</span>{' '}
                <strong className="text-slate-800">{confirmModalItem.type} / {confirmModalItem.gudang}</strong>
              </div>
              <div>
                <span className="text-slate-400">Rak / Qty:</span>{' '}
                <strong className="text-slate-800">{confirmModalItem.rak} ({confirmModalItem.jumlah} pcs)</strong>
              </div>
              <div>
                <span className="text-slate-400">Tgl Scan:</span>{' '}
                <strong className="font-mono text-slate-800">{confirmModalItem.tgl_scan || confirmModalItem.tgl}</strong>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModalItem(null)}
                disabled={isDeleting}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = confirmModalItem;
                  setConfirmModalItem(null);
                  await onDeleteSelected([target]);
                }}
                disabled={isDeleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Ya, Hapus 1 Baris Ini</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL - BULK (z-[120]) */}
      {confirmModalBulk && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-red-600">
              <div className="p-3 bg-red-100 rounded-2xl">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">
                  {confirmModalBulk === 'SELECTED' ? 'Hapus Transaksi Terpilih' : 'Hapus SEMUA Transaksi TRANSFER'}
                </h3>
                <p className="text-xs text-slate-500">Tindakan ini permanen dan tidak dapat dibatalkan</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {confirmModalBulk === 'SELECTED' ? (
                <>
                  Anda akan menghapus{' '}
                  <strong className="text-red-600 font-bold">{selectedIds.size} baris</strong> log TRANSFER yang
                  dipilih. Rak diproteksi (<strong className="font-mono">{PROTECTED_TRANSFER_RAKS.join(', ')}</strong>)
                  tetap aman dan tidak akan terhapus.
                </>
              ) : (
                <>
                  Anda akan menghapus SEMUA{' '}
                  <strong className="text-red-600 font-bold">{totalDeletable} baris</strong> log TRANSFER
                  {detectedSkus.length > 0 ? ` untuk ${detectedSkus.length} SKU yang dicari` : ''}. Rak diproteksi (
                  <strong className="font-mono">{PROTECTED_TRANSFER_RAKS.join(', ')}</strong>) tetap aman dan tidak
                  akan terhapus.
                </>
              )}
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModalBulk(null)}
                disabled={isDeleting}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  const mode = confirmModalBulk;
                  setConfirmModalBulk(null);
                  if (mode === 'SELECTED') {
                    await onDeleteSelected();
                  } else {
                    await onDeleteAll();
                  }
                }}
                disabled={isDeleting}
                className="px-4 py-2 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 text-white rounded-xl text-xs font-black shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
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
