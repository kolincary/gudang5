import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Toast } from './ui/Toast';
import {
  Wrench,
  Calculator,
  ArrowRightLeft,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  X,
  Send,
  Layers,
  Zap,
  Scale,
  Search,
  Package,
  Box,
  Loader,
  Sparkles,
  ShieldCheck,
  Check,
  Clock,
  Calendar,
  AlertTriangle,
  Info
} from 'lucide-react';
import { supabase, fetchAllStockItems, fetchAllProducts } from '../lib/supabase';
import { DatabaseService } from '../lib/DatabaseService';
import { useDatabaseConfig } from '../lib/DatabaseContext';
import { useAuth } from '../lib/AuthContext';
import { useDevMode } from '../lib/useDevMode';
import { getRealtimeDateTime, getOriginalReceiptDate } from '../lib/transferDateHelper';
import { CekSaldo2Modal } from './CekSaldo2Modal';

interface StockItem {
  id: string;
  nama_produk: string;
  packing: string;
  rak: string;
  sub_rak: string;
  satuan: string;
  stok_awal?: number;
  masuk?: number;
  keluar?: number;
  tersedia: number;
  status: string;
}

interface RackLocation {
  id: string;
  nama: string;
  status: string;
}

const RESTRICTED_RACKS = ['LANTAI 2', 'LANTAI 4', 'ECER-M', 'ECER-N', 'ECER-O', 'BLOK-I'];

export function AdminDevTools() {
  const { writeMode } = useDatabaseConfig();
  const { user, userRole, userEmail, userName } = useAuth();
  const isDevMode = useDevMode(userName, userEmail);

  // Tab State: 'cek-saldo' | 'pindah-barang'
  const [activeTab, setActiveTab] = useState<'cek-saldo' | 'pindah-barang'>('cek-saldo');

  // Shared Data States
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [rackLocations, setRackLocations] = useState<RackLocation[]>([]);
  const [allSkus, setAllSkus] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Toast State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' | 'info' } | null>(null);
  const notify = useCallback((message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    setToast({ message, type });
  }, []);

  // -------------------------------------------------------------
  // FORM PINDAH BARANG (STANDAR) STATE
  // -------------------------------------------------------------
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const [highlightedItemIndex, setHighlightedItemIndex] = useState(0);

  const [moveData, setMoveData] = useState<{
    rak_tujuan: string;
    jumlah_pindah: number | '';
  }>({
    rak_tujuan: '',
    jumlah_pindah: ''
  });

  const [showRakTujuanDropdown, setShowRakTujuanDropdown] = useState(false);
  const [highlightedRakIndex, setHighlightedRakIndex] = useState(0);
  const [isRakTujuanValidated, setIsRakTujuanValidated] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [operationProgress, setOperationProgress] = useState<{
    isVisible: boolean;
    currentStep: string;
    steps: string[];
    completedSteps: number;
  }>({
    isVisible: false,
    currentStep: '',
    steps: [],
    completedSteps: 0
  });

  // Original incoming receipt date detection for standard transfer
  const [detectedReceiptDate, setDetectedReceiptDate] = useState<{
    tgl: string;
    tgl_scan: string;
    waktu: string;
    loading: boolean;
  } | null>(null);

  // DevGod state
  const [isDevGod, setIsDevGod] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('pindah_devgod_active') === 'true';
    }
    return false;
  });

  // DOM Refs
  const itemInputRef = useRef<HTMLInputElement>(null);
  const itemDropdownRef = useRef<HTMLDivElement>(null);
  const rakTujuanInputRef = useRef<HTMLInputElement>(null);
  const rakDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (itemDropdownRef.current && !itemDropdownRef.current.contains(event.target as Node) &&
          itemInputRef.current && !itemInputRef.current.contains(event.target as Node)) {
        setShowItemDropdown(false);
      }
      if (rakDropdownRef.current && !rakDropdownRef.current.contains(event.target as Node) &&
          rakTujuanInputRef.current && !rakTujuanInputRef.current.contains(event.target as Node)) {
        setShowRakTujuanDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // -------------------------------------------------------------
  // DATA FETCHING (TANPA BATASAN 1000 DATA)
  // -------------------------------------------------------------
  const loadInitialData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Ambil seluruh stock items (tanpa limit 1000)
      const stockRes = await fetchAllStockItems();
      let uniqueSkusFromStock: string[] = [];
      if (stockRes.success && stockRes.data) {
        setStockItems(stockRes.data as StockItem[]);
        uniqueSkusFromStock = Array.from(new Set(
          (stockRes.data as any[]).map(d => (d.nama_produk || '').trim().toUpperCase()).filter(Boolean)
        ));
      }

      // 2. Ambil seluruh master products (names only, parallel load tanpa limit)
      const prodRes = await fetchAllProducts(undefined, true);
      let uniqueSkusFromProducts: string[] = [];
      if (prodRes.success && prodRes.data) {
        uniqueSkusFromProducts = Array.from(new Set(
          (prodRes.data as any[]).map(d => (d.nama || d.nama_produk || '').trim().toUpperCase()).filter(Boolean)
        ));
      }

      // Gabungkan semua SKU unik untuk pencarian tanpa batas
      const mergedSkus = Array.from(new Set([...uniqueSkusFromStock, ...uniqueSkusFromProducts])).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
      );
      setAllSkus(mergedSkus);

      // 3. Ambil lokasi rak aktif
      const { data: racks, error: rackErr } = await supabase
        .from('rack_locations')
        .select('id, nama, status')
        .eq('status', 'Aktif')
        .order('nama', { ascending: true });

      if (rackErr) throw rackErr;
      if (racks) {
        setRackLocations(racks);
      }
    } catch (err) {
      console.error('Error memuat data AdminDevTools:', err);
      notify('Gagal memuat data inventaris lengkap', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // -------------------------------------------------------------
  // AUTO-DETECT ORIGINAL RECEIPT DATE SAAT BARANG DIPILIH
  // -------------------------------------------------------------
  useEffect(() => {
    if (!selectedItem) {
      setDetectedReceiptDate(null);
      return;
    }

    let isMounted = true;
    setDetectedReceiptDate({ tgl: '', tgl_scan: '', waktu: '', loading: true });

    getOriginalReceiptDate(selectedItem.nama_produk, selectedItem.rak)
      .then(info => {
        if (isMounted) {
          setDetectedReceiptDate({ ...info, loading: false });
        }
      })
      .catch(err => {
        console.error('Error mendeteksi tanggal nota awal:', err);
        if (isMounted) {
          const { todayTgl, nowWaktu } = getRealtimeDateTime();
          setDetectedReceiptDate({ tgl: todayTgl, tgl_scan: todayTgl, waktu: nowWaktu, loading: false });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedItem]);

  // -------------------------------------------------------------
  // DROPDOWN FILTERING (TANPA BATASAN 1000 DATA)
  // -------------------------------------------------------------
  // Filter barang dengan stok tersedia > 0 untuk Form Pindah Barang
  const itemsWithAvailableStock = useMemo(() => {
    return stockItems.filter(item => (Number(item.tersedia) || 0) > 0);
  }, [stockItems]);

  const filteredItemsForTransfer = useMemo(() => {
    if (!searchTerm.trim()) {
      return itemsWithAvailableStock;
    }
    const q = searchTerm.toLowerCase().trim();
    return itemsWithAvailableStock.filter(item =>
      (item.nama_produk || '').toLowerCase().includes(q) ||
      (item.rak || '').toLowerCase().includes(q) ||
      (item.sub_rak && item.sub_rak.toLowerCase().includes(q))
    );
  }, [itemsWithAvailableStock, searchTerm]);

  // Filter rak tujuan
  const filteredRacks = useMemo(() => {
    const inputUpper = moveData.rak_tujuan.toUpperCase().trim();
    return rackLocations.filter(rack => {
      if (!isDevGod && RESTRICTED_RACKS.includes(rack.nama.toUpperCase())) {
        return false;
      }
      if (selectedItem && rack.nama.toUpperCase() === selectedItem.rak.toUpperCase()) {
        return false;
      }
      if (!inputUpper) return true;
      return rack.nama.toUpperCase().includes(inputUpper);
    });
  }, [rackLocations, moveData.rak_tujuan, selectedItem, isDevGod]);

  // Keyboard navigation for Item Select
  const handleItemKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showItemDropdown || filteredItemsForTransfer.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedItemIndex(prev => (prev < filteredItemsForTransfer.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedItemIndex(prev => (prev > 0 ? prev - 1 : filteredItemsForTransfer.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItemsForTransfer[highlightedItemIndex]) {
        handleItemSelect(filteredItemsForTransfer[highlightedItemIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowItemDropdown(false);
    }
  };

  const handleItemSelect = (item: StockItem) => {
    setSelectedItem(item);
    setSearchTerm(item.nama_produk);
    setShowItemDropdown(false);
    setMoveData(prev => ({ ...prev, jumlah_pindah: '' }));
  };

  // Keyboard navigation for Rak Tujuan
  const handleRakKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showRakTujuanDropdown || filteredRacks.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedRakIndex(prev => (prev < filteredRacks.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedRakIndex(prev => (prev > 0 ? prev - 1 : filteredRacks.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredRacks[highlightedRakIndex]) {
        handleRakTujuanSelect(filteredRacks[highlightedRakIndex].nama);
      }
    } else if (e.key === 'Escape') {
      setShowRakTujuanDropdown(false);
    }
  };

  const handleRakTujuanSelect = (rakNama: string) => {
    setMoveData(prev => ({ ...prev, rak_tujuan: rakNama }));
    setShowRakTujuanDropdown(false);
    setIsRakTujuanValidated(true);
  };

  const clearTransferForm = () => {
    setSelectedItem(null);
    setSearchTerm('');
    setMoveData({ rak_tujuan: '', jumlah_pindah: '' });
    setIsRakTujuanValidated(false);
    setShowItemDropdown(false);
    setShowRakTujuanDropdown(false);
  };

  // -------------------------------------------------------------
  // EKSEKUSI TRANSFER STANDAR (LOGIKA PINDAH BARANG STANDAR)
  // -------------------------------------------------------------
  const handleStandardTransfer = async () => {
    if (!selectedItem || !moveData.rak_tujuan || moveData.jumlah_pindah === '' || Number(moveData.jumlah_pindah) <= 0) {
      notify('Mohon lengkapi SKU, Rak Tujuan, dan Jumlah Pindah!', 'warning');
      return;
    }

    const qtyPindah = Number(moveData.jumlah_pindah);
    const rakTujuanFinal = moveData.rak_tujuan.toUpperCase().trim();

    if (!isDevGod && RESTRICTED_RACKS.includes(rakTujuanFinal)) {
      notify(`Tidak diperbolehkan memindahkan barang ke Rak ${rakTujuanFinal}`, 'error');
      return;
    }

    if (rakTujuanFinal.startsWith('TEMP')) {
      notify('Rak TEMP adalah lokasi transit khusus fitur Real-Time.', 'warning');
      return;
    }

    if (!isRakTujuanValidated) {
      notify('Mohon pilih rak tujuan yang valid dari daftar dropdown!', 'warning');
      return;
    }

    if (qtyPindah > selectedItem.tersedia) {
      notify(`Jumlah pindah (${qtyPindah}) tidak boleh melebihi stok tersedia (${selectedItem.tersedia})!`, 'error');
      return;
    }

    try {
      setSubmitting(true);
      const steps = [
        'Menyiapkan data transfer (Logika Standar: Tanggal Nota Asli)',
        'Mencatat log OUT dari rak asal',
        'Mencatat log IN ke rak tujuan',
        'Menyesuaikan stok rak asal',
        'Memperbarui/membuat stok di rak tujuan',
        'Sinkronisasi selesai'
      ];

      setOperationProgress({
        isVisible: true,
        currentStep: steps[0],
        steps,
        completedSteps: 0
      });

      const now = new Date();

      // 1. Ambil tanggal nota penerimaan awal supplier & tanggal real-time hari ini
      setOperationProgress(prev => ({ ...prev, currentStep: steps[1], completedSteps: 1 }));
      const originalInfo = await getOriginalReceiptDate(selectedItem.nama_produk, selectedItem.rak);
      const { todayTgl, nowWaktu } = getRealtimeDateTime();
      const tglNotaAsli = originalInfo.tgl || todayTgl;
      const tglScanAsli = originalInfo.tgl_scan || tglNotaAsli;

      const createdAtOut = new Date(now.getTime() + 1000).toISOString();
      const createdAtIn = new Date(now.getTime() + 2000).toISOString();

      // Aturan Tanggal:
      // - OUT: tgl nota = tgl sekarang (real-time), tgl scan = tgl nota asli data IN
      // - IN: tgl nota = tgl sekarang (real-time), tgl scan = tgl sekarang (real-time)
      const logEntries = [
        {
          tgl: todayTgl,
          waktu: nowWaktu,
          sku: selectedItem.nama_produk,
          jumlah: qtyPindah,
          type: 'OUT',
          gudang: 'TRANSFER',
          rak: selectedItem.rak,
          tgl_scan: tglScanAsli,
          user_name: user?.user_metadata?.full_name || user?.email || userRole || 'System (Admin/Dev Tools)',
          sub_rak: selectedItem.sub_rak || selectedItem.rak,
          created_at: createdAtOut
        },
        {
          tgl: todayTgl,
          waktu: nowWaktu,
          sku: selectedItem.nama_produk,
          jumlah: qtyPindah,
          type: 'IN',
          gudang: 'TRANSFER',
          rak: rakTujuanFinal,
          tgl_scan: todayTgl,
          user_name: user?.user_metadata?.full_name || user?.email || userRole || 'System (Admin/Dev Tools)',
          sub_rak: rakTujuanFinal,
          created_at: createdAtIn
        }
      ];

      // 2. Insert Log Entries
      setOperationProgress(prev => ({ ...prev, currentStep: steps[2], completedSteps: 2 }));
      const { data: insertedData, error: logError } = await DatabaseService.insertLogs(logEntries, writeMode);

      if (logError) {
        console.error('Error inserting transfer logs:', logError);
        notify(`Gagal mencatat transfer log: ${logError.message}`, 'error');
        setOperationProgress(prev => ({ ...prev, isVisible: false }));
        return;
      }

      // Pastikan tgl dan tgl_scan tidak di-override trigger database
      if (insertedData && insertedData.length > 0) {
        for (const l of insertedData) {
          if (l.id) {
            const expectedTgl = todayTgl;
            const expectedTglScan = l.type === 'OUT' ? tglScanAsli : todayTgl;
            if (l.tgl_scan !== expectedTglScan || l.tgl !== expectedTgl) {
              await DatabaseService.updateLog(l.id, { tgl_scan: expectedTglScan, tgl: expectedTgl }, writeMode);
            }
          }
        }
      }

      // 3. Kurangi stok asal
      setOperationProgress(prev => ({ ...prev, currentStep: steps[3], completedSteps: 3 }));
      if (selectedItem.id) {
        await DatabaseService.updateStockItem(
          selectedItem.id,
          {
            keluar: (selectedItem.keluar || 0) + qtyPindah,
            tersedia: Math.max(0, (selectedItem.tersedia || 0) - qtyPindah)
          },
          writeMode
        );
      }

      // 4. Tambah stok tujuan
      setOperationProgress(prev => ({ ...prev, currentStep: steps[4], completedSteps: 4 }));
      const { data: existingStock, error: checkError } = await supabase
        .from('stock_items')
        .select('id, tersedia, masuk')
        .eq('nama_produk', selectedItem.nama_produk)
        .eq('rak', rakTujuanFinal)
        .maybeSingle();

      if (checkError) {
        console.warn('Check existing stock error:', checkError);
      }

      let stockCreated = false;
      if (existingStock && existingStock.id) {
        await DatabaseService.updateStockItem(
          existingStock.id,
          {
            masuk: (existingStock.masuk || 0) + qtyPindah,
            tersedia: (existingStock.tersedia || 0) + qtyPindah
          },
          writeMode
        );
      } else {
        const { error: insertError } = await DatabaseService.insertStockItems([{
          nama_produk: selectedItem.nama_produk,
          packing: selectedItem.packing,
          rak: rakTujuanFinal,
          sub_rak: rakTujuanFinal,
          satuan: selectedItem.satuan || 'PCS',
          stok_awal: 0,
          masuk: qtyPindah,
          keluar: 0,
          tersedia: qtyPindah,
          status: 'Aktif'
        }], writeMode);

        if (insertError) {
          console.error('Error insert stock tujuan:', insertError);
          notify(`Gagal membuat item stok tujuan: ${insertError.message}`, 'error');
          setOperationProgress(prev => ({ ...prev, isVisible: false }));
          return;
        }
        stockCreated = true;
      }

      // 5. Finalisasi & Refresh
      setOperationProgress(prev => ({ ...prev, currentStep: steps[5], completedSteps: 6 }));
      notify(
        `Berhasil memindahkan ${qtyPindah} ${selectedItem.satuan} ${selectedItem.nama_produk} dari ${selectedItem.rak} ke ${rakTujuanFinal}${stockCreated ? ' (stok tujuan baru dibuat)' : ''}!`,
        'success'
      );

      setTimeout(() => {
        setOperationProgress(prev => ({ ...prev, isVisible: false }));
        clearTransferForm();
        loadInitialData();
      }, 1000);

    } catch (err: any) {
      console.error('Error during transfer:', err);
      notify(`Terjadi kesalahan: ${err?.message || 'Gagal memproses transfer'}`, 'error');
      setOperationProgress(prev => ({ ...prev, isVisible: false }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* ======================================================== */}
      {/* PREMIUM IMMERSIVE HEADER (SEPERTI INPUT BARANG MASUK) */}
      {/* ======================================================== */}
      <div className="flex flex-col mb-6 lg:mb-10">
        <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 pt-[75px] lg:pt-0 lg:h-[290px] pb-[35px] lg:pb-0 px-6 lg:px-12 rounded-b-[40px] lg:rounded-b-[55px] shadow-2xl shadow-blue-900/30 relative overflow-hidden transition-all duration-500 flex flex-col justify-center">

          {/* Decorative Watermark Background Icons */}
          <div className="absolute -top-6 -right-6 text-white opacity-5 pointer-events-none">
            <Wrench className="w-64 h-64 lg:w-96 lg:h-96" />
          </div>

          {/* Decorative Glowing Floating Shapes */}
          <div className="absolute top-10 right-10 w-32 h-32 bg-white/10 rounded-full blur-3xl animate-pulse pointer-events-none"></div>
          <div className="absolute top-24 left-1/4 w-16 h-16 bg-white/5 border border-white/10 rounded-2xl rotate-[35deg] backdrop-blur-sm hidden lg:block pointer-events-none"></div>
          <div className="absolute bottom-10 right-1/3 w-12 h-12 bg-white/10 rounded-full border border-white/20 hidden lg:block pointer-events-none"></div>
          <div className="absolute top-1/2 right-20 w-16 h-16 bg-blue-400/20 rounded-3xl -rotate-12 blur-xl hidden lg:block pointer-events-none"></div>

          {/* Header Text & Actions */}
          <div className="relative z-10 w-full flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 lg:gap-6 uppercase">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 mb-2 lg:mb-3 opacity-90">
                <div className="w-8 h-[2px] bg-white rounded-full"></div>
                <span className="text-[10px] lg:text-[12px] font-black tracking-[0.3em] text-white">
                  LOGISTICS V5 • ADMIN &amp; DEVELOPER WORKSTATION
                </span>
              </div>
              <h1 className="text-[32px] lg:text-[50px] font-black text-white tracking-tight leading-[1.1] mb-2 uppercase">
                ADMIN &amp; DEV <span className="text-blue-200">TOOLS HUB</span>
              </h1>
              <div className="text-blue-100/90 font-medium text-[13px] lg:text-[16px] leading-relaxed max-w-[95%] normal-case">
                {loading ? (
                  <span className="animate-pulse flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-white" /> Sinkronisasi data inventaris penuh...
                  </span>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                    </span>
                    <span className="font-black text-white">Digital System</span> - Audit Saldo Stok &amp; Pindah Barang Standar Terpadu ({allSkus.length.toLocaleString('id-ID')} SKU Aktif)
                  </div>
                )}
              </div>
            </div>

            {/* Header Right Action Buttons */}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={loadInitialData}
                disabled={loading}
                className="h-11 px-4 sm:px-5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl border border-white/20 flex items-center gap-2 transition-all active:scale-95 cursor-pointer text-xs sm:text-sm backdrop-blur-md shadow-sm disabled:opacity-50"
                title="Muat ulang seluruh inventaris dan SKU tanpa batasan 1000 data"
              >
                <RefreshCw className={`h-4 w-4 text-blue-200 ${loading ? 'animate-spin' : ''}`} />
                <span className="uppercase text-xs font-black tracking-wider">Refresh Data</span>
              </button>

              <div className="px-4 h-11 bg-slate-900/40 border border-white/10 rounded-2xl flex items-center gap-2 backdrop-blur-md text-xs font-mono text-blue-200">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span>ROLE: <strong className="text-white uppercase font-sans font-bold">{userRole || (isDevMode ? 'Developer' : 'Admin')}</strong></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* BODY CONTAINER (OVERLAPPING & MODERN TABS) */}
      {/* ======================================================== */}
      <div className="px-4 sm:px-6 lg:px-10 pb-16 -mt-6 lg:-mt-10 relative z-20 space-y-6">

        {/* Unified Tab Navigation Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-2 bg-white rounded-2xl shadow-sm border border-slate-200">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('cek-saldo')}
              className={`flex items-center space-x-2 px-5 py-3 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer ${
                activeTab === 'cek-saldo'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Calculator className="h-4 w-4" />
              <span>1. Audit &amp; Cek Saldo 2 (Auto-Fix)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('pindah-barang')}
              className={`flex items-center space-x-2 px-5 py-3 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer ${
                activeTab === 'pindah-barang'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <ArrowRightLeft className="h-4 w-4" />
              <span>2. Pindah Data Barang (Transfer Standar)</span>
            </button>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-500">
            <span>Tampilan Langsung</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>Non-Modal Mode</span>
          </div>
        </div>

        {/* ======================================================== */}
        {/* TAB 1: 1. AUDIT & CEK SALDO 2 (AUTO-FIX) LANGSUNG VIEW */}
        {/* ======================================================== */}
        {activeTab === 'cek-saldo' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <CekSaldo2Modal
              isInline={true}
              allSkus={allSkus}
              onDataUpdated={loadInitialData}
              showToast={notify}
            />
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: 2. PINDAH DATA BARANG (FORM STANDAR DENGAN DESAIN BARU) */}
        {/* ======================================================== */}
        {activeTab === 'pindah-barang' && (
          <div className="space-y-6 animate-in fade-in duration-300">

            {/* Operation Progress Display */}
            {operationProgress.isVisible && (
              <div className="p-4 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-2xl shadow-xl border border-blue-500/30 animate-in fade-in duration-300">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-200 flex items-center gap-2">
                    <Loader className="w-4 h-4 animate-spin text-amber-300" />
                    Memproses Pemindahan Stok Standar...
                  </span>
                  <span className="text-xs font-mono text-emerald-400 font-bold">
                    Langkah {operationProgress.completedSteps} dari {operationProgress.steps.length}
                  </span>
                </div>
                <p className="text-sm font-semibold text-white">{operationProgress.currentStep}</p>
                <div className="w-full bg-white/10 rounded-full h-2 mt-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-amber-400 to-emerald-400 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.round((operationProgress.completedSteps / operationProgress.steps.length) * 100)}%`
                    }}
                  ></div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

              {/* KOLOM KIRI: FORM PINDAH BARANG (STANDAR) */}
              <div className="lg:col-span-7 relative z-30">
                <Card className="border border-slate-200 shadow-md rounded-3xl overflow-visible bg-white relative z-30 min-h-[460px]">
                  <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-blue-50/50 via-white to-indigo-50/30 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                        <ArrowRightLeft className="h-5 w-5 text-blue-600" />
                        <span>Form Pindah Barang (Standar)</span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Memindahkan stok antar-rak reguler dengan mempertahankan <strong>tanggal nota penerimaan awal supplier</strong>.
                      </p>
                    </div>
                    <span className="text-[11px] font-black px-3 py-1 bg-blue-100 text-blue-800 border border-blue-200 rounded-full uppercase tracking-wider shrink-0">
                      Tgl Nota Asli
                    </span>
                  </div>

                  <CardContent className="p-6 space-y-5 overflow-visible">
                    {/* INPUT 1: PILIH BARANG (SKU) */}
                    <div className="relative z-30">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-slate-700 uppercase">
                          Pilih Barang ({itemsWithAvailableStock.length.toLocaleString('id-ID')} Item Stok Tersedia)
                        </label>
                        <span className="text-[11px] text-slate-400">
                          {loading ? 'Memuat...' : 'Semua data tanpa batasan'}
                        </span>
                      </div>

                      <div className="relative">
                        <input
                          ref={itemInputRef}
                          type="text"
                          value={searchTerm}
                          onChange={(e) => {
                            setSearchTerm(e.target.value);
                            setShowItemDropdown(true);
                            if (!e.target.value) {
                              setSelectedItem(null);
                            }
                          }}
                          onFocus={() => {
                            setShowItemDropdown(true);
                            setHighlightedItemIndex(0);
                          }}
                          onKeyDown={handleItemKeyDown}
                          placeholder="Ketik nama SKU / produk dengan stok tersedia..."
                          className="w-full h-12 px-4 pr-10 border border-slate-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs bg-white text-sm font-medium text-slate-900"
                        />

                        {searchTerm && (
                          <button
                            type="button"
                            onClick={() => {
                              setSearchTerm('');
                              setSelectedItem(null);
                              setShowItemDropdown(false);
                            }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 bg-rose-50 text-rose-500 hover:bg-rose-100 rounded-xl transition-all cursor-pointer"
                            title="Hapus pencarian"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}

                        {/* Autocomplete Dropdown List (Semua Data Tanpa Batasan 1000) */}
                        {showItemDropdown && (
                          <div
                            ref={itemDropdownRef}
                            className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[9999] max-h-80 overflow-y-auto divide-y divide-slate-100 animate-in fade-in duration-150 ring-1 ring-slate-900/10"
                          >
                            {filteredItemsForTransfer.length > 0 ? (
                              filteredItemsForTransfer.map((item, index) => (
                                <div
                                  key={`${item.id}-${item.rak}-${index}`}
                                  onClick={() => handleItemSelect(item)}
                                  className={`px-4 py-3 text-sm cursor-pointer transition-colors flex items-center justify-between ${
                                    index === highlightedItemIndex ? 'bg-blue-50 text-blue-900' : 'hover:bg-slate-50'
                                  }`}
                                >
                                  <div className="min-w-0 pr-3">
                                    <div className="font-bold text-slate-900 truncate">{item.nama_produk}</div>
                                    <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                                      <span className="px-2 py-0.5 bg-slate-100 rounded-md font-mono text-[11px] text-slate-700">Rak: {item.rak}</span>
                                      {item.packing && <span>Packing: {item.packing}</span>}
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200">
                                      {item.tersedia.toLocaleString('id-ID')} {item.satuan}
                                    </span>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="p-4 text-center text-xs text-slate-400">
                                {searchTerm ? 'Tidak ada barang dengan stok tersedia yang cocok' : 'Ketik untuk mencari produk dengan stok...'}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* DETAIL BARANG TERPILIH & BADGE TGL NOTA MASUK */}
                    {selectedItem && (
                      <div className="p-4 bg-gradient-to-r from-emerald-50/70 to-blue-50/70 border border-emerald-200 rounded-2xl space-y-3">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span className="text-xs font-black text-emerald-900 uppercase tracking-wide flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            Barang Terpilih
                          </span>

                          {/* Badge Tgl Nota Masuk Terdeteksi */}
                          {detectedReceiptDate && (
                            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white border border-blue-300 rounded-xl text-xs font-bold shadow-xs">
                              {detectedReceiptDate.loading ? (
                                <>
                                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-600" />
                                  <span className="text-blue-700">Mendeteksi Tgl Nota Asli...</span>
                                </>
                              ) : (
                                <>
                                  <Calendar className="h-3.5 w-3.5 text-blue-600" />
                                  <span className="text-slate-600">Tgl Nota Supplier:</span>
                                  <span className="font-black text-blue-950 underline">{detectedReceiptDate.tgl}</span>
                                </>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <div className="p-2 bg-white/80 rounded-xl border border-emerald-100">
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">Rak Asal</span>
                            <span className="font-black text-slate-800 text-sm">{selectedItem.rak}</span>
                          </div>
                          <div className="p-2 bg-white/80 rounded-xl border border-emerald-100">
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">Stok Tersedia</span>
                            <span className="font-black text-emerald-700 text-sm">
                              {selectedItem.tersedia.toLocaleString('id-ID')} {selectedItem.satuan}
                            </span>
                          </div>
                          <div className="p-2 bg-white/80 rounded-xl border border-emerald-100">
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">Satuan</span>
                            <span className="font-bold text-slate-800 text-sm">{selectedItem.satuan || 'PCS'}</span>
                          </div>
                          <div className="p-2 bg-white/80 rounded-xl border border-emerald-100">
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">Packing</span>
                            <span className="font-bold text-slate-800 text-sm truncate block">{selectedItem.packing || '-'}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* INPUT 2: RAK TUJUAN */}
                    {selectedItem && (
                      <div className="relative z-20">
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                          Rak Tujuan
                        </label>
                        <div className="relative">
                          <input
                            ref={rakTujuanInputRef}
                            type="text"
                            value={moveData.rak_tujuan}
                            onChange={(e) => {
                              const upperValue = e.target.value.toUpperCase().trimEnd();
                              setMoveData(prev => ({ ...prev, rak_tujuan: upperValue }));
                              setShowRakTujuanDropdown(true);
                              setIsRakTujuanValidated(false);
                            }}
                            onFocus={() => {
                              setShowRakTujuanDropdown(true);
                              setHighlightedRakIndex(0);
                            }}
                            onKeyDown={handleRakKeyDown}
                            placeholder="Ketik atau pilih nama rak tujuan..."
                            className="w-full h-12 px-4 pr-10 border border-slate-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs bg-white text-sm font-medium text-slate-900"
                          />

                          {moveData.rak_tujuan && (
                            <button
                              type="button"
                              onClick={() => {
                                setMoveData(prev => ({ ...prev, rak_tujuan: '' }));
                                setShowRakTujuanDropdown(false);
                                setIsRakTujuanValidated(false);
                              }}
                              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 bg-rose-50 text-rose-500 hover:bg-rose-100 rounded-xl transition-all cursor-pointer"
                              title="Hapus rak tujuan"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}

                          {/* Rak Tujuan Dropdown */}
                          {showRakTujuanDropdown && (
                            <div
                              ref={rakDropdownRef}
                              className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[9999] max-h-56 overflow-y-auto divide-y divide-slate-100 animate-in fade-in duration-150 ring-1 ring-slate-900/10"
                            >
                              {filteredRacks.length > 0 ? (
                                filteredRacks.map((rack, index) => {
                                  const isRestricted = RESTRICTED_RACKS.includes(rack.nama.toUpperCase());
                                  return (
                                    <div
                                      key={rack.id}
                                      onClick={() => handleRakTujuanSelect(rack.nama)}
                                      className={`px-4 py-3 text-sm cursor-pointer transition-colors flex items-center justify-between ${
                                        index === highlightedRakIndex
                                          ? 'bg-blue-100 text-blue-900 font-bold'
                                          : 'hover:bg-slate-50'
                                      }`}
                                    >
                                      <span className="font-bold text-slate-900">{rack.nama}</span>
                                      {isRestricted && (
                                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-purple-700 text-yellow-300">
                                          DEVGOD
                                        </span>
                                      )}
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="p-4 text-center text-xs text-slate-400">
                                  {moveData.rak_tujuan ? 'Tidak ada rak yang cocok' : 'Ketik untuk mencari rak...'}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {isRakTujuanValidated && (
                          <p className="text-xs font-bold text-emerald-600 mt-1.5 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Rak Tujuan valid: {moveData.rak_tujuan}
                          </p>
                        )}
                      </div>
                    )}

                    {/* INPUT 3: JUMLAH PINDAH */}
                    {selectedItem && (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-bold text-slate-700 uppercase">
                            Jumlah Pindah ({selectedItem.satuan || 'PCS'})
                          </label>
                          <button
                            type="button"
                            onClick={() => setMoveData(prev => ({ ...prev, jumlah_pindah: selectedItem.tersedia }))}
                            className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                          >
                            Gunakan Maksimal ({selectedItem.tersedia})
                          </button>
                        </div>

                        <input
                          type="number"
                          min="1"
                          max={selectedItem.tersedia}
                          value={moveData.jumlah_pindah}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '') {
                              setMoveData(prev => ({ ...prev, jumlah_pindah: '' }));
                            } else {
                              const parsed = parseInt(val, 10);
                              setMoveData(prev => ({ ...prev, jumlah_pindah: isNaN(parsed) ? '' : parsed }));
                            }
                          }}
                          placeholder={`Maksimal ${selectedItem.tersedia} ${selectedItem.satuan}`}
                          className="w-full h-12 px-4 border border-slate-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs bg-white text-sm font-semibold text-slate-900"
                        />
                      </div>
                    )}

                    {/* TOMBOL AKSI FORM */}
                    <div className="pt-2 flex flex-col sm:flex-row gap-3">
                      <Button
                        type="button"
                        onClick={clearTransferForm}
                        disabled={submitting}
                        className="sm:w-32 h-12 bg-white hover:bg-slate-100 text-slate-700 font-bold rounded-2xl border border-slate-200 transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                        <span className="uppercase text-xs font-bold">Clear</span>
                      </Button>

                      <Button
                        type="button"
                        onClick={handleStandardTransfer}
                        disabled={
                          submitting ||
                          !selectedItem ||
                          !moveData.rak_tujuan ||
                          !isRakTujuanValidated ||
                          moveData.jumlah_pindah === '' ||
                          Number(moveData.jumlah_pindah) <= 0
                        }
                        className="flex-1 h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black rounded-2xl shadow-lg shadow-blue-500/25 active:scale-95 transition-all flex items-center justify-center gap-2 border border-white/20 disabled:opacity-50 cursor-pointer text-xs sm:text-sm uppercase tracking-wider"
                      >
                        {submitting ? (
                          <>
                            <Loader className="h-4 w-4 animate-spin text-white" />
                            <span>Memindahkan Data...</span>
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4" />
                            <span>Pindahkan (Tgl Nota Asli)</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* KOLOM KANAN: RINGKASAN & LOGIKA TRANSFER STANDAR */}
              <div className="lg:col-span-5 space-y-5">
                <Card className="border border-slate-200 shadow-sm rounded-3xl overflow-hidden bg-white">
                  <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                    <h4 className="text-sm font-black text-slate-800 uppercase flex items-center gap-2">
                      <Scale className="w-4 h-4 text-blue-600" />
                      Prinsip Logika Transfer Standar
                    </h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md">
                      Anti-Anomali
                    </span>
                  </div>

                  <CardContent className="p-6 space-y-4 text-xs text-slate-600 leading-relaxed">
                    <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl text-blue-900 space-y-1">
                      <p className="font-bold flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-blue-600" />
                        Logika Pemindahan Terpisah (Admin &amp; Dev Tools)
                      </p>
                      <p className="text-[11px] text-blue-800">
                        Proses ini mencatat data <strong>OUT</strong> dengan tanggal nota sekarang (real-time) dan tanggal scan sesuai nota asli penerimaan IN awal supplier. Sedangkan data <strong>IN</strong> dicatat dengan tanggal nota dan tanggal scan sekarang (real-time).
                      </p>
                    </div>

                    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                      <p className="font-bold text-slate-800 text-[11px] uppercase">Alur Pemindahan Otomatis:</p>
                      <ul className="space-y-1.5 text-slate-600 text-[11px]">
                        <li className="flex items-start gap-1.5">
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span>Mencatat <strong>1x OUT</strong> di rak asal dengan tgl nota: <strong>Hari Ini (Real-Time)</strong> &amp; tgl scan: <strong>Tgl Nota Asli IN</strong>.</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span>Mencatat <strong>1x IN</strong> di rak tujuan dengan tgl nota: <strong>Hari Ini (Real-Time)</strong> &amp; tgl scan: <strong>Hari Ini (Real-Time)</strong>.</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span>Mengurangi stok tersedia di rak asal &amp; menambah stok di rak tujuan.</span>
                        </li>
                      </ul>
                    </div>

                    {selectedItem && (
                      <div className="p-4 bg-purple-50 border border-purple-200 rounded-2xl space-y-2">
                        <p className="font-bold text-purple-900 text-xs flex items-center gap-1.5">
                          <Package className="w-4 h-4 text-purple-700" />
                          Simulasi Perpindahan:
                        </p>
                        <div className="text-[11px] text-purple-900 space-y-1 font-mono">
                          <div>• Dari: <strong>{selectedItem.rak}</strong> (Sisa: {Math.max(0, selectedItem.tersedia - (Number(moveData.jumlah_pindah) || 0))} {selectedItem.satuan})</div>
                          <div>• Ke: <strong>{moveData.rak_tujuan || '[Pilih Rak Tujuan]'}</strong> (+{moveData.jumlah_pindah || 0} {selectedItem.satuan})</div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}
