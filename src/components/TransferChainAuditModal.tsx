import React, { useMemo } from 'react';
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
  Sparkles
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
  const allBroken = useMemo(() => {
    if (!summary) return [];
    return [...summary.brokenTransfers, ...summary.brokenNonTransferOuts];
  }, [summary]);

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

  const visibleIds = useMemo(() => filteredList.map(i => i.id), [filteredList]);
  const isAllVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));

  const totalTransfers = summary?.brokenTransfers.length || 0;
  const totalOuts = summary?.brokenNonTransferOuts.length || 0;
  const totalBroken = allBroken.length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 w-full max-w-6xl max-h-[92vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-violet-900 via-purple-900 to-indigo-950 text-white">
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
        <div className="p-5 border-b border-slate-200 bg-slate-50/50 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            {/* SKU Input */}
            <div className="flex items-center gap-2 flex-1 min-w-[280px] max-w-md">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Ketik SKU spesifik (kosongkan untuk SEMUA SKU)..."
                  value={skuInput}
                  onChange={(e) => setSkuInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onRescan(skuInput);
                  }}
                  className="w-full pl-9 pr-8 py-2 text-xs bg-white border border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent font-medium"
                />
                <Package className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                {skuInput && (
                  <button
                    onClick={() => {
                      setSkuInput('');
                      onRescan('');
                    }}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <button
                onClick={() => onRescan(skuInput)}
                disabled={isScanning || isFixing}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                <span>{isScanning ? 'Memindai...' : 'Scan Rantai'}</span>
              </button>
            </div>

            {/* Search Filter */}
            <div className="relative flex-1 min-w-[200px] max-w-xs">
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
                onClick={() => onSelectAllVisible(visibleIds)}
                className="px-3 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                {isAllVisibleSelected ? <CheckSquare className="h-3.5 w-3.5 text-violet-600" /> : <Square className="h-3.5 w-3.5" />}
                <span>{isAllVisibleSelected ? 'Batalkan Semua' : 'Pilih Semua'}</span>
              </button>

              <button
                onClick={() => onFixSelected()}
                disabled={selectedIds.size === 0 || isFixing}
                className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-black transition-all shadow-md active:scale-95 flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
              >
                <Wrench className={`h-3.5 w-3.5 ${isFixing ? 'animate-spin' : ''}`} />
                <span>Perbaiki Terpilih ({selectedIds.size})</span>
              </button>

              <button
                onClick={onFixAll}
                disabled={totalBroken === 0 || isFixing}
                className="px-4 py-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-xl text-xs font-black transition-all shadow-md active:scale-95 flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Perbaiki SEMUA ({totalBroken})</span>
              </button>
            </div>
          </div>

          {/* Metric Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
            <div className="bg-white border border-slate-200 p-3 rounded-2xl shadow-sm">
              <span className="text-[10px] font-extrabold uppercase text-slate-400">Total Anomali Rantai</span>
              <div className="text-xl font-black text-slate-800 mt-0.5">
                {totalBroken} <span className="text-xs font-normal text-slate-500">baris</span>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl shadow-sm">
              <span className="text-[10px] font-extrabold uppercase text-amber-700">Transfer OUT Ngaco</span>
              <div className="text-xl font-black text-amber-800 mt-0.5">
                {totalTransfers} <span className="text-xs font-normal text-amber-600">baris</span>
              </div>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-2xl shadow-sm">
              <span className="text-[10px] font-extrabold uppercase text-indigo-700">Potong Keluar Tertinggal</span>
              <div className="text-xl font-black text-indigo-800 mt-0.5">
                {totalOuts} <span className="text-xs font-normal text-indigo-600">baris</span>
              </div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl shadow-sm">
              <span className="text-[10px] font-extrabold uppercase text-emerald-700">Dipilih Untuk Diperbaiki</span>
              <div className="text-xl font-black text-emerald-800 mt-0.5">
                {selectedIds.size} <span className="text-xs font-normal text-emerald-600">baris</span>
              </div>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-2 border-b border-slate-200 pb-2">
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

        {/* Anomaly Table */}
        <div className="flex-1 overflow-y-auto p-5">
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
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100/80 border-b border-slate-200 text-slate-700 sticky top-0 z-10">
                  <tr>
                    <th className="p-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={isAllVisibleSelected}
                        onChange={() => onSelectAllVisible(visibleIds)}
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
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredList.map((item) => {
                    const isSelected = selectedIds.has(item.id);
                    const isTransfer = item.gudang === 'TRANSFER';

                    return (
                      <tr 
                        key={item.id} 
                        className={`hover:bg-slate-50/80 transition-colors ${isSelected ? 'bg-violet-50/40' : ''}`}
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
                        <td className="p-3 text-[11px] text-slate-500">
                          <div className="flex items-center gap-1 font-semibold text-slate-700">
                            <Calendar className="h-3 w-3 text-slate-400" />
                            <span>{item.batchInfo.receiptDate || item.tgl_scan || item.tgl}</span>
                          </div>
                          {item.batchInfo.receiptTime && (
                            <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
                              <Clock className="h-3 w-3 text-slate-300" />
                              <span>{item.batchInfo.receiptTime}</span>
                              {item.batchInfo.receiptRak && (
                                <span className="ml-1 text-slate-500">(@ {item.batchInfo.receiptRak})</span>
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
                        <td className="p-3 text-center">
                          <button
                            onClick={() => onFixSelected([item])}
                            disabled={isFixing}
                            className="px-2.5 py-1 bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 rounded-lg font-bold text-[11px] transition-all cursor-pointer inline-flex items-center gap-1"
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

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {selectedIds.size > 0 ? (
              <span className="font-bold text-violet-700">{selectedIds.size} baris dipilih untuk diselaraskan.</span>
            ) : (
              <span>Pilih baris atau klik "Perbaiki SEMUA" untuk update kolom rak & sub_rak secara otomatis.</span>
            )}
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
