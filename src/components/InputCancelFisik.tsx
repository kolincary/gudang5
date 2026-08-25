import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Building, Download, Upload, FileSpreadsheet, History, Package, TrendingDown, Search, Calendar, X, XCircle, RefreshCw, Loader2, Filter, ChevronLeft, ChevronRight, Trash2, Lock, Copy, CheckSquare, AlertTriangle, FileText, Ban, Layers } from 'lucide-react';
import { verifyPin } from '../lib/pinValidator';
import { Toast } from './ui/Toast';
import { Modal } from './ui/Modal';
import * as XLSX from 'xlsx';

import { useAuth } from '../lib/AuthContext';
import { DatabaseService } from '../lib/DatabaseService';
import { db } from '../lib/firebase';
import { collection, getDocs, onSnapshot, doc, writeBatch, getDoc, increment, deleteField, query, where, deleteDoc } from 'firebase/firestore';

interface StokLantai3Item {
  id: string;
  nama_produk: string;
  qty: number;
  qty_lama_terpakai?: number;
  sudah_so?: boolean;
  satuan: string;
  packing: string;
  rak: string;
  sub_rak: string;
  created_at: string;
  updated_at: string;
}

interface TransaksiLantai3 {
  id: string;
  doc_id: string;
  out_key: 'in' | 'out';
  nama_produk: string;
  qty: number;
  tipe: 'transfer_masuk' | 'pembelian_customer' | 'adjustment' | 'retur' | 'sisa_stok' | 'cancel';
  gudang: string;
  rak: string;
  sub_rak: string;
  keterangan: string;
  tanggal: string;
  waktu: string;
  user_name: string;
  created_at: string;
}

interface PinVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  expectedPin?: string;
  customDescription?: string;
}

function PinVerificationModal({ isOpen, onClose, onSuccess, expectedPin, customDescription }: PinVerificationModalProps) {
  const [pin, setPin] = useState('');
  const [pinMessage, setPinMessage] = useState({ text: '', type: '' });
  const [pinLoading, setPinLoading] = useState(false);
  const pinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setPinMessage({ text: '', type: '' });
      setTimeout(() => {
        if (pinInputRef.current) pinInputRef.current.focus();
      }, 100);
    }
  }, [isOpen]);

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinLoading(true);
    let isValid = false;
    
    if (expectedPin) {
      isValid = pin === expectedPin;
      await new Promise(resolve => setTimeout(resolve, 300));
    } else {
      isValid = await verifyPin(pin);
    }
    
    setPinLoading(false);

    if (isValid) {
      setPinMessage({ text: 'PIN Benar!', type: 'success' });
      setTimeout(() => {
        onSuccess();
        onClose();
        setPinMessage({ text: '', type: '' });
      }, 500);
    } else {
      setPinMessage({ text: 'PIN Salah. Coba lagi.', type: 'error' });
      setPin('');
      if (pinInputRef.current) pinInputRef.current.focus();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Verifikasi PIN Keamanan"
      size="sm"
    >
      <form onSubmit={handlePinSubmit} className="space-y-4">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="h-8 w-8 text-blue-600" />
          </div>
          <p className="text-sm text-gray-600 font-medium">
            {customDescription || 'Masukkan PIN 4-digit untuk melanjutkan aksi ini.'}
          </p>
        </div>

        <div className="relative">
          <input
            ref={pinInputRef}
            type="password"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            className="w-full text-center text-3xl tracking-[1em] font-bold py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-all"
            placeholder="****"
            autoFocus
          />
        </div>

        {pinMessage.text && (
          <div className={`text-center text-sm font-medium p-2 rounded-lg ${pinMessage.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {pinMessage.text}
          </div>
        )}

        <div className="flex space-x-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            className="w-full h-11"
            onClick={onClose}
          >
            Batal
          </Button>
          <Button
            type="submit"
            variant="primary"
            className="w-full h-11"
            disabled={pin.length < 4 || pinLoading}
          >
            {pinLoading ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : 'Konfirmasi'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function InputCancelFisik() {
  // Main Tab State: 'cancel_data' (Tab 1: Kumpulan Data Cancel Fisik) | 'stok_lt3' (Tab 2: Input Stok Lt 3)
  const [mainTab, setMainTab] = useState<'cancel_data' | 'stok_lt3'>('cancel_data');
  
  // StokLantai3 Original States
  const [activeTab, setActiveTab] = useState<'lantai3' | 'bundling'>('lantai3');
  const STOK_COL = activeTab === 'lantai3' ? 'stok_lantai3' : 'stok_bundling';
  const TRX_COL = activeTab === 'lantai3' ? 'transaksi_lantai3' : 'transaksi_bundling';
  
  const [stokData, setStokData] = useState<StokLantai3Item[]>([]);
  const [filteredStok, setFilteredStok] = useState<StokLantai3Item[]>([]);
  const [paginatedStok, setPaginatedStok] = useState<StokLantai3Item[]>([]);
  const [transaksiData, setTransaksiData] = useState<TransaksiLantai3[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showItemHistoryModal, setShowItemHistoryModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<StokLantai3Item | null>(null);
  const [itemHistory, setItemHistory] = useState<TransaksiLantai3[]>([]);
  const [importText, setImportText] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; details?: string[] } | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [transactionType, setTransactionType] = useState<'ORDER' | 'OUTBOUND' | 'RETUR' | 'CANCEL' | 'TRANSFER_MASUK' | 'SISA_STOK' | 'ADJUSTMENT' | ''>('');
  const [importProgress, setImportProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [activeProducts, setActiveProducts] = useState<Map<string, string>>(new Map());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activePackingData, setActivePackingData] = useState<Map<string, string>>(new Map());
  
  // Tab 1 (Cancel Data) Specific States
  const [cancelSearch, setCancelSearch] = useState('');
  const [cancelDateFilter, setCancelDateFilter] = useState('');

  // StokLantai3 Table & Filter States
  const [filters, setFilters] = useState({
    nama_produk: [] as string[],
    qty: [] as number[],
    satuan: [] as string[],
    packing: [] as string[],
    rak: [] as string[],
    sub_rak: [] as string[],
    status: [] as string[],
    sudah_so: [] as string[]
  });
  const [showFilterPopup, setShowFilterPopup] = useState<string | null>(null);
  const [filterSearch, setFilterSearch] = useState('');
  const [tempSelectedFilters, setTempSelectedFilters] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(100);
  const [isDevMode, setIsDevMode] = useState(false);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<Set<string>>(new Set());
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [editHistoryForm, setEditHistoryForm] = useState<{ nama_produk: string, qty: number }>({ nama_produk: '', qty: 0 });
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const { userRole } = useAuth();

  // PIN Modal State
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [pinModalConfig, setPinModalConfig] = useState<{ expectedPin?: string, description?: string }>({});

  const [historySearch, setHistorySearch] = useState('');
  const [historyDateFilter, setHistoryDateFilter] = useState('');
  const [historyTypeFilter, setHistoryTypeFilter] = useState('');
  const [historyKetFilter, setHistoryKetFilter] = useState('');

  const showToast = (message: string, type: 'success' | 'error', details?: string[]) => {
    setToast({ message, type, details });
    setTimeout(() => setToast(null), 5000);
  };

  const handleActionWithPin = (action: () => void, expectedPin?: string, description?: string) => {
    setPendingAction(() => action);
    setPinModalConfig({ expectedPin, description });
    setIsPinModalOpen(true);
  };

  const handlePinSuccess = () => {
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  // Realtime Firestore Subscriptions
  useEffect(() => {
    const unsubStok = onSnapshot(collection(db, STOK_COL), (snapshot) => {
      const data = snapshot.docs.map(docSnap => {
        const docData = docSnap.data();
        return {
          id: docSnap.id,
          nama_produk: docData.nama_produk || docSnap.id.replace(/_/g, '/'),
          qty: docData.qty || 0,
          qty_lama_terpakai: docData.qty_lama_terpakai || 0,
          sudah_so: docData.sudah_so || false,
          satuan: docData.satuan || 'PCS',
          packing: docData.packing || '',
          rak: docData.rak || '',
          sub_rak: docData.sub_rak || '',
          created_at: docData.created_at || new Date().toISOString(),
          updated_at: docData.updated_at || new Date().toISOString()
        } as StokLantai3Item;
      });

      setStokData(data);
      setLoading(false);
    }, (error) => {
      console.error(`Error listening to ${STOK_COL}:`, error);
      showToast('Gagal memuat data stok', 'error');
      setLoading(false);
    });

    const unsubTrx = onSnapshot(collection(db, TRX_COL), (snapshot) => {
      const data = snapshot.docs.map(docSnap => {
        const docData = docSnap.data();
        return {
          id: docSnap.id,
          doc_id: docSnap.id,
          out_key: docData.out_key || 'in',
          nama_produk: docData.nama_produk || '',
          qty: docData.qty || 0,
          tipe: docData.tipe || 'adjustment',
          gudang: docData.gudang || 'Lantai 3',
          rak: docData.rak || '',
          sub_rak: docData.sub_rak || '',
          keterangan: docData.keterangan || '',
          tanggal: docData.tanggal || '',
          waktu: docData.waktu || '',
          user_name: docData.user_name || 'System',
          created_at: docData.created_at || new Date().toISOString()
        } as TransaksiLantai3;
      });

      data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setTransaksiData(data);
    }, (error) => {
      console.error(`Error listening to ${TRX_COL}:`, error);
    });

    return () => {
      unsubStok();
      unsubTrx();
    };
  }, [STOK_COL, TRX_COL]);

  // Cancel Transactions Filtered List (For Tab 1)
  const cancelTransaksiData = useMemo(() => {
    return transaksiData.filter(item => {
      const isCancelType = item.tipe === 'cancel' || item.tipe === 'retur' || item.keterangan.toLowerCase().includes('cancel') || item.keterangan.toLowerCase().includes('retur');
      
      const matchSearch = cancelSearch === '' || 
        item.nama_produk.toLowerCase().includes(cancelSearch.toLowerCase()) ||
        item.keterangan.toLowerCase().includes(cancelSearch.toLowerCase()) ||
        item.user_name.toLowerCase().includes(cancelSearch.toLowerCase()) ||
        item.rak.toLowerCase().includes(cancelSearch.toLowerCase());
      
      const matchDate = cancelDateFilter === '' || item.tanggal === cancelDateFilter;

      return isCancelType && matchSearch && matchDate;
    });
  }, [transaksiData, cancelSearch, cancelDateFilter]);

  // Cancel Summary Metrics
  const cancelMetrics = useMemo(() => {
    const totalQty = cancelTransaksiData.reduce((sum, item) => sum + (item.qty || 0), 0);
    const uniqueSkus = new Set(cancelTransaksiData.map(item => item.nama_produk)).size;
    return {
      totalCount: cancelTransaksiData.length,
      totalQty,
      uniqueSkus
    };
  }, [cancelTransaksiData]);

  // Filtered Stok Data (For Tab 2)
  useEffect(() => {
    let result = [...stokData];

    if (searchQuery.trim()) {
      const queryLower = searchQuery.toLowerCase();
      result = result.filter(item => 
        item.nama_produk.toLowerCase().includes(queryLower) ||
        item.rak.toLowerCase().includes(queryLower) ||
        item.sub_rak.toLowerCase().includes(queryLower)
      );
    }

    setFilteredStok(result);
    setCurrentPage(1);
  }, [searchQuery, stokData]);

  useEffect(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    setPaginatedStok(filteredStok.slice(startIndex, endIndex));
  }, [filteredStok, currentPage, itemsPerPage]);

  // Export Cancel Data to Excel
  const exportCancelToExcel = () => {
    const dataToExport = cancelTransaksiData.map((item, idx) => ({
      No: idx + 1,
      Tanggal: item.tanggal,
      Waktu: item.waktu,
      'Nama Produk / SKU': item.nama_produk,
      Qty: item.qty,
      Rak: item.rak || '-',
      'Sub Rak': item.sub_rak || '-',
      Keterangan: item.keterangan || '-',
      User: item.user_name || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data Cancel Fisik');
    XLSX.writeFile(wb, `Data_Cancel_Fisik_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6 space-y-6">
      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          details={toast.details}
          onClose={() => setToast(null)}
        />
      )}

      {/* PIN Verification Modal */}
      <PinVerificationModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onSuccess={handlePinSuccess}
        expectedPin={pinModalConfig.expectedPin}
        customDescription={pinModalConfig.description}
      />

      {/* Top Header Card */}
      <Card className="rounded-3xl shadow-sm border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 overflow-hidden">
        <CardContent className="p-5 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-tr from-rose-600 to-amber-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-rose-500/20 shrink-0">
                <Ban className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                  Input Cancel Fisik
                </h1>
                <p className="text-xs md:text-sm font-semibold text-gray-500 dark:text-gray-400 mt-0.5">
                  Manajemen Data Cancel Fisik dan Input Stok Lantai 3
                </p>
              </div>
            </div>

            {/* MAIN TAB SWITCHER (Tab 1: Kumpulan Data Cancel Fisik | Tab 2: Input Stok Lt 3) */}
            <div className="flex items-center bg-gray-100 dark:bg-gray-900 p-1.5 rounded-2xl border border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setMainTab('cancel_data')}
                className={`flex items-center gap-2 px-5 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all ${
                  mainTab === 'cancel_data'
                    ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-white/50'
                }`}
              >
                <XCircle className="w-4 h-4" />
                <span>Kumpulan Data Cancel Fisik</span>
                <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] bg-white/20 text-white">
                  {cancelTransaksiData.length}
                </span>
              </button>

              <button
                onClick={() => setMainTab('stok_lt3')}
                className={`flex items-center gap-2 px-5 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all ${
                  mainTab === 'stok_lt3'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-white/50'
                }`}
              >
                <Building className="w-4 h-4" />
                <span>Input Stok Lt 3 & Logika Saat Ini</span>
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ========================================================================= */}
      {/* TAB 1: KUMPULAN DATA CANCEL FISIK */}
      {/* ========================================================================= */}
      {mainTab === 'cancel_data' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Cancel Metrics Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="rounded-2xl border border-rose-100 dark:border-rose-900/30 bg-rose-50/50 dark:bg-rose-950/20">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">Total Catatan Cancel</p>
                  <h3 className="text-3xl font-black text-rose-950 dark:text-rose-200 mt-1">{cancelMetrics.totalCount}</h3>
                </div>
                <div className="w-12 h-12 bg-rose-100 dark:bg-rose-900/50 rounded-2xl flex items-center justify-center text-rose-600">
                  <XCircle className="w-6 h-6" />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border border-amber-100 dark:border-amber-900/30 bg-amber-50/50 dark:bg-amber-950/20">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Total Barang Cancel (Qty)</p>
                  <h3 className="text-3xl font-black text-amber-950 dark:text-amber-200 mt-1">{cancelMetrics.totalQty.toLocaleString()}</h3>
                </div>
                <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/50 rounded-2xl flex items-center justify-center text-amber-600">
                  <Package className="w-6 h-6" />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border border-blue-100 dark:border-blue-900/30 bg-blue-50/50 dark:bg-blue-950/20">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Varian SKU Cancel</p>
                  <h3 className="text-3xl font-black text-blue-950 dark:text-blue-200 mt-1">{cancelMetrics.uniqueSkus}</h3>
                </div>
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/50 rounded-2xl flex items-center justify-center text-blue-600">
                  <Layers className="w-6 h-6" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filter & Controls Card */}
          <Card className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800">
            <CardContent className="p-4 md:p-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3 flex-1">
                  {/* Search Input */}
                  <div className="relative flex-1 min-w-[240px]">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={cancelSearch}
                      onChange={(e) => setCancelSearch(e.target.value)}
                      placeholder="Cari SKU, Nama Produk, Rak, Keterangan..."
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>

                  {/* Date Filter */}
                  <div className="relative">
                    <input
                      type="date"
                      value={cancelDateFilter}
                      onChange={(e) => setCancelDateFilter(e.target.value)}
                      className="px-3.5 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>

                  {cancelDateFilter && (
                    <button
                      onClick={() => setCancelDateFilter('')}
                      className="px-3 py-2 text-xs font-bold text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl"
                    >
                      Reset Tanggal
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={exportCancelToExcel}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl h-11 px-4 flex items-center gap-2 shadow-sm"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export Excel</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cancel Transactions Data Table */}
          <Card className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-rose-50/80 dark:bg-rose-950/40 text-rose-950 dark:text-rose-200 uppercase text-[11px] font-black tracking-wider border-b border-rose-100 dark:border-rose-900/30">
                    <tr>
                      <th className="py-4 px-4 text-center w-12">No</th>
                      <th className="py-4 px-4">Tanggal & Waktu</th>
                      <th className="py-4 px-4">Nama Produk / SKU</th>
                      <th className="py-4 px-4 text-center">Qty Cancel</th>
                      <th className="py-4 px-4">Rak / Sub Rak</th>
                      <th className="py-4 px-4">Keterangan / Alasan</th>
                      <th className="py-4 px-4">Petugas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800 font-medium">
                    {cancelTransaksiData.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-gray-400">
                          <XCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
                          <p className="font-bold">Belum ada data cancel fisik yang tercatat.</p>
                        </td>
                      </tr>
                    ) : (
                      cancelTransaksiData.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-rose-50/30 dark:hover:bg-rose-950/10 transition-colors">
                          <td className="py-3.5 px-4 text-center text-xs text-gray-400 font-bold">{idx + 1}</td>
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-gray-900 dark:text-white text-xs">{item.tanggal}</div>
                            <div className="text-[10px] text-gray-400 font-semibold">{item.waktu || '-'}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-black text-gray-900 dark:text-white text-xs block uppercase">
                              {item.nama_produk}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className="inline-block px-3 py-1 bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 font-black rounded-lg text-xs">
                              {item.qty}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-bold text-gray-700 dark:text-gray-300 text-xs">
                              {item.rak || '-'} {item.sub_rak ? `(${item.sub_rak})` : ''}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-xs text-gray-600 dark:text-gray-400">
                            {item.keterangan || '-'}
                          </td>
                          <td className="py-3.5 px-4 text-xs font-bold text-gray-500">
                            {item.user_name || 'System'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: INPUT STOK LT 3 & LOGIKA SAAT INI (FULL STOK LANTAI 3) */}
      {/* ========================================================================= */}
      {mainTab === 'stok_lt3' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Main Controls Card */}
          <Card className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 shadow-sm">
            <CardContent className="p-4 md:p-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Cari produk, rak, sub-rak di Lantai 3..."
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-500">Total Produk: <strong>{filteredStok.length}</strong></span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stok Table */}
          <Card className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 uppercase text-[11px] font-black tracking-wider border-b border-gray-200 dark:border-gray-800">
                    <tr>
                      <th className="py-4 px-4 text-center w-12">No</th>
                      <th className="py-4 px-4">Nama Produk</th>
                      <th className="py-4 px-4 text-center">Stok Qty</th>
                      <th className="py-4 px-4">Satuan</th>
                      <th className="py-4 px-4">Packing</th>
                      <th className="py-4 px-4">Rak</th>
                      <th className="py-4 px-4">Sub Rak</th>
                      <th className="py-4 px-4 text-center">Status SO</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800 font-medium">
                    {loading ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-gray-400">
                          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-600" />
                          <p className="font-bold text-xs uppercase">Memuat Data Stok Lantai 3...</p>
                        </td>
                      </tr>
                    ) : paginatedStok.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-gray-400">
                          <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                          <p className="font-bold">Tidak ada data stok ditemukan.</p>
                        </td>
                      </tr>
                    ) : (
                      paginatedStok.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-blue-50/30 dark:hover:bg-blue-950/10 transition-colors">
                          <td className="py-3.5 px-4 text-center text-xs text-gray-400 font-bold">
                            {(currentPage - 1) * itemsPerPage + idx + 1}
                          </td>
                          <td className="py-3.5 px-4 font-black text-gray-900 dark:text-white uppercase text-xs">
                            {item.nama_produk}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className={`inline-block px-3 py-1 rounded-lg font-black text-xs ${item.qty > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>
                              {item.qty}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-xs font-bold text-gray-600 dark:text-gray-400">
                            {item.satuan || 'PCS'}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-gray-600 dark:text-gray-400">
                            {item.packing || '-'}
                          </td>
                          <td className="py-3.5 px-4 text-xs font-bold text-gray-800 dark:text-gray-200">
                            {item.rak || '-'}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-gray-600 dark:text-gray-400">
                            {item.sub_rak || '-'}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${item.sudah_so ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                              {item.sudah_so ? 'Sudah SO' : 'Belum SO'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
