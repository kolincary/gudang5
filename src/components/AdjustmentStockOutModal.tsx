import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  X,
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Package,
  Layers,
  CheckSquare,
  Square,
  Sparkles,
  ArrowDownRight,
  ListPlus,
  Sliders,
  AlertCircle,
  Hash,
  Database,
  Tag,
  Boxes
} from 'lucide-react';
import {
  AvailableStockItem,
  parseMultipleSkus,
  fetchAvailableStockForSkus,
  executeAdjustmentStockOut
} from '../services/adjustmentStockOutService';
import { useDatabaseConfig } from '../lib/DatabaseContext';
import { useAuth } from '../lib/AuthContext';

interface AdjustmentStockOutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  defaultSku?: string;
}

export const AdjustmentStockOutModal: React.FC<AdjustmentStockOutModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultSku = ''
}) => {
  const { writeMode } = useDatabaseConfig();
  const { user, userRole, userName: authUserName } = useAuth();

  // Mode: SINGLE SKU vs BULK MASSAL
  const [inputMode, setInputMode] = useState<'SINGLE' | 'BULK'>('SINGLE');
  const [singleSkuInput, setSingleSkuInput] = useState(defaultSku);
  const [bulkSkuInput, setBulkSkuInput] = useState('');

  // Search and loaded data states
  const [isSearching, setIsSearching] = useState(false);
  const [searchProgressMessage, setSearchProgressMessage] = useState('');
  const [searchPercent, setSearchPercent] = useState(0);
  const [stockItems, setStockItems] = useState<AvailableStockItem[]>([]);
  const [notFoundSkus, setNotFoundSkus] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Table filter search
  const [tableFilter, setTableFilter] = useState('');

  // Execution states
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [execProgress, setExecProgress] = useState({
    percent: 0,
    current: 0,
    total: 0,
    message: ''
  });
  const [executionResult, setExecutionResult] = useState<{
    success: boolean;
    processedCount: number;
    totalQtyOut: number;
    insertedLogsCount: number;
  } | null>(null);

  const singleInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus single input when opened
  useEffect(() => {
    if (isOpen) {
      if (defaultSku) {
        setSingleSkuInput(defaultSku);
        // Auto trigger search if defaultSku provided
        handleSearch(defaultSku);
      }
      setTimeout(() => {
        singleInputRef.current?.focus();
      }, 100);
    } else {
      // Reset temporary states on close
      setExecutionResult(null);
      setIsConfirmOpen(false);
    }
  }, [isOpen, defaultSku]);

  // Detected SKUs in bulk input
  const detectedBulkSkus = useMemo(() => {
    return parseMultipleSkus(bulkSkuInput);
  }, [bulkSkuInput]);

  // Filtered rows for the preview table
  const filteredStockItems = useMemo(() => {
    if (!tableFilter.trim()) return stockItems;
    const q = tableFilter.toLowerCase().trim();
    return stockItems.filter(item =>
      item.nama_produk.toLowerCase().includes(q) ||
      item.rak.toLowerCase().includes(q) ||
      item.sub_rak.toLowerCase().includes(q) ||
      item.satuan.toLowerCase().includes(q) ||
      item.packing.toLowerCase().includes(q)
    );
  }, [stockItems, tableFilter]);

  // Summary stats
  const summary = useMemo(() => {
    const selected = stockItems.filter(i => i.isSelected);
    const uniqueSkus = new Set(selected.map(i => i.nama_produk));
    const totalOut = selected.reduce((sum, i) => sum + (Number(i.outQty) || 0), 0);
    const totalAvailable = selected.reduce((sum, i) => sum + i.tersedia, 0);

    const allUniqueSkus = new Set(stockItems.map(i => i.nama_produk));
    const allTotalAvailable = stockItems.reduce((sum, i) => sum + i.tersedia, 0);

    return {
      selectedRowsCount: selected.length,
      selectedSkusCount: uniqueSkus.size,
      totalOutQty: totalOut,
      totalAvailableInSelected: totalAvailable,
      allRowsCount: stockItems.length,
      allSkusCount: allUniqueSkus.size,
      allAvailableTotal: allTotalAvailable
    };
  }, [stockItems]);

  const isAllSelected = stockItems.length > 0 && stockItems.every(i => i.isSelected);
  const isSomeSelected = stockItems.some(i => i.isSelected);

  // Handle searching
  const handleSearch = async (overrideSingleSku?: string) => {
    const targetSkus: string[] = [];

    if (inputMode === 'SINGLE' || overrideSingleSku) {
      const sku = (overrideSingleSku !== undefined ? overrideSingleSku : singleSkuInput).trim();
      if (!sku) return;
      targetSkus.push(sku);
    } else {
      if (detectedBulkSkus.length === 0) return;
      targetSkus.push(...detectedBulkSkus);
    }

    try {
      setIsSearching(true);
      setSearchPercent(0);
      setSearchProgressMessage('Menghubungi database...');
      setExecutionResult(null);

      const result = await fetchAvailableStockForSkus(targetSkus, (msg, pct) => {
        setSearchProgressMessage(msg);
        setSearchPercent(pct);
      });

      setStockItems(result.items);
      setNotFoundSkus(result.notFoundSkus);
      setHasSearched(true);
    } catch (err: any) {
      console.error('Error in handleSearch:', err);
      alert('Gagal memuat stok: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSearching(false);
    }
  };

  // Row selection handlers
  const handleToggleSelectRow = (id: string) => {
    setStockItems(prev =>
      prev.map(item =>
        item.id === id ? { ...item, isSelected: !item.isSelected } : item
      )
    );
  };

  const handleSelectAll = (select: boolean) => {
    setStockItems(prev =>
      prev.map(item => ({ ...item, isSelected: select }))
    );
  };

  const handleSetMaxAll = () => {
    setStockItems(prev =>
      prev.map(item => ({ ...item, outQty: item.tersedia }))
    );
  };

  const handleOutQtyChange = (id: string, rawVal: string) => {
    const val = parseInt(rawVal, 10);
    setStockItems(prev =>
      prev.map(item => {
        if (item.id !== id) return item;
        if (isNaN(val) || val <= 0) {
          return { ...item, outQty: 0 };
        }
        // Cap to available
        const capped = Math.min(val, item.tersedia);
        return { ...item, outQty: capped };
      })
    );
  };

  // Reset entire search
  const handleReset = () => {
    setStockItems([]);
    setNotFoundSkus([]);
    setHasSearched(false);
    setTableFilter('');
    setExecutionResult(null);
    if (inputMode === 'SINGLE') {
      setSingleSkuInput('');
      singleInputRef.current?.focus();
    } else {
      setBulkSkuInput('');
    }
  };

  // Execute OUT process
  const handleExecuteOut = async () => {
    const validItems = stockItems.filter(i => i.isSelected && Number(i.outQty) > 0);
    if (validItems.length === 0) {
      alert('Pilih setidaknya 1 baris item dengan Qty OUT > 0 untuk diproses.');
      return;
    }

    try {
      setIsConfirmOpen(false);
      setIsExecuting(true);
      setExecProgress({
        percent: 0,
        current: 0,
        total: validItems.length,
        message: 'Memulai proses Penyesuaian Stok OUT...'
      });

      const effectiveUserName =
        authUserName ||
        user?.user_metadata?.full_name ||
        user?.email ||
        userRole ||
        'DevMode Admin';

      const result = await executeAdjustmentStockOut(validItems, {
        userName: effectiveUserName,
        writeMode,
        onProgress: (percent, current, total, message) => {
          setExecProgress({ percent, current, total, message });
        }
      });

      if (result.success) {
        setExecutionResult(result);
        // Remove processed items or update available qty in UI
        setStockItems(prev => {
          return prev
            .map(item => {
              const proc = validItems.find(v => v.id === item.id);
              if (!proc) return item;
              const newTersedia = Math.max(0, item.tersedia - proc.outQty);
              return {
                ...item,
                tersedia: newTersedia,
                outQty: newTersedia,
                isSelected: newTersedia > 0
              };
            })
            .filter(item => item.tersedia > 0); // Keep only remaining with stock
        });

        // Trigger parent refresh callback
        if (onSuccess) {
          onSuccess();
        }
      } else {
        alert(`Gagal: ${result.error || 'Terjadi kesalahan sistem'}`);
      }
    } catch (err: any) {
      console.error('Error executing adjustment out:', err);
      alert('Terjadi kesalahan saat memproses OUT: ' + (err.message || 'Unknown error'));
    } finally {
      setIsExecuting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white border border-amber-300/60 w-full max-w-6xl h-[94vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden relative">

        {/* 1. MODAL HEADER */}
        <div className="px-6 py-4 bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 text-white flex items-center justify-between shadow-md flex-shrink-0">
          <div className="flex items-center space-x-3.5">
            <div className="p-2.5 bg-white/20 rounded-2xl backdrop-blur-sm border border-white/20 shadow-inner">
              <Boxes className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-black tracking-wide">Penyesuaian Stok OUT SKU</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-slate-950/40 text-amber-200 border border-amber-300/30 tracking-widest uppercase">
                  DevMode Khusus
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-950/50 text-rose-200 border border-rose-300/30 tracking-wider">
                  Gudang: PENYESUAIAN STOK OUT
                </span>
              </div>
              <p className="text-xs text-amber-100/90 font-medium mt-0.5">
                Pencarian data SKU (Single / Massal) dengan stok <span className="font-bold underline text-white">tersedia &gt; 0</span> di berbagai rak &amp; langsung eksekusi OUT real-time
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isExecuting}
            className="p-2 hover:bg-white/20 rounded-full transition-colors cursor-pointer text-white/80 hover:text-white disabled:opacity-50"
            title="Tutup Modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 2. BODY CONTAINER */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-50/50">

          {/* INPUT FORM SECTION */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
            {/* Input Mode Toggle Tabs */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 flex-wrap gap-2">
              <div className="flex items-center gap-1.5 p-1 bg-gray-100/80 rounded-xl border border-gray-200/60">
                <button
                  type="button"
                  onClick={() => setInputMode('SINGLE')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition-all ${
                    inputMode === 'SINGLE'
                      ? 'bg-white text-orange-700 shadow-sm border border-gray-200/80'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  <Tag className="w-3.5 h-3.5" />
                  CARI SINGLE SKU
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('BULK')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition-all ${
                    inputMode === 'BULK'
                      ? 'bg-white text-orange-700 shadow-sm border border-gray-200/80'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  <ListPlus className="w-3.5 h-3.5" />
                  CARI MASSAL (BULK PASTE)
                  {detectedBulkSkus.length > 0 && (
                    <span className="px-1.5 py-0.2 text-[10px] bg-orange-100 text-orange-800 rounded-full font-bold">
                      {detectedBulkSkus.length}
                    </span>
                  )}
                </button>
              </div>

              {hasSearched && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all border border-gray-200 hover:border-rose-200 flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reset Form &amp; Hasil
                </button>
              )}
            </div>

            {/* Mode 1: Single SKU Input */}
            {inputMode === 'SINGLE' && (
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                  <span>Nama / Kode SKU Barang</span>
                  <span className="text-[11px] font-normal text-gray-400 normal-case">(Mendukung pencarian nama spesifik atau potongan SKU)</span>
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      ref={singleInputRef}
                      type="text"
                      value={singleSkuInput}
                      onChange={e => setSingleSkuInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSearch();
                        }
                      }}
                      placeholder="Ketik nama SKU barang... contoh: BATERAI ABC, CASING 123..."
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                    />
                    {singleSkuInput && (
                      <button
                        type="button"
                        onClick={() => setSingleSkuInput('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSearch()}
                    disabled={isSearching || !singleSkuInput.trim()}
                    className="px-6 py-3 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 min-w-[150px] justify-center"
                  >
                    {isSearching ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Mencari...
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4" />
                        Cari Stok
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Mode 2: Bulk SKU Input */}
            {inputMode === 'BULK' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                    <span>Paste Daftar Banyak SKU</span>
                    <span className="text-[11px] font-normal text-gray-400 normal-case">(Pisahkan dengan enter / baris baru, koma, atau titik koma)</span>
                  </label>
                  {detectedBulkSkus.length > 0 && (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      {detectedBulkSkus.length} SKU Terdeteksi
                    </span>
                  )}
                </div>
                <textarea
                  rows={4}
                  value={bulkSkuInput}
                  onChange={e => setBulkSkuInput(e.target.value)}
                  placeholder="Paste daftar SKU di sini...&#10;SKU-CONTOH-01&#10;SKU-CONTOH-02&#10;SKU-CONTOH-03"
                  className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 leading-relaxed"
                />
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleSearch()}
                    disabled={isSearching || detectedBulkSkus.length === 0}
                    className="px-6 py-3 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 justify-center"
                  >
                    {isSearching ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Mencari ({searchPercent}%)...
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4" />
                        Cari Stok ({detectedBulkSkus.length} SKU)
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* SUCCESS BANNER POST-EXECUTION */}
          {executionResult && (
            <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl shadow-sm flex items-center justify-between gap-4 animate-in slide-in-from-top-2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500 text-white rounded-xl">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-emerald-900">
                    Penyesuaian Stok OUT Berhasil Dieksekusi!
                  </h4>
                  <p className="text-xs text-emerald-700 font-medium">
                    Telah membuat <strong>{executionResult.insertedLogsCount}</strong> entri log (Gudang: <code>PENYESUAIAN STOK OUT</code>) dengan total potongan <strong>{executionResult.totalQtyOut.toLocaleString()} Qty</strong> pada <strong>{executionResult.processedCount}</strong> lokasi rak.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExecutionResult(null)}
                className="px-3 py-1.5 text-xs font-bold bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-xl"
              >
                Tutup Notifikasi
              </button>
            </div>
          )}

          {/* NOT FOUND WARNING */}
          {notFoundSkus.length > 0 && hasSearched && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-black">{notFoundSkus.length} SKU tidak memiliki stok tersedia (&gt; 0) di rak: </span>
                <span className="font-mono text-[11px] opacity-90">{notFoundSkus.slice(0, 15).join(', ')}{notFoundSkus.length > 15 ? ` dan ${notFoundSkus.length - 15} lainnya` : ''}</span>
              </div>
            </div>
          )}

          {/* PREVIEW TABLE SECTION */}
          {hasSearched && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
              
              {/* Table Top Controls & Summary Bar */}
              <div className="p-4 bg-gradient-to-r from-gray-50 to-amber-50/30 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
                
                {/* Summary Metrics Badges */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="px-3 py-1.5 bg-white border border-gray-200 rounded-xl shadow-xs flex items-center gap-2">
                    <Package className="w-4 h-4 text-orange-600" />
                    <span className="text-xs font-black text-gray-700">
                      {summary.allSkusCount} SKU Ditemukan
                    </span>
                  </div>
                  <div className="px-3 py-1.5 bg-white border border-gray-200 rounded-xl shadow-xs flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-black text-gray-700">
                      {summary.allRowsCount} Baris Rak
                    </span>
                  </div>
                  <div className="px-3 py-1.5 bg-amber-100/70 border border-amber-300/80 rounded-xl shadow-xs flex items-center gap-2">
                    <ArrowDownRight className="w-4 h-4 text-rose-600 font-bold" />
                    <span className="text-xs font-black text-amber-950">
                      Total OUT: <span className="text-rose-600 font-black">{summary.totalOutQty.toLocaleString()}</span> / {summary.allAvailableTotal.toLocaleString()} PCS
                    </span>
                  </div>
                </div>

                {/* Table search & Quick action buttons */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={tableFilter}
                      onChange={e => setTableFilter(e.target.value)}
                      placeholder="Saring hasil tabel..."
                      className="pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 w-48 sm:w-60"
                    />
                  </div>

                  <div className="flex items-center gap-1 border-l border-gray-200 pl-2">
                    <button
                      type="button"
                      onClick={() => handleSelectAll(!isAllSelected)}
                      className="px-2.5 py-1.5 bg-white hover:bg-gray-100 text-gray-700 text-xs font-bold rounded-lg border border-gray-200 transition-all flex items-center gap-1.5"
                    >
                      {isAllSelected ? <CheckSquare className="w-3.5 h-3.5 text-orange-600" /> : <Square className="w-3.5 h-3.5 text-gray-400" />}
                      {isAllSelected ? 'Batal Pilih' : 'Pilih Semua'}
                    </button>
                    <button
                      type="button"
                      onClick={handleSetMaxAll}
                      className="px-2.5 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs font-bold rounded-lg border border-orange-200 transition-all"
                      title="Set Qty OUT ke maksimal stok tersedia untuk semua baris"
                    >
                      Set Max Semua
                    </button>
                  </div>
                </div>
              </div>

              {/* Table Data Container */}
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                {filteredStockItems.length === 0 ? (
                  <div className="py-12 text-center text-gray-400 space-y-2">
                    <AlertCircle className="w-8 h-8 mx-auto text-gray-300" />
                    <p className="text-sm font-semibold">
                      {stockItems.length === 0
                        ? 'Tidak ditemukan stok barang yang tersedia (> 0) untuk SKU yang dicari.'
                        : 'Tidak ada baris yang sesuai dengan filter pencarian tabel.'}
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-100/90 text-gray-700 uppercase font-black tracking-wider text-[10px] sticky top-0 z-10 border-b border-gray-200 shadow-xs">
                      <tr>
                        <th className="p-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={isAllSelected}
                            onChange={e => handleSelectAll(e.target.checked)}
                            className="rounded text-orange-600 focus:ring-orange-500 w-4 h-4 cursor-pointer"
                          />
                        </th>
                        <th className="p-3 w-12 text-center">No</th>
                        <th className="p-3">SKU Barang (Nama Produk)</th>
                        <th className="p-3">Lokasi Rak</th>
                        <th className="p-3">Sub Rak</th>
                        <th className="p-3">Satuan / Packing</th>
                        <th className="p-3 text-right">Stok Tersedia</th>
                        <th className="p-3 text-center w-36">Jumlah OUT (Penyesuaian)</th>
                        <th className="p-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-gray-700">
                      {filteredStockItems.map((item, idx) => {
                        const isRowSelected = item.isSelected;
                        return (
                          <tr
                            key={item.id}
                            className={`transition-colors ${
                              isRowSelected
                                ? 'bg-orange-50/30 hover:bg-orange-50/60'
                                : 'bg-white hover:bg-gray-50 opacity-60'
                            }`}
                          >
                            <td className="p-3 text-center">
                              <input
                                type="checkbox"
                                checked={isRowSelected}
                                onChange={() => handleToggleSelectRow(item.id)}
                                className="rounded text-orange-600 focus:ring-orange-500 w-4 h-4 cursor-pointer"
                              />
                            </td>
                            <td className="p-3 text-center font-bold text-gray-400">
                              {idx + 1}
                            </td>
                            <td className="p-3 font-black text-gray-900">
                              <span className="font-mono text-xs">{item.nama_produk}</span>
                            </td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 font-bold rounded-md border border-blue-200 font-mono text-[11px]">
                                {item.rak}
                              </span>
                            </td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 font-bold rounded-md border border-indigo-200 font-mono text-[11px]">
                                {item.sub_rak || item.rak}
                              </span>
                            </td>
                            <td className="p-3 text-gray-500 font-medium">
                              {item.satuan || 'PCS'} {item.packing ? `(${item.packing})` : ''}
                            </td>
                            <td className="p-3 text-right font-black text-emerald-700 font-mono text-xs">
                              {item.tersedia.toLocaleString()}
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <input
                                  type="number"
                                  min={1}
                                  max={item.tersedia}
                                  value={item.outQty}
                                  disabled={!isRowSelected}
                                  onChange={e => handleOutQtyChange(item.id, e.target.value)}
                                  className="w-20 px-2 py-1 bg-white border border-gray-300 rounded-lg text-center font-bold text-xs text-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-400 disabled:bg-gray-100 disabled:text-gray-400"
                                />
                                <button
                                  type="button"
                                  disabled={!isRowSelected}
                                  onClick={() => handleOutQtyChange(item.id, item.tersedia.toString())}
                                  className="px-1.5 py-1 text-[10px] font-black bg-gray-100 hover:bg-orange-100 text-gray-600 hover:text-orange-700 rounded border border-gray-200 disabled:opacity-40"
                                  title="Maksimal"
                                >
                                  MAX
                                </button>
                              </div>
                            </td>
                            <td className="p-3 text-center">
                              {isRowSelected && item.outQty > 0 ? (
                                <span className="px-2 py-0.5 bg-rose-100 text-rose-800 font-black rounded-full text-[10px] border border-rose-200 inline-flex items-center gap-1">
                                  <ArrowDownRight className="w-3 h-3" />
                                  OUT: {item.outQty}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-gray-100 text-gray-500 font-bold rounded-full text-[10px]">
                                  Dilewati
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

            </div>
          )}

        </div>

        {/* 3. MODAL FOOTER */}
        <div className="px-6 py-4 bg-white border-t border-gray-200 flex items-center justify-between flex-shrink-0 shadow-lg">
          <div className="text-xs text-gray-500 font-medium">
            {hasSearched && (
              <span>
                Dipilih: <strong className="text-gray-900">{summary.selectedRowsCount} baris</strong> ({summary.selectedSkusCount} SKU) | Total OUT: <strong className="text-rose-600 font-bold">{summary.totalOutQty.toLocaleString()} PCS</strong>
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isExecuting}
              className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition-all active:scale-95 disabled:opacity-50"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={() => setIsConfirmOpen(true)}
              disabled={isExecuting || summary.selectedRowsCount === 0 || summary.totalOutQty === 0}
              className="px-6 py-2.5 bg-gradient-to-r from-rose-600 via-red-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 text-white font-black rounded-xl text-xs uppercase tracking-wider shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
            >
              <ArrowDownRight className="w-4 h-4" />
              Eksekusi Penyesuaian Stok OUT ({summary.totalOutQty.toLocaleString()} PCS)
            </button>
          </div>
        </div>

        {/* 4. CONFIRMATION MODAL */}
        {isConfirmOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-rose-200 space-y-4 animate-in zoom-in-95 duration-150">
              <div className="p-3 bg-rose-100 text-rose-700 w-12 h-12 rounded-2xl flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="text-center space-y-1">
                <h3 className="text-base font-black text-gray-900">
                  Konfirmasi Eksekusi Penyesuaian Stok OUT
                </h3>
                <p className="text-xs text-gray-500 font-medium">
                  Apakah Anda yakin ingin memproses transaksi OUT untuk data berikut?
                </p>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-gray-200 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Nama Gudang Log:</span>
                  <span className="font-bold font-mono text-rose-700">PENYESUAIAN STOK OUT</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Jumlah SKU:</span>
                  <span className="font-bold text-gray-900">{summary.selectedSkusCount} SKU</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Baris Rak:</span>
                  <span className="font-bold text-gray-900">{summary.selectedRowsCount} Lokasi Rak</span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-2 text-sm">
                  <span className="font-black text-gray-700">Total Qty OUT:</span>
                  <span className="font-black text-rose-600">{summary.totalOutQty.toLocaleString()} PCS</span>
                </div>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsConfirmOpen(false)}
                  className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition-all"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleExecuteOut}
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-xl text-xs uppercase tracking-wider shadow-md transition-all active:scale-95"
                >
                  Ya, Eksekusi OUT
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 5. EXECUTION PROGRESS OVERLAY */}
        {isExecuting && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-amber-200 space-y-5 text-center">
              <div className="p-3.5 bg-orange-100 text-orange-600 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto animate-bounce">
                <RefreshCw className="w-8 h-8 animate-spin" />
              </div>
              <div>
                <h3 className="text-base font-black text-gray-900">
                  Memproses Penyesuaian Stok OUT...
                </h3>
                <p className="text-xs text-gray-500 font-medium mt-1">
                  {execProgress.message}
                </p>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                  <div
                    className="h-full bg-gradient-to-r from-orange-500 to-rose-600 rounded-full transition-all duration-300"
                    style={{ width: `${execProgress.percent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] font-bold text-gray-500">
                  <span>{execProgress.current} dari {execProgress.total} item</span>
                  <span>{execProgress.percent}%</span>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
