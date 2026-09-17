import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Toast } from './ui/Toast';
import { ArrowRightLeft, X, Send, RefreshCw, AlertCircle, CheckCircle, Loader, Wrench, Hammer, Zap, Sparkles, Scale, Layers, AlertTriangle, CheckSquare, Square, Search } from 'lucide-react';
import { supabase, fetchAllStockItems } from '../lib/supabase';
import { DatabaseService } from '../lib/DatabaseService';
import { useDatabaseConfig } from '../lib/DatabaseContext';
import { useAuth } from '../lib/AuthContext';
import { getOriginalReceiptDate, getRealtimeDateTime } from '../lib/transferDateHelper';
import { AutoKlopMinusModal, getRackBatchKey, getRackBatchLabel } from './AutoKlopMinusModal';
import { toggleOpnameZoneSession } from '../services/opnameZoneBridgeService';

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

interface SkuAggregatedItem {
  nama_produk: string;
  satuan: string;
  packing: string;
  totalTersedia: number;
  totalPlus: number;
  totalMinus: number;
  locations: {
    rak: string;
    sub_rak: string;
    tersedia: number;
    id: string;
  }[];
  minusLocations: {
    rak: string;
    sub_rak: string;
    tersedia: number;
    id: string;
  }[];
  plusLocations: {
    rak: string;
    sub_rak: string;
    tersedia: number;
    id: string;
  }[];
  pairPlans: {
    sourceRak: string;
    sourceSubRak: string;
    targetRak: string;
    targetSubRak: string;
    qty: number;
  }[];
}

interface RackLocation {
  id: string;
  nama: string;
  status: string;
}

const RESTRICTED_RACKS = ['LANTAI 2', 'LANTAI 4', 'ECER-M', 'ECER-N', 'ECER-O', 'BLOK-I'];
const DEFAULT_TEMP_RACKS = ['TEMP-A', 'TEMP-B', 'TEMP-C', 'TEMP-D', 'TEMP-E', 'TEMP-F'];

export function PindahDataBarang() {
  const { writeMode } = useDatabaseConfig();
  const { user, userRole, userEmail } = useAuth();

  // Role check: Developer and Admin only
  const isDevOrAdmin = useMemo(() => {
    const role = (userRole || '').trim().toLowerCase();
    return (
      role === 'developer' ||
      role === 'admin' ||
      role.includes('admin') ||
      role.includes('developer') ||
      user?.email === 'devmode' ||
      userEmail === 'rianambong@gmail.com' ||
      userEmail === 'kepin@gmail.com' ||
      userEmail === 'admin@gmail.com' ||
      localStorage.getItem('devmode') === 'true'
    );
  }, [user, userRole, userEmail]);

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

  // Modal State for Real-Time Transfer & Auto-Klop (Developer & Admin)
  const [showRealtimeModal, setShowRealtimeModal] = useState(false);
  const [realtimeModalMode, setRealtimeModalMode] = useState<'SINGLE' | 'BATCH'>('SINGLE');
  const [showAutoKlopModal, setShowAutoKlopModal] = useState(false);
  const [modalSkuSearch, setModalSkuSearch] = useState('');
  const [selectedSkuAggregate, setSelectedSkuAggregate] = useState<SkuAggregatedItem | null>(null);
  const [modalShowSkuDropdown, setModalShowSkuDropdown] = useState(false);
  const [modalRakTujuan, setModalRakTujuan] = useState('');
  const [modalShowRakDropdown, setModalShowRakDropdown] = useState(false);
  const [modalJumlahPindah, setModalJumlahPindah] = useState<number | ''>('');
  const [isModalRakValidated, setIsModalRakValidated] = useState(false);
  const [modalHighlightedSkuIndex, setModalHighlightedSkuIndex] = useState(0);
  const [modalHighlightedRakIndex, setModalHighlightedRakIndex] = useState(0);

  // Real-time Batch Mass Transfer States
  const [batchSelectedKey, setBatchSelectedKey] = useState<string>('ALL');
  const [batchSearchQuery, setBatchSearchQuery] = useState<string>('');
  const [batchSelectedItems, setBatchSelectedItems] = useState<Set<string>>(new Set());
  const [batchDestRak, setBatchDestRak] = useState<string>('');
  const [batchShowRakDropdown, setBatchShowRakDropdown] = useState(false);
  const [isBatchRakValidated, setIsBatchRakValidated] = useState(false);
  const [batchHighlightedRakIndex, setBatchHighlightedRakIndex] = useState(0);

  const modalSkuInputRef = useRef<HTMLInputElement>(null);
  const modalRakInputRef = useRef<HTMLInputElement>(null);
  const modalSkuDropdownRef = useRef<HTMLDivElement>(null);
  const modalRakDropdownRef = useRef<HTMLDivElement>(null);
  const batchDestRakInputRef = useRef<HTMLInputElement>(null);
  const batchDestRakDropdownRef = useRef<HTMLDivElement>(null);

  // Aggregated SKU list (pure unique SKUs with accurate net physical surplus and auto-klop pair plans)
  const skuAggregatedList = useMemo<SkuAggregatedItem[]>(() => {
    const map = new Map<string, {
      nama_produk: string;
      satuan: string;
      packing: string;
      totalPlus: number;
      totalMinus: number;
      locations: { rak: string; sub_rak: string; tersedia: number; id: string; }[];
      minusLocations: { rak: string; sub_rak: string; tersedia: number; id: string; }[];
      plusLocations: { rak: string; sub_rak: string; tersedia: number; id: string; }[];
    }>();

    stockItems.forEach(item => {
      const sku = item.nama_produk ? item.nama_produk.trim() : '';
      if (!sku) return;
      const qty = Number(item.tersedia) || 0;

      if (!map.has(sku)) {
        map.set(sku, {
          nama_produk: sku,
          satuan: item.satuan || 'PCS',
          packing: item.packing || '',
          totalPlus: 0,
          totalMinus: 0,
          locations: [],
          minusLocations: [],
          plusLocations: []
        });
      }

      const rec = map.get(sku)!;
      rec.locations.push({
        rak: item.rak,
        sub_rak: item.sub_rak || item.rak,
        tersedia: qty,
        id: item.id
      });

      if (qty < 0) {
        rec.totalMinus += Math.abs(qty);
        rec.minusLocations.push({
          rak: item.rak,
          sub_rak: item.sub_rak || item.rak,
          tersedia: qty,
          id: item.id
        });
      } else if (qty > 0) {
        rec.totalPlus += qty;
        rec.plusLocations.push({
          rak: item.rak,
          sub_rak: item.sub_rak || item.rak,
          tersedia: qty,
          id: item.id
        });
      }
    });

    const result: SkuAggregatedItem[] = [];

    map.forEach(rec => {
      // Net physical available stock in warehouse
      const netTersedia = Math.max(0, rec.totalPlus - rec.totalMinus);

      // Compute auto-balancing pair plans if there are minus locations and plus locations
      const pairPlans: {
        sourceRak: string;
        sourceSubRak: string;
        targetRak: string;
        targetSubRak: string;
        qty: number;
      }[] = [];

      if (rec.minusLocations.length > 0 && rec.plusLocations.length > 0) {
        const minusList = rec.minusLocations.map(m => ({
          rak: m.rak,
          sub_rak: m.sub_rak,
          needed: Math.abs(m.tersedia)
        }));

        const plusList = [...rec.plusLocations]
          .sort((a, b) => b.tersedia - a.tersedia)
          .map(p => ({
            rak: p.rak,
            sub_rak: p.sub_rak,
            available: p.tersedia
          }));

        for (const m of minusList) {
          if (m.needed <= 0) continue;
          for (const p of plusList) {
            if (p.available <= 0) continue;
            const transferQty = Math.min(m.needed, p.available);
            if (transferQty > 0) {
              pairPlans.push({
                sourceRak: p.rak,
                sourceSubRak: p.sub_rak,
                targetRak: m.rak,
                targetSubRak: m.sub_rak,
                qty: transferQty
              });
              m.needed -= transferQty;
              p.available -= transferQty;
            }
            if (m.needed <= 0) break;
          }
        }
      }

      // Include SKU if it has either plus stock or minus stock
      if (rec.totalPlus > 0 || rec.totalMinus > 0) {
        result.push({
          nama_produk: rec.nama_produk,
          satuan: rec.satuan,
          packing: rec.packing,
          totalTersedia: netTersedia,
          totalPlus: rec.totalPlus,
          totalMinus: rec.totalMinus,
          locations: rec.locations,
          minusLocations: rec.minusLocations,
          plusLocations: rec.plusLocations,
          pairPlans
        });
      }
    });

    return result.sort((a, b) => a.nama_produk.localeCompare(b.nama_produk));
  }, [stockItems]);

  const modalFilteredSkus = useMemo(() => {
    if (!modalSkuSearch.trim()) return skuAggregatedList;
    const term = modalSkuSearch.toLowerCase().trim();
    return skuAggregatedList.filter(item =>
      item.nama_produk.toLowerCase().includes(term)
    );
  }, [skuAggregatedList, modalSkuSearch]);

  // Real-Time modal only allows TEMP racks as destination
  const modalFilteredRacks = useMemo(() => {
    const tempFromDb = rackLocations.filter(rack => rack.nama.toUpperCase().startsWith('TEMP'));
    const existingNames = new Set(tempFromDb.map(r => r.nama.toUpperCase()));
    const combined = [...tempFromDb];
    DEFAULT_TEMP_RACKS.forEach(def => {
      if (!existingNames.has(def)) {
        combined.push({ id: `temp-${def.toLowerCase()}`, nama: def, status: 'Aktif' });
      }
    });

    const term = modalRakTujuan.toLowerCase().trim();
    return combined.filter(rack =>
      rack.nama.toLowerCase().includes(term)
    ).sort((a, b) => a.nama.localeCompare(b.nama));
  }, [rackLocations, modalRakTujuan]);

  const batchFilteredDestRacks = useMemo(() => {
    const tempFromDb = rackLocations.filter(rack => rack.nama.toUpperCase().startsWith('TEMP'));
    const existingNames = new Set(tempFromDb.map(r => r.nama.toUpperCase()));
    const combined = [...tempFromDb];
    DEFAULT_TEMP_RACKS.forEach(def => {
      if (!existingNames.has(def)) {
        combined.push({ id: `temp-${def.toLowerCase()}`, nama: def, status: 'Aktif' });
      }
    });

    const term = batchDestRak.toLowerCase().trim();
    return combined.filter(rack =>
      rack.nama.toLowerCase().includes(term)
    ).sort((a, b) => a.nama.localeCompare(b.nama));
  }, [rackLocations, batchDestRak]);

  // Batch summaries and filtered items for Batch Mass Transfer Mode
  const batchSummaries = useMemo(() => {
    const itemsWithStock = stockItems.filter(i => i.tersedia > 0);
    const map = new Map<string, { key: string; label: string; count: number; totalQty: number; items: StockItem[] }>();

    itemsWithStock.forEach(item => {
      const key = getRackBatchKey(item.rak);
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: getRackBatchLabel(key),
          count: 0,
          totalQty: 0,
          items: []
        });
      }
      const entry = map.get(key)!;
      entry.count += 1;
      entry.totalQty += item.tersedia;
      entry.items.push(item);
    });

    const list = Array.from(map.values()).sort((a, b) => {
      if (a.key.length === 1 && b.key.length === 1) return a.key.localeCompare(b.key);
      if (a.key.length === 1) return -1;
      if (b.key.length === 1) return 1;
      return a.label.localeCompare(b.label);
    });

    const totalCount = itemsWithStock.length;
    const totalQty = itemsWithStock.reduce((s, i) => s + i.tersedia, 0);

    return {
      all: { count: totalCount, totalQty, items: itemsWithStock },
      batches: list
    };
  }, [stockItems]);

  const batchDisplayedItems = useMemo(() => {
    let items = batchSelectedKey === 'ALL'
      ? batchSummaries.all.items
      : (batchSummaries.batches.find(b => b.key === batchSelectedKey)?.items || []);

    if (batchSearchQuery.trim()) {
      const q = batchSearchQuery.toLowerCase().trim();
      items = items.filter(i =>
        i.nama_produk.toLowerCase().includes(q) ||
        i.rak.toLowerCase().includes(q) ||
        (i.sub_rak && i.sub_rak.toLowerCase().includes(q))
      );
    }
    return items;
  }, [batchSummaries, batchSelectedKey, batchSearchQuery]);

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

    if (rakTujuanUpper.startsWith('TEMP')) {
      showToast('Rak TEMP adalah lokasi transit khusus fitur Real-Time. Gunakan tombol "Pindah Real-Time" di atas untuk memindahkan ke rak TEMP.', 'warning');
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
        'Menyiapkan data transfer (Logika Standar: Tanggal Nota Asli)',
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

      updateProgress(operationSteps[1], 1);

      // Fetch original supplier receipt date and time (pure without adding minutes)
      const originalInfo = await getOriginalReceiptDate(selectedItem.nama_produk, selectedItem.rak);
      const tglAsli = originalInfo.tgl;
      const tglScanAsli = originalInfo.tgl_scan;
      const waktuAsli = originalInfo.waktu;

      // Use current timestamp for created_at so transaction logs sort properly to the top
      const createdAtOut = new Date(now.getTime() + 1000).toISOString();
      const createdAtIn = new Date(now.getTime() + 2000).toISOString();

      const logEntries = [
        {
          tgl: tglAsli,
          waktu: waktuAsli,
          sku: selectedItem.nama_produk,
          jumlah: moveData.jumlah_pindah,
          type: 'OUT',
          gudang: 'TRANSFER',
          rak: selectedItem.rak,
          tgl_scan: tglScanAsli,
          user_name: user?.user_metadata?.full_name || user?.email || userRole || 'System (Pindah Standar)',
          sub_rak: selectedItem.sub_rak || selectedItem.rak,
          created_at: createdAtOut
        },
        {
          tgl: tglAsli,
          waktu: waktuAsli,
          sku: selectedItem.nama_produk,
          jumlah: moveData.jumlah_pindah,
          type: 'IN',
          gudang: 'TRANSFER',
          rak: rakTujuanFinal,
          tgl_scan: tglScanAsli,
          user_name: user?.user_metadata?.full_name || user?.email || userRole || 'System (Pindah Standar)',
          sub_rak: rakTujuanFinal,
          created_at: createdAtIn
        }
      ];

      const { data: insertedData, error: logError } = await DatabaseService.insertLogs(logEntries, writeMode);

      if (insertedData && insertedData.length > 0) {
        for (const l of insertedData) {
          if (l.id && (l.tgl_scan !== tglScanAsli || l.tgl !== tglAsli)) {
            await DatabaseService.updateLog(l.id, { tgl_scan: tglScanAsli, tgl: tglAsli }, writeMode);
          }
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

  // Special Real-Time Transfer Execution from Modal (Developer & Admin Only)
  const handleExecuteRealtimeTransfer = async () => {
    if (!isDevOrAdmin) {
      showToast('Hanya role Developer dan Admin yang dapat menggunakan fitur ini', 'error');
      return;
    }

    if (!selectedSkuAggregate || !modalRakTujuan || modalJumlahPindah === '' || Number(modalJumlahPindah) <= 0) {
      showToast('Mohon lengkapi SKU, rak tujuan, dan jumlah pindah yang valid', 'warning');
      return;
    }

    const rakTujuanUpper = modalRakTujuan.toUpperCase().trim();
    if (RESTRICTED_RACKS.includes(rakTujuanUpper)) {
      showToast(`Tidak diperbolehkan memindahkan barang ke Rak ${rakTujuanUpper}`, 'error');
      return;
    }

    if (!isModalRakValidated) {
      showToast('Mohon pilih rak tujuan dari daftar dropdown yang tersedia', 'warning');
      return;
    }

    const transferQty = Number(modalJumlahPindah);
    if (transferQty > selectedSkuAggregate.totalTersedia) {
      showToast(`Jumlah pindah (${transferQty}) melebihi total sisa stok (${selectedSkuAggregate.totalTersedia})`, 'error');
      return;
    }

    try {
      setSubmitting(true);
      const operationSteps = [
        'Menyiapkan transfer real-time (Tgl Hari Ini)',
        'Menghitung alokasi potongan dari rak-rak asal',
        'Membuat log OUT per rak asal dengan tanggal hari ini',
        'Membuat log IN ke rak tujuan dengan tanggal hari ini',
        'Memeriksa & membuat stock item tujuan (jika diperlukan)',
        'Validasi final dan sinkronisasi database'
      ];

      setOperationProgress({
        isVisible: true,
        currentStep: operationSteps[0],
        steps: operationSteps,
        completedSteps: 0
      });

      const now = new Date();
      const { todayTgl, nowWaktu } = getRealtimeDateTime(now);

      updateProgress(operationSteps[1], 1);

      const logEntries: any[] = [];
      let baseTime = now.getTime();
      const userName = user?.user_metadata?.full_name || user?.email || userRole || 'Dev/Admin Realtime';

      // 1. Eksekusi Auto-Klop rak minus terlebih dahulu jika terdeteksi
      const donorUsage = new Map<string, number>();
      if (selectedSkuAggregate.pairPlans && selectedSkuAggregate.pairPlans.length > 0) {
        for (const plan of selectedSkuAggregate.pairPlans) {
          baseTime += 300;
          // OUT dari rak donor
          logEntries.push({
            tgl: todayTgl,
            waktu: nowWaktu,
            sku: selectedSkuAggregate.nama_produk,
            jumlah: plan.qty,
            type: 'OUT',
            gudang: 'TRANSFER',
            rak: plan.sourceRak,
            sub_rak: plan.sourceSubRak,
            tgl_scan: todayTgl,
            tgl_normalized: todayTgl,
            user_name: userName,
            created_at: new Date(baseTime).toISOString()
          });

          baseTime += 300;
          // IN ke rak minus
          logEntries.push({
            tgl: todayTgl,
            waktu: nowWaktu,
            sku: selectedSkuAggregate.nama_produk,
            jumlah: plan.qty,
            type: 'IN',
            gudang: 'TRANSFER',
            rak: plan.targetRak,
            sub_rak: plan.targetSubRak,
            tgl_scan: todayTgl,
            tgl_normalized: todayTgl,
            user_name: userName,
            created_at: new Date(baseTime).toISOString()
          });

          donorUsage.set(plan.sourceRak, (donorUsage.get(plan.sourceRak) || 0) + plan.qty);
        }
      }

      // 2. Potong sisa fisik murni untuk transfer ke rak tujuan
      let remainingToDeduct = transferQty;
      const availableLocations = selectedSkuAggregate.plusLocations
        .map(loc => ({
          ...loc,
          tersediaSetelahKlop: Math.max(0, loc.tersedia - (donorUsage.get(loc.rak) || 0))
        }))
        .filter(loc => loc.tersediaSetelahKlop > 0)
        .sort((a, b) => b.tersediaSetelahKlop - a.tersediaSetelahKlop);

      for (const loc of availableLocations) {
        if (remainingToDeduct <= 0) break;
        const deductQty = Math.min(loc.tersediaSetelahKlop, remainingToDeduct);
        if (deductQty > 0) {
          baseTime += 300;
          logEntries.push({
            tgl: todayTgl,
            waktu: nowWaktu,
            sku: selectedSkuAggregate.nama_produk,
            jumlah: deductQty,
            type: 'OUT',
            gudang: 'TRANSFER',
            rak: loc.rak,
            sub_rak: loc.sub_rak || loc.rak,
            tgl_scan: todayTgl,
            tgl_normalized: todayTgl,
            user_name: userName,
            created_at: new Date(baseTime).toISOString()
          });
          remainingToDeduct -= deductQty;
        }
      }

      updateProgress(operationSteps[2], 2);

      // Entri log IN ke rak tujuan
      baseTime += 500;
      logEntries.push({
        tgl: todayTgl,
        waktu: nowWaktu,
        sku: selectedSkuAggregate.nama_produk,
        jumlah: transferQty,
        type: 'IN',
        gudang: 'TRANSFER',
        rak: rakTujuanUpper,
        tgl_scan: todayTgl,
        tgl_normalized: todayTgl,
        user_name: userName,
        sub_rak: rakTujuanUpper,
        created_at: new Date(baseTime).toISOString()
      });

      updateProgress(operationSteps[3], 3);

      const { data: insertedData, error: logError } = await DatabaseService.insertLogs(logEntries, writeMode);

      if (insertedData && insertedData.length > 0) {
        for (const l of insertedData) {
          if (l.id && (l.tgl_scan !== todayTgl || l.tgl !== todayTgl)) {
            await DatabaseService.updateLog(l.id, { tgl_scan: todayTgl, tgl: todayTgl }, writeMode);
          }
        }
      }

      if (logError) {
        console.error('Error creating realtime log entries:', logError);
        showToast(`Gagal mencatat perpindahan real-time: ${logError.message}`, 'error');
        setOperationProgress(prev => ({ ...prev, isVisible: false }));
        return;
      }

      updateProgress(operationSteps[4], 4);

      // Pastikan stock item ada di rak tujuan
      const { data: existingStock, error: checkError } = await supabase
        .from('stock_items')
        .select('id')
        .eq('nama_produk', selectedSkuAggregate.nama_produk)
        .eq('rak', rakTujuanUpper)
        .maybeSingle();

      if (checkError) {
        console.error('Error checking existing stock:', checkError);
      }

      let stockItemCreated = false;

      if (!existingStock) {
        updateProgress(operationSteps[4], 4);

        const { error: insertError } = await DatabaseService.insertStockItems([{
          nama_produk: selectedSkuAggregate.nama_produk,
          packing: selectedSkuAggregate.packing,
          rak: rakTujuanUpper,
          sub_rak: rakTujuanUpper,
          satuan: selectedSkuAggregate.satuan,
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

      // Auto-activate Opname Zone Session if moved to TEMP-* rack
      if (rakTujuanUpper.startsWith('TEMP')) {
        const zonePrefix = rakTujuanUpper.replace('TEMP-', '').replace('TEMP', '').trim();
        if (zonePrefix) {
          toggleOpnameZoneSession(zonePrefix, true, user?.email || 'admin').catch(e => console.warn('Auto zone activate error:', e));
        }
      }

      showToast(
        `[Real-Time Berhasil] Memindahkan ${transferQty} ${selectedSkuAggregate.satuan} ${selectedSkuAggregate.nama_produk} ke ${rakTujuanUpper}${selectedSkuAggregate.pairPlans.length > 0 ? ` sekaligus menolkan ${selectedSkuAggregate.pairPlans.length} rak minus (Auto-Klop)!` : '!'}${stockItemCreated ? ' (item baru dibuat)' : ''}`,
        'success'
      );

      setTimeout(() => {
        setOperationProgress(prev => ({ ...prev, isVisible: false }));
        setShowRealtimeModal(false);
        setSelectedSkuAggregate(null);
        setModalSkuSearch('');
        setModalRakTujuan('');
        setModalJumlahPindah('');
        setIsModalRakValidated(false);
        loadInitialData();
      }, 1000);

    } catch (error) {
      console.error('Error executing real-time transfer:', error);
      showToast(`Terjadi kesalahan saat memindahkan barang: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      setOperationProgress(prev => ({ ...prev, isVisible: false }));
    } finally {
      setSubmitting(false);
    }
  };

  // Single SKU Auto-Klop Execution from Real-Time Modal
  const handleExecuteSingleKlop = async (skuAggregate?: SkuAggregatedItem) => {
    const target = skuAggregate || selectedSkuAggregate;
    if (!target) return;
    if (!target.pairPlans || target.pairPlans.length === 0) {
      showToast('Tidak ada rak minus yang perlu di-klop untuk SKU ini', 'info');
      return;
    }

    try {
      setSubmitting(true);
      const now = new Date();
      const { todayTgl, nowWaktu } = getRealtimeDateTime(now);

      const userName = user?.user_metadata?.full_name || user?.email || userRole || 'Auto-Klop Admin';
      let baseTime = now.getTime();
      const logEntries: any[] = [];

      for (const plan of target.pairPlans) {
        baseTime += 300;
        logEntries.push({
          tgl: todayTgl,
          waktu: nowWaktu,
          sku: target.nama_produk,
          jumlah: plan.qty,
          type: 'OUT',
          gudang: 'TRANSFER',
          rak: plan.sourceRak,
          sub_rak: plan.sourceSubRak,
          tgl_scan: todayTgl,
          tgl_normalized: todayTgl,
          user_name: userName,
          created_at: new Date(baseTime).toISOString()
        });

        baseTime += 300;
        logEntries.push({
          tgl: todayTgl,
          waktu: nowWaktu,
          sku: target.nama_produk,
          jumlah: plan.qty,
          type: 'IN',
          gudang: 'TRANSFER',
          rak: plan.targetRak,
          sub_rak: plan.targetSubRak,
          tgl_scan: todayTgl,
          tgl_normalized: todayTgl,
          user_name: userName,
          created_at: new Date(baseTime).toISOString()
        });
      }

      const { data: insertedData, error: logError } = await DatabaseService.insertLogs(logEntries, writeMode);

      if (logError) {
        console.error('Error in Auto-Klop single:', logError);
        showToast(`Gagal auto-klop: ${logError.message}`, 'error');
        return;
      }

      if (insertedData && insertedData.length > 0) {
        for (const l of insertedData) {
          if (l.id && (l.tgl_scan !== todayTgl || l.tgl !== todayTgl)) {
            await DatabaseService.updateLog(l.id, { tgl_scan: todayTgl, tgl: todayTgl }, writeMode);
          }
        }
      }

      const totalKlopped = target.pairPlans.reduce((s, p) => s + p.qty, 0);
      showToast(`[Auto-Klop Berhasil] Berhasil menyeimbangkan ${totalKlopped} ${target.satuan} untuk ${target.nama_produk}! Rak minus kini bersih.`, 'success');

      setSelectedSkuAggregate(null);
      setModalSkuSearch('');
      setModalRakTujuan('');
      setModalJumlahPindah('');
      setIsModalRakValidated(false);
      loadInitialData();

    } catch (err: any) {
      console.error('Auto-Klop single error:', err);
      showToast(`Terjadi kesalahan: ${err.message || 'Error'}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleModalSkuSelect = (skuItem: SkuAggregatedItem) => {
    setSelectedSkuAggregate(skuItem);
    setModalSkuSearch(skuItem.nama_produk);
    setModalShowSkuDropdown(false);
    setModalRakTujuan('');
    setIsModalRakValidated(false);
    setModalJumlahPindah('');
    setTimeout(() => modalRakInputRef.current?.focus(), 0);
  };

  const handleModalRakSelect = (rakNama: string) => {
    const upperValue = rakNama.toUpperCase().trim();
    if (!upperValue.startsWith('TEMP')) {
      showToast(`Rak tujuan Real-Time hanya boleh rak TEMP (contoh: TEMP-A, TEMP-B, dst)`, 'error');
      return;
    }
    setModalRakTujuan(upperValue);
    setModalShowRakDropdown(false);
    setIsModalRakValidated(true);
  };

  const handleBatchRakSelect = (rakNama: string) => {
    const upperValue = rakNama.toUpperCase().trim();
    if (!upperValue.startsWith('TEMP')) {
      showToast(`Rak tujuan Real-Time hanya boleh rak TEMP (contoh: TEMP-A, TEMP-B, dst)`, 'error');
      return;
    }
    setBatchDestRak(upperValue);
    setBatchShowRakDropdown(false);
    setIsBatchRakValidated(true);
  };

  const handleBatchToggleItem = (itemId: string) => {
    setBatchSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const handleBatchSelectAllDisplayed = () => {
    const displayedIds = batchDisplayedItems.map(i => i.id);
    const allSelected = displayedIds.length > 0 && displayedIds.every(id => batchSelectedItems.has(id));

    setBatchSelectedItems(prev => {
      const next = new Set(prev);
      if (allSelected) {
        displayedIds.forEach(id => next.delete(id));
      } else {
        displayedIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const handleExecuteMassBatchRealtimeTransfer = async () => {
    if (!isDevOrAdmin) {
      showToast('Hanya role Developer dan Admin yang dapat menggunakan fitur ini', 'error');
      return;
    }

    const destRak = batchDestRak.toUpperCase().trim();
    if (!destRak || !destRak.startsWith('TEMP')) {
      showToast('Pilih rak tujuan TEMP yang valid (contoh: TEMP-A, TEMP-B, dst)', 'warning');
      return;
    }

    if (batchSelectedItems.size === 0) {
      showToast('Pilih setidaknya satu item untuk dipindahkan', 'warning');
      return;
    }

    const itemsToMove = stockItems.filter(i => batchSelectedItems.has(i.id) && i.tersedia > 0);
    if (itemsToMove.length === 0) {
      showToast('Tidak ada item valid dengan stok tersedia untuk dipindahkan', 'warning');
      return;
    }

    try {
      setSubmitting(true);
      const now = new Date();
      const { todayTgl, nowWaktu } = getRealtimeDateTime(now);

      const userName = user?.user_metadata?.full_name || user?.email || userRole || 'Dev/Admin Batch Realtime';
      let baseTime = now.getTime();
      const logEntries: any[] = [];

      itemsToMove.forEach(item => {
        baseTime += 100;
        logEntries.push({
          tgl: todayTgl,
          waktu: nowWaktu,
          sku: item.nama_produk,
          jumlah: item.tersedia,
          type: 'OUT',
          gudang: 'TRANSFER',
          rak: item.rak,
          sub_rak: item.sub_rak || item.rak,
          tgl_scan: todayTgl,
          tgl_normalized: todayTgl,
          user_name: userName,
          created_at: new Date(baseTime).toISOString()
        });

        baseTime += 100;
        logEntries.push({
          tgl: todayTgl,
          waktu: nowWaktu,
          sku: item.nama_produk,
          jumlah: item.tersedia,
          type: 'IN',
          gudang: 'TRANSFER',
          rak: destRak,
          sub_rak: destRak,
          tgl_scan: todayTgl,
          tgl_normalized: todayTgl,
          user_name: userName,
          created_at: new Date(baseTime).toISOString()
        });
      });

      const { data: insertedLogs, error: logError } = await DatabaseService.insertLogs(logEntries, writeMode);

      if (insertedLogs && insertedLogs.length > 0) {
        for (const l of insertedLogs) {
          if (l.id && (l.tgl_scan !== todayTgl || l.tgl !== todayTgl)) {
            await DatabaseService.updateLog(l.id, { tgl_scan: todayTgl, tgl: todayTgl }, writeMode);
          }
        }
      }

      if (logError) {
        console.error('Error in mass batch realtime transfer:', logError);
        showToast(`Gagal transfer massal: ${logError.message}`, 'error');
        return;
      }

      // Ensure destination stock items exist
      const uniqueSkus = Array.from(new Set(itemsToMove.map(i => i.nama_produk)));
      const { data: existingDestStocks } = await supabase
        .from('stock_items')
        .select('nama_produk')
        .eq('rak', destRak)
        .in('nama_produk', uniqueSkus);

      const existingSkuSet = new Set((existingDestStocks || []).map(s => s.nama_produk));
      const missingItems = itemsToMove.filter(i => !existingSkuSet.has(i.nama_produk));

      if (missingItems.length > 0) {
        const toInsertMap = new Map<string, any>();
        missingItems.forEach(i => {
          if (!toInsertMap.has(i.nama_produk)) {
            toInsertMap.set(i.nama_produk, {
              nama_produk: i.nama_produk,
              packing: i.packing,
              rak: destRak,
              sub_rak: destRak,
              satuan: i.satuan,
              stok_awal: 0,
              status: 'Aktif'
            });
          }
        });
        await DatabaseService.insertStockItems(Array.from(toInsertMap.values()), writeMode);
      }

      const totalQty = itemsToMove.reduce((s, i) => s + i.tersedia, 0);

      // Auto-activate Opname Zone Session if moved to TEMP-* rack
      if (destRak.startsWith('TEMP')) {
        const zonePrefix = destRak.replace('TEMP-', '').replace('TEMP', '').trim();
        if (zonePrefix) {
          toggleOpnameZoneSession(zonePrefix, true, user?.email || 'admin').catch(e => console.warn('Auto zone activate error:', e));
        }
      }

      showToast(`[Real-Time Massal Berhasil] Berhasil memindahkan ${itemsToMove.length} item (${totalQty} pcs) ke ${destRak}!`, 'success');

      setBatchSelectedItems(new Set());
      setShowRealtimeModal(false);
      loadInitialData();

    } catch (err: any) {
      console.error('Mass batch transfer error:', err);
      showToast(`Terjadi kesalahan: ${err.message || 'Error'}`, 'error');
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

      if (modalSkuInputRef.current && !modalSkuInputRef.current.contains(target) && !target.closest('.modal-sku-dropdown-container')) {
        setModalShowSkuDropdown(false);
      }

      if (modalRakInputRef.current && !modalRakInputRef.current.contains(target) && !target.closest('.modal-rak-dropdown-container')) {
        setModalShowRakDropdown(false);
      }

      if (batchDestRakInputRef.current && !batchDestRakInputRef.current.contains(target) && !target.closest('.batch-rak-dropdown-container')) {
        setBatchShowRakDropdown(false);
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

  useEffect(() => {
    setModalHighlightedSkuIndex(0);
  }, [modalSkuSearch]);

  useEffect(() => {
    setModalHighlightedRakIndex(0);
  }, [modalRakTujuan]);

  useEffect(() => {
    setBatchHighlightedRakIndex(0);
  }, [batchDestRak]);

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

  // Auto-scroll for modal SKU dropdown
  useEffect(() => {
    if (modalShowSkuDropdown && modalSkuDropdownRef.current) {
      const highlightedElement = modalSkuDropdownRef.current.children[modalHighlightedSkuIndex] as HTMLElement;
      if (highlightedElement) {
        highlightedElement.scrollIntoView({
          block: 'nearest',
          inline: 'start'
        });
      }
    }
  }, [modalHighlightedSkuIndex, modalShowSkuDropdown]);

  // Auto-scroll for modal Rak dropdown
  useEffect(() => {
    if (modalShowRakDropdown && modalRakDropdownRef.current) {
      const highlightedElement = modalRakDropdownRef.current.children[modalHighlightedRakIndex] as HTMLElement;
      if (highlightedElement) {
        highlightedElement.scrollIntoView({
          block: 'nearest',
          inline: 'start'
        });
      }
    }
  }, [modalHighlightedRakIndex, modalShowRakDropdown]);

  // Auto-scroll for batch Rak dropdown
  useEffect(() => {
    if (batchShowRakDropdown && batchDestRakDropdownRef.current) {
      const highlightedElement = batchDestRakDropdownRef.current.children[batchHighlightedRakIndex] as HTMLElement;
      if (highlightedElement) {
        highlightedElement.scrollIntoView({
          block: 'nearest',
          inline: 'start'
        });
      }
    }
  }, [batchHighlightedRakIndex, batchShowRakDropdown]);

  // Keyboard navigation for item dropdown
  const handleItemKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showItemDropdown) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedItemIndex(prev => (prev + 1) % (filteredItems.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedItemIndex(prev => (prev - 1 + filteredItems.length) % (filteredItems.length || 1));
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
        setHighlightedRakIndex(prev => (prev + 1) % (filteredRacks.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedRakIndex(prev => (prev - 1 + filteredRacks.length) % (filteredRacks.length || 1));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (filteredRacks.length > 0) {
          e.preventDefault();
          handleRakTujuanSelect(filteredRacks[highlightedRakIndex].nama);
        }
      }
    }
  };

  // Keyboard navigation for modal SKU dropdown
  const handleModalSkuKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (modalShowSkuDropdown) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setModalHighlightedSkuIndex(prev => (prev + 1) % (modalFilteredSkus.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setModalHighlightedSkuIndex(prev => (prev - 1 + modalFilteredSkus.length) % (modalFilteredSkus.length || 1));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (modalFilteredSkus.length > 0) {
          e.preventDefault();
          handleModalSkuSelect(modalFilteredSkus[modalHighlightedSkuIndex]);
        }
      }
    }
  };

  // Keyboard navigation for modal Rak dropdown
  const handleModalRakKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (modalShowRakDropdown) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setModalHighlightedRakIndex(prev => (prev + 1) % (modalFilteredRacks.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setModalHighlightedRakIndex(prev => (prev - 1 + modalFilteredRacks.length) % (modalFilteredRacks.length || 1));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (modalFilteredRacks.length > 0) {
          e.preventDefault();
          handleModalRakSelect(modalFilteredRacks[modalHighlightedRakIndex].nama);
        }
      }
    }
  };

  // Keyboard navigation for batch Rak dropdown
  const handleBatchRakKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (batchShowRakDropdown) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setBatchHighlightedRakIndex(prev => (prev + 1) % (batchFilteredDestRacks.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setBatchHighlightedRakIndex(prev => (prev - 1 + batchFilteredDestRacks.length) % (batchFilteredDestRacks.length || 1));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (batchFilteredDestRacks.length > 0) {
          e.preventDefault();
          handleBatchRakSelect(batchFilteredDestRacks[batchHighlightedRakIndex].nama);
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

      {/* Real-Time Transfer Modal for Developer & Admin */}
      {showRealtimeModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-purple-100 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-purple-700 via-indigo-800 to-slate-900 text-white p-6 relative overflow-hidden shrink-0">
              <div className="absolute -right-8 -top-8 text-white/5 pointer-events-none">
                <Zap className="w-48 h-48" />
              </div>
              <div className="relative z-10 flex items-start justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-400/20 border border-amber-300/30 rounded-full text-amber-300 text-[11px] font-black tracking-wider uppercase mb-2">
                    <Zap className="w-3.5 h-3.5 fill-amber-300" /> Khusus Developer & Admin
                  </div>
                  <h3 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
                    Pindah Stok Real-Time <span className="text-purple-300 text-base font-bold">(Tgl Hari Ini & Rak Tujuan TEMP)</span>
                  </h3>
                  <p className="text-purple-200/80 text-xs mt-1 max-w-xl leading-relaxed">
                    Memindahkan stok murni seketika dengan <span className="underline font-bold text-amber-200">tanggal & jam hari ini</span> ke lokasi rak penampung sementara (<strong className="text-white">TEMP-A s/d TEMP-F</strong>).
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowRealtimeModal(false);
                    setSelectedSkuAggregate(null);
                    setModalSkuSearch('');
                    setModalRakTujuan('');
                    setModalJumlahPindah('');
                    setIsModalRakValidated(false);
                  }}
                  className="p-2 rounded-2xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
                  aria-label="Tutup modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Mode Switcher Tabs */}
              <div className="relative z-10 flex items-center gap-2 mt-4 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setRealtimeModalMode('SINGLE')}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
                    realtimeModalMode === 'SINGLE'
                      ? 'bg-white text-purple-900 shadow-md'
                      : 'bg-white/10 text-purple-200 hover:bg-white/20'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Per SKU (Satuan)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRealtimeModalMode('BATCH')}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
                    realtimeModalMode === 'BATCH'
                      ? 'bg-white text-purple-900 shadow-md'
                      : 'bg-white/10 text-purple-200 hover:bg-white/20'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Auto Massal per Batch Rak ({batchSummaries.all.count} Item Tersedia)</span>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {realtimeModalMode === 'SINGLE' ? (
                /* Mode 1: Single SKU Transfer */
                <>
                  {/* 1. Pure SKU Search */}
                  <div className="modal-sku-dropdown-container">
                    <label className="block text-xs font-black text-slate-700 tracking-wider uppercase mb-2">
                      1. Pilih SKU Barang ({skuAggregatedList.length} SKU Tersedia)
                    </label>
                    <div className="relative">
                      <input
                        ref={modalSkuInputRef}
                        type="text"
                        value={modalSkuSearch}
                        onChange={(e) => {
                          setModalSkuSearch(e.target.value);
                          setModalShowSkuDropdown(true);
                          if (!e.target.value) {
                            setSelectedSkuAggregate(null);
                          }
                        }}
                        onFocus={() => {
                          setModalShowSkuDropdown(true);
                          setModalHighlightedSkuIndex(0);
                        }}
                        onKeyDown={handleModalSkuKeyDown}
                        className="w-full h-12 px-4 pr-10 bg-slate-50 border border-slate-300 focus:border-purple-500 focus:bg-white rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-500/10 text-sm font-semibold text-slate-800 transition-all placeholder:text-slate-400"
                        placeholder="Ketik nama SKU barang... contoh: BOOK-1PACK/CLBK-3501"
                      />
                      {modalSkuSearch && (
                        <button
                          onClick={() => {
                            setModalSkuSearch('');
                            setSelectedSkuAggregate(null);
                            setModalShowSkuDropdown(false);
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-red-500 rounded-lg transition-colors cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}

                      {/* SKU Dropdown List */}
                      {modalShowSkuDropdown && (
                        <div
                          ref={modalSkuDropdownRef}
                          className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-60 overflow-y-auto p-1.5 divide-y divide-slate-100"
                        >
                          {modalFilteredSkus.length > 0 ? (
                            modalFilteredSkus.slice(0, 50).map((skuItem, index) => (
                              <div
                                key={skuItem.nama_produk}
                                onClick={() => handleModalSkuSelect(skuItem)}
                                className={`p-3 rounded-xl cursor-pointer transition-all ${
                                  index === modalHighlightedSkuIndex
                                    ? 'bg-purple-100 text-purple-950 font-bold'
                                    : 'hover:bg-purple-50 text-slate-800'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-bold text-sm tracking-tight text-slate-900">
                                    {skuItem.nama_produk}
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    {skuItem.minusLocations.length > 0 && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200">
                                        Rak Minus: -{skuItem.totalMinus}
                                      </span>
                                    )}
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black border ${
                                      skuItem.totalTersedia > 0 
                                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200' 
                                        : 'bg-slate-100 text-slate-600 border-slate-200'
                                    }`}>
                                      Net: {skuItem.totalTersedia} {skuItem.satuan}
                                    </span>
                                  </div>
                                </div>
                                <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
                                  <span>Tersebar di {skuItem.locations.length} lokasi rak:</span>
                                  <span className="font-medium text-purple-700">
                                    {skuItem.locations.map(l => `${l.rak} (${l.tersedia})`).join(', ')}
                                  </span>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="p-4 text-center text-xs text-slate-400 font-medium">
                              {modalSkuSearch ? 'Tidak ada SKU yang cocok dengan pencarian' : 'Ketik untuk mencari SKU...'}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Selected SKU Highlight Box */}
                  {selectedSkuAggregate && (
                    <div className="p-4 bg-gradient-to-br from-purple-50 via-indigo-50/50 to-slate-50 border border-purple-200 rounded-2xl space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-[10px] font-black text-purple-700 uppercase tracking-wider">SKU Terpilih</span>
                          <h4 className="font-black text-slate-900 text-base">{selectedSkuAggregate.nama_produk}</h4>
                          <p className="text-xs text-slate-500">Packing: {selectedSkuAggregate.packing || '-'}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">Total Sisa Bersih</span>
                          <div className="text-xl font-black text-emerald-700">
                            {selectedSkuAggregate.totalTersedia} <span className="text-xs font-bold">{selectedSkuAggregate.satuan}</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1.5">
                          Rincian Stok Tiap Rak ({selectedSkuAggregate.locations.length} Lokasi):
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedSkuAggregate.locations.map((loc, idx) => (
                            <span
                              key={idx}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold shadow-2xs border ${
                                loc.tersedia < 0
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : loc.tersedia > 0
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-white text-slate-500 border-slate-200'
                              }`}
                            >
                              <span className="opacity-70 font-normal">Rak</span> {loc.rak}:{' '}
                              <span className="font-black">{loc.tersedia} {selectedSkuAggregate.satuan}</span>
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Auto-Klop Alert if Minus Racks Detected */}
                      {selectedSkuAggregate.minusLocations.length > 0 && (
                        <div className="p-3.5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl flex flex-col gap-2.5 shadow-xs animate-fade-in">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                              <span className="text-xs font-black text-amber-950">
                                Terdeteksi {selectedSkuAggregate.minusLocations.length} Rak Minus ({selectedSkuAggregate.totalMinus} {selectedSkuAggregate.satuan})
                              </span>
                            </div>
                            {selectedSkuAggregate.pairPlans.length > 0 && (
                              <button
                                type="button"
                                onClick={() => handleExecuteSingleKlop(selectedSkuAggregate)}
                                disabled={submitting}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-xl text-[11px] font-black shadow-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                                title="Klopkan sekarang untuk menolkan rak minus pada SKU ini saja"
                              >
                                <Scale className="w-3.5 h-3.5" />
                                <span>Auto-Klop SKU Ini Saja</span>
                              </button>
                            )}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                            <div className="bg-white/80 p-2 rounded-xl border border-amber-100">
                              <span className="text-rose-600 font-extrabold uppercase text-[10px] block mb-1">Rak Minus:</span>
                              <div className="flex flex-wrap gap-1">
                                {selectedSkuAggregate.minusLocations.map((m, idx) => (
                                  <span key={idx} className="bg-rose-50 text-rose-700 font-bold px-1.5 py-0.5 rounded border border-rose-200">
                                    {m.rak}: {m.tersedia} {selectedSkuAggregate.satuan}
                                  </span>
                                ))}
                              </div>
                            </div>

                            <div className="bg-white/80 p-2 rounded-xl border border-amber-100">
                              <span className="text-emerald-600 font-extrabold uppercase text-[10px] block mb-1">Rak Donor Penyeimbang:</span>
                              <div className="flex flex-wrap gap-1">
                                {selectedSkuAggregate.plusLocations.map((p, idx) => (
                                  <span key={idx} className="bg-emerald-50 text-emerald-700 font-bold px-1.5 py-0.5 rounded border border-emerald-200">
                                    {p.rak}: +{p.tersedia} {selectedSkuAggregate.satuan}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 2. Destination Rack Selection (ONLY TEMP Racks) */}
                  {selectedSkuAggregate && (
                    <div className="modal-rak-dropdown-container">
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-xs font-black text-slate-700 tracking-wider uppercase">
                          2. Pilih Rak Tujuan (Khusus Rak TEMP)
                        </label>
                        <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-lg border border-purple-200">
                          Hanya Rak TEMP-A s/d TEMP-F
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          ref={modalRakInputRef}
                          type="text"
                          value={modalRakTujuan}
                          onChange={(e) => {
                            const upperVal = e.target.value.toUpperCase().trimEnd();
                            setModalRakTujuan(upperVal);
                            setModalShowRakDropdown(true);
                            setIsModalRakValidated(false);
                          }}
                          onFocus={() => {
                            setModalShowRakDropdown(true);
                            setModalHighlightedRakIndex(0);
                          }}
                          onKeyDown={handleModalRakKeyDown}
                          className="w-full h-12 px-4 pr-10 bg-slate-50 border border-slate-300 focus:border-purple-500 focus:bg-white rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-500/10 text-sm font-semibold text-slate-800 transition-all placeholder:text-slate-400"
                          placeholder="Pilih rak penampung... contoh: TEMP-A, TEMP-B, TEMP-C"
                        />
                        {modalRakTujuan && (
                          <button
                            onClick={() => {
                              setModalRakTujuan('');
                              setModalShowRakDropdown(false);
                              setIsModalRakValidated(false);
                            }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-red-500 rounded-lg transition-colors cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}

                        {/* Rak Dropdown List */}
                        {modalShowRakDropdown && (
                          <div
                            ref={modalRakDropdownRef}
                            className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-48 overflow-y-auto p-1.5 divide-y divide-slate-100"
                          >
                            {modalFilteredRacks.length > 0 ? (
                              modalFilteredRacks.map((rack, index) => (
                                <div
                                  key={rack.id}
                                  onClick={() => handleModalRakSelect(rack.nama)}
                                  className={`px-3 py-2.5 rounded-xl cursor-pointer text-sm transition-all flex items-center justify-between ${
                                    index === modalHighlightedRakIndex
                                      ? 'bg-purple-100 text-purple-950 font-bold'
                                      : 'hover:bg-purple-50 text-slate-800'
                                  }`}
                                >
                                  <span>Rak <strong className="text-slate-900">{rack.nama}</strong></span>
                                  <span className="text-[10px] font-bold px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full border border-purple-200">
                                    Lokasi TEMP
                                  </span>
                                </div>
                              ))
                            ) : (
                              <div className="p-3 text-center text-xs text-slate-400">
                                {modalRakTujuan ? 'Tidak ada rak TEMP yang cocok' : 'Ketik untuk mencari rak TEMP...'}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      {isModalRakValidated && (
                        <p className="text-[11px] font-bold text-emerald-600 mt-1 flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" /> Rak Tujuan valid: {modalRakTujuan}
                        </p>
                      )}
                    </div>
                  )}

                  {/* 3. Transfer Quantity */}
                  {selectedSkuAggregate && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-xs font-black text-slate-700 tracking-wider uppercase">
                          3. Jumlah Pindah
                        </label>
                        <button
                          type="button"
                          onClick={() => setModalJumlahPindah(selectedSkuAggregate.totalTersedia)}
                          className="px-2.5 py-1 bg-purple-100 hover:bg-purple-200 text-purple-800 rounded-lg text-xs font-bold transition-all cursor-pointer active:scale-95 flex items-center gap-1"
                        >
                          <Zap className="w-3 h-3 text-purple-700" />
                          <span>Pindah Semua ({selectedSkuAggregate.totalTersedia} {selectedSkuAggregate.satuan})</span>
                        </button>
                      </div>
                      <input
                        type="number"
                        min="1"
                        max={selectedSkuAggregate.totalTersedia}
                        value={modalJumlahPindah}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '') {
                            setModalJumlahPindah('');
                          } else {
                            const num = parseInt(val);
                            setModalJumlahPindah(isNaN(num) ? '' : num);
                          }
                        }}
                        className="w-full h-12 px-4 bg-slate-50 border border-slate-300 focus:border-purple-500 focus:bg-white rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-500/10 text-sm font-semibold text-slate-800 transition-all placeholder:text-slate-400"
                        placeholder={`Masukkan jumlah pindah (1 - ${selectedSkuAggregate.totalTersedia})...`}
                      />
                      <div className="flex justify-between items-center text-xs text-slate-500 mt-1">
                        <span>Maksimal tersedia: <strong className="text-slate-800">{selectedSkuAggregate.totalTersedia} {selectedSkuAggregate.satuan}</strong></span>
                        {typeof modalJumlahPindah === 'number' && modalJumlahPindah > 0 && (
                          <span className="font-bold text-purple-700">
                            Sisa setelah transfer: {Math.max(0, selectedSkuAggregate.totalTersedia - modalJumlahPindah)} {selectedSkuAggregate.satuan}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* Mode 2: Mass Batch Real-Time Transfer */
                <div className="space-y-4">
                  {/* Batch Selection Pills Bar */}
                  <div>
                    <label className="block text-xs font-black text-slate-700 tracking-wider uppercase mb-2">
                      1. Pilih Batch Rak Asal
                    </label>
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
                      <button
                        type="button"
                        onClick={() => setBatchSelectedKey('ALL')}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                          batchSelectedKey === 'ALL'
                            ? 'bg-purple-700 text-white shadow-md shadow-purple-600/20'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                        }`}
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>Semua Batch ({batchSummaries.all.count} Item)</span>
                      </button>
                      {batchSummaries.batches.map(batch => (
                        <button
                          key={batch.key}
                          type="button"
                          onClick={() => setBatchSelectedKey(batch.key)}
                          className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                            batchSelectedKey === batch.key
                              ? 'bg-purple-700 text-white shadow-md shadow-purple-600/20'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                          }`}
                        >
                          <span>{batch.label}</span>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                            batchSelectedKey === batch.key ? 'bg-purple-900/60 text-purple-100' : 'bg-slate-200 text-slate-700'
                          }`}>
                            {batch.count}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Batch Items Controls & List */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      {/* Search Bar inside Batch */}
                      <div className="relative flex-1 min-w-[240px]">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={batchSearchQuery}
                          onChange={(e) => setBatchSearchQuery(e.target.value)}
                          placeholder="Cari SKU atau Rak di batch terpilih..."
                          className="w-full h-10 pl-9 pr-3 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10"
                        />
                      </div>

                      {/* Select All Toggle */}
                      <button
                        type="button"
                        onClick={handleBatchSelectAllDisplayed}
                        className="px-3 py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-black text-slate-700 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                      >
                        {batchDisplayedItems.length > 0 && batchDisplayedItems.every(i => batchSelectedItems.has(i.id)) ? (
                          <>
                            <CheckSquare className="w-4 h-4 text-purple-600" />
                            <span>Batal Pilih Semua ({batchDisplayedItems.length})</span>
                          </>
                        ) : (
                          <>
                            <Square className="w-4 h-4 text-slate-400" />
                            <span>Pilih Semua ({batchDisplayedItems.length})</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Items Scrollable List */}
                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white shadow-xs">
                      {batchDisplayedItems.length > 0 ? (
                        batchDisplayedItems.map((item) => {
                          const isSelected = batchSelectedItems.has(item.id);
                          return (
                            <div
                              key={item.id}
                              onClick={() => handleBatchToggleItem(item.id)}
                              className={`p-3 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                                isSelected ? 'bg-purple-50/70 hover:bg-purple-50' : 'hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className="text-purple-600 shrink-0">
                                  {isSelected ? (
                                    <CheckSquare className="w-5 h-5 text-purple-600" />
                                  ) : (
                                    <Square className="w-5 h-5 text-slate-300" />
                                  )}
                                </div>
                                <div>
                                  <div className="font-black text-xs text-slate-900">{item.nama_produk}</div>
                                  <div className="text-[11px] text-slate-500 mt-0.5">
                                    Rak: <strong className="text-purple-700">{item.rak}</strong> (Sub: {item.sub_rak || item.rak}) {item.packing ? `| ${item.packing}` : ''}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  +{item.tersedia} {item.satuan}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="p-8 text-center text-xs text-slate-400 font-medium">
                          Tidak ada item dengan stok tersedia di batch ini
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 2. Destination TEMP Rack Selection */}
                  <div className="batch-rak-dropdown-container">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-black text-slate-700 tracking-wider uppercase">
                        2. Pilih Rak Tujuan TEMP untuk Transfer Massal
                      </label>
                      <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-lg border border-purple-200">
                        Khusus Rak TEMP
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        ref={batchDestRakInputRef}
                        type="text"
                        value={batchDestRak}
                        onChange={(e) => {
                          const upperVal = e.target.value.toUpperCase().trimEnd();
                          setBatchDestRak(upperVal);
                          setBatchShowRakDropdown(true);
                          setIsBatchRakValidated(false);
                        }}
                        onFocus={() => {
                          setBatchShowRakDropdown(true);
                          setBatchHighlightedRakIndex(0);
                        }}
                        onKeyDown={handleBatchRakKeyDown}
                        className="w-full h-12 px-4 pr-10 bg-slate-50 border border-slate-300 focus:border-purple-500 focus:bg-white rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-500/10 text-sm font-semibold text-slate-800 transition-all placeholder:text-slate-400"
                        placeholder="Pilih rak penampung... contoh: TEMP-A, TEMP-B, TEMP-C"
                      />
                      {batchDestRak && (
                        <button
                          onClick={() => {
                            setBatchDestRak('');
                            setBatchShowRakDropdown(false);
                            setIsBatchRakValidated(false);
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-red-500 rounded-lg transition-colors cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}

                      {/* Dropdown List */}
                      {batchShowRakDropdown && (
                        <div
                          ref={batchDestRakDropdownRef}
                          className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-48 overflow-y-auto p-1.5 divide-y divide-slate-100"
                        >
                          {batchFilteredDestRacks.length > 0 ? (
                            batchFilteredDestRacks.map((rack, index) => (
                              <div
                                key={rack.id}
                                onClick={() => handleBatchRakSelect(rack.nama)}
                                className={`px-3 py-2.5 rounded-xl cursor-pointer text-sm transition-all flex items-center justify-between ${
                                  index === batchHighlightedRakIndex
                                    ? 'bg-purple-100 text-purple-950 font-bold'
                                    : 'hover:bg-purple-50 text-slate-800'
                                }`}
                              >
                                <span>Rak <strong className="text-slate-900">{rack.nama}</strong></span>
                                <span className="text-[10px] font-bold px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full border border-purple-200">
                                  Lokasi TEMP
                                </span>
                              </div>
                            ))
                          ) : (
                            <div className="p-3 text-center text-xs text-slate-400">
                              {batchDestRak ? 'Tidak ada rak TEMP yang cocok' : 'Ketik untuk mencari rak TEMP...'}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {isBatchRakValidated && (
                      <p className="text-[11px] font-bold text-emerald-600 mt-1 flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> Rak Tujuan valid: {batchDestRak}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Real-time Notice */}
              <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-2xl text-[11px] text-amber-900 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-900">Catatan Pemindahan Real-Time:</p>
                  <p className="text-amber-800 leading-relaxed mt-0.5">
                    Proses ini akan memotong stok riil yang ada di rak asal dan memasukkannya ke rak tujuan TEMP dengan <strong>tanggal hari ini</strong> dan <strong>waktu saat ini</strong>.
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-slate-500 font-medium">
                {realtimeModalMode === 'BATCH' && (
                  <span>
                    Terpilih: <strong className="text-purple-700 font-black">{batchSelectedItems.size} Item</strong> (
                    {stockItems
                      .filter(i => batchSelectedItems.has(i.id))
                      .reduce((s, i) => s + i.tersedia, 0)}{' '}
                    pcs)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowRealtimeModal(false);
                    setSelectedSkuAggregate(null);
                    setModalSkuSearch('');
                    setModalRakTujuan('');
                    setModalJumlahPindah('');
                    setIsModalRakValidated(false);
                  }}
                  disabled={submitting}
                  className="px-5 h-11 bg-white hover:bg-slate-100 text-slate-700 font-bold rounded-xl border border-slate-200 transition-all cursor-pointer active:scale-95 disabled:opacity-50 text-xs uppercase tracking-wider"
                >
                  Batal
                </button>

                {realtimeModalMode === 'SINGLE' ? (
                  <button
                    type="button"
                    onClick={handleExecuteRealtimeTransfer}
                    disabled={
                      submitting ||
                      !selectedSkuAggregate ||
                      !modalRakTujuan ||
                      !isModalRakValidated ||
                      modalJumlahPindah === '' ||
                      Number(modalJumlahPindah) <= 0 ||
                      Number(modalJumlahPindah) > (selectedSkuAggregate?.totalTersedia || 0)
                    }
                    className="px-6 h-11 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-700 text-white font-black rounded-xl shadow-lg shadow-purple-500/25 transition-all active:scale-95 flex items-center gap-2 cursor-pointer disabled:opacity-50 text-xs uppercase tracking-wider"
                  >
                    {submitting ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        <span>Memproses...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 fill-amber-300 text-amber-300" />
                        <span>Eksekusi Pindah Real-Time</span>
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleExecuteMassBatchRealtimeTransfer}
                    disabled={
                      submitting ||
                      batchSelectedItems.size === 0 ||
                      !batchDestRak ||
                      !isBatchRakValidated
                    }
                    className="px-6 h-11 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-700 text-white font-black rounded-xl shadow-lg shadow-purple-500/25 transition-all active:scale-95 flex items-center gap-2 cursor-pointer disabled:opacity-50 text-xs uppercase tracking-wider"
                  >
                    {submitting ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        <span>Memproses Transfer Massal...</span>
                      </>
                    ) : (
                      <>
                        <Layers className="w-4 h-4 text-purple-200" />
                        <span>Eksekusi Pindah Massal ({batchSelectedItems.size} Item)</span>
                      </>
                    )}
                  </button>
                )}
              </div>
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

                {/* Dedicated Real-Time Transfer Button for Dev & Admin */}
                {isDevOrAdmin && (
                  <button
                    onClick={() => setShowRealtimeModal(true)}
                    className="h-12 px-5 bg-gradient-to-r from-purple-500 via-indigo-500 to-purple-600 hover:from-purple-600 hover:to-indigo-600 text-white font-black rounded-2xl shadow-lg shadow-purple-900/30 transition-all active:scale-95 flex items-center justify-center gap-2.5 border border-purple-300/30 cursor-pointer"
                    title="Buka Modal Pindah Real-Time: Hitung sisa riil IN-OUT per SKU dan pindahkan dengan tanggal hari ini ke rak TEMP"
                  >
                    <Zap className="h-4 w-4 text-amber-300 fill-amber-300" />
                    <span className="uppercase text-xs font-black tracking-wide">Pindah Real-Time</span>
                  </button>
                )}

                {/* Dedicated Auto-Klop Button for Dev & Admin */}
                {isDevOrAdmin && (
                  <button
                    onClick={() => setShowAutoKlopModal(true)}
                    className="h-12 px-5 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:to-orange-600 text-white font-black rounded-2xl shadow-lg shadow-amber-900/30 transition-all active:scale-95 flex items-center justify-center gap-2.5 border border-amber-300/30 cursor-pointer"
                    title="Buka Modal Rekonsiliasi & Auto-Klop Rak Minus (Seluruh Gudang & Per-Batch)"
                  >
                    <Scale className="h-4 w-4 text-amber-100" />
                    <span className="uppercase text-xs font-black tracking-wide">Auto-Klop Rak Minus</span>
                  </button>
                )}

                <button
                  onClick={loadInitialData}
                  disabled={loading}
                  className="h-12 px-6 bg-white hover:bg-blue-50 text-blue-700 font-black rounded-2xl shadow-[0_8px_25px_rgba(255,255,255,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2.5 border-none disabled:opacity-50 cursor-pointer"
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
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-bold text-gray-800 flex items-center">
                    <ArrowRightLeft className="h-5 w-5 mr-2 text-blue-600" />
                    Form Pindah Barang (Standar)
                  </h3>
                  <span className="text-[10px] font-bold px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
                    Tgl Nota Asli Supplier
                  </span>
                </div>
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                  Memindahkan stok antar-rak reguler dengan mempertahankan <strong>tanggal nota penerimaan awal</strong> supplier.
                </p>

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
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1.5 bg-red-50 text-red-500 hover:bg-red-100 rounded-lg transition-all border border-red-100 backdrop-blur-sm shadow-sm cursor-pointer"
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
                            className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1.5 bg-red-50 text-red-500 hover:bg-red-100 rounded-lg transition-all border border-red-100 backdrop-blur-sm shadow-sm cursor-pointer"
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
                  <div className="space-y-3 pt-4">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button
                        onClick={clearSelection}
                        disabled={submitting}
                        className="sm:w-28 h-11 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-xl shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2 border border-slate-200 cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                        <span className="uppercase text-xs tracking-wider font-bold">Clear</span>
                      </Button>

                      {/* Standard Transfer Button (Uses Original Supplier Receipt Date) */}
                      <Button
                        onClick={handleSubmit}
                        disabled={submitting || !selectedItem || !moveData.rak_tujuan || !isRakTujuanValidated || moveData.jumlah_pindah === '' || moveData.jumlah_pindah <= 0}
                        className="flex-1 h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-md shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 border border-white/20 disabled:opacity-50 cursor-pointer"
                        title="Pindahkan stok menggunakan tanggal nota barang masuk awal"
                      >
                        {submitting ? (
                          <Loader className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        <span className="uppercase text-xs tracking-wider font-bold">
                          {submitting ? 'Memindahkan...' : 'Pindahkan (Tgl Nota Asli)'}
                        </span>
                      </Button>
                    </div>
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

      {/* Auto-Klop Minus Modal */}
      <AutoKlopMinusModal
        isOpen={showAutoKlopModal}
        onClose={() => setShowAutoKlopModal(false)}
        onSuccess={() => {
          loadInitialData();
        }}
        stockItems={stockItems}
      />
    </>
  );
}