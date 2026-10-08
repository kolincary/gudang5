import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { Toast } from './ui/Toast';
import { 
  Flame, 
  RefreshCw, 
  Download, 
  Search, 
  Filter, 
  RotateCcw, 
  Calendar, 
  Package, 
  Building2, 
  MapPin, 
  User, 
  Tag, 
  Check, 
  Copy, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Eye, 
  Database, 
  Layers, 
  Activity,
  FileSpreadsheet,
  AlertCircle,
  HelpCircle,
  X
} from 'lucide-react';
import { collection, getDocs, query, where, orderBy, limit as firestoreLimit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';

export interface FirestoreLogEntry {
  id: string;
  tgl?: string;
  waktu?: string;
  sku?: string;
  jumlah?: number;
  type?: 'IN' | 'OUT' | 'MOVE' | string;
  gudang?: string;
  rak?: string;
  sub_rak?: string;
  tgl_scan?: string;
  user_name?: string;
  user?: string;
  log_update_user?: string;
  keterangan?: string;
  is_adjustment?: boolean;
  status?: string;
  created_at?: string;
  tgl_normalized?: string;
  waktu_normalized?: string;
  matched_log_id?: string | null;
  unique_code?: string | null;
  [key: string]: any;
}

export function FirestoreLog() {
  const [logs, setLogs] = useState<FirestoreLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchedSkuTerm, setSearchedSkuTerm] = useState('');
  
  // Main SKU search input (required before loading)
  const [inputSku, setInputSku] = useState('');

  // Fetch limit option
  const [fetchLimit, setFetchLimit] = useState<number>(1000);

  const [toast, setToast] = useState<{ isOpen: boolean; message: string; type: 'success' | 'error' | 'info' }>({
    isOpen: false,
    message: '',
    type: 'info'
  });

  // In-table secondary filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterTgl, setFilterTgl] = useState('');
  const [filterTglScan, setFilterTglScan] = useState('');
  const [filterGudang, setFilterGudang] = useState('');
  const [filterRak, setFilterRak] = useState('');
  const [filterSubRak, setFilterSubRak] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterAdjustment, setFilterAdjustment] = useState<string>('ALL');

  // Sorting
  const [sortKey, setSortKey] = useState<'tgl' | 'waktu' | 'jumlah' | 'sku' | 'created_at'>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(50);

  // Selection & Detail Modal
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedDocDetail, setSelectedDocDetail] = useState<FirestoreLogEntry | null>(null);

  // Load Data function from Firestore 'stock-lt3' collection
  const handleSearchFirestore = async (customSku?: string) => {
    const rawTarget = (customSku !== undefined ? customSku : inputSku).trim();
    if (!rawTarget) {
      setToast({
        isOpen: true,
        message: 'Ketik SKU terlebih dahulu sebelum memuat data dari Cloud Firestore!',
        type: 'error'
      });
      return;
    }

    setLoading(true);
    setHasSearched(true);
    setSearchedSkuTerm(rawTarget);
    setSelectedIds(new Set());

    try {
      // 1. Kumpulkan daftar kandidat SKU
      const candidateSkus = new Set<string>();
      
      // Jika input memiliki tanda koma atau baris baru (multi-sku)
      if (rawTarget.includes(',') || rawTarget.includes('\n')) {
        rawTarget.split(/[\n,]+/).forEach(s => {
          const trimmed = s.trim().toUpperCase();
          if (trimmed) candidateSkus.add(trimmed);
        });
      } else {
        const upperTarget = rawTarget.toUpperCase();
        candidateSkus.add(upperTarget);
        candidateSkus.add(rawTarget);

        // Cari kemungkinan SKU lengkap dari database stock_items jika user mengetik shorthand/potongan (misal: '209A')
        try {
          const { data: matchedItems } = await supabase
            .from('stock_items')
            .select('nama_produk')
            .ilike('nama_produk', `%${rawTarget}%`)
            .limit(15);

          if (matchedItems && Array.isArray(matchedItems)) {
            matchedItems.forEach(item => {
              if (item.nama_produk) candidateSkus.add(item.nama_produk.trim().toUpperCase());
            });
          }
        } catch (subErr) {
          console.warn('SKU candidate lookup skipped:', subErr);
        }
      }

      const candidateList = Array.from(candidateSkus).slice(0, 30);
      const colRef = collection(db, 'stock-lt3');

      let fetchedDocs: FirestoreLogEntry[] = [];

      // Query ke Firestore
      try {
        let q;
        if (candidateList.length === 1) {
          q = query(
            colRef,
            where('sku', '==', candidateList[0]),
            firestoreLimit(fetchLimit > 0 ? fetchLimit : 1000)
          );
        } else {
          q = query(
            colRef,
            where('sku', 'in', candidateList),
            firestoreLimit(fetchLimit > 0 ? fetchLimit : 1000)
          );
        }

        const snapshot = await getDocs(q);
        fetchedDocs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as FirestoreLogEntry));

      } catch (qErr: any) {
        console.warn('Direct SKU query fallback:', qErr);
        // Fallback exact query
        const fallbackQ = query(
          colRef,
          where('sku', '==', rawTarget),
          firestoreLimit(fetchLimit > 0 ? fetchLimit : 1000)
        );
        const fallbackSnap = await getDocs(fallbackQ);
        fetchedDocs = fallbackSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as FirestoreLogEntry));
      }

      // Sort in memory by created_at / tgl descending
      fetchedDocs.sort((a, b) => {
        const timeA = new Date(a.created_at || a.tgl || '').getTime();
        const timeB = new Date(b.created_at || b.tgl || '').getTime();
        if (!isNaN(timeA) && !isNaN(timeB)) return timeB - timeA;
        return String(b.tgl || '').localeCompare(String(a.tgl || ''));
      });

      setLogs(fetchedDocs);

      if (fetchedDocs.length === 0) {
        setToast({
          isOpen: true,
          message: `Tidak ada data log di Firestore untuk SKU "${rawTarget}".`,
          type: 'info'
        });
      } else {
        setToast({
          isOpen: true,
          message: `Ditemukan ${fetchedDocs.length} transaksi log Firestore untuk SKU "${rawTarget}".`,
          type: 'success'
        });
      }

    } catch (err: any) {
      console.error('Error fetching Firestore logs:', err);
      setToast({
        isOpen: true,
        message: `Gagal memuat log dari Firestore: ${err.message}`,
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle Sort Toggle
  const handleSort = (key: 'tgl' | 'waktu' | 'jumlah' | 'sku' | 'created_at') => {
    if (sortKey === key) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  // Filter & Search Logic
  const filteredLogs = useMemo(() => {
    let result = [...logs];

    // Quick search across fields
    if (searchQuery.trim()) {
      const qLower = searchQuery.toLowerCase().trim();
      result = result.filter(log => {
        return (
          (log.sku || '').toLowerCase().includes(qLower) ||
          (log.id || '').toLowerCase().includes(qLower) ||
          (log.gudang || '').toLowerCase().includes(qLower) ||
          (log.rak || '').toLowerCase().includes(qLower) ||
          (log.sub_rak || '').toLowerCase().includes(qLower) ||
          (log.user_name || log.user || '').toLowerCase().includes(qLower) ||
          (log.tgl || '').toLowerCase().includes(qLower) ||
          (log.tgl_scan || '').toLowerCase().includes(qLower) ||
          (log.log_update_user || '').toLowerCase().includes(qLower) ||
          (log.keterangan || '').toLowerCase().includes(qLower)
        );
      });
    }

    // Type Filter
    if (filterType !== 'ALL') {
      result = result.filter(log => (log.type || '').toUpperCase() === filterType);
    }

    // Tanggal Transaksi Filter
    if (filterTgl.trim()) {
      result = result.filter(log => (log.tgl || '').includes(filterTgl.trim()));
    }

    // Tanggal Scan Filter
    if (filterTglScan.trim()) {
      result = result.filter(log => (log.tgl_scan || '').includes(filterTglScan.trim()));
    }

    // Gudang Filter
    if (filterGudang.trim()) {
      result = result.filter(log => (log.gudang || '').toLowerCase().includes(filterGudang.toLowerCase().trim()));
    }

    // Rak Filter
    if (filterRak.trim()) {
      result = result.filter(log => (log.rak || '').toLowerCase().includes(filterRak.toLowerCase().trim()));
    }

    // Sub Rak Filter
    if (filterSubRak.trim()) {
      result = result.filter(log => (log.sub_rak || '').toLowerCase().includes(filterSubRak.toLowerCase().trim()));
    }

    // User Filter
    if (filterUser.trim()) {
      result = result.filter(log => (log.user_name || log.user || '').toLowerCase().includes(filterUser.toLowerCase().trim()));
    }

    // Adjustment Filter
    if (filterAdjustment !== 'ALL') {
      const isAdj = filterAdjustment === 'TRUE';
      result = result.filter(log => Boolean(log.is_adjustment) === isAdj);
    }

    // Sorting
    result.sort((a, b) => {
      let valA: any = a[sortKey];
      let valB: any = b[sortKey];

      if (sortKey === 'jumlah') {
        valA = Number(valA || 0);
        valB = Number(valB || 0);
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }

      if (sortKey === 'tgl' || sortKey === 'created_at') {
        const timeA = new Date(a.created_at || a.tgl || '').getTime();
        const timeB = new Date(b.created_at || b.tgl || '').getTime();
        if (!isNaN(timeA) && !isNaN(timeB)) {
          return sortDirection === 'asc' ? timeA - timeB : timeB - timeA;
        }
      }

      valA = String(valA || '').toLowerCase();
      valB = String(valB || '').toLowerCase();
      return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });

    return result;
  }, [
    logs,
    searchQuery,
    filterType,
    filterTgl,
    filterTglScan,
    filterGudang,
    filterRak,
    filterSubRak,
    filterUser,
    filterAdjustment,
    sortKey,
    sortDirection
  ]);

  // Statistics calculation
  const stats = useMemo(() => {
    let inCount = 0;
    let inQty = 0;
    let outCount = 0;
    let outQty = 0;
    let moveCount = 0;
    let moveQty = 0;
    let adjCount = 0;

    for (const log of filteredLogs) {
      const type = (log.type || '').toUpperCase();
      const qty = Number(log.jumlah || 0);
      if (type === 'IN') {
        inCount++;
        inQty += qty;
      } else if (type === 'OUT') {
        outCount++;
        outQty += qty;
      } else if (type === 'MOVE') {
        moveCount++;
        moveQty += qty;
      }
      if (log.is_adjustment) adjCount++;
    }

    return {
      totalLogs: filteredLogs.length,
      inCount,
      inQty,
      outCount,
      outQty,
      moveCount,
      moveQty,
      adjCount
    };
  }, [filteredLogs]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / (itemsPerPage || 50)));
  const paginatedLogs = useMemo(() => {
    if (itemsPerPage <= 0) return filteredLogs;
    const start = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(start, start + itemsPerPage);
  }, [filteredLogs, currentPage, itemsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterType, filterTgl, filterTglScan, filterGudang, filterRak, filterSubRak, filterUser, filterAdjustment]);

  // Reset secondary filters
  const handleResetSecondaryFilters = () => {
    setSearchQuery('');
    setFilterType('ALL');
    setFilterTgl('');
    setFilterTglScan('');
    setFilterGudang('');
    setFilterRak('');
    setFilterSubRak('');
    setFilterUser('');
    setFilterAdjustment('ALL');
  };

  // Checkbox handlers
  const handleSelectAll = () => {
    if (selectedIds.size === paginatedLogs.length && paginatedLogs.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedLogs.map(l => l.id)));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Export to Excel
  const handleExportExcel = () => {
    if (filteredLogs.length === 0) {
      setToast({ isOpen: true, message: 'Tidak ada data untuk diexport!', type: 'info' });
      return;
    }

    const dataToExport = filteredLogs.map((log, index) => ({
      No: index + 1,
      ID: log.id,
      Tanggal: log.tgl || '-',
      Waktu: log.waktu || '-',
      SKU: log.sku || '-',
      Jumlah: log.jumlah || 0,
      Type: log.type || '-',
      Gudang: log.gudang || '-',
      Rak: log.rak || '-',
      SubRak: log.sub_rak || '-',
      TglScan: log.tgl_scan || '-',
      User: log.user_name || log.user || '-',
      Penyesuaian: log.is_adjustment ? 'YA' : 'TIDAK',
      Status: log.status || '-',
      LogUpdate: log.log_update_user || log.keterangan || '-',
      CreatedAt: log.created_at || '-'
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Firestore Logs');

    const cleanSku = (searchedSkuTerm || 'All').replace(/[^a-zA-Z0-9_-]/g, '_');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    XLSX.writeFile(workbook, `Firestore_Log_${cleanSku}_${timestamp}.xlsx`);

    setToast({
      isOpen: true,
      message: `Berhasil mengekspor ${dataToExport.length} data Firestore ke Excel!`,
      type: 'success'
    });
  };

  // Copy helper
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setToast({ isOpen: true, message: `${label} berhasil disalin ke clipboard!`, type: 'success' });
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Toast Notification */}
      <Toast
        isOpen={toast.isOpen}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast(prev => ({ ...prev, isOpen: false }))}
      />

      {/* HERO SECTION / BANNER */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-amber-950 to-slate-900 rounded-3xl p-6 sm:p-8 lg:p-10 shadow-2xl border border-amber-500/20">
        <div className="absolute -top-12 -right-12 text-amber-500 opacity-10 pointer-events-none">
          <Flame className="w-72 h-72 lg:w-[420px] lg:h-[420px]" />
        </div>
        <div className="absolute top-1/3 right-1/4 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-3 opacity-90">
              <div className="w-10 h-[2px] bg-amber-400 rounded-full"></div>
              <span className="text-[11px] font-black tracking-[0.3em] text-amber-300 uppercase">
                Cloud Firestore Activity Repository
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight uppercase flex items-center gap-3">
              <span>Firestore</span>
              <span className="text-amber-400 flex items-center gap-2">
                Log <Flame className="w-8 h-8 sm:w-10 sm:h-10 text-amber-400 fill-amber-400 inline" />
              </span>
            </h1>
            <p className="text-amber-100/80 text-xs sm:text-sm font-medium mt-2 leading-relaxed">
              Pencarian terarah log transaksi Cloud Firestore (koleksi <code className="bg-amber-950/80 text-amber-300 px-2 py-0.5 rounded font-mono font-bold text-xs">stock-lt3</code>). Masukkan SKU terlebih dahulu untuk query cepat dan hemat kuota baca.
            </p>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-4">
              <div className="px-3 py-1 bg-white/10 rounded-full backdrop-blur-sm border border-white/10 flex items-center gap-2 text-white">
                <span className="relative flex h-2 w-2">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
                </span>
                <span className="text-[10px] sm:text-[11px] font-black tracking-widest uppercase">
                  Query Sesuai SKU
                </span>
              </div>
              <span className="text-xs text-amber-200/70 font-semibold">
                Database: <strong>stock-lt3</strong>
              </span>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Limit Selector */}
            <select
              value={fetchLimit}
              onChange={(e) => setFetchLimit(Number(e.target.value))}
              disabled={loading}
              className="h-11 px-3 bg-slate-800/90 hover:bg-slate-800 text-white font-bold text-xs rounded-2xl border border-white/20 outline-none cursor-pointer"
              title="Batas dokumen yang diambil dari Firestore"
            >
              <option value="500">Maks 500 Data</option>
              <option value="1000">Maks 1.000 Data</option>
              <option value="2500">Maks 2.500 Data</option>
              <option value="0">Semua Data SKU</option>
            </select>

            {/* Export Excel Button */}
            {logs.length > 0 && (
              <button
                type="button"
                onClick={handleExportExcel}
                className="h-11 px-4 bg-emerald-700 hover:bg-emerald-600 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg transition-all active:scale-95 flex items-center gap-2 border border-emerald-500/40 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Export Excel</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* PRIMARY SKU SEARCH BOX (Ketik dulu SKU-nya) */}
      <Card className="border-2 border-amber-400 shadow-xl rounded-3xl overflow-hidden bg-gradient-to-b from-white to-amber-50/40">
        <CardContent className="p-5 sm:p-7">
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-black uppercase tracking-wider text-amber-700 flex items-center gap-1.5 justify-center sm:justify-start">
                  <Search className="w-4 h-4" /> Langkah Wajib: Masukkan SKU Barang
                </span>
                <p className="text-xs text-slate-500 mt-0.5">
                  Firestore tidak memuat seluruh database secara otomatis untuk mencegah pemborosan kuota baca.
                </p>
              </div>

              {searchedSkuTerm && (
                <div className="flex items-center gap-2 bg-amber-100 text-amber-900 px-3 py-1 rounded-xl text-xs font-bold border border-amber-300">
                  <span>Aktif: <code className="font-mono">{searchedSkuTerm}</code></span>
                  <span className="text-[10px] text-amber-700 font-normal">({logs.length} data)</span>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Package className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-600" />
                <input
                  type="text"
                  value={inputSku}
                  onChange={(e) => setInputSku(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSearchFirestore();
                    }
                  }}
                  placeholder="Ketik SKU / Kode Barang (contoh: CORRECTION-CF-S209A atau 209A)..."
                  className="w-full pl-11 pr-10 py-3.5 bg-white border-2 border-amber-300 rounded-2xl text-sm font-black text-slate-900 placeholder-slate-400 focus:border-amber-500 focus:ring-4 focus:ring-amber-200 outline-none uppercase tracking-wide transition-all shadow-inner"
                />
                {inputSku && (
                  <button
                    type="button"
                    onClick={() => setInputSku('')}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleSearchFirestore()}
                disabled={loading}
                className="py-3.5 px-6 sm:px-8 bg-gradient-to-r from-amber-600 via-orange-600 to-amber-600 hover:from-amber-700 hover:to-orange-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg hover:shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 shrink-0 border border-amber-400"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Mencari di Firestore...</span>
                  </>
                ) : (
                  <>
                    <Flame className="w-4 h-4 fill-white text-white" />
                    <span>CARI DATA FIRESTORE</span>
                  </>
                )}
              </button>
            </div>

            {/* Quick Helper Chips */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 pt-1">
              <span className="font-bold text-[11px] text-slate-400 uppercase">Contoh Cepat:</span>
              <button
                type="button"
                onClick={() => {
                  setInputSku('CORRECTION-CF-S209A');
                  handleSearchFirestore('CORRECTION-CF-S209A');
                }}
                className="px-2.5 py-1 bg-white hover:bg-amber-100 rounded-lg border border-slate-200 hover:border-amber-300 font-mono text-[11px] text-amber-900 transition-colors"
              >
                CORRECTION-CF-S209A
              </button>
              <button
                type="button"
                onClick={() => {
                  setInputSku('BOOK-NB-666');
                  handleSearchFirestore('BOOK-NB-666');
                }}
                className="px-2.5 py-1 bg-white hover:bg-amber-100 rounded-lg border border-slate-200 hover:border-amber-300 font-mono text-[11px] text-amber-900 transition-colors"
              >
                BOOK-NB-666
              </button>
              <button
                type="button"
                onClick={() => {
                  setInputSku('CLIP-260PTL/1DRUM/12PCS');
                  handleSearchFirestore('CLIP-260PTL/1DRUM/12PCS');
                }}
                className="px-2.5 py-1 bg-white hover:bg-amber-100 rounded-lg border border-slate-200 hover:border-amber-300 font-mono text-[11px] text-amber-900 transition-colors"
              >
                CLIP-260PTL/1DRUM/12PCS
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* STATE 1: INITIAL STATE (BELUM KETIK SKU) */}
      {!hasSearched && (
        <Card className="border border-dashed border-amber-300 bg-amber-50/50 rounded-3xl p-10 text-center">
          <div className="max-w-md mx-auto space-y-3">
            <div className="w-16 h-16 rounded-3xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto shadow-inner">
              <Flame className="w-8 h-8 fill-amber-500 text-amber-500" />
            </div>
            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">
              Ketik SKU untuk Menampilkan Log Firestore
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed font-medium">
              Data Cloud Firestore tidak langsung di-load saat halaman dibuka. Silakan masukkan SKU barang di kolom pencarian di atas, lalu tekan <strong>Enter</strong> atau klik tombol <strong>&quot;Cari Data Firestore&quot;</strong>.
            </p>
          </div>
        </Card>
      )}

      {/* STATE 2: SETELAH SEARCH, TAMPILKAN STATS, FILTER DETAIL & TABEL */}
      {hasSearched && (
        <>
          {/* STATS OVERVIEW CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
            <Card className="border-slate-200/80 shadow-xs bg-white rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Total Log Firestore</span>
                  <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                    <Flame className="w-4 h-4" />
                  </div>
                </div>
                <p className="text-2xl font-black text-slate-900 mt-2">
                  {stats.totalLogs.toLocaleString()}
                </p>
                <span className="text-[10px] font-bold text-slate-400">Dokumen Cocok</span>
              </CardContent>
            </Card>

            <Card className="border-emerald-200/80 shadow-xs bg-emerald-50/40 rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-emerald-700">Transaksi IN</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-200 text-emerald-800 uppercase">
                    {stats.inCount} Log
                  </span>
                </div>
                <p className="text-2xl font-black text-emerald-800 mt-2">
                  +{stats.inQty.toLocaleString()}
                </p>
                <span className="text-[10px] font-bold text-emerald-600/90">Total Pcs Masuk</span>
              </CardContent>
            </Card>

            <Card className="border-rose-200/80 shadow-xs bg-rose-50/40 rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-rose-700">Transaksi OUT</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-200 text-rose-800 uppercase">
                    {stats.outCount} Log
                  </span>
                </div>
                <p className="text-2xl font-black text-rose-800 mt-2">
                  -{stats.outQty.toLocaleString()}
                </p>
                <span className="text-[10px] font-bold text-rose-600/90">Total Pcs Keluar</span>
              </CardContent>
            </Card>

            <Card className="border-purple-200/80 shadow-xs bg-purple-50/40 rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-purple-700">Mutasi MOVE</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-200 text-purple-800 uppercase">
                    {stats.moveCount} Log
                  </span>
                </div>
                <p className="text-2xl font-black text-purple-800 mt-2">
                  {stats.moveQty.toLocaleString()}
                </p>
                <span className="text-[10px] font-bold text-purple-600/90">Pcs Pemindahan Rak</span>
              </CardContent>
            </Card>

            <Card className="border-amber-200/80 shadow-xs bg-amber-50/40 rounded-2xl overflow-hidden hover:shadow-md transition-shadow col-span-2 sm:col-span-1">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-amber-800">Penyesuaian</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-200 text-amber-900 uppercase">
                    Adjustment
                  </span>
                </div>
                <p className="text-2xl font-black text-amber-900 mt-2">
                  {stats.adjCount.toLocaleString()}
                </p>
                <span className="text-[10px] font-bold text-amber-700/90">Log Bertanda Penyesuaian</span>
              </CardContent>
            </Card>
          </div>

          {/* SECONDARY FILTER PANEL */}
          <Card className="border-slate-200 shadow-sm rounded-3xl overflow-hidden bg-white">
            <CardContent className="p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                    Saring Hasil Log Dokumen ({filteredLogs.length} dari {logs.length})
                  </span>
                </div>

                {(searchQuery || filterType !== 'ALL' || filterTgl || filterTglScan || filterGudang || filterRak || filterSubRak || filterUser || filterAdjustment !== 'ALL') && (
                  <button
                    type="button"
                    onClick={handleResetSecondaryFilters}
                    className="text-xs text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Filter Kolom</span>
                  </button>
                )}
              </div>

              {/* Quick Search Input */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari dalam hasil (ketik ID Dokumen, Gudang, Rak, User, Keterangan, dll)..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none transition-all"
                />
              </div>

              {/* Detailed Filters Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* Filter Type */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-600 mb-1">
                    Tipe Log
                  </label>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-amber-500 focus:ring-1 focus:ring-amber-200 outline-none cursor-pointer"
                  >
                    <option value="ALL">Semua Tipe</option>
                    <option value="IN">IN (Masuk)</option>
                    <option value="OUT">OUT (Keluar)</option>
                    <option value="MOVE">MOVE (Pemindahan)</option>
                  </select>
                </div>

                {/* Filter Tanggal Transaksi */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-600 mb-1">
                    Tgl Transaksi
                  </label>
                  <input
                    type="text"
                    value={filterTgl}
                    onChange={(e) => setFilterTgl(e.target.value)}
                    placeholder="YYYY-MM-DD"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-amber-500 focus:ring-1 focus:ring-amber-200 outline-none"
                  />
                </div>

                {/* Filter Tanggal Scan */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-600 mb-1">
                    Tgl Scan Masuk
                  </label>
                  <input
                    type="text"
                    value={filterTglScan}
                    onChange={(e) => setFilterTglScan(e.target.value)}
                    placeholder="YYYY-MM-DD"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-amber-500 focus:ring-1 focus:ring-amber-200 outline-none"
                  />
                </div>

                {/* Filter Rak */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-600 mb-1">
                    Lokasi Rak
                  </label>
                  <input
                    type="text"
                    value={filterRak}
                    onChange={(e) => setFilterRak(e.target.value)}
                    placeholder="Contoh: C7, UTAMA"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 uppercase focus:bg-white focus:border-amber-500 focus:ring-1 focus:ring-amber-200 outline-none"
                  />
                </div>

                {/* Filter User */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-600 mb-1">
                    User Pemotong
                  </label>
                  <input
                    type="text"
                    value={filterUser}
                    onChange={(e) => setFilterUser(e.target.value)}
                    placeholder="Email / User..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-amber-500 focus:ring-1 focus:ring-amber-200 outline-none"
                  />
                </div>

                {/* Filter Penyesuaian */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-600 mb-1">
                    Penyesuaian
                  </label>
                  <select
                    value={filterAdjustment}
                    onChange={(e) => setFilterAdjustment(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-amber-500 focus:ring-1 focus:ring-amber-200 outline-none cursor-pointer"
                  >
                    <option value="ALL">Semua</option>
                    <option value="TRUE">Hanya Penyesuaian</option>
                    <option value="FALSE">Bukan Penyesuaian</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* DATA TABLE SECTION */}
          <Card className="border-slate-200 shadow-md rounded-3xl overflow-hidden bg-white">
            {/* Table Toolbar */}
            <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
              <div className="flex items-center gap-3">
                <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                  Menampilkan {paginatedLogs.length} dari {filteredLogs.length} Baris
                </span>
                {selectedIds.size > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-200 text-amber-900 border border-amber-300">
                    {selectedIds.size} Dipilih
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">Baris per halaman:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  className="px-2.5 py-1 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer"
                >
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="250">250</option>
                  <option value="0">Semua</option>
                </select>
              </div>
            </div>

            {/* Desktop View Table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-900 text-white uppercase text-[11px] font-black tracking-wider">
                  <tr>
                    <th className="px-3 py-3 text-center border-r border-slate-800 w-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === paginatedLogs.length && paginatedLogs.length > 0}
                        onChange={handleSelectAll}
                        className="w-3.5 h-3.5 rounded cursor-pointer"
                      />
                    </th>
                    <th 
                      onClick={() => handleSort('tgl')}
                      className="px-4 py-3 text-left border-r border-slate-800 cursor-pointer hover:bg-slate-800 transition-colors select-none"
                    >
                      <div className="flex items-center gap-1">
                        <span>Tgl Transaksi</span>
                        {sortKey === 'tgl' ? (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-400" /> : <ArrowDown className="w-3 h-3 text-amber-400" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('waktu')}
                      className="px-3 py-3 text-center border-r border-slate-800 cursor-pointer hover:bg-slate-800 transition-colors select-none"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Waktu</span>
                        {sortKey === 'waktu' ? (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-400" /> : <ArrowDown className="w-3 h-3 text-amber-400" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('sku')}
                      className="px-4 py-3 text-left border-r border-slate-800 cursor-pointer hover:bg-slate-800 transition-colors select-none"
                    >
                      <div className="flex items-center gap-1">
                        <span>SKU / Nama Barang</span>
                        {sortKey === 'sku' ? (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-400" /> : <ArrowDown className="w-3 h-3 text-amber-400" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('jumlah')}
                      className="px-3 py-3 text-right border-r border-slate-800 cursor-pointer hover:bg-slate-800 transition-colors select-none"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Jumlah</span>
                        {sortKey === 'jumlah' ? (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-400" /> : <ArrowDown className="w-3 h-3 text-amber-400" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                      </div>
                    </th>
                    <th className="px-3 py-3 text-center border-r border-slate-800">Type</th>
                    <th className="px-3 py-3 text-left border-r border-slate-800">Gudang</th>
                    <th className="px-3 py-3 text-left border-r border-slate-800">Rak</th>
                    <th className="px-3 py-3 text-left border-r border-slate-800">Tgl Scan</th>
                    <th className="px-3 py-3 text-left border-r border-slate-800">User</th>
                    <th className="px-3 py-3 text-left border-r border-slate-800">Sub Rak</th>
                    <th className="px-4 py-3 text-left border-r border-slate-800">Log Update / Catatan</th>
                    <th className="px-3 py-3 text-center w-20">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {loading ? (
                    <tr>
                      <td colSpan={13} className="text-center py-16 text-slate-500">
                        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-amber-500 mb-2" />
                        <p className="font-bold">Mengambil dokumen log dari Cloud Firestore...</p>
                      </td>
                    </tr>
                  ) : paginatedLogs.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="text-center py-14 text-slate-500">
                        <Package className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                        <p className="font-black text-sm text-slate-700 uppercase">Tidak Ditemukan Dokumen Firestore</p>
                        <p className="text-xs text-slate-400 mt-1">Coba sesuaikan filter atau cek penulisan SKU.</p>
                      </td>
                    </tr>
                  ) : (
                    paginatedLogs.map((log) => {
                      const isSelected = selectedIds.has(log.id);
                      const typeUpper = (log.type || '').toUpperCase();
                      const isMove = typeUpper === 'MOVE';
                      const isIn = typeUpper === 'IN';
                      const isOut = typeUpper === 'OUT';

                      return (
                        <tr 
                          key={log.id} 
                          className={`hover:bg-amber-50/50 transition-colors ${isSelected ? 'bg-amber-100/60' : ''}`}
                        >
                          <td className="px-3 py-2.5 text-center border-r border-slate-100">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelect(log.id)}
                              className="w-3.5 h-3.5 rounded cursor-pointer"
                            />
                          </td>

                          <td className="px-4 py-2.5 font-bold text-slate-900 border-r border-slate-100 whitespace-nowrap">
                            {log.tgl || '-'}
                          </td>

                          <td className="px-3 py-2.5 text-center font-mono text-slate-600 border-r border-slate-100 whitespace-nowrap">
                            {log.waktu || '-'}
                          </td>

                          <td className="px-4 py-2.5 border-r border-slate-100">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-black text-slate-900 uppercase">
                                {log.sku}
                              </span>
                              {log.is_adjustment && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-black border border-amber-300 uppercase tracking-wider">
                                  PENYESUAIAN
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono block">
                              ID: {log.id}
                            </span>
                          </td>

                          <td className="px-3 py-2.5 text-right font-black border-r border-slate-100 whitespace-nowrap">
                            <span className={isIn ? 'text-emerald-700' : isOut ? 'text-rose-700' : 'text-purple-700'}>
                              {isIn ? '+' : isOut ? '-' : ''}{Number(log.jumlah || 0).toLocaleString()} <span className="text-[10px] font-bold text-slate-400 uppercase">pcs</span>
                            </span>
                          </td>

                          <td className="px-3 py-2.5 text-center border-r border-slate-100 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                              isIn ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                              isOut ? 'bg-rose-100 text-rose-800 border border-rose-300' :
                              'bg-purple-100 text-purple-800 border border-purple-300'
                            }`}>
                              {log.type || '-'}
                            </span>
                          </td>

                          <td className="px-3 py-2.5 font-bold text-slate-700 border-r border-slate-100 whitespace-nowrap">
                            {log.gudang || '-'}
                          </td>

                          <td className="px-3 py-2.5 font-black text-slate-900 border-r border-slate-100 whitespace-nowrap">
                            {log.rak || '-'}
                          </td>

                          <td className="px-3 py-2.5 text-slate-700 border-r border-slate-100 whitespace-nowrap">
                            {log.tgl_scan || '-'}
                          </td>

                          <td className="px-3 py-2.5 text-slate-700 border-r border-slate-100 max-w-[120px] truncate" title={log.user_name || log.user || '-'}>
                            {log.user_name || log.user || '-'}
                          </td>

                          <td className="px-3 py-2.5 text-slate-700 border-r border-slate-100 whitespace-nowrap">
                            {log.sub_rak || '-'}
                          </td>

                          <td className="px-4 py-2.5 text-slate-600 border-r border-slate-100 max-w-[200px] truncate" title={log.log_update_user || log.keterangan || '-'}>
                            {log.log_update_user || log.keterangan || '-'}
                          </td>

                          <td className="px-3 py-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => setSelectedDocDetail(log)}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-800 transition-colors cursor-pointer"
                              title="Lihat Detail Dokumen Firestore"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile View Card List */}
            <div className="lg:hidden divide-y divide-slate-100 p-3 space-y-3">
              {paginatedLogs.map((log) => {
                const typeUpper = (log.type || '').toUpperCase();
                const isIn = typeUpper === 'IN';
                const isOut = typeUpper === 'OUT';

                return (
                  <div 
                    key={log.id} 
                    onClick={() => setSelectedDocDetail(log)}
                    className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 cursor-pointer active:scale-98 transition-transform"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-black text-xs text-slate-900 uppercase">{log.sku}</span>
                        {log.is_adjustment && (
                          <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[9px] font-black border border-amber-300">
                            PENYESUAIAN
                          </span>
                        )}
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        isIn ? 'bg-emerald-100 text-emerald-800' :
                        isOut ? 'bg-rose-100 text-rose-800' :
                        'bg-purple-100 text-purple-800'
                      }`}>
                        {log.type}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-bold">
                        Tgl: {log.tgl || '-'} ({log.waktu || '-'})
                      </span>
                      <span className={`font-black ${isIn ? 'text-emerald-700' : isOut ? 'text-rose-700' : 'text-purple-700'}`}>
                        {isIn ? '+' : isOut ? '-' : ''}{Number(log.jumlah || 0).toLocaleString()} pcs
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-600 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>Rak: <strong>{log.rak || '-'}</strong></span>
                      <span>Tgl Scan: <strong>{log.tgl_scan || '-'}</strong></span>
                      <span>User: <strong>{log.user_name || log.user || '-'}</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Footer */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
                <span className="text-xs font-bold text-slate-500">
                  Halaman {currentPage} dari {totalPages}
                </span>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                  >
                    Awal
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                  >
                    Prev
                  </button>

                  <div className="flex items-center gap-1 px-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum = currentPage - 2 + i;
                      if (pageNum < 1) pageNum = 1 + i;
                      if (pageNum > totalPages) pageNum = totalPages - 4 + i;
                      if (pageNum < 1 || pageNum > totalPages) return null;

                      return (
                        <button
                          key={pageNum}
                          type="button"
                          onClick={() => setCurrentPage(pageNum)}
                          className={`w-7 h-7 text-xs font-black rounded-lg transition-colors cursor-pointer ${
                            currentPage === pageNum
                              ? 'bg-amber-600 text-white shadow-xs'
                              : 'bg-white border border-slate-200 hover:bg-slate-100 text-slate-700'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                  >
                    Next
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                  >
                    Akhir
                  </button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}

      {/* DETAIL DOCUMENT MODAL */}
      <Modal
        isOpen={Boolean(selectedDocDetail)}
        onClose={() => setSelectedDocDetail(null)}
        title="Detail Dokumen Cloud Firestore"
      >
        {selectedDocDetail && (
          <div className="space-y-4">
            <div className="bg-slate-900 text-amber-300 p-4 rounded-2xl flex items-center justify-between border border-amber-500/30">
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 block tracking-widest">
                  ID Dokumen Firestore
                </span>
                <span className="font-mono text-xs font-bold select-all break-all text-white">
                  {selectedDocDetail.id}
                </span>
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(selectedDocDetail.id, 'ID Dokumen')}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer shrink-0 ml-2"
                title="Salin ID Dokumen"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">SKU</span>
                <strong className="text-slate-900 text-sm">{selectedDocDetail.sku || '-'}</strong>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Jumlah / Qty</span>
                <strong className="text-slate-900 text-sm">{selectedDocDetail.jumlah || 0} PCS</strong>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Tipe Mutasi</span>
                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase mt-0.5 ${
                  selectedDocDetail.type === 'IN' ? 'bg-emerald-100 text-emerald-800' :
                  selectedDocDetail.type === 'OUT' ? 'bg-rose-100 text-rose-800' :
                  'bg-purple-100 text-purple-800'
                }`}>
                  {selectedDocDetail.type || '-'}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Penyesuaian</span>
                <strong className={selectedDocDetail.is_adjustment ? 'text-amber-800 font-bold' : 'text-slate-700'}>
                  {selectedDocDetail.is_adjustment ? 'YA (Adjustment)' : 'TIDAK'}
                </strong>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Tanggal Transaksi</span>
                <span className="font-bold text-slate-800">{selectedDocDetail.tgl || '-'} ({selectedDocDetail.waktu || '-'})</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Tanggal Scan Kedatangan</span>
                <span className="font-bold text-slate-800">{selectedDocDetail.tgl_scan || '-'}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Lokasi Rak & Sub Rak</span>
                <span className="font-bold text-slate-800">{selectedDocDetail.rak || '-'} ({selectedDocDetail.sub_rak || '-'})</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">User / Operator</span>
                <span className="font-bold text-slate-800">{selectedDocDetail.user_name || selectedDocDetail.user || '-'}</span>
              </div>
            </div>

            {/* Raw JSON Data Preview */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  Raw JSON Data (Seluruh Field Dokumen)
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(JSON.stringify(selectedDocDetail, null, 2), 'JSON Data')}
                  className="text-[10px] font-black text-amber-700 hover:text-amber-800 flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3 h-3" /> Salin JSON
                </button>
              </div>
              <pre className="p-3 bg-slate-900 text-amber-200 text-[11px] font-mono rounded-xl max-h-56 overflow-auto border border-slate-800">
                {JSON.stringify(selectedDocDetail, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={() => setSelectedDocDetail(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase rounded-xl"
              >
                Tutup
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
