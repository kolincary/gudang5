import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  RefreshCw,
  RotateCcw,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Clock,
  Package,
  Layers,
  Sparkles,
  CheckSquare,
  Square
} from 'lucide-react';
import {
  MismatchedOutRakItem,
  SyncOutRakScanResult
} from '../services/syncOutRakService';

interface SyncOutRakModalProps {
  isOpen: boolean;
  onClose: () => void;
  scanResult: SyncOutRakScanResult | null;
  isScanning: boolean;
  isFixing: boolean;
  onRescan: (sku?: string) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAllVisible: (ids: string[]) => void;
  onClearSelection: () => void;
  onFixSelected: (items?: MismatchedOutRakItem[]) => void;
  onFixAll: () => void;
  skuInput: string;
  setSkuInput: (sku: string) => void;
  skuOptions: string[];
}

export const SyncOutRakModal: React.FC<SyncOutRakModalProps> = ({
  isOpen,
  onClose,
  scanResult,
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
  skuOptions
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmModalItem, setConfirmModalItem] = useState<MismatchedOutRakItem | null>(null);
  const [confirmModalBulk, setConfirmModalBulk] = useState<'SELECTED' | 'ALL' | null>(null);

  const rawList = useMemo(() => scanResult?.mismatchedItems || [], [scanResult]);

  const filteredList = useMemo(() => {
    if (!searchTerm.trim()) return rawList;
    const q = searchTerm.toLowerCase();
    return rawList.filter(item => {
      const matchSku = (item.sku || '').toLowerCase().includes(q);
      const matchCurRak = (item.currentRak || '').toLowerCase().includes(q);
      const matchCorRak = (item.correctRak || '').toLowerCase().includes(q);
      const matchGudang = (item.gudang || '').toLowerCase().includes(q);
      const matchTgl = (item.tgl || '').includes(q) || (item.tgl_scan || '').includes(q);
      return matchSku || matchCurRak || matchCorRak || matchGudang || matchTgl;
    });
  }, [rawList, searchTerm]);

  const visibleIds = useMemo(() => filteredList.map(i => i.id), [filteredList]);
  const isAllVisibleSelected =
    visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));

  const totalMismatched = rawList.length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white border border-emerald-200/80 w-full max-w-6xl max-h-[92vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Top Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 text-white flex items-center justify-between shadow-md">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-white/20 rounded-2xl backdrop-blur-sm border border-white/20">
              <RotateCcw className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-wide">Sinkronisasi Rak OUT Sesuai Nota Masuk</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-950/40 text-emerald-100 border border-white/20 tracking-wider uppercase">
                  DevMode Restore
                </span>
              </div>
              <p className="text-xs text-emerald-100/90 font-medium">
                Kembalikan rak & sub rak potong keluar (OUT) agar mengikuti rak barang masuk asli (Gudang J & H)
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
        <div className="p-5 border-b border-slate-200 bg-slate-50/50 space-y-4">
          <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
            {/* SKU Input & Scan */}
            <div className="flex items-center gap-2 w-full md:w-auto flex-1 max-w-lg">
              <div className="relative flex-1">
                <input
                  type="text"
                  list="sku-options-sync"
                  placeholder="Ketik SKU spesifik (atau kosongkan untuk semua)..."
                  value={skuInput}
                  onChange={(e) => setSkuInput(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white font-mono"
                />
                <Package className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                <datalist id="sku-options-sync">
                  {skuOptions.slice(0, 100).map(s => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>

              <button
                onClick={() => onRescan(skuInput)}
                disabled={isScanning || isFixing}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-md transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                <span>{isScanning ? 'Memindai...' : 'Pindai Rak OUT'}</span>
              </button>
            </div>

            {/* Quick Search in List */}
            <div className="relative w-full md:w-64">
              <input
                type="text"
                placeholder="Cari di hasil (SKU, rak, tgl)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
              />
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
            </div>

            {/* Batch Action Buttons */}
            <div className="flex items-center gap-2 w-full md:w-auto justify-end">
              <button
                onClick={() => setConfirmModalBulk('SELECTED')}
                disabled={selectedIds.size === 0 || isFixing}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white rounded-xl text-xs font-black shadow-md transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Kembalikan Terpilih ({selectedIds.size})</span>
              </button>

              <button
                onClick={() => setConfirmModalBulk('ALL')}
                disabled={totalMismatched === 0 || isFixing}
                className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 disabled:opacity-40 text-white rounded-xl text-xs font-black shadow-md transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer whitespace-nowrap border border-emerald-400/30"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Kembalikan SEMUA ({totalMismatched})</span>
              </button>
            </div>
          </div>

          {/* Logic Explanation Banner */}
          <div className="bg-cyan-50/80 border border-cyan-200 p-3 rounded-2xl flex items-start space-x-3 text-xs text-cyan-900 shadow-sm">
            <CheckCircle2 className="h-5 w-5 text-cyan-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold">Logika Pengembalian Rak:</p>
              <p className="text-[11px] text-cyan-800 leading-relaxed">
                Setiap baris transaksi <strong>OUT</strong> dicocokkan dengan transaksi barang masuk asli (<strong>IN, Gudang J atau H</strong>) yang memiliki <strong>SKU dan Tgl Scan yang sama</strong>. Rak dan Sub Rak pada log OUT yang melenceng akan dikembalikan mengikuti nota masuk tersebut.
              </p>
            </div>
          </div>

          {/* Metric Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
            <div className="bg-white border border-slate-200 p-3 rounded-2xl shadow-sm">
              <span className="text-[10px] font-extrabold uppercase text-slate-400">Total OUT Tidak Sesuai</span>
              <div className="text-xl font-black text-rose-700 mt-0.5">
                {totalMismatched} <span className="text-xs font-normal text-slate-500">baris</span>
              </div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl shadow-sm">
              <span className="text-[10px] font-extrabold uppercase text-emerald-700">Dipilih Untuk Dikembalikan</span>
              <div className="text-xl font-black text-emerald-800 mt-0.5">
                {selectedIds.size} <span className="text-xs font-normal text-emerald-600">baris</span>
              </div>
            </div>
            <div className="bg-teal-50 border border-teal-200 p-3 rounded-2xl shadow-sm">
              <span className="text-[10px] font-extrabold uppercase text-teal-700">Akurasi Nota Masuk</span>
              <div className="text-xl font-black text-teal-800 mt-0.5">
                100% <span className="text-xs font-normal text-teal-600">Gudang J / H</span>
              </div>
            </div>
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {filteredList.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center">
              <div className="p-4 bg-emerald-50 rounded-full border border-emerald-200 mb-3">
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              </div>
              <h3 className="text-sm font-black text-slate-700">
                {isScanning ? 'Sedang memindai ketidaksesuaian rak...' : 'Semua Rak OUT Sudah Sesuai dengan Nota Masuk!'}
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                {isScanning
                  ? 'Mencocokkan transaksi OUT dengan nota masuk IN Gudang J/H...'
                  : 'Tidak ditemukan transaksi OUT yang raknya melenceng dari barang masuk aslinya.'}
              </p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100/90 border-b border-slate-200 text-slate-700 sticky top-0 z-10 font-bold">
                  <tr>
                    <th className="p-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={isAllVisibleSelected}
                        onChange={() => onSelectAllVisible(visibleIds)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
                      />
                    </th>
                    <th className="p-3">SKU Produk</th>
                    <th className="p-3">Tgl Scan & Waktu</th>
                    <th className="p-3 text-center">Gudang</th>
                    <th className="p-3 text-right">Qty OUT</th>
                    <th className="p-3">🛑 Rak Sekarang (Salah)</th>
                    <th className="p-3">➡️ Rak Nota Masuk (Seharusnya)</th>
                    <th className="p-3">Nota Asal</th>
                    <th className="p-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredList.map((item) => {
                    const isSelected = selectedIds.has(item.id);
                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          isSelected ? 'bg-emerald-50/40' : ''
                        }`}
                      >
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onToggleSelect(item.id)}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
                          />
                        </td>
                        <td className="p-3 font-mono font-bold text-slate-900">
                          {item.sku}
                        </td>
                        <td className="p-3 text-[11px] text-slate-600">
                          <div className="flex items-center gap-1 font-semibold text-slate-700">
                            <Calendar className="h-3 w-3 text-slate-400" />
                            <span>{item.tgl_scan}</span>
                          </div>
                          {item.waktu && (
                            <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
                              <Clock className="h-3 w-3 text-slate-300" />
                              <span>{item.waktu}</span>
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-center font-bold text-slate-700">
                          <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px]">
                            {item.gudang}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-black text-slate-800">
                          {item.jumlah}
                        </td>
                        <td className="p-3">
                          <span className="px-2.5 py-1 bg-red-100 text-red-700 border border-red-200 rounded-lg font-mono font-black text-xs inline-block">
                            {item.currentRak} {item.currentSubRak ? `(${item.currentSubRak})` : ''}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            <ArrowRight className="h-3.5 w-3.5 text-emerald-500" />
                            <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg font-mono font-black text-xs inline-block">
                              {item.correctRak} {item.correctSubRak ? `(${item.correctSubRak})` : ''}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 text-[11px] text-slate-500">
                          <div className="font-semibold text-slate-700">
                            Gudang {item.inReceipt.gudang}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Qty Masuk: {item.inReceipt.jumlah}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => setConfirmModalItem(item)}
                            disabled={isFixing}
                            className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg font-bold text-[11px] transition-all cursor-pointer inline-flex items-center gap-1"
                            title="Kembalikan baris ini saja untuk uji coba"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>Kembalikan 1 Baris</span>
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

        {/* Bottom Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Terpilih: <strong className="text-slate-800">{selectedIds.size}</strong> dari {totalMismatched} baris
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
              disabled={selectedIds.size === 0 || isFixing}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white text-xs font-black rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Kembalikan Terpilih ({selectedIds.size})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal - Single Item */}
      {confirmModalItem && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-emerald-300 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-start space-x-3">
              <div className="p-3 bg-emerald-100 text-emerald-700 rounded-2xl">
                <RotateCcw className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-800">Konfirmasi Kembalikan 1 Baris</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Anda akan mengubah rak dan sub rak transaksi OUT berikut:
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1 font-mono">
              <div><strong>SKU:</strong> {confirmModalItem.sku}</div>
              <div><strong>Tgl Scan:</strong> {confirmModalItem.tgl_scan}</div>
              <div className="pt-1 text-red-600">
                <strong>Rak Sekarang:</strong> {confirmModalItem.currentRak} (Sub: {confirmModalItem.currentSubRak || '-'})
              </div>
              <div className="text-emerald-700 font-bold">
                <strong>Diubah Menjadi:</strong> {confirmModalItem.correctRak} (Sub: {confirmModalItem.correctSubRak})
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmModalItem(null)}
                disabled={isFixing}
                className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  const item = confirmModalItem;
                  setConfirmModalItem(null);
                  onFixSelected([item]);
                }}
                disabled={isFixing}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-md cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Ya, Kembalikan Rak</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal - Bulk */}
      {confirmModalBulk && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-emerald-300 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-start space-x-3">
              <div className="p-3 bg-emerald-100 text-emerald-700 rounded-2xl">
                <Sparkles className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-800">
                  {confirmModalBulk === 'SELECTED' ? 'Konfirmasi Kembalikan Rak Terpilih' : 'Konfirmasi Kembalikan SEMUA Rak'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {confirmModalBulk === 'SELECTED'
                    ? `Mengembalikan rak pada ${selectedIds.size} baris transaksi OUT sesuai barang masuk.`
                    : `Mengembalikan rak pada SEMUA (${totalMismatched}) baris transaksi OUT yang terdeteksi.`}
                </p>
              </div>
            </div>

            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-800 space-y-1">
              <p className="font-bold">Informasi Tindakan:</p>
              <p className="text-[11px]">
                Sistem akan menyamakan kolom `rak` dan `sub_rak` pada data OUT agar persis mengikuti nota masuk awal Gudang J/H.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmModalBulk(null)}
                disabled={isFixing}
                className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  const mode = confirmModalBulk;
                  setConfirmModalBulk(null);
                  if (mode === 'SELECTED') {
                    onFixSelected();
                  } else {
                    onFixAll();
                  }
                }}
                disabled={isFixing}
                className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white text-xs font-black rounded-xl shadow-md cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>
                  {confirmModalBulk === 'SELECTED'
                    ? `Ya, Kembalikan (${selectedIds.size}) Baris`
                    : `Ya, Kembalikan SEMUA (${totalMismatched}) Baris`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
