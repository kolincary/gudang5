import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Building, Download, Upload, FileSpreadsheet, History, Package, TrendingDown, Search, Calendar, X, XCircle, RefreshCw, Loader2, Filter, ChevronLeft, ChevronRight, Trash2, Lock, Copy, CheckSquare } from 'lucide-react';
import { verifyPin } from '../lib/pinValidator';
import { Toast } from './ui/Toast';
import { Modal } from './ui/Modal';

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
      // Simulate slight delay for UX
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

export function StokLantai3() {
  const [activeTab, setActiveTab] = useState<'lantai3' | 'bundling'>('lantai3');
  const STOK_COL = activeTab === 'lantai3' ? 'stok_lantai3' : 'stok_bundling';
  const TRX_COL = activeTab === 'lantai3' ? 'transaksi_lantai3' : 'transaksi_bundling';
  const GUDANG_LABEL = activeTab === 'lantai3' ? 'Lantai 3' : 'Bundling';
  const THEME = activeTab === 'lantai3' ? 'blue' : 'indigo';
  const TITLE = activeTab === 'lantai3' ? 'STOK LANTAI 3' : 'STOK BUNDLING';
  const [stokData, setStokData] = useState<StokLantai3Item[]>([]);
  const [filteredStok, setFilteredStok] = useState<StokLantai3Item[]>([]);
  const [paginatedStok, setPaginatedStok] = useState<StokLantai3Item[]>([]);
  const [transaksiData, setTransaksiData] = useState<TransaksiLantai3[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
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
  const { userEmail, userRole } = useAuth();

  // --- PIN PROTECTION STATE ---
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [pinModalConfig, setPinModalConfig] = useState<{ expectedPin?: string, description?: string }>({});

  useEffect(() => {
    if (showImportModal && userRole?.toLowerCase().includes('staf') && userRole?.toLowerCase().includes('gudang')) {
      setTransactionType('SISA_STOK');
    }
  }, [showImportModal, userRole]);

  const [historySearch, setHistorySearch] = useState('');
  const [historyDateFilter, setHistoryDateFilter] = useState('');
  const [historyTypeFilter, setHistoryTypeFilter] = useState('');
  const [historyKetFilter, setHistoryKetFilter] = useState('');
  const [historyLimit, setHistoryLimit] = useState(100);
  const [selectedHistoryMonth, setSelectedHistoryMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const filteredTransaksiData = useMemo(() => {
    return transaksiData.filter(item => {
      const matchSearch = historySearch === '' || 
        item.nama_produk.toLowerCase().includes(historySearch.toLowerCase());
      
      const matchDate = historyDateFilter === '' || item.tanggal === historyDateFilter;
      
      const matchType = historyTypeFilter === '' || item.tipe === historyTypeFilter;
      
      const matchKet = historyKetFilter === '' || item.keterangan.toLowerCase().includes(historyKetFilter.toLowerCase());
      
      return matchSearch && matchDate && matchType && matchKet;
    });
  }, [transaksiData, historySearch, historyDateFilter, historyTypeFilter, historyKetFilter]);

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

  useEffect(() => {
    let keyBuffer = '';
    const secretCode = 'devmode';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.length === 1) {
        keyBuffer += e.key.toLowerCase();
        if (keyBuffer.length > secretCode.length) {
          keyBuffer = keyBuffer.slice(-secretCode.length);
        }
        if (keyBuffer === secretCode) {
          setIsDevMode(prev => !prev);
          keyBuffer = '';
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelectAllProducts = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const allIds = paginatedStok.map(item => item.id);
      setSelectedProductIds(new Set([...selectedProductIds, ...allIds]));
    } else {
      const currentIds = paginatedStok.map(item => item.id);
      const newSelected = new Set(selectedProductIds);
      currentIds.forEach(id => newSelected.delete(id));
      setSelectedProductIds(newSelected);
    }
  };

  const handleSelectProduct = (id: string) => {
    const newSelected = new Set(selectedProductIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedProductIds(newSelected);
  };

  const handleDeleteProduct = async (item: StokLantai3Item) => {
    if (!window.confirm(`DevMode: Hapus nama produk "${item.nama_produk}" dari Stok Lantai 3?`)) return;
    try {
      const stokDocId = item.nama_produk.replace(/\//g, '_');
      await deleteDoc(doc(db, STOK_COL, stokDocId));
      setSelectedProductIds(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      showToast(`Produk "${item.nama_produk}" berhasil dihapus`, 'success');
    } catch (error: any) {
      console.error('Error deleting product:', error);
      showToast(`Gagal menghapus produk: ${error.message}`, 'error');
    }
  };

  const handleBulkDeleteProducts = async () => {
    if (selectedProductIds.size === 0) return;
    const selectedItems = stokData.filter(item => selectedProductIds.has(item.id));
    if (!window.confirm(`DevMode: Hapus ${selectedItems.length} produk terpilih dari Stok Lantai 3?`)) return;

    try {
      const batch = writeBatch(db);
      selectedItems.forEach(item => {
        const stokDocId = item.nama_produk.replace(/\//g, '_');
        batch.delete(doc(db, STOK_COL, stokDocId));
      });
      await batch.commit();
      setSelectedProductIds(new Set());
      showToast(`Berhasil menghapus ${selectedItems.length} produk`, 'success');
    } catch (error: any) {
      console.error('Error bulk deleting products:', error);
      showToast(`Gagal menghapus produk: ${error.message}`, 'error');
    }
  };

  const handleCopySelected = async () => {
    if (selectedProductIds.size === 0) return;
    
    const selectedData = stokData.filter(item => selectedProductIds.has(item.id));
    const textData = selectedData.map(item => `${item.nama_produk}\t${item.qty || 0}`).join('\n');
    
    try {
      await navigator.clipboard.writeText(textData);
      showToast(`${selectedData.length} data berhasil dicopy ke clipboard!`, 'success');
    } catch (err) {
      console.error('Failed to copy text: ', err);
      showToast('Gagal copy data. Silakan coba lagi.', 'error');
    }
  };

  const handleExportSelectedCSV = () => {
    if (selectedProductIds.size === 0) return;
    
    const selectedData = stokData.filter(item => selectedProductIds.has(item.id));
    
    const headers = ['Nama Produk', 'Qty', 'Satuan', 'Packing', 'Rak', 'Sub Rak', 'Status SO'];
    const rows = selectedData.map(item => [
      `"${item.nama_produk}"`,
      item.qty || 0,
      `"${item.satuan || ''}"`,
      `"${item.packing || ''}"`,
      `"${item.rak || ''}"`,
      `"${item.sub_rak || ''}"`,
      item.sudah_so ? 'Sudah SO' : 'Belum SO'
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    link.setAttribute('download', `Export_Selected_${activeTab}_${dateStr}_${timeStr}.csv`);
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const loadActiveProducts = async () => {
    try {
      const cached = localStorage.getItem('cached_active_products');
      if (cached) {
        const parsed = JSON.parse(cached);
        setActiveProducts(new Map(Object.entries(parsed)));
      }
      const allData = await DatabaseService.fetchActiveProducts('supabase');
      console.log(`✅ Loaded ${allData.length} active products`);
      const productMap = new Map<string, string>();
      const objForCache: Record<string, string> = {};
      allData.forEach(product => {
        if (product.sku_code && product.nama) {
          productMap.set(product.sku_code, product.nama);
          objForCache[product.sku_code] = product.nama;
        }
      });
      setActiveProducts(productMap);
      localStorage.setItem('cached_active_products', JSON.stringify(objForCache));
    } catch (error) {
      console.error('Error loading active products:', error);
    }
  };

  const loadActivePackingData = async () => {
    try {
      const cached = localStorage.getItem('cached_active_packing');
      if (cached) {
        const parsed = JSON.parse(cached);
        setActivePackingData(new Map(Object.entries(parsed)));
      }
      // Read packing from Firestore stock_items collection
      const snapshot = await getDocs(collection(db, 'stock_items'));
      const packingMap = new Map<string, string>();
      const objForCache: Record<string, string> = {};
      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (data.nama_produk && data.packing) {
          const currentValue = packingMap.get(data.nama_produk);
          if (!currentValue || data.packing.length > currentValue.length) {
            packingMap.set(data.nama_produk, data.packing);
            objForCache[data.nama_produk] = data.packing;
          }
        }
      });
      console.log(`✅ Loaded ${packingMap.size} unique packing entries from Firestore`);
      setActivePackingData(packingMap);
      localStorage.setItem('cached_active_packing', JSON.stringify(objForCache));
    } catch (error) {
      console.error('Error loading packing data:', error);
    }
  };



  const loadStokData = async (showLoadingState = true) => { /* handled by onSnapshot */ };

  useEffect(() => {
    loadActiveProducts();
    loadActivePackingData();
  }, []);

  useEffect(() => {
    try {
      const cached = localStorage.getItem(`cached_stok_${activeTab}`);
      if (cached) {
        setStokData(JSON.parse(cached));
        setLoading(false); // If cached exists, hide loading immediately
      } else {
        setStokData([]);
        setLoading(true);
      }
    } catch(e) {
      setStokData([]);
      setLoading(true);
    }

    const unsubStok = onSnapshot(collection(db, STOK_COL), (snapshot) => {
      const allData: StokLantai3Item[] = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          nama_produk: data.nama_produk || '',
          qty: data.qty || 0,
          qty_lama_terpakai: data.qty_lama_terpakai || 0,
          sudah_so: data.sudah_so || false,
          satuan: data.satuan || '',
          packing: data.packing || '',
          rak: data.rak || '',
          sub_rak: data.sub_rak || '',
          created_at: data.created_at || '',
          updated_at: data.updated_at || ''
        };
      });
      allData.sort((a, b) => a.nama_produk.localeCompare(b.nama_produk));
      setStokData(allData);
      localStorage.setItem(`cached_stok_${activeTab}`, JSON.stringify(allData));
      setLoading(false);
    }, (error) => {
      console.error('Error loading stok realtime:', error);
      setLoading(false);
    });

    return () => {
      unsubStok();
    };
  }, [activeTab]);

  useEffect(() => {
    filterStokData();
  }, [searchQuery, stokData, filters]);

  useEffect(() => {
    paginateData();
  }, [filteredStok, currentPage, itemsPerPage]);

  useEffect(() => {
    setSelectedProductIds(new Set());
    setCurrentPage(1);
  }, [searchQuery, filters, itemsPerPage]);



  const loadTransaksiData = async (monthVal = selectedHistoryMonth) => {
    try {
      setLoadingHistory(true);
      
      const q = query(collection(db, TRX_COL), where("bulan", "==", monthVal));
      const snapshot = await getDocs(q);
      const formattedData: TransaksiLantai3[] = [];

      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (data.harian) {
          Object.keys(data.harian).forEach(dateKey => {
            const dayData = data.harian[dateKey];
            if (dayData.in && dayData.in > 0) {
              formattedData.push({
                id: `${docSnap.id}_${dateKey}_in`,
                doc_id: docSnap.id,
                out_key: 'in',
                nama_produk: data.nama_produk || '',
                qty: dayData.in,
                tipe: 'transfer_masuk',
                gudang: GUDANG_LABEL,
                rak: '',
                sub_rak: '',
                keterangan: `Masuk dari Gudang Utama`,
                tanggal: dateKey,
                waktu: '',
                user_name: '',
                created_at: data.created_at || ''
              });
            }
            if (dayData.retur && dayData.retur > 0) {
              formattedData.push({
                id: `${docSnap.id}_${dateKey}_retur`,
                doc_id: docSnap.id,
                out_key: 'retur',
                nama_produk: data.nama_produk || '',
                qty: dayData.retur,
                tipe: 'retur',
                gudang: GUDANG_LABEL,
                rak: '',
                sub_rak: '',
                keterangan: `Retur Customer`,
                tanggal: dateKey,
                waktu: '',
                user_name: '',
                created_at: data.created_at || ''
              });
            }
            if (dayData.cancel && dayData.cancel > 0) {
              formattedData.push({
                id: `${docSnap.id}_${dateKey}_cancel`,
                doc_id: docSnap.id,
                out_key: 'retur',
                nama_produk: data.nama_produk || '',
                qty: dayData.cancel,
                tipe: 'cancel',
                gudang: GUDANG_LABEL,
                rak: '',
                sub_rak: '',
                keterangan: `Order Cancel`,
                tanggal: dateKey,
                waktu: '',
                user_name: '',
                created_at: data.created_at || ''
              });
            }
            if (dayData.out && dayData.out > 0) {
              formattedData.push({
                id: `${docSnap.id}_${dateKey}_out`,
                doc_id: docSnap.id,
                out_key: 'out',
                nama_produk: data.nama_produk || '',
                qty: -dayData.out,
                tipe: 'pembelian_customer',
                gudang: GUDANG_LABEL,
                rak: '',
                sub_rak: '',
                keterangan: `Order Keluar`,
                tanggal: dateKey,
                waktu: '',
                user_name: '',
                created_at: data.created_at || ''
              });
            }
            if (dayData.sisa_stok && dayData.sisa_stok > 0) {
              formattedData.push({
                id: `${docSnap.id}_${dateKey}_sisa_stok`,
                doc_id: docSnap.id,
                out_key: 'sisa_stok',
                nama_produk: data.nama_produk || '',
                qty: dayData.sisa_stok,
                tipe: 'sisa_stok',
                gudang: GUDANG_LABEL,
                rak: '',
                sub_rak: '',
                keterangan: `Sisa Stok Awal`,
                tanggal: dateKey,
                waktu: '',
                user_name: '',
                created_at: data.created_at || ''
              });
            }
          });
        }
      });

      // Sort by tanggal descending
      formattedData.sort((a, b) => b.tanggal.localeCompare(a.tanggal));
      setTransaksiData(formattedData);
      console.log(`✅ Loaded ${formattedData.length} transaksi docs from Firestore transaksi_lantai3`);
    } catch (error) {
      console.error('Error loading transaksi data:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const getStatus = (item: StokLantai3Item): string => {
    const aktual = item.qty - (item.qty_lama_terpakai || 0);
    if (aktual < 0) return 'minus';
    if (item.qty === 0 && aktual === 0) return 'habis';
    if (aktual < 10) return 'low';
    return 'tersedia';
  };

  const getStatusLabel = (status: string): string => {
    const labels: Record<string, string> = {
      'minus': 'Minus',
      'habis': 'Habis',
      'low': 'Low',
      'tersedia': 'Tersedia'
    };
    return labels[status] || status;
  };

  const openFilterPopup = (column: keyof typeof filters) => {
    setShowFilterPopup(column);
    setTempSelectedFilters(filters[column] || []);
    setFilterSearch('');
  };

  const closeFilterPopup = () => {
    setShowFilterPopup(null);
  };

  const toggleFilterValue = (value: string | number) => {
    const valStr = String(value);
    setTempSelectedFilters(prev => 
      prev.includes(valStr)
        ? prev.filter(v => v !== valStr)
        : [...prev, valStr]
    );
  };

  const getFilteredOptions = () => {
    if (!showFilterPopup) return [];
    
    // Get unique values for the column
    const uniqueValues = Array.from(new Set(
      stokData.map(item => {
        if (showFilterPopup === 'status') return getStatus(item);
        if (showFilterPopup === 'sudah_so') return item.sudah_so ? 'Sudah SO' : 'Belum SO';
        const val = item[showFilterPopup as keyof StokLantai3Item];
        return val ? String(val) : '';
      })
    )).filter(Boolean).sort();

    if (!filterSearch) return uniqueValues;

    return uniqueValues.filter(val => 
      val.toLowerCase().includes(filterSearch.toLowerCase())
    );
  };

  const handleResetFilters = () => {
    setFilters({
      nama_produk: [],
      qty: [],
      satuan: [],
      packing: [],
      rak: [],
      sub_rak: [],
      status: [],
      sudah_so: []
    });
    setTempSelectedFilters([]);
    setCurrentPage(1);
  };

  const applyFilter = () => {
    if (showFilterPopup) {
      setFilters(prev => ({
        ...prev,
        [showFilterPopup]: tempSelectedFilters
      }));
    }
    closeFilterPopup();
  };

  const hasActiveFilters = () => {
    return Object.values(filters).some(arr => arr.length > 0);
  };

  const getActiveFilterCount = (key: keyof typeof filters) => {
    return filters[key]?.length || 0;
  };

  const filterStokData = () => {
    let filtered = [...stokData];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(item => {
        const namaProduk = (item.nama_produk || '').toLowerCase();
        const rak = (item.rak || '').toLowerCase();
        const subRak = (item.sub_rak || '').toLowerCase();
        return namaProduk.includes(query) || rak.includes(query) || subRak.includes(query);
      });
    }

    if (filters.nama_produk.length > 0) {
      filtered = filtered.filter(item =>
        filters.nama_produk.includes(activeProducts.get(item.nama_produk) || item.nama_produk)
      );
    }

    if (filters.qty.length > 0) {
      filtered = filtered.filter(item => filters.qty.includes(item.qty));
    }

    if (filters.satuan.length > 0) {
      filtered = filtered.filter(item => filters.satuan.includes(item.satuan || ''));
    }

    if (filters.packing.length > 0) {
      filtered = filtered.filter(item => filters.packing.includes(item.packing || ''));
    }

    if (filters.rak.length > 0) {
      filtered = filtered.filter(item => filters.rak.includes(item.rak || ''));
    }

    if (filters.sub_rak.length > 0) {
      filtered = filtered.filter(item => filters.sub_rak.includes(item.sub_rak || ''));
    }

    if (filters.status.length > 0) {
      filtered = filtered.filter(item => filters.status.includes(getStatus(item)));
    }

    if (filters.sudah_so && filters.sudah_so.length > 0) {
      filtered = filtered.filter(item => {
        const val = item.sudah_so ? 'Sudah SO' : 'Belum SO';
        return filters.sudah_so.includes(val);
      });
    }

    setFilteredStok(filtered);
  };

  const paginateData = () => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    setPaginatedStok(filteredStok.slice(startIndex, endIndex));
  };

  const totalPages = Math.ceil(filteredStok.length / itemsPerPage);
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, filteredStok.length);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 7;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 4) {
        for (let i = 1; i <= 5; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 3) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 4; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      }
    }

    return pages;
  };

  const showToast = (message: string, type: 'success' | 'error', details?: string[]) => {
    setToast({ message, type, details });
    if (type === 'success') {
        setTimeout(() => setToast(null), 3000);
    }
  };

  const handleDeleteTargetData = async (targetTab: 'lantai3' | 'bundling') => {
    const colName = targetTab === 'lantai3' ? 'Lantai 3' : 'Bundling';
    if (!confirm(`HAPUS SEMUA DATA (STOK & TRANSAKSI) KHUSUS ${colName.toUpperCase()}? Aksi ini tidak dapat dibatalkan.`)) return;
    
    try {
      setLoading(true);
      const targetStokCol = targetTab === 'lantai3' ? 'stok_lantai3' : 'stok_bundling';
      const targetTrxCol = targetTab === 'lantai3' ? 'transaksi_lantai3' : 'transaksi_bundling';
      
      const stokSnap = await getDocs(collection(db, targetStokCol));
      if (!stokSnap.empty) {
        const batchSize = 50;
        for (let i = 0; i < stokSnap.docs.length; i += batchSize) {
          const chunk = stokSnap.docs.slice(i, i + batchSize);
          const batch = writeBatch(db);
          chunk.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      }

      const trxSnap = await getDocs(collection(db, targetTrxCol));
      if (!trxSnap.empty) {
        const batchSize = 50;
        for (let i = 0; i < trxSnap.docs.length; i += batchSize) {
          const chunk = trxSnap.docs.slice(i, i + batchSize);
          const batch = writeBatch(db);
          chunk.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      }
      
      showToast(`Semua data ${colName} berhasil dihapus!`, 'success');
      if (activeTab === targetTab) {
        loadStokData(true);
        loadTransaksiData();
      }
    } catch (error: any) {
      console.error('Error deleting data:', error);
      showToast(`Gagal menghapus data: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      showToast('Data sudah tersinkronisasi realtime', 'success');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleShowItemHistory = async (item: StokLantai3Item) => {
    setSelectedItem(item);

    try {
      const q = query(collection(db, TRX_COL), where("nama_produk", "==", item.nama_produk));
      const snapshot = await getDocs(q);
      const formattedData: TransaksiLantai3[] = [];

      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (data.nama_produk === item.nama_produk) {
          // Expand the horizontal harian map into individual rows
          const harian = data.harian || {};
          for (const [dateKey, values] of Object.entries(harian)) {
            const dayData = values as { in?: number; out?: number; retur?: number };
            if (dayData.in && dayData.in > 0) {
              formattedData.push({
                id: `${docSnap.id}_${dateKey}_in`,
                nama_produk: data.nama_produk,
                qty: dayData.in,
                tipe: 'transfer_masuk',
                gudang: GUDANG_LABEL,
                rak: '', sub_rak: '',
                keterangan: `Masuk dari Gudang Utama`,
                tanggal: dateKey,
                waktu: '', user_name: '',
                created_at: data.created_at || ''
              });
            }
            if (dayData.retur && dayData.retur > 0) {
              formattedData.push({
                id: `${docSnap.id}_${dateKey}_retur`,
                nama_produk: data.nama_produk,
                qty: dayData.retur,
                tipe: 'retur',
                gudang: GUDANG_LABEL,
                rak: '', sub_rak: '',
                keterangan: `Retur Customer`,
                tanggal: dateKey,
                waktu: '', user_name: '',
                created_at: data.created_at || ''
              });
            }
            if (dayData.cancel && dayData.cancel > 0) {
              formattedData.push({
                id: `${docSnap.id}_${dateKey}_cancel`,
                nama_produk: data.nama_produk,
                qty: dayData.cancel,
                tipe: 'cancel',
                gudang: GUDANG_LABEL,
                rak: '', sub_rak: '',
                keterangan: `Order Cancel`,
                tanggal: dateKey,
                waktu: '', user_name: '',
                created_at: data.created_at || ''
              });
            }
            if (dayData.out && dayData.out > 0) {
              formattedData.push({
                id: `${docSnap.id}_${dateKey}_out`,
                nama_produk: data.nama_produk,
                qty: -dayData.out,
                tipe: 'pembelian_customer',
                gudang: GUDANG_LABEL,
                rak: '', sub_rak: '',
                keterangan: `Order Keluar`,
                tanggal: dateKey,
                waktu: '', user_name: '',
                created_at: data.created_at || ''
              });
            }
            if (dayData.sisa_stok && dayData.sisa_stok > 0) {
              formattedData.push({
                id: `${docSnap.id}_${dateKey}_sisa_stok`,
                nama_produk: data.nama_produk,
                qty: dayData.sisa_stok,
                tipe: 'sisa_stok',
                gudang: GUDANG_LABEL,
                rak: '', sub_rak: '',
                keterangan: `Sisa Stok Awal`,
                tanggal: dateKey,
                waktu: '', user_name: '',
                created_at: data.created_at || ''
              });
            }
          }
        }
      });

      // Sort by date descending
      formattedData.sort((a, b) => b.tanggal.localeCompare(a.tanggal));
      setItemHistory(formattedData);
      setShowItemHistoryModal(true);
    } catch (error) {
      console.error('Error loading item history:', error);
      showToast('Gagal memuat riwayat item', 'error');
    }
  };

  const handleImportData = async () => {
    if (!importText.trim()) {
      showToast('Harap masukkan data untuk diimport', 'error');
      return;
    }

    if (!transactionType) {
      showToast('Harap pilih jenis transaksi', 'error');
      return;
    }

    setIsImporting(true);
    setImportProgress(0);

    try {
      const lines = importText.trim().split('\n');
      const items: { nama_produk: string; qty: number }[] = [];
      const errors: string[] = [];

      lines.forEach((line, index) => {
        const parts = line.split('\t').map(p => p.trim());

        if (parts.length >= 2) {
          let nama_produk = parts[0];
          const qty = parseInt(parts[1]);

          if (!nama_produk) {
            errors.push(`Baris ${index + 1}: Nama produk kosong`);
            return;
          }

          if (isNaN(qty) || qty === 0 || (qty < 0 && transactionType !== 'ADJUSTMENT')) {
            errors.push(`Baris ${index + 1}: Qty tidak valid (${parts[1]})`);
            return;
          }

          items.push({ nama_produk, qty });
        } else {
          errors.push(`Baris ${index + 1}: Format tidak valid`);
        }
      });

      if (errors.length > 0) {
        showToast(`Import gagal: ${errors.length} error ditemukan. Cek console untuk detail.`, 'error');
        console.error('Import errors:', errors);
        setIsImporting(false);
        return;
      }

      if (items.length === 0) {
        showToast('Tidak ada data valid untuk diimport', 'error');
        setIsImporting(false);
        return;
      }

      // Aggregate duplicate SKUs to avoid batch conflicts
      const aggregatedItems = new Map<string, number>();
      items.forEach(item => {
        aggregatedItems.set(item.nama_produk, (aggregatedItems.get(item.nama_produk) || 0) + item.qty);
      });
      const uniqueItems = Array.from(aggregatedItems.entries()).map(([nama_produk, qty]) => ({ nama_produk, qty }));

      const typeConfig = {
        'ORDER': { multiplier: -1, outKey: 'out' as const, label: 'Order Keluar' },
        'OUTBOUND': { multiplier: -1, outKey: 'out' as const, label: 'Stok Keluar Manual' },
        'RETUR': { multiplier: 1, outKey: 'retur' as const, label: 'Retur Customer' },
        'CANCEL': { multiplier: 1, outKey: 'cancel' as const, label: 'Order Cancel' },
        'TRANSFER_MASUK': { multiplier: 1, outKey: 'in' as const, label: 'Transfer Masuk' },
        'SISA_STOK': { multiplier: 1, outKey: 'sisa_stok' as const, label: `Sisa Stok Awal ${GUDANG_LABEL}` },
        'ADJUSTMENT': { multiplier: 1, outKey: 'adjustment' as const, label: 'Penyesuaian Stok' }
      };

      const config = typeConfig[transactionType];
      const now = new Date();
      const dateKey = selectedDate || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const [year, month] = dateKey.split('-');
      const yearMonth = `${year}-${month}`;

      let successCount = 0;
      const skippedItems: string[] = [];

      // Process items in batches for Firestore without getDoc (super fast)
      const chunkSize = 200; // Increased chunk size to reduce network roundtrips (200 * 2 = 400 writes, under 500 limit)
      for (let i = 0; i < uniqueItems.length; i += chunkSize) {
        const chunk = uniqueItems.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        const progress = Math.round(((i + chunk.length) / uniqueItems.length) * 80);
        setImportProgress(progress);

        for (const item of chunk) {
          const stokDocId = item.nama_produk.replace(/\//g, '_');
          const stokRef = doc(db, STOK_COL, stokDocId);
          
          const existingStok = stokData.find(s => s.nama_produk === item.nama_produk);

          if (!existingStok) {
            // SKU not found in Stok Lantai 3 yet
            if (config.multiplier > 0) {
              // RETUR: create new doc with positive qty
              batch.set(stokRef, {
                nama_produk: item.nama_produk,
                qty: item.qty,
                satuan: '', packing: '', rak: '', sub_rak: '',
                sudah_so: transactionType === 'SISA_STOK',
                created_at: now.toISOString(),
                updated_at: now.toISOString()
              });
            } else {
              skippedItems.push(item.nama_produk);
              continue;
            }
          } else {
            const currentQty = existingStok.qty || 0;
            let currentQtyLamaTerpakai = existingStok.qty_lama_terpakai || 0;
            const isSisaStokTransaction = transactionType === 'SISA_STOK';
            const sudahSo = existingStok.sudah_so || isSisaStokTransaction;
            
            let newQty = currentQty;
            
            if (config.multiplier < 0) { // OUT
              const deductAmount = item.qty;
              if (sudahSo) {
                // Jika sudah SO, kita bypass fallback ke nol.
                // Biarkan stok menjadi minus dan qty_lama_terpakai tidak disentuh.
                newQty -= deductAmount;
              } else {
                if (currentQty >= deductAmount) {
                  newQty -= deductAmount;
                } else {
                  newQty = 0;
                  const sisa = deductAmount - currentQty;
                  currentQtyLamaTerpakai += sisa;
                }
              }
            } else { // IN
               newQty += item.qty;
            }

            const stokUpdateData: any = {
              qty: newQty,
              qty_lama_terpakai: currentQtyLamaTerpakai,
              updated_at: now.toISOString()
            };

            if (isSisaStokTransaction) {
              stokUpdateData.sudah_so = true;
              stokUpdateData.qty_lama_terpakai = 0; // RESET stok lama karena sudah fisik pasti aktualnya.
            }

            batch.set(stokRef, stokUpdateData, { merge: true });
          }

          // Update transaksi_lantai3 horizontal map with set + merge
          const trxDocId = `${stokDocId}_${yearMonth}`;
          const trxRef = doc(db, TRX_COL, trxDocId);

          batch.set(trxRef, {
            nama_produk: item.nama_produk,
            bulan: yearMonth,
            [`total_${config.outKey}`]: increment(item.qty),
            harian: {
              [dateKey]: {
                [config.outKey]: increment(item.qty)
              }
            },
            updated_at: now.toISOString()
          }, { merge: true });
          
          successCount++;
        }

        await batch.commit();
      }

      setImportProgress(100);

      if (skippedItems.length > 0) {
        showToast(
          `Import selesai!\n\n✓ ${successCount} produk berhasil diimport\n✗ ${skippedItems.length} produk tidak ditemukan di Stok Lantai 3`,
          successCount > 0 ? 'success' : 'error',
          skippedItems
        );
      } else {
        showToast(`Import berhasil: ${successCount} item diproses`, 'success');
      }

      if (successCount > 0) {
        setImportText('');
        setTransactionType('');
        setShowImportModal(false);
        // Load data asynchronously in the background so the UI doesn't freeze
        Promise.all([
          loadStokData(true),
          loadTransaksiData()
        ]).catch(console.error);
      }
    } catch (error) {
      console.error('Error importing data:', error);
      showToast('Terjadi kesalahan saat import data', 'error');
    } finally {
      setIsImporting(false);
      setImportProgress(0);
    }
  };

  const handleDeleteSelectedHistory = async () => {
    if (selectedHistoryIds.size === 0) return;
    
    if (!window.confirm(`Yakin ingin menghapus ${selectedHistoryIds.size} riwayat transaksi yang dipilih?\n\nSistem juga akan otomatis mengembalikan/menyesuaikan stok barang terkait.`)) {
      return;
    }

    try {
      setLoading(true);
      const batch = writeBatch(db);
      
      const itemsToDelete = transaksiData.filter(t => selectedHistoryIds.has(t.id));
      
      const affectedProducts = new Set<string>();

      // 1. Delete fields in transactions
      for (const item of itemsToDelete) {
        const trxRef = doc(db, TRX_COL, item.doc_id);
        const qtyAbs = Math.abs(item.qty);
        
        batch.update(trxRef, {
          [`total_${item.out_key}`]: increment(-qtyAbs),
          [`harian.${item.tanggal}.${item.out_key}`]: deleteField()
        });

        affectedProducts.add(item.nama_produk);
      }

      // 2. Recalculate stock chronologically for affected products
      for (const nama_produk of affectedProducts) {
        const stokDocId = nama_produk.replace(/\//g, '_');
        const stokRef = doc(db, STOK_COL, stokDocId);

        // Fetch ALL transactions for this product to recalculate stock accurately
        const q = query(collection(db, TRX_COL), where("nama_produk", "==", nama_produk));
        const snap = await getDocs(q);
        const allProductTx: TransaksiLantai3[] = [];
        
        snap.docs.forEach(docSnap => {
          const data = docSnap.data();
          const harian = data.harian || {};
          for (const [dateKey, values] of Object.entries(harian)) {
            const dayData = values as { in?: number; out?: number; retur?: number; sisa_stok?: number };
            if (dayData.in && dayData.in > 0) allProductTx.push({ id: `${docSnap.id}_${dateKey}_in`, out_key: 'in', qty: dayData.in, tanggal: dateKey } as TransaksiLantai3);
            if (dayData.retur && dayData.retur > 0) allProductTx.push({ id: `${docSnap.id}_${dateKey}_retur`, out_key: 'retur', qty: dayData.retur, tanggal: dateKey } as TransaksiLantai3);
            if (dayData.out && dayData.out > 0) allProductTx.push({ id: `${docSnap.id}_${dateKey}_out`, out_key: 'out', qty: -dayData.out, tanggal: dateKey } as TransaksiLantai3);
            if (dayData.sisa_stok && dayData.sisa_stok > 0) allProductTx.push({ id: `${docSnap.id}_${dateKey}_sisa_stok`, out_key: 'sisa_stok', qty: dayData.sisa_stok, tanggal: dateKey } as TransaksiLantai3);
          }
        });

        // Filter out the deleted transactions
        const productTx = allProductTx.filter(t => !selectedHistoryIds.has(t.id));
        
        // Group by date to process chronologically
        const dailyTx = new Map<string, typeof productTx>();
        for (const t of productTx) {
          if (!dailyTx.has(t.tanggal)) dailyTx.set(t.tanggal, []);
          dailyTx.get(t.tanggal)!.push(t);
        }
        
        const sortedDates = Array.from(dailyTx.keys()).sort();
        
        let currentQty = 0;
        let currentTerpakai = 0;
        let sudahSo = false;

        for (const date of sortedDates) {
          const txList = dailyTx.get(date)!;
          
          // 1. INs (transfer_masuk, retur)
          const ins = txList.filter(t => t.out_key === 'in' || t.out_key === 'retur');
          for (const t of ins) {
            currentQty += Math.abs(t.qty);
          }
          
          // 2. SISA_STOK (Stock Opname)
          const sisaStoks = txList.filter(t => t.out_key === 'sisa_stok');
          if (sisaStoks.length > 0) {
            for (const t of sisaStoks) {
               currentQty += Math.abs(t.qty);
            }
            sudahSo = true;
            currentTerpakai = 0;
          }

          // 3. OUTs (pembelian)
          const outs = txList.filter(t => t.out_key === 'out');
          for (const t of outs) {
            const deductAmount = Math.abs(t.qty);
            if (sudahSo) {
              currentQty -= deductAmount;
            } else {
              if (currentQty >= deductAmount) {
                currentQty -= deductAmount;
              } else {
                const sisa = deductAmount - currentQty;
                currentQty = 0;
                currentTerpakai += sisa;
              }
            }
          }
        }

        batch.update(stokRef, {
          qty: currentQty,
          qty_lama_terpakai: currentTerpakai,
          sudah_so: sudahSo,
          updated_at: new Date().toISOString()
        });
      }

      await batch.commit();
      
      setSelectedHistoryIds(new Set());
      showToast(`Berhasil menghapus ${itemsToDelete.length} riwayat transaksi`, 'success');
      
      Promise.all([
        loadStokData(true),
        loadTransaksiData()
      ]).catch(console.error);
    } catch (error) {
      console.error('Error deleting history:', error);
      showToast('Gagal menghapus riwayat transaksi', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEditHistory = (item: TransaksiLantai3) => {
    setEditingHistoryId(item.id);
    setEditHistoryForm({
      nama_produk: item.nama_produk,
      qty: Math.abs(item.qty)
    });
  };

  const handleCancelEditHistory = () => {
    setEditingHistoryId(null);
    setEditHistoryForm({ nama_produk: '', qty: 0 });
  };

  const handleSaveEditHistory = async (oldItem: TransaksiLantai3) => {
    const newQtyAbs = Math.abs(editHistoryForm.qty);
    const newQtySigned = newQtyAbs * (oldItem.qty < 0 ? -1 : 1);
    const newItem = { ...oldItem, nama_produk: editHistoryForm.nama_produk.trim(), qty: newQtySigned };
    
    if (newItem.nama_produk === oldItem.nama_produk && newItem.qty === oldItem.qty) {
      handleCancelEditHistory();
      return;
    }

    if (!newItem.nama_produk) {
      showToast('Nama produk tidak boleh kosong', 'error');
      return;
    }

    if (isNaN(newQtyAbs) || newQtyAbs === 0) {
      showToast('Qty tidak valid', 'error');
      return;
    }

    if (!window.confirm(`Simpan perubahan data riwayat transaksi ini?\nSistem akan otomatis menyesuaikan stok terkait.`)) {
      return;
    }

    try {
      setLoading(true);
      const batch = writeBatch(db);
      const affectedProducts = new Set<string>();

      // Scenario 1: Qty changed, SKU same
      if (newItem.nama_produk === oldItem.nama_produk) {
        const trxRef = doc(db, TRX_COL, oldItem.doc_id);
        const qtyDiff = newQtyAbs - Math.abs(oldItem.qty);

        batch.update(trxRef, {
          [`total_${oldItem.out_key}`]: increment(qtyDiff),
          [`harian.${oldItem.tanggal}.${oldItem.out_key}`]: increment(qtyDiff)
        });
        affectedProducts.add(oldItem.nama_produk);
      } 
      // Scenario 2: SKU changed
      else {
        // 1. Remove from old doc
        const oldTrxRef = doc(db, TRX_COL, oldItem.doc_id);
        const oldQtyAbs = Math.abs(oldItem.qty);
        
        batch.update(oldTrxRef, {
          [`total_${oldItem.out_key}`]: increment(-oldQtyAbs),
          [`harian.${oldItem.tanggal}.${oldItem.out_key}`]: increment(-oldQtyAbs)
        });

        // 2. Add to new doc
        const dateObj = new Date(oldItem.tanggal);
        const yearMonth = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
        const newStokDocId = newItem.nama_produk.replace(/\//g, '_');
        const newTrxDocId = `${newStokDocId}_${yearMonth}`;
        const newTrxRef = doc(db, TRX_COL, newTrxDocId);

        batch.set(newTrxRef, {
          nama_produk: newItem.nama_produk,
          bulan: yearMonth,
          [`total_${newItem.out_key}`]: increment(newQtyAbs),
          harian: {
            [oldItem.tanggal]: {
              [oldItem.out_key]: increment(newQtyAbs)
            }
          },
          updated_at: new Date().toISOString()
        }, { merge: true });

        affectedProducts.add(oldItem.nama_produk);
        affectedProducts.add(newItem.nama_produk);

        // Ensure stok doc exists for new item
        const newStokRef = doc(db, STOK_COL, newStokDocId);
        batch.set(newStokRef, {
          nama_produk: newItem.nama_produk,
          updated_at: new Date().toISOString()
        }, { merge: true });
      }

      await batch.commit();

      // Recalculate stock for affected products
      const recalculateBatch = writeBatch(db);
      for (const nama_produk of affectedProducts) {
        const stokDocId = nama_produk.replace(/\//g, '_');
        const stokRef = doc(db, STOK_COL, stokDocId);

        const q = query(collection(db, TRX_COL), where("nama_produk", "==", nama_produk));
        const snap = await getDocs(q);
        const allProductTx: TransaksiLantai3[] = [];
        
        snap.docs.forEach(docSnap => {
          const data = docSnap.data();
          const harian = data.harian || {};
          for (const [dateKey, values] of Object.entries(harian)) {
            const dayData = values as { in?: number; out?: number; retur?: number; sisa_stok?: number };
            if (dayData.in && dayData.in > 0) allProductTx.push({ id: `${docSnap.id}_${dateKey}_in`, out_key: 'in', qty: dayData.in, tanggal: dateKey } as TransaksiLantai3);
            if (dayData.retur && dayData.retur > 0) allProductTx.push({ id: `${docSnap.id}_${dateKey}_retur`, out_key: 'retur', qty: dayData.retur, tanggal: dateKey } as TransaksiLantai3);
            if (dayData.out && dayData.out > 0) allProductTx.push({ id: `${docSnap.id}_${dateKey}_out`, out_key: 'out', qty: -dayData.out, tanggal: dateKey } as TransaksiLantai3);
            if (dayData.sisa_stok && dayData.sisa_stok > 0) allProductTx.push({ id: `${docSnap.id}_${dateKey}_sisa_stok`, out_key: 'sisa_stok', qty: dayData.sisa_stok, tanggal: dateKey } as TransaksiLantai3);
          }
        });

        const dailyTx = new Map<string, typeof allProductTx>();
        for (const t of allProductTx) {
          if (!dailyTx.has(t.tanggal)) dailyTx.set(t.tanggal, []);
          dailyTx.get(t.tanggal)!.push(t);
        }
        
        const sortedDates = Array.from(dailyTx.keys()).sort();
        
        let currentQty = 0;
        let currentTerpakai = 0;
        let sudahSo = false;

        for (const date of sortedDates) {
          const txList = dailyTx.get(date)!;
          
          const ins = txList.filter(t => t.out_key === 'in' || t.out_key === 'retur');
          for (const t of ins) currentQty += Math.abs(t.qty);
          
          const sisaStoks = txList.filter(t => t.out_key === 'sisa_stok');
          if (sisaStoks.length > 0) {
            for (const t of sisaStoks) currentQty += Math.abs(t.qty);
            sudahSo = true;
            currentTerpakai = 0;
          }

          const outs = txList.filter(t => t.out_key === 'out');
          for (const t of outs) {
            const deductAmount = Math.abs(t.qty);
            if (sudahSo) {
              currentQty -= deductAmount;
            } else {
              if (currentQty >= deductAmount) {
                currentQty -= deductAmount;
              } else {
                const sisa = deductAmount - currentQty;
                currentQty = 0;
                currentTerpakai += sisa;
              }
            }
          }
        }

        recalculateBatch.update(stokRef, {
          qty: currentQty,
          qty_lama_terpakai: currentTerpakai,
          sudah_so: sudahSo,
          updated_at: new Date().toISOString()
        });
      }

      await recalculateBatch.commit();
      handleCancelEditHistory();
      showToast('Perubahan riwayat berhasil disimpan', 'success');
      
      Promise.all([
        loadStokData(true),
        loadTransaksiData()
      ]).catch(console.error);

    } catch (error: any) {
      console.error('Error saving edited history:', error);
      showToast(`Gagal menyimpan: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    const headers = ['Nama Produk', 'Qty', 'Satuan', 'Packing', 'Rak'];
    const csvContent = [
      headers.join(','),
      ...filteredStok.map(item => {
        const displayName = activeProducts.get(item.nama_produk) || item.nama_produk;
        const displayPacking = activePackingData.get(item.nama_produk) || item.packing;
        return [displayName, item.qty, item.satuan, displayPacking, item.rak, item.sub_rak]
          .map(val => `"${val}"`)
          .join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `stok_lantai3_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalStok = stokData.reduce((sum, item) => sum + item.qty, 0);
  const totalProduk = stokData.length;
  const stokMinus = stokData.filter(item => (item.qty - (item.qty_lama_terpakai || 0)) < 0).length;

  return (
    <div className="space-y-6">


      {/* PREMIUM IMMERSIVE HEADER (310px) */}
      <div className="flex flex-col mb-8 lg:mb-12 uppercase">
        <div className={`bg-gradient-to-br transition-all duration-500 ${activeTab === 'lantai3' ? 'from-blue-600 via-blue-700 to-indigo-800' : 'from-indigo-700 via-indigo-800 to-slate-900'} pt-[80px] lg:pt-0 lg:h-[310px] pb-[40px] lg:pb-0 px-6 lg:px-12 rounded-b-[40px] lg:rounded-b-[55px] shadow-2xl shadow-blue-900/20 relative overflow-hidden flex flex-col justify-center`}>
          {/* Decorative Background Icon */}
          <div className="absolute -top-6 -right-6 text-white opacity-5">
            <Building className="w-64 h-64 lg:w-96 lg:h-96" />
          </div>
          {/* Decorative Floating Elements */}
          <div className="absolute top-10 right-10 w-32 h-32 bg-white/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute top-24 left-1/4 w-16 h-16 bg-white/5 border border-white/10 rounded-2xl rotate-[35deg] backdrop-blur-sm hidden lg:block"></div>
          <div className="absolute bottom-10 right-1/3 w-12 h-12 bg-white/10 rounded-full border border-white/20 hidden lg:block"></div>
          <div className="absolute top-1/2 right-20 w-16 h-16 bg-blue-400/20 rounded-3xl -rotate-12 blur-xl hidden lg:block"></div>

          {/* Text Content */}
          <div className="relative z-10 w-full flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 lg:gap-6 uppercase text-left">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 mb-2 lg:mb-3 opacity-90">
                <div className="w-8 h-[2px] bg-white rounded-full"></div>
                <span className="text-[10px] lg:text-[12px] font-black tracking-[0.3em] text-white">Stok Management</span>
              </div>
              <h1 className="text-[34px] lg:text-[54px] font-black text-white tracking-tight leading-[1.1] mb-2 uppercase">
                STOK <span className={activeTab === 'lantai3' ? 'text-blue-200' : 'text-indigo-200'}>{activeTab === 'lantai3' ? 'LANTAI 3' : 'BUNDLING'}</span>
              </h1>
              <div className="text-blue-100/90 font-medium text-[14px] lg:text-[18px] leading-relaxed max-w-[90%] normal-case flex flex-wrap items-center gap-3">
                  <div className="px-3 py-1.5 bg-white/10 rounded-full backdrop-blur-sm border border-white/10 flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    <span className="text-[11px] font-bold tracking-widest uppercase text-white">{totalStok.toLocaleString()} ITEM</span>
                  </div>
                  <span className="text-[13px] lg:text-[16px] text-white/90">Stok transfer dari Lt 5 & pembelian customer.</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="relative z-10 flex flex-wrap gap-2 lg:gap-3 items-center mt-4 lg:mt-0">
              {isDevMode && (
                <>
                  <Button
                    onClick={() => handleDeleteTargetData('lantai3')}
                    className="h-12 px-4 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl shadow-[0_4px_15px_rgba(225,29,72,0.35)] transition-all active:scale-95 flex items-center justify-center gap-2 border border-rose-400/50"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="uppercase text-[10px] font-black">Hapus Lt 3 (Dev)</span>
                  </Button>
                  <Button
                    onClick={() => handleDeleteTargetData('bundling')}
                    className="h-12 px-4 bg-indigo-800 hover:bg-indigo-900 text-white font-black rounded-xl shadow-[0_4px_15px_rgba(55,48,163,0.35)] transition-all active:scale-95 flex items-center justify-center gap-2 border border-indigo-500/50"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="uppercase text-[10px] font-black">Hapus Bundling (Dev)</span>
                  </Button>
                </>
              )}
              <Button
                onClick={handleRefresh}
                disabled={isRefreshing || loading}
                className="h-12 px-6 bg-white hover:bg-blue-50 text-blue-700 font-black rounded-2xl shadow-[0_8px_25px_rgba(255,255,255,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2.5 border-none disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing || loading ? 'animate-spin' : ''}`} />
                <span className="uppercase text-xs font-black">Refresh Data</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Stok</p>
                <p className="text-3xl font-bold text-gray-800">{totalStok.toLocaleString()}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Package className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Produk</p>
                <p className="text-3xl font-bold text-gray-800">{totalProduk.toLocaleString()}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <FileSpreadsheet className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Stok Minus</p>
                <p className="text-3xl font-bold text-red-600">{stokMinus.toLocaleString()}</p>
              </div>
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <TrendingDown className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* TAB NAVIGATION */}
      <div className="flex space-x-4 mb-2 bg-gray-100/50 p-2 rounded-xl border border-gray-200/60">
        <button 
          onClick={() => setActiveTab('lantai3')}
          className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all duration-300 shadow-sm border-b-4 flex items-center justify-center gap-2
            ${activeTab === 'lantai3' 
              ? 'bg-blue-600 text-white border-blue-800 scale-100 ring-2 ring-blue-600/20' 
              : 'bg-white text-gray-600 border-gray-300 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 opacity-90 scale-[0.98]'
            }`}
        >
          <Package className="w-4 h-4" />
          STOK LANTAI 3
        </button>
        <button 
          onClick={() => setActiveTab('bundling')}
          className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all duration-300 shadow-sm border-b-4 flex items-center justify-center gap-2
            ${activeTab === 'bundling' 
              ? 'bg-indigo-700 text-white border-indigo-900 scale-100 ring-2 ring-indigo-700/20' 
              : 'bg-white text-gray-600 border-gray-300 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 opacity-90 scale-[0.98]'
            }`}
        >
          <Package className="w-4 h-4" />
          STOK BUNDLING
        </button>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Cari produk, rak, atau lokasi..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  title="Clear pencarian"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {hasActiveFilters() && (
                <Button
                  onClick={handleResetFilters}
                  className="bg-orange-600 hover:bg-orange-700 text-white"
                >
                  <X className="h-4 w-4 mr-2" />
                  Reset Filter
                </Button>
              )}
              <Button
                onClick={() => setShowImportModal(true)}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Upload className="h-4 w-4 mr-2" />{activeTab === 'lantai3' ? 'Import Order Keluar' : 'Import Stok Bundling'}</Button>
              <Button
                onClick={() => handleActionWithPin(handleExportCSV)}
                variant="secondary"
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button
                onClick={() => {
                  setSelectedHistoryMonth('');
                  setTransaksiData([]);
                  setShowHistoryModal(true);
                }}
                variant="secondary"
              >
                <History className="h-4 w-4 mr-2" />
                Riwayat Transaksi
              </Button>
            </div>
          </div>

          {selectedProductIds.size > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-6 flex flex-wrap items-center justify-between gap-4 shadow-sm animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center text-blue-800 font-medium px-2">
                <CheckSquare className="h-5 w-5 mr-2 text-blue-600" />
                {selectedProductIds.size} produk terpilih
              </div>
              <div className="flex gap-2">
                {isDevMode && (
                  <Button onClick={handleBulkDeleteProducts} className="bg-red-600 hover:bg-red-700 text-white shadow-sm" title="Dev Mode: Hapus produk terpilih dari database">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Hapus Terpilih
                  </Button>
                )}
                <Button onClick={handleCopySelected} className="bg-white hover:bg-blue-100 text-blue-700 border border-blue-300 shadow-sm">
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Data
                </Button>
                <Button onClick={handleExportSelectedCSV} className="bg-white hover:bg-blue-100 text-blue-700 border border-blue-300 shadow-sm">
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV Terpilih
                </Button>
                <Button onClick={() => setSelectedProductIds(new Set())} variant="secondary" className="text-gray-500 hover:text-gray-700">
                  <X className="h-4 w-4 mr-1" />
                  Batal
                </Button>
              </div>
            </div>
          )}

          {filteredStok.length === 0 && !loading ? (
            <div className="text-center py-12">
              <Package className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">
                {searchQuery ? 'Tidak ada data yang sesuai dengan pencarian' : 'Belum ada data stok lantai 3'}
              </p>
            </div>
          ) : (
            <>
            <div className="overflow-x-auto relative min-h-[300px]">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 w-10">
                      <div className="flex items-center justify-center">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          checked={paginatedStok.length > 0 && paginatedStok.every(item => selectedProductIds.has(item.id))}
                          onChange={handleSelectAllProducts}
                          title="Pilih Semua di Halaman Ini"
                        />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <div className="flex items-center justify-between">
                        <span>Nama Produk (Status: Aktif)</span>
                        <button
                          onClick={() => openFilterPopup('nama_produk')}
                          className={`ml-2 p-1 rounded hover:bg-gray-200 relative ${
                            getActiveFilterCount('nama_produk') > 0 ? 'text-blue-600' : 'text-gray-400'
                          }`}
                        >
                          <Filter className="h-4 w-4" />
                          {getActiveFilterCount('nama_produk') > 0 && (
                            <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                              {getActiveFilterCount('nama_produk')}
                            </span>
                          )}
                        </button>
                      </div>
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <div className="flex items-center justify-center">
                        <span>SO</span>
                        <button
                          onClick={() => openFilterPopup('sudah_so')}
                          className={`ml-2 p-1 rounded hover:bg-gray-200 relative ${
                            getActiveFilterCount('sudah_so') > 0 ? 'text-blue-600' : 'text-gray-400'
                          }`}
                        >
                          <Filter className="h-4 w-4" />
                          {getActiveFilterCount('sudah_so') > 0 && (
                            <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                              {getActiveFilterCount('sudah_so')}
                            </span>
                          )}
                        </button>
                      </div>
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <div className="flex flex-col items-center justify-center gap-1">
                        <div className="flex items-center justify-center">
                          <span>Stok Realtime (Baru)</span>
                          <button
                            onClick={() => openFilterPopup('qty')}
                            className={`ml-2 p-1 rounded hover:bg-gray-200 relative ${
                              getActiveFilterCount('qty') > 0 ? 'text-blue-600' : 'text-gray-400'
                            }`}
                          >
                            <Filter className="h-4 w-4" />
                            {getActiveFilterCount('qty') > 0 && (
                              <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                                {getActiveFilterCount('qty')}
                              </span>
                            )}
                          </button>
                        </div>
                      </div>
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <div className="flex items-center justify-center">
                        <span>Stok Lama Terpakai</span>
                      </div>
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-blue-600 uppercase tracking-wider">
                      <div className="flex items-center justify-center">
                        <span>Stok Aktual</span>
                      </div>
                    </th>
{/* Satuan column hidden as requested */}
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <div className="flex items-center justify-center">
                        <span>Packing</span>
                        <button
                          onClick={() => openFilterPopup('packing')}
                          className={`ml-2 p-1 rounded hover:bg-gray-200 relative ${
                            getActiveFilterCount('packing') > 0 ? 'text-blue-600' : 'text-gray-400'
                          }`}
                        >
                          <Filter className="h-4 w-4" />
                          {getActiveFilterCount('packing') > 0 && (
                            <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                              {getActiveFilterCount('packing')}
                            </span>
                          )}
                        </button>
                      </div>
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <div className="flex items-center justify-center">
                        <span>Rak</span>
                        <button
                          onClick={() => openFilterPopup('rak')}
                          className={`ml-2 p-1 rounded hover:bg-gray-200 relative ${
                            getActiveFilterCount('rak') > 0 ? 'text-blue-600' : 'text-gray-400'
                          }`}
                        >
                          <Filter className="h-4 w-4" />
                          {getActiveFilterCount('rak') > 0 && (
                            <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                              {getActiveFilterCount('rak')}
                            </span>
                          )}
                        </button>
                      </div>
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <div className="flex items-center justify-center">
                        <span>Status</span>
                        <button
                          onClick={() => openFilterPopup('status')}
                          className={`ml-2 p-1 rounded hover:bg-gray-200 relative ${
                            getActiveFilterCount('status') > 0 ? 'text-blue-600' : 'text-gray-400'
                          }`}
                        >
                          <Filter className="h-4 w-4" />
                          {getActiveFilterCount('status') > 0 && (
                            <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                              {getActiveFilterCount('status')}
                            </span>
                          )}
                        </button>
                      </div>
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedStok.map((item, index) => {
                    const isSelected = selectedProductIds.has(item.id);
                    return (
                    <tr key={item.id} className={`hover:bg-gray-50 ${isSelected ? 'bg-blue-50/60' : ''}`}>
                      <td className="px-4 py-3 w-10">
                        <div className="flex items-center justify-center">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            checked={isSelected}
                            onChange={() => handleSelectProduct(item.id)}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">{(currentPage - 1) * itemsPerPage + index + 1}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {activeProducts.get(item.nama_produk) || item.nama_produk}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {item.sudah_so ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200" title="Sudah dilakukan Sisa Stok (Stok Opname)">
                            ✅ SO
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs italic">-</span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-sm text-center font-semibold ${item.qty < 0 ? 'text-red-600' : item.qty === 0 ? 'text-gray-500' : 'text-green-600'}`}>
                        {item.qty.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-center font-medium text-orange-600">
                        {(item.qty_lama_terpakai || 0).toLocaleString()}
                      </td>
                      <td className={`px-4 py-3 text-sm text-center font-bold ${item.qty - (item.qty_lama_terpakai || 0) < 0 ? 'text-red-600' : 'text-blue-600'}`}>
                        {(item.qty - (item.qty_lama_terpakai || 0)).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 text-center">{activePackingData.get(item.nama_produk) || item.packing}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 text-center">{item.rak}</td>
                      <td className="px-4 py-3 text-center">
                        {(item.qty - (item.qty_lama_terpakai || 0)) < 0 ? (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">Minus</span>
                        ) : item.qty === 0 && (item.qty - (item.qty_lama_terpakai || 0)) === 0 ? (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">Habis</span>
                        ) : (item.qty - (item.qty_lama_terpakai || 0)) < 10 ? (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">Low</span>
                        ) : (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Tersedia</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            onClick={() => handleShowItemHistory(item)}
                            variant="secondary"
                            className="px-3 py-1.5 text-xs font-medium"
                          >
                            <History className="h-3 w-3 mr-1.5" />
                            Riwayat
                          </Button>
                          {isDevMode && (
                            <>
                              <Button
                                onClick={() => handleTandaiKosong(item)}
                                variant="secondary"
                                className="px-3 py-1.5 text-xs font-medium bg-red-50 hover:bg-red-100 text-red-600 border border-red-200"
                                title="Tandai stok fisik benar-benar kosong"
                              >
                                <XCircle className="h-3 w-3 mr-1.5" />
                                Kosong
                              </Button>
                              <Button
                                onClick={() => handleDeleteProduct(item)}
                                variant="secondary"
                                className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white border border-red-600"
                                title="Dev Mode: Hapus nama produk ini dari database"
                              >
                                <Trash2 className="h-3 w-3 mr-1.5" />
                                Hapus
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredStok.length > 0 && (
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t pt-4">
                <div className="flex items-center gap-4">
                  <p className="text-sm text-gray-600">
                    Menampilkan <span className="font-semibold">{startItem}</span> - <span className="font-semibold">{endItem}</span> dari <span className="font-semibold">{filteredStok.length}</span> data
                  </p>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => setItemsPerPage(Number(e.target.value))}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                    <option value={500}>500</option>
                    <option value={1000}>1000</option>
                    <option value={filteredStok.length}>Tampilkan Semua</option>
                  </select>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      variant="secondary"
                      className="px-3 py-2"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>

                    {getPageNumbers().map((page, index) => (
                      typeof page === 'number' ? (
                        <Button
                          key={index}
                          onClick={() => handlePageChange(page)}
                          variant={currentPage === page ? 'default' : 'secondary'}
                          className={`px-4 py-2 ${
                            currentPage === page
                              ? 'bg-blue-600 text-white hover:bg-blue-700'
                              : ''
                          }`}
                        >
                          {page}
                        </Button>
                      ) : (
                        <span key={index} className="px-2 text-gray-500">...</span>
                      )
                    ))}

                    <Button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      variant="secondary"
                      className="px-3 py-2"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}
            </>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="Import Order Keluar"
        size="2xl"
      >
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-blue-900 mb-2">Cara Import:</h4>
            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
              <li>Pilih jenis transaksi terlebih dahulu</li>
              <li>Copy data dari Excel dengan format: Kolom A (Nama Produk), Kolom B (Qty)</li>
              <li><strong className="text-red-600">TIDAK PERLU konversi box dan pcs, biarkan terpisah (1 baris box, 1 baris pcs) sesuai apa adanya di Excel.</strong></li>
              <li>Paste data ke textarea di bawah</li>
              <li>Pastikan nama produk sama persis dengan nama di tabel Stok Lantai 3</li>
              <li><strong className="text-blue-600">Data dengan nama produk/SKU yang sama akan otomatis di-subtotal (dijumlahkan) qty-nya saat diimpor.</strong></li>
            </ol>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tanggal Transaksi
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              onClick={(e) => {
                e.currentTarget.showPicker?.();
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.currentTarget.showPicker?.();
              }}
              onKeyDown={(e) => e.preventDefault()}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer select-none caret-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Jenis Transaksi <span className="text-red-500">*</span>
            </label>
            <select
              value={transactionType}
              onChange={(e) => setTransactionType(e.target.value as 'ORDER' | 'OUTBOUND' | 'RETUR' | 'CANCEL' | 'TRANSFER_MASUK' | 'SISA_STOK' | 'ADJUSTMENT' | '')}
              className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${userRole?.toLowerCase().includes('staf') && userRole?.toLowerCase().includes('gudang') ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              disabled={userRole?.toLowerCase().includes('staf') && userRole?.toLowerCase().includes('gudang')}
            >
              {userRole?.toLowerCase().includes('staf') && userRole?.toLowerCase().includes('gudang') ? (
                <option value="SISA_STOK">SISA STOK - Input Sisa Stok Awal {GUDANG_LABEL} (Stok Masuk)</option>
              ) : (
                <>
                  <option value="">-- Pilih Jenis Transaksi --</option>
                  <option value="ORDER">ORDER - Pembelian Customer (Stok Keluar)</option>
                  <option value="OUTBOUND">OUTBOUND - Keluar Manual / Sample / Non-Bon (Stok Keluar)</option>
                  <option value="CANCEL">CANCEL - Order Cancel / Batal (Stok Masuk / Kembalikan Stok)</option>
                  <option value="TRANSFER_MASUK">TRANSFER MASUK - Stok Masuk dari Gudang Utama</option>
                  <option value="RETUR">RETUR - Retur dari Customer (Stok Masuk)</option>
                  <option value="SISA_STOK">SISA STOK - Input Sisa Stok Awal {GUDANG_LABEL} (Stok Masuk)</option>
                  <option value="ADJUSTMENT">ADJUSTMENT - Penyesuaian Stok / Selisih (Penyesuaian)</option>
                </>
              )}
            </select>
            {transactionType && (
              <p className="mt-2 text-sm text-gray-600">
                {transactionType === 'ORDER' && '📦 Stok akan berkurang (pembelian customer dari marketplace)'}
                {transactionType === 'OUTBOUND' && '📤 Stok akan berkurang (sample kantor / non-bon / keperluan lain)'}
                {transactionType === 'CANCEL' && '↺ Stok akan bertambah (pembatalan order customer, stok dikembalikan)'}
                {transactionType === 'RETUR' && '📥 Stok akan bertambah (retur dari customer yang ditolak/dikembalikan)'}
                {transactionType === 'SISA_STOK' && '📥 Stok akan bertambah (Input stok awal lantai 3 ke sistem)'}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Data Excel (Paste di sini)
            </label>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Paste data dari Excel di sini...&#10;Contoh:&#10;Produk A&#9;100&#10;Produk B&#9;50"
              rows={12}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
            />
          </div>

          {isImporting && (
            <div className="space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-blue-900">Memproses Import...</span>
                  <span className="text-sm font-semibold text-blue-900">{importProgress}%</span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-blue-600 h-full transition-all duration-300 ease-out flex items-center justify-end"
                    style={{ width: `${importProgress}%` }}
                  >
                    <div className="w-2 h-2 bg-white rounded-full mr-1 animate-pulse"></div>
                  </div>
                </div>
                <p className="text-xs text-blue-700 mt-2">Mohon tunggu, sedang menyimpan data ke database...</p>
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              onClick={() => setShowImportModal(false)}
              variant="secondary"
              disabled={isImporting}
            >
              Batal
            </Button>
            <Button
              onClick={handleImportData}
              className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isImporting}
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Memproses...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Import Data
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showItemHistoryModal}
        onClose={() => setShowItemHistoryModal(false)}
        title={`Riwayat Transaksi: ${selectedItem?.nama_produk || ''}`}
        size="5xl"
      >
        <div className="space-y-4">
          {selectedItem && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-blue-600 font-medium">Nama Produk</p>
                  <p className="text-sm font-bold text-blue-900">
                    {activeProducts.get(selectedItem.nama_produk) || selectedItem.nama_produk}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-blue-600 font-medium">Stok Saat Ini</p>
                  <p className={`text-sm font-bold ${selectedItem.qty < 0 ? 'text-red-600' : selectedItem.qty === 0 ? 'text-gray-600' : 'text-green-600'}`}>
                    {selectedItem.qty.toLocaleString()} {selectedItem.satuan}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-blue-600 font-medium">Lokasi</p>
                  <p className="text-sm font-bold text-blue-900">{selectedItem.rak} - {selectedItem.sub_rak}</p>
                </div>
                <div>
                  <p className="text-xs text-blue-600 font-medium">Packing</p>
                  <p className="text-sm font-bold text-blue-900">{activePackingData.get(selectedItem.nama_produk) || selectedItem.packing}</p>
                </div>
              </div>
            </div>
          )}

          {itemHistory.length === 0 ? (
            <div className="text-center py-8">
              <History className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500">Belum ada riwayat transaksi untuk item ini</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tanggal</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Qty</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tipe</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {itemHistory.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-xs text-gray-900">
                        {new Date(item.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className={`px-3 py-2 text-center font-bold text-sm ${item.qty < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {item.qty > 0 ? '+' : ''}{item.qty.toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        {item.tipe === 'transfer_masuk' && (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">Transfer Masuk</span>
                        )}
                        {item.tipe === 'retur' && (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-800">Retur Customer</span>
                        )}
                        {item.tipe === 'cancel' && (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-rose-100 text-rose-800">Order Cancel</span>
                        )}
                        {item.tipe === 'sisa_stok' && (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-teal-100 text-teal-800">Sisa Stok Awal</span>
                        )}
                        {item.tipe === 'pembelian_customer' && (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800">Pembelian</span>
                        )}
                        {item.tipe === 'adjustment' && (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800">Adjustment</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-600 text-xs">{item.keterangan}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-between items-center pt-2 border-t border-gray-200">
            <p className="text-sm text-gray-500">Total {itemHistory.length} transaksi</p>
            <Button
              onClick={() => setShowItemHistoryModal(false)}
              className="bg-gray-600 hover:bg-gray-700 text-white"
            >
              Tutup
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showHistoryModal}
        onClose={() => { setShowHistoryModal(false); setSelectedHistoryIds(new Set()); setHistoryLimit(100); }}
        title={`Riwayat Transaksi ${activeTab === 'lantai3' ? 'Lantai 3' : 'Bundling'}`}
        size="7xl"
      >
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4 mb-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Cari nama produk..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
              />
              {historySearch && (
                <button
                  onClick={() => setHistorySearch('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="w-full md:w-48">
              <select
                value={selectedHistoryMonth}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedHistoryMonth(val);
                  if (val) {
                    loadTransaksiData(val);
                  } else {
                    setTransaksiData([]);
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-bold bg-blue-50 border-blue-200 focus:ring-2 focus:ring-blue-500 text-gray-700"
              >
                <option value="">Pilih Bulan...</option>
                {(() => {
                  const options = [];
                  const now = new Date();
                  for (let i = 0; i < 12; i++) {
                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                    const label = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
                    options.push(
                      <option key={yearMonth} value={yearMonth}>
                        {label}
                      </option>
                    );
                  }
                  return options;
                })()}
              </select>
            </div>
            <div className="w-full md:w-48">
              <input
                type="date"
                value={historyDateFilter}
                onChange={(e) => {
                  const dateVal = e.target.value;
                  setHistoryDateFilter(dateVal);
                  if (dateVal) {
                    const [year, month] = dateVal.split('-');
                    const yearMonth = `${year}-${month}`;
                    if (yearMonth !== selectedHistoryMonth) {
                      setSelectedHistoryMonth(yearMonth);
                      loadTransaksiData(yearMonth);
                    }
                  }
                }}
                onClick={(e) => {
                  e.currentTarget.showPicker?.();
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.currentTarget.showPicker?.();
                }}
                onKeyDown={(e) => e.preventDefault()}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 text-gray-600 cursor-pointer select-none caret-transparent"
              />
            </div>
            <div className="w-full md:w-48">
              <select
                value={historyTypeFilter}
                onChange={(e) => setHistoryTypeFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 text-gray-600"
              >
                <option value="">Semua Tipe</option>
                <option value="transfer_masuk">Transfer Masuk</option>
                <option value="retur">Retur Customer</option>
                <option value="cancel">Order Cancel</option>
                <option value="sisa_stok">Sisa Stok Awal</option>
                <option value="pembelian_customer">Pembelian Customer</option>
                <option value="adjustment">Adjustment</option>
              </select>
            </div>
            <div className="w-full md:w-48">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Cari keterangan..."
                  value={historyKetFilter}
                  onChange={(e) => setHistoryKetFilter(e.target.value)}
                  className="w-full pl-3 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
                {historyKetFilter && (
                  <button
                    onClick={() => setHistoryKetFilter('')}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="w-full md:w-auto flex items-center gap-2">
              <Button 
                onClick={() => {
                  setHistorySearch('');
                  setHistoryDateFilter('');
                  setHistoryTypeFilter('');
                  setHistoryKetFilter('');
                  setSelectedHistoryMonth('');
                  setTransaksiData([]);
                }}
                variant="secondary"
                className="w-full md:w-auto px-4"
              >
                Reset Filter
              </Button>
              {isDevMode && selectedHistoryIds.size > 0 && (
                <Button
                  onClick={handleDeleteSelectedHistory}
                  className="w-full md:w-auto px-4 bg-red-600 hover:bg-red-700 text-white"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Hapus ({selectedHistoryIds.size})
                </Button>
              )}
            </div>
          </div>

          <div className="min-h-[500px]">
            {loadingHistory ? (
              <div className="text-center py-20">
                <Loader2 className="h-12 w-12 text-blue-500 animate-spin mx-auto mb-3" />
                <p className="text-gray-600 font-medium">
                  Memuat riwayat transaksi {(() => {
                    if (!selectedHistoryMonth) return '';
                    const [year, month] = selectedHistoryMonth.split('-');
                    const d = new Date(parseInt(year), parseInt(month) - 1, 1);
                    return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
                  })()}...
                </p>
              </div>
            ) : filteredTransaksiData.length === 0 ? (
              <div className="text-center py-20">
                <History className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">
                  {selectedHistoryMonth ? 'Belum ada riwayat transaksi yang sesuai' : 'Silakan pilih bulan terlebih dahulu untuk memuat data'}
                </p>
              </div>
            ) : (
              <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    {isDevMode && (
                      <th className="px-3 py-2 text-left w-10">
                        <input
                          type="checkbox"
                          checked={filteredTransaksiData.length > 0 && selectedHistoryIds.size === filteredTransaksiData.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedHistoryIds(new Set(filteredTransaksiData.map(item => item.id)));
                            } else {
                              setSelectedHistoryIds(new Set());
                            }
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </th>
                    )}
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tanggal</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Produk</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Qty</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tipe</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Keterangan</th>
                    {isDevMode && (
                      <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Aksi</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredTransaksiData.slice(0, historyLimit).map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      {isDevMode && (
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selectedHistoryIds.has(item.id)}
                            onChange={(e) => {
                              const newSelected = new Set(selectedHistoryIds);
                              if (e.target.checked) {
                                newSelected.add(item.id);
                              } else {
                                newSelected.delete(item.id);
                              }
                              setSelectedHistoryIds(newSelected);
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="px-3 py-2 text-gray-900">
                        {new Date(item.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-3 py-2 text-gray-900">
                        {editingHistoryId === item.id ? (
                          <input
                            type="text"
                            value={editHistoryForm.nama_produk}
                            onChange={(e) => setEditHistoryForm(prev => ({ ...prev, nama_produk: e.target.value }))}
                            className="w-full min-w-[150px] px-2 py-1 border border-blue-500 rounded text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                            autoFocus
                          />
                        ) : (
                          item.nama_produk
                        )}
                      </td>
                      <td className={`px-3 py-2 text-center font-semibold ${item.qty < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {editingHistoryId === item.id ? (
                          <div className="flex items-center justify-center min-w-[80px]">
                            <span className="mr-1">{item.qty < 0 ? '-' : '+'}</span>
                            <input
                              type="number"
                              min="1"
                              value={editHistoryForm.qty || ''}
                              onChange={(e) => setEditHistoryForm(prev => ({ ...prev, qty: parseInt(e.target.value) || 0 }))}
                              className="w-16 px-1 py-1 border border-blue-500 rounded text-sm text-center outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                        ) : (
                          <>{item.qty > 0 ? '+' : ''}{item.qty.toLocaleString()}</>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {item.tipe === 'transfer_masuk' && (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">Transfer Masuk</span>
                        )}
                        {item.tipe === 'retur' && (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-800">Retur Customer</span>
                        )}
                        {item.tipe === 'cancel' && (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-rose-100 text-rose-800">Order Cancel</span>
                        )}
                        {item.tipe === 'pembelian_customer' && (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800">Pembelian</span>
                        )}
                        {item.tipe === 'adjustment' && (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800">Adjustment</span>
                        )}
                        {item.tipe === 'sisa_stok' && (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-teal-100 text-teal-800">Sisa Stok Awal</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-600 text-xs">{item.keterangan}</td>
                      {isDevMode && (
                        <td className="px-3 py-2 text-center">
                          {editingHistoryId === item.id ? (
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleSaveEditHistory(item)}
                                className="px-2 py-1 bg-green-100 hover:bg-green-200 text-green-700 rounded text-xs font-semibold transition-colors"
                              >
                                Simpan
                              </button>
                              <button
                                onClick={handleCancelEditHistory}
                                className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs transition-colors"
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleEditHistory(item)}
                              className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded text-xs border border-blue-200 font-medium transition-colors"
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredTransaksiData.length > historyLimit && (
                <div className="flex justify-center p-4">
                  <Button
                    onClick={() => setHistoryLimit(prev => prev + 100)}
                    variant="outline"
                  >
                    Muat Lebih Banyak ({filteredTransaksiData.length - historyLimit} data tersisa)
                  </Button>
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      </Modal>

      {/* PIN Modal Protection */}
      <PinVerificationModal
        isOpen={isPinModalOpen}
        onClose={() => { setIsPinModalOpen(false); setPinModalConfig({}); }}
        onSuccess={handlePinSuccess}
        expectedPin={pinModalConfig.expectedPin}
        customDescription={pinModalConfig.description}
      />

      {showFilterPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={closeFilterPopup}>
          <div className="bg-white rounded-lg shadow-xl w-96 max-h-[600px] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900">
                  Filter {showFilterPopup === 'nama_produk' ? 'Nama Produk' :
                         showFilterPopup === 'sudah_so' ? 'Status SO' :
                         showFilterPopup === 'qty' ? 'Qty' :
                         showFilterPopup === 'satuan' ? 'Satuan' :
                         showFilterPopup === 'packing' ? 'Packing' :
                         showFilterPopup === 'rak' ? 'Rak' :
                         showFilterPopup === 'sub_rak' ? 'Sub Rak' : 'Status'}
                </h3>
                <button onClick={closeFilterPopup} className="text-gray-400 hover:text-gray-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Cari..."
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="space-y-2">
                {getFilteredOptions().length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">Tidak ada data</p>
                ) : (
                  getFilteredOptions().map((value) => (
                    <label
                      key={value}
                      className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={tempSelectedFilters.includes(value)}
                        onChange={() => toggleFilterValue(value)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <span className="text-sm text-gray-700">
                        {showFilterPopup === 'status' ? getStatusLabel(value) : value}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-between items-center">
              <button
                onClick={() => setTempSelectedFilters([])}
                className="text-sm text-gray-600 hover:text-gray-800"
              >
                Clear
              </button>
              <div className="flex space-x-2">
                <Button onClick={closeFilterPopup} variant="secondary">
                  Batal
                </Button>
                <Button onClick={applyFilter} className="bg-blue-600 hover:bg-blue-700 text-white">
                  Terapkan ({tempSelectedFilters.length})
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <Toast
          isOpen={true}
          message={toast.message}
          type={toast.type}
          details={toast.details}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
