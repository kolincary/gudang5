import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Toast } from './ui/Toast';
import { ArrowRightLeft, X, Send, RefreshCw, AlertCircle, CheckCircle, Loader, Wrench, Hammer } from 'lucide-react';
import { supabase, fetchAllStockItems } from '../lib/supabase';
import { DatabaseService } from '../lib/DatabaseService';
import { useDatabaseConfig } from '../lib/DatabaseContext';

interface StockItem {
  id: string;
  nama_produk: string;
  packing: string;
  rak: string;
  sub_rak: string;
  satuan: string;
  tersedia: number;
  status: string;
}

interface RackLocation {
  id: string;
  nama: string;
  status: string;
}


const RESTRICTED_RACKS = ['LANTAI 2', 'LANTAI 4', 'ECER-M', 'ECER-N', 'ECER-O', 'BLOK-I'];

export function PindahDataBarang() {
  const { writeMode } = useDatabaseConfig();
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [rackLocations, setRackLocations] = useState<RackLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const [showRakTujuanDropdown, setShowRakTujuanDropdown] = useState(false);

  const [highlightedItemIndex, setHighlightedItemIndex] = useState(0);
  const [highlightedRakIndex, setHighlightedRakIndex] = useState(0);

  const [moveData, setMoveData] = useState<{
    rak_tujuan: string;
    jumlah_pindah: number | '';
  }>({
    rak_tujuan: '',
    jumlah_pindah: ''
  });

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

  const itemInputRef = useRef<HTMLInputElement>(null);
  const rakTujuanInputRef = useRef<HTMLInputElement>(null);
  const itemDropdownRef = useRef<HTMLDivElement>(null);
  const rakDropdownRef = useRef<HTMLDivElement>(null);

  const [toast, setToast] = useState<{
    isOpen: boolean;
    message: string;
    type: 'success' | 'info' | 'warning' | 'error';
  }>({
    isOpen: false,
    message: '',
    type: 'info'
  });

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') => {
    setToast({ isOpen: true, message, type });
    setTimeout(() => {
      setToast({ isOpen: false, message: '', type: 'info' });
    }, 4000);
  }, []);

  useEffect(() => {
    loadInitialData();
  }, []);


  const loadInitialData = async () => {
    try {
      setLoading(true);

      // Load stock items only
      const stockResult = await fetchAllStockItems();

      if (!stockResult.success) {
        throw new Error('Gagal memuat data stock items');
      }

      // Filter active items
      const activeStockItems = stockResult.data.filter(item => item.status === 'Aktif');

      // Aggregate duplicate items if they exist in the database
      const aggregatedMap = new Map<string, StockItem>();
      activeStockItems.forEach(item => {
        const key = `${item.nama_produk}-${item.rak}`;
        if (aggregatedMap.has(key)) {
            const existing = aggregatedMap.get(key)!;
            existing.tersedia += item.tersedia;
        } else {
            aggregatedMap.set(key, {
                id: item.id,
                nama_produk: item.nama_produk,
                packing: item.packing,
                rak: item.rak,
                sub_rak: item.sub_rak || item.rak,
                satuan: item.satuan,
                tersedia: item.tersedia, // Trust the database value
                status: item.status
            });
        }
      });

      const allStockItems: StockItem[] = Array.from(aggregatedMap.values());

      // Set all stock items
      setStockItems(allStockItems);

      // Load rack locations
      const { data: rackData, error: rackError } = await supabase
        .from('rack_locations')
        .select('id, nama, status')
        .eq('status', 'Aktif')
        .order('nama', { ascending: true });

      if (rackError) {
        console.error('Error loading rack locations:', rackError);
        showToast('Gagal memuat data lokasi rak', 'warning');
        setRackLocations([]);
      } else {
        setRackLocations(rackData || []);
      }

    } catch (error) {
      console.error('Error loading initial data:', error);
      showToast('Gagal memuat data. Periksa koneksi database.', 'error');
      setStockItems([]);
      setRackLocations([]);
    } finally {
      setLoading(false);
    }
  };

  // Memoized filtered items for better performance
  const filteredItems = useMemo(() => {
    return stockItems.filter(item =>
      item.tersedia > 0 && // Only show items with available stock
      (item.nama_produk.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.rak.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [stockItems, searchTerm]);

  const filteredRacks = useMemo(() => {
    return rackLocations.filter(rack =>
      rack.nama.toLowerCase().includes(moveData.rak_tujuan.toLowerCase()) &&
      rack.nama !== selectedItem?.rak && // Exclude current rack
      !RESTRICTED_RACKS.includes(rack.nama.toUpperCase()) // Exclude restricted racks
    );
  }, [rackLocations, moveData.rak_tujuan, selectedItem]);

  const handleItemSelect = (item: StockItem) => {
    setSelectedItem(item);
    setSearchTerm(item.nama_produk);
    setShowItemDropdown(false);
    setMoveData({
      rak_tujuan: '',
      jumlah_pindah: ''
    });
    // Pindahkan fokus ke input rak tujuan
    setTimeout(() => rakTujuanInputRef.current?.focus(), 0);
  };

  const [isRakTujuanValidated, setIsRakTujuanValidated] = useState(false);

  const handleRakTujuanSelect = (rakNama: string) => {
    const upperValue = rakNama.toUpperCase().trim();

    if (RESTRICTED_RACKS.includes(upperValue)) {
      showToast(`Rak ${upperValue} tidak diizinkan sebagai tujuan pemindahan`, 'error');
      return;
    }

    setMoveData({ ...moveData, rak_tujuan: upperValue });
    setShowRakTujuanDropdown(false);
    setIsRakTujuanValidated(true);
  };

  const clearSelection = () => {
    setSelectedItem(null);
    setSearchTerm('');
    setMoveData({
      rak_tujuan: '',
      jumlah_pindah: ''
    });
    setIsRakTujuanValidated(false);
  };

  const updateProgress = (step: string, completed: number) => {
    setOperationProgress(prev => ({
      ...prev,
      currentStep: step,
      completedSteps: completed
    }));
  };

  const handleSubmit = async () => {
    if (!selectedItem || !moveData.rak_tujuan || moveData.jumlah_pindah === '' || moveData.jumlah_pindah <= 0) {
      showToast('Mohon lengkapi semua data yang diperlukan', 'warning');
      return;
    }

    const rakTujuanUpper = moveData.rak_tujuan.toUpperCase().trim();
    if (RESTRICTED_RACKS.includes(rakTujuanUpper)) {
      showToast(`Tidak diperbolehkan memindahkan barang ke Rak ${rakTujuanUpper}`, 'error');
      return;
    }

    if (!isRakTujuanValidated) {
      showToast('Mohon pilih rak tujuan dari dropdown yang tersedia', 'warning');
      return;
    }

    if (moveData.jumlah_pindah > selectedItem.tersedia) {
      showToast(`Jumlah pindah tidak boleh melebihi stok tersedia (${selectedItem.tersedia})`, 'error');
      return;
    }

    try {
      setSubmitting(true);
      const operationSteps = [
        'Menyiapkan data transfer',
        'Membuat log entry untuk output dari rak asal',
        'Membuat log entry untuk input ke rak tujuan',
        'Memeriksa stock item tujuan',
        'Membuat stock item di rak tujuan (jika diperlukan)',
        'Validasi final dan reload data'
      ];

      setOperationProgress({
        isVisible: true,
        currentStep: operationSteps[0],
        steps: operationSteps,
        completedSteps: 0
      });

      const rakTujuanFinal = moveData.rak_tujuan.toUpperCase().trim();
      const now = new Date();
      const tgl = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const waktu = now.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit'
      });

      updateProgress(operationSteps[1], 1);

      // Fetch original IN log for this item to inherit its tgl, tgl_scan & waktu
      const { data: logData, error: originalLogError } = await supabase
          .from('database_log')
          .select('tgl, tgl_scan, created_at, waktu, rak')
          .ilike('sku', `%${selectedItem.nama_produk.trim()}%`)
          .or('type.ilike.%IN%,type.ilike.%MOVE%,type.ilike.%TRANSFER%');
      
      let originalLog = null;
      if (logData && logData.length > 0) {
          // Prioritize matching rack, then sort descending by created_at (newest active batch first)
          const rackMatched = logData.filter(l => l.rak && l.rak.trim().toLowerCase() === selectedItem.rak.trim().toLowerCase());
          const targetList = rackMatched.length > 0 ? rackMatched : logData;
          originalLog = targetList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      }

      if (originalLogError) {
          console.error('Error fetching original log:', originalLogError);
          showToast(`Gagal mengambil data tgl masuk asli: ${originalLogError.message || 'unknown error'}`, 'error');
      }

      const tglAsli = originalLog?.tgl || tgl;
      const tglScanAsli = originalLog?.tgl_scan || originalLog?.tgl || tgl;
      const waktuAsli = originalLog?.waktu || waktu;
      
      // Helper to add +1 minute to waktu string
      const addOneMinuteToWaktu = (waktuStr: string): string => {
        if (!waktuStr) return waktuStr;
        const separator = waktuStr.includes('.') ? '.' : ':';
        const parts = waktuStr.split(separator).map(p => parseInt(p, 10));
        
        if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          let hours = parts[0];
          let minutes = parts[1] + 1;
          let seconds = parts[2] || 0;

          if (minutes >= 60) {
            minutes = 0;
            hours = (hours + 1) % 24;
          }

          const h = String(hours).padStart(2, '0');
          const m = String(minutes).padStart(2, '0');
          const s = parts.length >= 3 ? separator + String(seconds).padStart(2, '0') : '';
          return h + separator + m + s;
        }
        return waktuStr;
      };

      // Use current timestamp for created_at so transaction logs sort properly to the top
      const createdAtOut = new Date(now.getTime() + 1000).toISOString();
      const createdAtIn = new Date(now.getTime() + 2000).toISOString();
      const waktuOut = addOneMinuteToWaktu(waktuAsli);
      const waktuIn = addOneMinuteToWaktu(waktuAsli);

      const logEntries = [
        {
          tgl: tglAsli,
          waktu: waktuOut,
          sku: selectedItem.nama_produk,
          jumlah: moveData.jumlah_pindah,
          type: 'OUT',
          gudang: 'TRANSFER',
          rak: selectedItem.rak,
          tgl_scan: tglScanAsli,
          user_name: 'System',
          sub_rak: selectedItem.sub_rak || selectedItem.rak,
          created_at: createdAtOut
        },
        {
          tgl: tglAsli,
          waktu: waktuIn,
          sku: selectedItem.nama_produk,
          jumlah: moveData.jumlah_pindah,
          type: 'IN',
          gudang: 'TRANSFER',
          rak: rakTujuanFinal,
          tgl_scan: tglScanAsli,
          user_name: 'System',
          sub_rak: rakTujuanFinal,
          created_at: createdAtIn
        }
      ];

      const { data: insertedData, error: logError } = await DatabaseService.insertLogs(logEntries, writeMode);

      if (insertedData) {
        // Workaround for Supabase Trigger bug overwriting IN tgl_scan to today's date
        const inLog = insertedData.find((l: any) => l.type === 'IN');
        if (inLog && inLog.id) {
           await DatabaseService.updateLog(inLog.id, { tgl_scan: tglScanAsli, tgl: tglAsli }, writeMode);
        }
      }

      if (logError) {
        console.error('Error creating log entries:', logError);
        showToast(`Gagal mencatat perpindahan barang: ${logError.message}`, 'error');
        setOperationProgress(prev => ({ ...prev, isVisible: false }));
        return;
      }

      updateProgress(operationSteps[3], 3);

      const { data: existingStock, error: checkError } = await supabase
        .from('stock_items')
        .select('id')
        .eq('nama_produk', selectedItem.nama_produk)
        .eq('rak', rakTujuanFinal)
        .maybeSingle();

      if (checkError) {
        console.error('Error checking existing stock:', checkError);
        showToast('Gagal memeriksa stok tujuan', 'warning');
      }

      let stockItemCreated = false;

      if (!existingStock) {
        updateProgress(operationSteps[4], 4);

        const { error: insertError } = await DatabaseService.insertStockItems([{
          nama_produk: selectedItem.nama_produk,
          packing: selectedItem.packing,
          rak: rakTujuanFinal,
          sub_rak: rakTujuanFinal,
          satuan: selectedItem.satuan,
          stok_awal: 0,
          status: 'Aktif'
        }], writeMode);

        if (insertError) {
          console.error('Error creating destination stock item:', insertError);
          showToast(`Gagal membuat item stok tujuan: ${insertError.message}`, 'error');
          setOperationProgress(prev => ({ ...prev, isVisible: false }));
          return;
        }

        stockItemCreated = true;
      }

      updateProgress(operationSteps[5], 6);

      showToast(
        `Berhasil memindahkan ${moveData.jumlah_pindah} ${selectedItem.satuan} ${selectedItem.nama_produk} dari ${selectedItem.rak} ke ${rakTujuanFinal}${stockItemCreated ? ' (stock item baru dibuat)' : ''}`,
        'success'
      );

      setTimeout(() => {
        setOperationProgress(prev => ({ ...prev, isVisible: false }));
        clearSelection();
        loadInitialData();
      }, 1000);

    } catch (error) {
      console.error('Error moving item:', error);
      showToast(`Terjadi kesalahan saat memindahkan barang: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      setOperationProgress(prev => ({ ...prev, isVisible: false }));
    } finally {
      setSubmitting(false);
    }
  };

  // Handle outside clicks for dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      if (itemInputRef.current && !itemInputRef.current.contains(target) && !target.closest('.item-dropdown-container')) {
        setShowItemDropdown(false);
      }

      if (rakTujuanInputRef.current && !rakTujuanInputRef.current.contains(target) && !target.closest('.rak-dropdown-container')) {
        setShowRakTujuanDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset highlight index when search term changes
  useEffect(() => {
    setHighlightedItemIndex(0);
  }, [searchTerm]);

  useEffect(() => {
    setHighlightedRakIndex(0);
  }, [moveData.rak_tujuan]);

  // Auto-scroll for item dropdown
  useEffect(() => {
    if (showItemDropdown && itemDropdownRef.current) {
      const highlightedElement = itemDropdownRef.current.children[highlightedItemIndex] as HTMLElement;
      if (highlightedElement) {
        highlightedElement.scrollIntoView({
          block: 'nearest',
          inline: 'start'
        });
      }
    }
  }, [highlightedItemIndex, showItemDropdown]);

  // Auto-scroll for rack dropdown
  useEffect(() => {
    if (showRakTujuanDropdown && rakDropdownRef.current) {
      const highlightedElement = rakDropdownRef.current.children[highlightedRakIndex] as HTMLElement;
      if (highlightedElement) {
        highlightedElement.scrollIntoView({
          block: 'nearest',
          inline: 'start'
        });
      }
    }
  }, [highlightedRakIndex, showRakTujuanDropdown]);

  // Keyboard navigation for item dropdown
  const handleItemKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showItemDropdown) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedItemIndex(prev => (prev + 1) % filteredItems.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedItemIndex(prev => (prev - 1 + filteredItems.length) % filteredItems.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (filteredItems.length > 0) {
          e.preventDefault();
          handleItemSelect(filteredItems[highlightedItemIndex]);
        }
      }
    }
  };

  // Keyboard navigation for rak dropdown
  const handleRakKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showRakTujuanDropdown) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedRakIndex(prev => (prev + 1) % filteredRacks.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedRakIndex(prev => (prev - 1 + filteredRacks.length) % filteredRacks.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (filteredRacks.length > 0) {
          e.preventDefault();
          handleRakTujuanSelect(filteredRacks[highlightedRakIndex].nama);
        }
      }
    }
  };




  // --- Maintenance Mode ---
  const isMaintenanceMode = false; // Set to true to enable maintenance mode

  if (isMaintenanceMode) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 space-y-6">
        <div className="relative">
          <div className="absolute inset-0 bg-blue-100 rounded-full animate-ping opacity-75"></div>
          <div className="relative bg-white p-6 rounded-full shadow-xl border-4 border-blue-100">
            <div className="relative">
              <Wrench className="h-16 w-16 text-blue-600 animate-pulse relative z-10" />
              <Hammer className="h-12 w-12 text-blue-400 absolute -right-4 -bottom-2 transform -rotate-12" />
            </div>
          </div>
        </div>

        <div className="max-w-md space-y-2">
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">
            Sedang Dalam Perbaikan
          </h2>
          <p className="text-slate-500 font-medium text-lg">
            Fitur <span className="text-blue-600 font-bold">Pindah Data Barang</span> sedang ditingkatkan performanya.
          </p>
          <div className="pt-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-semibold border border-blue-100">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Estimasi: Segera Kembali</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Toast
        isOpen={toast.isOpen}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ isOpen: false, message: '', type: 'info' })}
      />

      {operationProgress.isVisible && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 pointer-events-auto shadow-lg">
            <div className="flex items-center space-x-3 mb-6">
              <Loader className="h-5 w-5 animate-spin text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-800">Memproses Transfer Barang</h3>
            </div>

            <div className="space-y-3 mb-6">
              {operationProgress.steps.map((step, index) => (
                <div key={index} className="flex items-start space-x-3">
                  <div className="flex-shrink-0 mt-1">
                    {index < operationProgress.completedSteps ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : index === operationProgress.completedSteps ? (
                      <Loader className="h-5 w-5 animate-spin text-blue-600" />
                    ) : (
                      <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm ${index < operationProgress.completedSteps
                      ? 'text-green-700 line-through'
                      : index === operationProgress.completedSteps
                        ? 'text-blue-700 font-medium'
                        : 'text-gray-500'
                      }`}>
                      {step}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${(operationProgress.completedSteps / operationProgress.steps.length) * 100}%`
                }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* PREMIUM IMMERSIVE HEADER (310px) */}
        <div className="flex flex-col mb-8 lg:mb-12 uppercase">
          <div className="bg-gradient-to-br from-blue-700 via-indigo-800 to-slate-900 pt-[90px] lg:pt-0 lg:h-[310px] pb-[75px] lg:pb-0 px-6 lg:px-12 rounded-b-[40px] lg:rounded-b-[55px] shadow-2xl shadow-blue-900/40 relative overflow-hidden transition-all duration-500 flex flex-col justify-center">

            {/* Decorative Background Icon */}
            <div className="absolute -top-12 -right-12 text-white opacity-5">
              <ArrowRightLeft className="w-72 h-72 lg:w-[520px] lg:h-[520px]" />
            </div>

            {/* Decorative Floating Elements */}
            <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute bottom-1/4 right-1/4 w-24 h-24 bg-indigo-500/10 rounded-3xl rotate-45 blur-2xl"></div>

            {/* Text Content */}
            <div className="relative z-10 w-full flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 uppercase text-left">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2 mb-3 lg:mb-4 opacity-90 text-left">
                  <div className="w-10 h-[2px] bg-blue-400 rounded-full"></div>
                  <span className="text-[10px] lg:text-[12px] font-black tracking-[0.4em] text-blue-100">Digital Redistribution System</span>
                </div>
                <h1 className="text-[34px] lg:text-[62px] font-black text-white tracking-tighter leading-[0.9] mb-3 uppercase">
                  Pindah Data <span className="text-blue-400">Barang</span>
                </h1>
                <div className="text-blue-100/80 font-medium text-[14px] lg:text-[18px] leading-relaxed max-w-[90%] normal-case flex items-center gap-3">
                  <div className="px-3 py-1 bg-white/10 rounded-full backdrop-blur-sm border border-white/10 flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                    </span>
                    <span className="text-[11px] font-bold tracking-widest uppercase">System Online</span>
                  </div>
                  <span className="opacity-60 hidden sm:inline">|</span>
                  <span className="text-[13px] lg:text-[16px]">Optimalkan alokasi stok antar lokasi rak dengan presisi tinggi</span>
                </div>
              </div>

              {/* Global Actions Container - Unified Header Actions */}
              <div className="relative z-10 flex flex-wrap gap-2 lg:gap-3 lg:mb-2 items-center">
                {loading && (
                  <div className="px-5 py-2.5 bg-blue-500/10 backdrop-blur-md border border-white/10 rounded-2xl flex items-center gap-3 mr-2 animate-in fade-in duration-500">
                    <RefreshCw className="w-4 h-4 text-white animate-spin" />
                    <span className="text-[11px] font-black text-white tracking-[0.2em] uppercase">Syncing...</span>
                  </div>
                )}

                <button
                  onClick={loadInitialData}
                  disabled={loading}
                  className="h-12 px-6 bg-white hover:bg-blue-50 text-blue-700 font-black rounded-2xl shadow-[0_8px_25px_rgba(255,255,255,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2.5 border-none disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  <span className="uppercase text-xs font-black">Refresh Data</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:px-10 pb-12 -mt-6 lg:-mt-10">
          {/* Marquee/Running Text */}
          <div className="bg-gradient-to-r from-blue-700 via-blue-800 to-blue-700 text-white py-2.5 px-6 rounded-2xl overflow-hidden shadow-xl border border-blue-900/50 mb-8 relative z-20">
            <div className="flex items-center whitespace-nowrap animate-marquee">
              <div className="flex items-center space-x-4 pr-12">
                <span className="flex items-center gap-2 font-black uppercase tracking-wider text-[10px] bg-amber-400 text-blue-900 px-3 py-1 rounded-full shadow-sm">
                  <AlertCircle className="h-3 w-3" /> PENTING
                </span>
                <span className="font-bold text-xs lg:text-sm tracking-tight uppercase">
                  Pindah data hanya diperbolehkan dari **Rak Utama** ke **Rak Utama** lainnya. Transaksi ke rak restricted (Eceran/Lantai tertentu) tidak diizinkan.
                </span>
              </div>
              <div className="flex items-center space-x-4 pr-12">
                <span className="flex items-center gap-2 font-black uppercase tracking-wider text-[10px] bg-amber-400 text-blue-900 px-3 py-1 rounded-full shadow-sm">
                  <AlertCircle className="h-3 w-3" /> PENTING
                </span>
                <span className="font-bold text-xs lg:text-sm tracking-tight uppercase">
                  Pindah data hanya diperbolehkan dari **Rak Utama** ke **Rak Utama** lainnya. Transaksi ke rak restricted (Eceran/Lantai tertentu) tidak diizinkan.
                </span>
              </div>
            </div>
          </div>

          <style>
            {`
            @keyframes marquee {
              0% { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
            .animate-marquee {
              display: inline-flex;
              animation: marquee 25s linear infinite;
            }
            .animate-marquee:hover {
              animation-play-state: paused;
            }
          `}
          </style>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Form Section */}
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                  <ArrowRightLeft className="h-5 w-5 mr-2 text-blue-600" />
                  Form Pindah Barang
                </h3>

                <div className="space-y-4">
                  {/* Item Selection */}
                  <div className="item-dropdown-container">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Pilih Barang ({stockItems.filter(item => item.tersedia > 0).length} item dengan stok)
                    </label>
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
                        className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Ketik nama barang dengan stok tersedia..."
                      />
                      {searchTerm && (
                        <button
                          onClick={() => {
                            setSearchTerm('');
                            setSelectedItem(null);
                            setShowItemDropdown(false);
                          }}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1.5 bg-red-50 text-red-500 hover:bg-red-100 text-red-600 rounded-lg transition-all border border-red-100 backdrop-blur-sm shadow-sm"
                          aria-label="Hapus pencarian"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}

                      {showItemDropdown && (
                        <div ref={itemDropdownRef} className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-64 overflow-y-auto">
                          {filteredItems.length > 0 ? (
                            filteredItems.slice(0, 50).map((item, index) => (
                              <div
                                key={item.id}
                                onClick={() => handleItemSelect(item)}
                                className={`px-3 py-2 text-sm cursor-pointer border-b border-gray-100 last:border-b-0 ${index === highlightedItemIndex ? 'bg-blue-100' : 'hover:bg-blue-50'
                                  }`}
                              >
                                <div className="font-medium text-gray-900">{item.nama_produk}</div>
                                <div className="text-xs text-gray-500">
                                  Rak: {item.rak} | Tersedia: {item.tersedia} {item.satuan}
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="px-3 py-2 text-sm text-gray-500">
                              {searchTerm ? 'Tidak ada barang dengan stok tersedia yang cocok' : 'Ketik untuk mencari barang dengan stok tersedia...'}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Selected Item Info */}
                  {selectedItem && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <h4 className="font-medium text-green-800 mb-2">Barang Terpilih:</h4>
                      <div className="text-sm text-green-700 space-y-1">
                        <div><strong>Nama:</strong> {selectedItem.nama_produk}</div>
                        <div><strong>Rak Asal:</strong> {selectedItem.rak}</div>
                        <div><strong>Stok Tersedia:</strong> {selectedItem.tersedia} {selectedItem.satuan}</div>
                        <div><strong>Packing:</strong> {selectedItem.packing}</div>
                      </div>
                    </div>
                  )}

                  {/* Destination Rack */}
                  {selectedItem && (
                    <div className="rak-dropdown-container">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Rak Tujuan
                      </label>
                      <div className="relative">
                        <input
                          ref={rakTujuanInputRef}
                          type="text"
                          value={moveData.rak_tujuan}
                          onChange={(e) => {
                            const upperValue = e.target.value.toUpperCase().trimEnd();
                            setMoveData({ ...moveData, rak_tujuan: upperValue });
                            setShowRakTujuanDropdown(true);
                            setIsRakTujuanValidated(false);
                          }}
                          onFocus={() => {
                            setShowRakTujuanDropdown(true);
                            setHighlightedRakIndex(0);
                          }}
                          onKeyDown={handleRakKeyDown}
                          className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Pilih atau ketik rak tujuan..."
                        />
                        {moveData.rak_tujuan && (
                          <button
                            onClick={() => {
                              setMoveData({ ...moveData, rak_tujuan: '' });
                              setShowRakTujuanDropdown(false);
                              setIsRakTujuanValidated(false);
                            }}
                            className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1.5 bg-red-50 text-red-500 hover:bg-red-100 text-red-600 rounded-lg transition-all border border-red-100 backdrop-blur-sm shadow-sm"
                            aria-label="Hapus rak tujuan"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}

                        {showRakTujuanDropdown && (
                          <div ref={rakDropdownRef} className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                            {filteredRacks.length > 0 ? (
                              filteredRacks.map((rack, index) => (
                                <div
                                  key={rack.id}
                                  onClick={() => handleRakTujuanSelect(rack.nama)}
                                  className={`px-3 py-2 text-sm cursor-pointer border-b border-gray-100 last:border-b-0 ${index === highlightedRakIndex ? 'bg-blue-100' : 'hover:bg-blue-50'
                                    }`}
                                >
                                  {rack.nama}
                                </div>
                              ))
                            ) : (
                              <div className="px-3 py-2 text-sm text-gray-500">
                                {moveData.rak_tujuan ? 'Tidak ada rak yang cocok' : 'Ketik untuk mencari rak...'}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Quantity */}
                  {selectedItem && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Jumlah Pindah
                      </label>
                      <input
                        type="number"
                        min="1"
                        max={selectedItem.tersedia}
                        value={moveData.jumlah_pindah}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '') {
                            setMoveData({ ...moveData, jumlah_pindah: '' });
                          } else {
                            const parsed = parseInt(val);
                            setMoveData({ ...moveData, jumlah_pindah: isNaN(parsed) ? '' : parsed });
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Masukkan jumlah..."
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Maksimal: {selectedItem.tersedia} {selectedItem.satuan}
                      </p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex space-x-3 pt-4">
                    <Button
                      onClick={clearSelection}
                      disabled={submitting}
                      className="flex-1 h-11 bg-white/10 hover:bg-white/20 text-slate-700 font-bold rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.1)] transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center gap-2 border border-slate-200 backdrop-blur-xl"
                    >
                      <X className="h-4 w-4" />
                      <span className="uppercase text-xs tracking-wider font-bold">Clear</span>
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      disabled={submitting || !selectedItem || !moveData.rak_tujuan || !isRakTujuanValidated || moveData.jumlah_pindah === '' || moveData.jumlah_pindah <= 0}
                      className="flex-[2] h-11 bg-gradient-to-br from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white font-bold rounded-xl shadow-[0_4px_15px_rgba(37,99,235,0.4)] hover:shadow-blue-500/50 transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center gap-2 border border-white/20 backdrop-blur-md disabled:opacity-50"
                    >
                      {submitting ? (
                        <Loader className="h-5 w-5 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      <span className="uppercase text-xs tracking-wider font-bold">
                        {submitting ? 'Memindahkan...' : 'Pindahkan'}
                      </span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Summary Section */}
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Ringkasan Perpindahan</h3>

                {selectedItem && moveData.rak_tujuan ? (
                  <div className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-medium text-blue-800">Dari:</span>
                        <span className="text-blue-600">{selectedItem.rak}</span>
                      </div>
                      <div className="flex items-center justify-center mb-3">
                        <ArrowRightLeft className="h-6 w-6 text-blue-600" />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-blue-800">Ke:</span>
                        <span className="text-blue-600">{moveData.rak_tujuan}</span>
                      </div>
                    </div>

                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Barang:</span>
                        <span className="font-medium">{selectedItem.nama_produk}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Jumlah Pindah:</span>
                        <span className="font-medium text-green-600">
                          {moveData.jumlah_pindah !== '' ? `${moveData.jumlah_pindah} ${selectedItem.satuan}` : '-'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Sisa di Rak Asal:</span>
                        <span className="font-medium">
                          {selectedItem.tersedia - (typeof moveData.jumlah_pindah === 'number' ? moveData.jumlah_pindah : 0)} {selectedItem.satuan}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-8">
                    <ArrowRightLeft className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p>Pilih barang dan rak tujuan untuk melihat ringkasan perpindahan</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Statistics */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
              <div>
                <span className="font-medium">Total Item di Database:</span>
                <span className="ml-1 text-blue-600">{stockItems.length.toLocaleString()}</span>
              </div>
              <div>
                <span className="font-medium">Item dengan Stok:</span>
                <span className="ml-1 text-green-600">{stockItems.filter(item => item.tersedia > 0).length.toLocaleString()}</span>
              </div>
              <div>
                <span className="font-medium">Total Lokasi Rak:</span>
                <span className="ml-1 text-purple-600">{rackLocations.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}