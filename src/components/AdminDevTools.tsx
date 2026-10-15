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
  Info,
  CheckSquare,
  Square
} from 'lucide-react';
import { supabase, fetchAllStockItems, fetchAllProducts } from '../lib/supabase';
import { DatabaseService } from '../lib/DatabaseService';
import { useDatabaseConfig } from '../lib/DatabaseContext';
import { useAuth } from '../lib/AuthContext';
import { useDevMode } from '../lib/useDevMode';
import { getRealtimeDateTime, getOriginalReceiptDate } from '../lib/transferDateHelper';
import { CekSaldo1DirectView } from './CekSaldo1DirectView';

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

export interface SkuGroupForTransfer {
  nama_produk: string;
  packing: string;
  satuan: string;
  totalTersedia: number;
  rackCount: number;
  rackSummary: string;
  items: StockItem[];
}

export interface OriginRackItemState {
  stockItem: StockItem;
  isSelected: boolean;
  jumlahPindah: number;
  detectedReceiptDate: {
    tgl: string;
    tgl_scan: string;
    waktu: string;
    loading: boolean;
  };
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
  // FORM PINDAH BARANG (STANDAR) MULTI-RAK STATE
  // -------------------------------------------------------------
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSkuGroup, setSelectedSkuGroup] = useState<SkuGroupForTransfer | null>(null);
  const [selectedOriginRacks, setSelectedOriginRacks] = useState<OriginRackItemState[]>([]);
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const [highlightedItemIndex, setHighlightedItemIndex] = useState(0);

  const [moveData, setMoveData] = useState<{
    rak_tujuan: string;
  }>({
    rak_tujuan: ''
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
  // GROUPING STOCK ITEMS BY SKU (UNTUK MULTI-RAK TRANSFER)
  // -------------------------------------------------------------
  const skuGroupsForTransfer = useMemo(() => {
    const map = new Map<string, StockItem[]>();
    stockItems.forEach(item => {
      const avail = Number(item.tersedia) || 0;
      if (avail <= 0) return;
      const normSku = (item.nama_produk || '').trim().toUpperCase();
      if (!normSku) return;
      if (!map.has(normSku)) map.set(normSku, []);
      map.get(normSku)!.push(item);
    });

    const groups: SkuGroupForTransfer[] = [];
    map.forEach((items) => {
      const totalTersedia = items.reduce((sum, it) => sum + (Number(it.tersedia) || 0), 0);
      const packing = items.find(it => it.packing)?.packing || '-';
      const satuan = items.find(it => it.satuan)?.satuan || 'PCS';
      const rackSummary = items
        .map(it => `${it.rak || '-'}${it.sub_rak && it.sub_rak !== it.rak ? ` (${it.sub_rak})` : ''} (${(it.tersedia || 0).toLocaleString('id-ID')})`)
        .join(', ');

      groups.push({
        nama_produk: items[0].nama_produk,
        packing,
        satuan,
        totalTersedia,
        rackCount: items.length,
        rackSummary,
        items
      });
    });

    return groups.sort((a, b) => a.nama_produk.localeCompare(b.nama_produk));
  }, [stockItems]);

  const filteredSkuGroupsForTransfer = useMemo(() => {
    if (!searchTerm.trim()) {
      return skuGroupsForTransfer;
    }
    const q = searchTerm.toLowerCase().trim();
    return skuGroupsForTransfer.filter(g =>
      g.nama_produk.toLowerCase().includes(q) ||
      g.items.some(it =>
        (it.rak || '').toLowerCase().includes(q) ||
        (it.sub_rak || '').toLowerCase().includes(q)
      )
    );
  }, [skuGroupsForTransfer, searchTerm]);

  // Filter rak tujuan
  const filteredRacks = useMemo(() => {
    const inputUpper = moveData.rak_tujuan.toUpperCase().trim();
    return rackLocations.filter(rack => {
      if (!isDevGod && RESTRICTED_RACKS.includes(rack.nama.toUpperCase())) {
        return false;
      }
      if (!inputUpper) return true;
      return rack.nama.toUpperCase().includes(inputUpper);
    });
  }, [rackLocations, moveData.rak_tujuan, isDevGod]);

  // Keyboard navigation for Item Select
  const handleItemKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showItemDropdown || filteredSkuGroupsForTransfer.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedItemIndex(prev => (prev < filteredSkuGroupsForTransfer.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedItemIndex(prev => (prev > 0 ? prev - 1 : filteredSkuGroupsForTransfer.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredSkuGroupsForTransfer[highlightedItemIndex]) {
        handleSkuGroupSelect(filteredSkuGroupsForTransfer[highlightedItemIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowItemDropdown(false);
    }
  };

  // Pilih SKU Group (Mengambil seluruh macam rak & sub rak sekaligus)
  const handleSkuGroupSelect = (group: SkuGroupForTransfer) => {
    setSelectedSkuGroup(group);
    setSearchTerm(group.nama_produk);
    setShowItemDropdown(false);

    // Default: Semua rak tercentang dan jumlah pindah terisi maksimal
    const initialRacks: OriginRackItemState[] = group.items.map(it => ({
      stockItem: it,
      isSelected: true,
      jumlahPindah: it.tersedia,
      detectedReceiptDate: { tgl: '', tgl_scan: '', waktu: '', loading: true }
    }));

    setSelectedOriginRacks(initialRacks);

    // Deteksi tanggal nota asli untuk setiap rak secara paralel
    initialRacks.forEach((rackState, idx) => {
      getOriginalReceiptDate(group.nama_produk, rackState.stockItem.rak)
        .then(info => {
          setSelectedOriginRacks(prev => {
            const next = [...prev];
            if (next[idx]) {
              next[idx] = {
                ...next[idx],
                detectedReceiptDate: { ...info, loading: false }
              };
            }
            return next;
          });
        })
        .catch(err => {
          console.error('Error mendeteksi tanggal nota awal rak:', rackState.stockItem.rak, err);
          const { todayTgl, nowWaktu } = getRealtimeDateTime();
          setSelectedOriginRacks(prev => {
            const next = [...prev];
            if (next[idx]) {
              next[idx] = {
                ...next[idx],
                detectedReceiptDate: { tgl: todayTgl, tgl_scan: todayTgl, waktu: nowWaktu, loading: false }
              };
            }
            return next;
          });
        });
    });
  };

  // Toggle checklist semua rak
  const handleToggleSelectAllRacks = (checked: boolean) => {
    setSelectedOriginRacks(prev => prev.map(r => ({
      ...r,
      isSelected: checked,
      jumlahPindah: checked ? r.stockItem.tersedia : 0
    })));
  };

  // Gunakan maksimal semua rak
  const handleSetMaxAllSelectedRacks = () => {
    setSelectedOriginRacks(prev => prev.map(r => ({
      ...r,
      jumlahPindah: r.stockItem.tersedia
    })));
  };

  // Toggle single rack checkbox
  const handleToggleRackSelection = (idx: number, checked: boolean) => {
    setSelectedOriginRacks(prev => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        isSelected: checked,
        jumlahPindah: checked ? (next[idx].jumlahPindah || next[idx].stockItem.tersedia) : 0
      };
      return next;
    });
  };

  // Set jumlah pindah for single rack
  const handleSetRackJumlahPindah = (idx: number, val: number | string) => {
    setSelectedOriginRacks(prev => {
      const next = [...prev];
      if (val === '') {
        next[idx] = { ...next[idx], jumlahPindah: 0 };
      } else {
        const num = Math.min(next[idx].stockItem.tersedia, Math.max(0, Number(val) || 0));
        next[idx] = { ...next[idx], jumlahPindah: num };
      }
      return next;
    });
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
    setMoveData({ rak_tujuan: rakNama });
    setShowRakTujuanDropdown(false);
    setIsRakTujuanValidated(true);
  };

  const clearTransferForm = () => {
    setSelectedSkuGroup(null);
    setSelectedOriginRacks([]);
    setSearchTerm('');
    setMoveData({ rak_tujuan: '' });
    setIsRakTujuanValidated(false);
    setShowItemDropdown(false);
    setShowRakTujuanDropdown(false);
  };

  // Kalkulasi total
  const selectedRacksToMove = useMemo(() => {
    return selectedOriginRacks.filter(r => r.isSelected && r.jumlahPindah > 0);
  }, [selectedOriginRacks]);

  const totalQtyToMove = useMemo(() => {
    return selectedRacksToMove.reduce((sum, r) => sum + r.jumlahPindah, 0);
  }, [selectedRacksToMove]);

  const totalAvailableAcrossSelectedRacks = useMemo(() => {
    return selectedOriginRacks.reduce((sum, r) => sum + (r.isSelected ? r.stockItem.tersedia : 0), 0);
  }, [selectedOriginRacks]);

  const isAllRacksSelected = useMemo(() => {
    return selectedOriginRacks.length > 0 && selectedOriginRacks.every(r => r.isSelected);
  }, [selectedOriginRacks]);

  // -------------------------------------------------------------
  // EKSEKUSI TRANSFER STANDAR MULTI-RAK SEKALIGUS
  // -------------------------------------------------------------
  const handleMultiRackStandardTransfer = async () => {
    if (!selectedSkuGroup || !moveData.rak_tujuan || selectedRacksToMove.length === 0 || totalQtyToMove <= 0) {
      notify('Mohon pilih setidaknya 1 rak asal dengan jumlah pindah > 0 dan tentukan Rak Tujuan!', 'warning');
      return;
    }

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

    // Cek apakah rak tujuan sama dengan salah satu rak asal terpilih
    const sameRackConflict = selectedRacksToMove.find(r => r.stockItem.rak.toUpperCase() === rakTujuanFinal);
    if (sameRackConflict) {
      notify(`Rak Tujuan (${rakTujuanFinal}) sama dengan rak asal. Mohon hilangkan centang rak ${sameRackConflict.stockItem.rak} atau ganti rak tujuan!`, 'warning');
      return;
    }

    try {
      setSubmitting(true);
      const steps = [
        `Menyiapkan transfer ${selectedRacksToMove.length} rak asal (Total ${totalQtyToMove.toLocaleString('id-ID')} ${selectedSkuGroup.satuan})`,
        'Mencatat data log OUT dari seluruh rak asal (Tgl Nota Asli)',
        'Mencatat data log IN ke rak tujuan (Hari Ini)',
        'Menyesuaikan stok di seluruh rak asal',
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
      const { todayTgl, nowWaktu } = getRealtimeDateTime();
      const userIdentifier = user?.user_metadata?.full_name || user?.email || userRole || 'System (Admin/Dev Tools)';

      // 1 & 2. Build log entries for ALL origin racks
      setOperationProgress(prev => ({ ...prev, currentStep: steps[1], completedSteps: 1 }));

      const logEntries: any[] = [];
      let timeOffset = 0;

      for (const rackState of selectedRacksToMove) {
        const it = rackState.stockItem;
        const qty = rackState.jumlahPindah;
        let tglScanAsli = rackState.detectedReceiptDate.tgl_scan || rackState.detectedReceiptDate.tgl;

        if (!tglScanAsli) {
          const info = await getOriginalReceiptDate(it.nama_produk, it.rak);
          tglScanAsli = info.tgl_scan || info.tgl || todayTgl;
        }

        timeOffset += 1000;
        const createdAtOut = new Date(now.getTime() + timeOffset).toISOString();
        timeOffset += 1000;
        const createdAtIn = new Date(now.getTime() + timeOffset).toISOString();

        // OUT from origin rack
        logEntries.push({
          tgl: todayTgl,
          waktu: nowWaktu,
          sku: it.nama_produk,
          jumlah: qty,
          type: 'OUT',
          gudang: 'TRANSFER',
          rak: it.rak,
          tgl_scan: tglScanAsli,
          user_name: userIdentifier,
          sub_rak: it.sub_rak || it.rak,
          created_at: createdAtOut
        });

        // IN to destination rack
        logEntries.push({
          tgl: todayTgl,
          waktu: nowWaktu,
          sku: it.nama_produk,
          jumlah: qty,
          type: 'IN',
          gudang: 'TRANSFER',
          rak: rakTujuanFinal,
          tgl_scan: todayTgl,
          user_name: userIdentifier,
          sub_rak: rakTujuanFinal,
          created_at: createdAtIn
        });
      }

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
            const origMatch = logEntries.find(e => e.created_at === l.created_at || (e.type === l.type && e.rak === l.rak && e.jumlah === l.jumlah));
            const expectedTglScan = origMatch?.tgl_scan || (l.type === 'OUT' ? todayTgl : todayTgl);
            if (l.tgl_scan !== expectedTglScan || l.tgl !== expectedTgl) {
              await DatabaseService.updateLog(l.id, { tgl_scan: expectedTglScan, tgl: expectedTgl }, writeMode);
            }
          }
        }
      }

      // 3. Kurangi stok di seluruh rak asal
      setOperationProgress(prev => ({ ...prev, currentStep: steps[3], completedSteps: 3 }));
      for (const rackState of selectedRacksToMove) {
        const it = rackState.stockItem;
        const qty = rackState.jumlahPindah;
        if (it.id) {
          await DatabaseService.updateStockItem(
            it.id,
            {
              keluar: (it.keluar || 0) + qty,
              tersedia: Math.max(0, (it.tersedia || 0) - qty)
            },
            writeMode
          );
        }
      }

      // 4. Tambah stok di rak tujuan (akumulasi total seluruh rak)
      setOperationProgress(prev => ({ ...prev, currentStep: steps[4], completedSteps: 4 }));
      const { data: existingStock, error: checkError } = await supabase
        .from('stock_items')
        .select('id, tersedia, masuk')
        .eq('nama_produk', selectedSkuGroup.nama_produk)
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
            masuk: (existingStock.masuk || 0) + totalQtyToMove,
            tersedia: (existingStock.tersedia || 0) + totalQtyToMove
          },
          writeMode
        );
      } else {
        const { error: insertError } = await DatabaseService.insertStockItems([{
          nama_produk: selectedSkuGroup.nama_produk,
          packing: selectedSkuGroup.packing,
          rak: rakTujuanFinal,
          sub_rak: rakTujuanFinal,
          satuan: selectedSkuGroup.satuan || 'PCS',
          stok_awal: 0,
          masuk: totalQtyToMove,
          keluar: 0,
          tersedia: totalQtyToMove,
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
      const rackNames = selectedRacksToMove.map(r => r.stockItem.rak).join(', ');
      notify(
        `Sukses memindahkan total ${totalQtyToMove.toLocaleString('id-ID')} ${selectedSkuGroup.satuan} ${selectedSkuGroup.nama_produk} dari ${selectedRacksToMove.length} rak (${rackNames}) ke ${rakTujuanFinal}${stockCreated ? ' (stok tujuan baru dibuat)' : ''}!`,
        'success'
      );

      setTimeout(() => {
        setOperationProgress(prev => ({ ...prev, isVisible: false }));
        clearTransferForm();
        loadInitialData();
      }, 1200);

    } catch (err: any) {
      console.error('Error during multi-rack transfer:', err);
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
      {/* PREMIUM IMMERSIVE HEADER */}
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
        {/* TAB 1: 1. AUDIT & CEK SALDO (CEK SALDO 1 DIRECT VIEW) */}
        {/* ======================================================== */}
        {activeTab === 'cek-saldo' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <CekSaldo1DirectView
              allSkus={allSkus}
              onDataUpdated={loadInitialData}
              showToast={notify}
            />
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: 2. PINDAH DATA BARANG (MULTI-RAK SEKALIGUS) */}
        {/* ======================================================== */}
        {activeTab === 'pindah-barang' && (
          <div className="space-y-6 animate-in fade-in duration-300">

            {/* Operation Progress Display */}
            {operationProgress.isVisible && (
              <div className="p-4 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-2xl shadow-xl border border-blue-500/30 animate-in fade-in duration-300">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-200 flex items-center gap-2">
                    <Loader className="w-4 h-4 animate-spin text-amber-300" />
                    Memproses Pemindahan Stok Standar Multi-Rak...
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

              {/* KOLOM KIRI: FORM PINDAH BARANG (MULTI-RAK STANDAR) */}
              <div className="lg:col-span-8 relative z-30">
                <Card className="border border-slate-200 shadow-md rounded-3xl overflow-visible bg-white relative z-30 min-h-[460px]">
                  <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-blue-50/50 via-white to-indigo-50/30 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                        <ArrowRightLeft className="h-5 w-5 text-blue-600" />
                        <span>Form Pindah Barang (Standar Terpadu)</span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Tarik semua macam rak &amp; sub rak sekaligus ke satu rak tujuan dengan mempertahankan <strong>tanggal nota penerimaan awal</strong>.
                      </p>
                    </div>
                    <span className="text-[11px] font-black px-3 py-1 bg-blue-100 text-blue-800 border border-blue-200 rounded-full uppercase tracking-wider shrink-0">
                      Tgl Nota Asli
                    </span>
                  </div>

                  <CardContent className="p-6 space-y-5 overflow-visible">
                    {/* INPUT 1: PILIH BARANG (SKU DENGAN INFO SEMUA RAK & TOTAL) */}
                    <div className="relative z-30">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-slate-700 uppercase">
                          Pilih Barang ({skuGroupsForTransfer.length.toLocaleString('id-ID')} SKU dengan Stok Tersedia)
                        </label>
                        <span className="text-[11px] text-slate-400">
                          {loading ? 'Memuat...' : 'Mencari semua rak & total stok'}
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
                              setSelectedSkuGroup(null);
                              setSelectedOriginRacks([]);
                            }
                          }}
                          onFocus={() => {
                            setShowItemDropdown(true);
                            setHighlightedItemIndex(0);
                          }}
                          onKeyDown={handleItemKeyDown}
                          placeholder="Ketik nama SKU / produk untuk melihat semua rak & total stok..."
                          className="w-full h-12 px-4 pr-10 border border-slate-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs bg-white text-sm font-medium text-slate-900"
                        />

                        {searchTerm && (
                          <button
                            type="button"
                            onClick={() => {
                              clearTransferForm();
                            }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 bg-rose-50 text-rose-500 hover:bg-rose-100 rounded-xl transition-all cursor-pointer"
                            title="Hapus pencarian"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}

                        {/* Autocomplete Dropdown List */}
                        {showItemDropdown && (
                          <div
                            ref={itemDropdownRef}
                            className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[9999] max-h-84 overflow-y-auto divide-y divide-slate-100 animate-in fade-in duration-150 ring-1 ring-slate-900/10"
                          >
                            {filteredSkuGroupsForTransfer.length > 0 ? (
                              filteredSkuGroupsForTransfer.map((group, index) => (
                                <div
                                  key={`${group.nama_produk}-${index}`}
                                  onClick={() => handleSkuGroupSelect(group)}
                                  className={`px-4 py-3 text-sm cursor-pointer transition-colors flex items-center justify-between ${
                                    index === highlightedItemIndex ? 'bg-blue-50 text-blue-900' : 'hover:bg-slate-50'
                                  }`}
                                >
                                  <div className="min-w-0 pr-3">
                                    <div className="font-bold text-slate-900 truncate">{group.nama_produk}</div>
                                    <div className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5 mt-0.5">
                                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 font-bold rounded-md text-[11px] border border-indigo-200">
                                        {group.rackCount} Lokasi Rak
                                      </span>
                                      <span className="text-[11px] text-slate-600 truncate max-w-[360px]" title={group.rackSummary}>
                                        {group.rackSummary}
                                      </span>
                                      {group.packing && <span className="text-slate-400">| Packing: {group.packing}</span>}
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <span className="text-xs font-black text-emerald-700 bg-emerald-100 px-3 py-1.5 rounded-xl border border-emerald-300 block">
                                      Total {group.totalTersedia.toLocaleString('id-ID')} {group.satuan}
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

                    {/* DETAIL BARANG TERPILIH & CHECKLIST SEMUA MACAM RAK */}
                    {selectedSkuGroup && (
                      <div className="p-5 bg-gradient-to-r from-emerald-50/70 via-blue-50/50 to-indigo-50/50 border border-emerald-200 rounded-3xl space-y-4">
                        {/* Header Info SKU */}
                        <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-emerald-200/60">
                          <div>
                            <span className="text-xs font-black text-emerald-950 uppercase tracking-wide flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              Barang Terpilih: <strong className="text-blue-900 font-mono text-sm ml-1">{selectedSkuGroup.nama_produk}</strong>
                            </span>
                            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-3">
                              <span>Satuan: <strong>{selectedSkuGroup.satuan}</strong></span>
                              <span>•</span>
                              <span>Packing: <strong>{selectedSkuGroup.packing}</strong></span>
                              <span>•</span>
                              <span>Total Stok: <strong className="text-emerald-700 font-bold">{selectedSkuGroup.totalTersedia.toLocaleString('id-ID')} {selectedSkuGroup.satuan}</strong></span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="px-3 py-1 bg-white border border-emerald-300 rounded-xl text-xs font-black text-emerald-800 shadow-xs">
                              {selectedOriginRacks.length} Lokasi Rak Ditemukan
                            </span>
                          </div>
                        </div>

                        {/* Toolbar Checklist & Action */}
                        <div className="flex flex-wrap items-center justify-between gap-3 bg-white/90 p-3 rounded-2xl border border-slate-200 shadow-xs">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => handleToggleSelectAllRacks(!isAllRacksSelected)}
                              className="flex items-center gap-2 text-xs font-black text-slate-800 hover:text-blue-600 cursor-pointer"
                            >
                              {isAllRacksSelected ? (
                                <CheckSquare className="w-4 h-4 text-blue-600" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-400" />
                              )}
                              <span>Pilih Semua Rak ({selectedOriginRacks.length})</span>
                            </button>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleSetMaxAllSelectedRacks}
                              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl border border-blue-200 transition-colors cursor-pointer"
                            >
                              Gunakan Maksimal Semua Rak
                            </button>

                            <span className="px-3 py-1.5 bg-emerald-600 text-white font-black text-xs rounded-xl shadow-xs">
                              Total Pindah: {totalQtyToMove.toLocaleString('id-ID')} {selectedSkuGroup.satuan}
                            </span>
                          </div>
                        </div>

                        {/* Daftar Macam Rak & Sub Rak */}
                        <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs max-h-72 overflow-y-auto">
                          <table className="w-full text-xs text-left">
                            <thead className="bg-slate-100 sticky top-0 border-b border-slate-200 text-slate-700 font-bold">
                              <tr>
                                <th className="p-3 w-10 text-center">
                                  <input
                                    type="checkbox"
                                    checked={isAllRacksSelected}
                                    onChange={(e) => handleToggleSelectAllRacks(e.target.checked)}
                                    className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                                  />
                                </th>
                                <th className="p-3">Lokasi Rak &amp; Sub Rak</th>
                                <th className="p-3 text-center">Stok Tersedia</th>
                                <th className="p-3 text-center w-40">Jumlah Pindah (PCS)</th>
                                <th className="p-3 text-center">Tgl Nota Asli IN</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {selectedOriginRacks.map((rackState, idx) => {
                                const it = rackState.stockItem;
                                return (
                                  <tr
                                    key={`${it.id}-${it.rak}-${idx}`}
                                    className={`transition-colors ${rackState.isSelected ? 'bg-blue-50/40 hover:bg-blue-50/70' : 'bg-slate-50/60 opacity-60 hover:opacity-90'}`}
                                  >
                                    <td className="p-3 text-center">
                                      <input
                                        type="checkbox"
                                        checked={rackState.isSelected}
                                        onChange={(e) => handleToggleRackSelection(idx, e.target.checked)}
                                        className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                                      />
                                    </td>
                                    <td className="p-3">
                                      <div className="font-bold text-slate-900 text-sm">{it.rak}</div>
                                      {it.sub_rak && it.sub_rak !== it.rak && (
                                        <div className="text-[10px] text-slate-500 italic mt-0.5">
                                          Sub: {it.sub_rak}
                                        </div>
                                      )}
                                    </td>
                                    <td className="p-3 text-center font-bold text-emerald-700">
                                      {it.tersedia.toLocaleString('id-ID')} {it.satuan}
                                    </td>
                                    <td className="p-3">
                                      <div className="flex items-center gap-1.5 justify-center">
                                        <input
                                          type="number"
                                          min="0"
                                          max={it.tersedia}
                                          disabled={!rackState.isSelected}
                                          value={rackState.jumlahPindah === 0 ? '' : rackState.jumlahPindah}
                                          onChange={(e) => handleSetRackJumlahPindah(idx, e.target.value)}
                                          placeholder={`Maks ${it.tersedia}`}
                                          className="w-24 h-9 px-2.5 text-center font-bold border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-xs disabled:bg-slate-100 disabled:text-slate-400"
                                        />
                                        <button
                                          type="button"
                                          disabled={!rackState.isSelected}
                                          onClick={() => handleSetRackJumlahPindah(idx, it.tersedia)}
                                          className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-[10px] transition-colors disabled:opacity-40 cursor-pointer"
                                          title={`Gunakan maksimal ${it.tersedia}`}
                                        >
                                          Maks
                                        </button>
                                      </div>
                                    </td>
                                    <td className="p-3 text-center font-mono">
                                      {rackState.detectedReceiptDate.loading ? (
                                        <span className="inline-flex items-center gap-1 text-[11px] text-blue-600 animate-pulse">
                                          <RefreshCw className="w-3 h-3 animate-spin" /> Mendeteksi...
                                        </span>
                                      ) : (
                                        <span className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-bold text-slate-800 shadow-xs">
                                          {rackState.detectedReceiptDate.tgl_scan || rackState.detectedReceiptDate.tgl || '-'}
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* INPUT 2: RAK TUJUAN (TETAP SEPERTI BIASA) */}
                    {selectedSkuGroup && (
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
                              setMoveData({ rak_tujuan: upperValue });
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
                                setMoveData({ rak_tujuan: '' });
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
                        onClick={handleMultiRackStandardTransfer}
                        disabled={
                          submitting ||
                          !selectedSkuGroup ||
                          !moveData.rak_tujuan ||
                          !isRakTujuanValidated ||
                          selectedRacksToMove.length === 0 ||
                          totalQtyToMove <= 0
                        }
                        className="flex-1 h-12 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 text-white font-black rounded-2xl shadow-lg shadow-blue-500/25 active:scale-95 transition-all flex items-center justify-center gap-2 border border-white/20 disabled:opacity-50 cursor-pointer text-xs sm:text-sm uppercase tracking-wider"
                      >
                        {submitting ? (
                          <>
                            <Loader className="h-4 w-4 animate-spin text-white" />
                            <span>Memindahkan {selectedRacksToMove.length} Rak...</span>
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4" />
                            <span>Pindahkan Semua ({totalQtyToMove.toLocaleString('id-ID')} PCS dari {selectedRacksToMove.length} Rak)</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* KOLOM KANAN: RINGKASAN & SIMULASI MULTI-RAK */}
              <div className="lg:col-span-4 space-y-5">
                <Card className="border border-slate-200 shadow-sm rounded-3xl overflow-hidden bg-white">
                  <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                    <h4 className="text-sm font-black text-slate-800 uppercase flex items-center gap-2">
                      <Scale className="w-4 h-4 text-blue-600" />
                      Prinsip Transfer Multi-Rak
                    </h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md">
                      Anti-Anomali
                    </span>
                  </div>

                  <CardContent className="p-6 space-y-4 text-xs text-slate-600 leading-relaxed">
                    <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl text-blue-900 space-y-1">
                      <p className="font-bold flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-blue-600" />
                        Logika Pemindahan Terpadu (Admin &amp; Dev Tools)
                      </p>
                      <p className="text-[11px] text-blue-800">
                        Memindahkan seluruh stok dari beragam rak (seperti sub rak A1, D7, LORONG-1, ECER-M, LANTAI 2, dsb.) sekaligus ke satu rak tujuan dengan mempertahankan tanggal nota asli masing-masing rak.
                      </p>
                    </div>

                    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                      <p className="font-bold text-slate-800 text-[11px] uppercase">Alur Pemindahan Terpadu:</p>
                      <ul className="space-y-1.5 text-slate-600 text-[11px]">
                        <li className="flex items-start gap-1.5">
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span>Mencatat <strong>1x OUT</strong> untuk setiap rak asal dengan tgl scan nota asli masing-masing.</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span>Mencatat <strong>1x IN</strong> di rak tujuan dengan tanggal nota dan scan hari ini (real-time).</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span>Mengurangi stok asal di masing-masing rak &amp; mengakumulasikan total di rak tujuan.</span>
                        </li>
                      </ul>
                    </div>

                    {selectedSkuGroup && (
                      <div className="p-4 bg-purple-50 border border-purple-200 rounded-2xl space-y-2.5">
                        <p className="font-bold text-purple-900 text-xs flex items-center gap-1.5">
                          <Package className="w-4 h-4 text-purple-700" />
                          Simulasi Rincian Transfer:
                        </p>
                        <div className="text-[11px] text-purple-900 space-y-1.5">
                          <div className="font-semibold text-slate-800">
                            • Total Pindah: <strong>{totalQtyToMove.toLocaleString('id-ID')} {selectedSkuGroup.satuan}</strong> dari <strong>{selectedRacksToMove.length}</strong> lokasi rak:
                          </div>
                          <div className="max-h-40 overflow-y-auto space-y-1 pl-2 font-mono text-[10px] text-purple-950">
                            {selectedRacksToMove.map((r, i) => (
                              <div key={i} className="flex justify-between items-center bg-white/70 px-2 py-1 rounded border border-purple-200/50">
                                <span>{r.stockItem.rak}:</span>
                                <strong>-{r.jumlahPindah} {selectedSkuGroup.satuan}</strong>
                              </div>
                            ))}
                          </div>
                          <div className="pt-1 border-t border-purple-200/60 font-semibold text-purple-950">
                            • Menuju ke: <strong className="text-blue-900 underline">{moveData.rak_tujuan || '[Pilih Rak Tujuan]'}</strong> (+{totalQtyToMove.toLocaleString('id-ID')} {selectedSkuGroup.satuan})
                          </div>
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
