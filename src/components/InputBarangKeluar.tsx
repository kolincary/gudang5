import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Plus, Trash2, Settings, Send, Trash, ChevronDown, X, Layers, RefreshCw, Eye, MoveRight, ShieldAlert, Tag, Camera, Filter, Package, Edit3, SlidersHorizontal, Box, LayoutGrid, Warehouse, AlertCircle } from 'lucide-react';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { ValidationAlert } from './ui/ValidationAlert';
import { Toast } from './ui/Toast';
import { Modal } from './ui/Modal';
import { BarcodeScanner } from './ui/BarcodeScanner';
import { CustomDropdown } from './ui/CustomDropdown';
import { supabase, calculateAccurateStock, fetchAllProducts, fetchAllStockItems } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { cn } from '../lib/utils';
import { verifyPin } from '../lib/pinValidator';
import { db } from '../lib/firebase';
import { collection, writeBatch, doc } from 'firebase/firestore';
import { useDatabaseConfig } from '../lib/DatabaseContext';
import { DatabaseService } from '../lib/DatabaseService';
// Local storage keys
const STORAGE_KEY = 'input_barang_keluar_data';
const PRODUCTS_CACHE_KEY = 'input_barang_keluar_products_cache';
const WAREHOUSES_CACHE_KEY = 'input_barang_keluar_warehouses_cache';
const RACKS_CACHE_KEY = 'input_barang_keluar_racks_cache';
const CACHE_TIMESTAMP_KEY = 'input_barang_keluar_cache_timestamp';
const SESSION_ID_KEY = 'input_barang_keluar_session_id';
// Cache duration is now effectively ignored

// Generate or retrieve a stable session ID for this device+browser
const getSessionId = (): string => {
    let sessionId = localStorage.getItem(SESSION_ID_KEY);
    if (!sessionId) {
        sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem(SESSION_ID_KEY, sessionId);
    }
    return sessionId;
};

const getDeviceInfo = (): string => {
    try {
        return `${navigator.userAgent.slice(0, 100)}`;
    } catch { return 'unknown'; }
};

// Sync rows to Supabase draft table
const syncDraftToSupabase = async (rows: TransactionRow[], sessionId: string) => {
    try {
        // Delete existing draft for this session
        await supabase.from('input_barang_keluar_draft').delete().eq('session_id', sessionId);

        // Only insert rows that have meaningful data
        const meaningfulRows = rows.filter(r => r.nama_produk || r.jumlah > 0 || r.gudang || r.rak);
        if (meaningfulRows.length === 0) return;

        const draftRows = meaningfulRows.map((row, index) => ({
            session_id: sessionId,
            row_id: row.id,
            row_index: index,
            nama_produk: row.nama_produk || '',
            jumlah: row.jumlah || 0,
            tanggal: row.tanggal || '',
            gudang: row.gudang || '',
            rak: row.rak || '',
            sub_rak: row.sub_rak || '',
            type: row.type || 'OUT',
            packing: row.packing || '',
            tgl_scan: row.tgl_scan || '',
            user_name: row.user_name || '',
            unique_code: row.unique_code || '',
            stok_tersedia: row.stok_tersedia || 0,
            total_stok: row.total_stok || 0,
            is_scanned: row.is_scanned || false,
            device_info: getDeviceInfo(),
            updated_at: new Date().toISOString()
        }));

        await supabase.from('input_barang_keluar_draft').insert(draftRows);
    } catch (error) {
        console.warn('⚠️ Draft sync to Supabase failed (table may not exist yet):', error);
    }
};

// Log deleted rows to Supabase
const logDeletedToSupabase = async (deletedRows: TransactionRow[], reason: string, sessionId: string) => {
    try {
        const records = deletedRows
            .filter(r => r.nama_produk || r.jumlah > 0 || r.gudang || r.rak)
            .map((row, index) => ({
                original_row_id: row.id,
                session_id: sessionId,
                row_index: index,
                nama_produk: row.nama_produk || '',
                jumlah: row.jumlah || 0,
                tanggal: row.tanggal || '',
                gudang: row.gudang || '',
                rak: row.rak || '',
                sub_rak: row.sub_rak || '',
                type: row.type || 'OUT',
                packing: row.packing || '',
                tgl_scan: row.tgl_scan || '',
                user_name: row.user_name || '',
                unique_code: row.unique_code || '',
                stok_tersedia: row.stok_tersedia || 0,
                total_stok: row.total_stok || 0,
                is_scanned: row.is_scanned || false,
                deleted_by: 'user',
                delete_reason: reason,
                device_info: getDeviceInfo()
            }));

        if (records.length > 0) {
            await supabase.from('input_barang_keluar_deleted').insert(records);
            console.log(`🗑️ Logged ${records.length} deleted row(s) to Supabase [reason: ${reason}]`);
        }
    } catch (error) {
        console.warn('⚠️ Delete logging to Supabase failed (table may not exist yet):', error);
    }
};

interface TransactionRow {
    id: string;
    tanggal: string;
    waktu: string;
    nama_produk: string;
    jumlah: number;
    type: string;
    gudang: string;
    rak: string;
    sub_rak: string;
    tgl_scan: string;
    user_name: string;
    unique_code?: string;
    stok_tersedia: number;
    total_stok: number;
    packing?: string;
    validationErrors?: string[];
    is_scanned?: boolean;
}
interface AnalyzedItem {
    nama_produk: string;
    jumlah: number;
    isValid: boolean;
}
interface AnalyzedItem2 {
    nama_produk: string;
    jumlah: number;
    tgl_scan: string;
    user_name: string;
    isValid: boolean;
}
interface AnalyzedItemScan {
    nama_produk: string;
    jumlah: number;
    rak: string;
    tgl_scan: string;
    user_name: string;
    isValid: boolean;
}
interface AnalyzedItemSN {
    nama_produk: string;
    unique_code: string;
    tgl_scan: string;
    isValid: boolean;
}
interface AnalyzedItemMassal {
    nama_produk: string;
    jumlah: number;
    rak: string;
    isValid: boolean;
}
interface Massal2Item {
    nama_produk: string;
    jumlah: number;
    unique_code: string;
    isValid: boolean;
}
interface Massal3Item {
    sku: string;
    qty_pcs: number;
    qty_karton: number;
    isValid: boolean;
}
interface RackLocation {
    id: string;
    nama: string;
    tampil_di_menu: 'INPUT_MASUK' | 'INPUT_KELUAR' | 'KEDUANYA';
    status: string;
    auto_fill_scanner?: boolean;
}
interface StockItem {
    id: string;
    nama_produk: string;
    rak: string;
    tersedia: number;
    packing?: string;
}
const loadFromStorage = (): TransactionRow[] => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (error) {
        console.error('Error loading from localStorage:', error);
    }
    return [];
};
const saveToStorage = (data: TransactionRow[]) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
        console.error('Error saving to localStorage:', error);
    }
};

const saveDropdownCache = (key: string, data: string[]) => {
    try {
        localStorage.setItem(key, JSON.stringify(data));
        localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
    } catch (error) {
        console.error('Error saving dropdown cache:', error);
    }
};
export function InputBarangKeluar() {
    const { writeMode } = useDatabaseConfig();
    const { userEmail, userDetails, isGuest, loading } = useAuth();
    const formatDateDDMMYYYY = (date: Date): string => {
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    };
    const convertToInputDate = (ddmmyyyy: string): string => {
        if (!ddmmyyyy || ddmmyyyy.split('/').length !== 3) return '';
        const [day, month, year] = ddmmyyyy.split('/');
        return `${year}-${month}-${day}`;
    };
    const convertFromInputDate = (yyyymmdd: string): string => {
        if (!yyyymmdd) return '';
        const [year, month, day] = yyyymmdd.split('-');
        return `${day}/${month}/${year}`;
    };
    const formatTimeWithSeconds = (date: Date): string => {
        return date.toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    };
    const [currentTime, setCurrentTime] = useState(formatTimeWithSeconds(new Date()));
    const [currentDate, setCurrentDate] = useState(formatDateDDMMYYYY(new Date()));
    const [validProducts, setValidProducts] = useState<string[]>([]);
    const [validWarehouses, setValidWarehouses] = useState<string[]>([]);
    const [validRacks, setValidRacks] = useState<string[]>([]);
    const [dropdownLoading, setDropdownLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [stockItems, setStockItems] = useState<StockItem[]>([]);
    const [rackLocations, setRackLocations] = useState<RackLocation[]>([]);
    const [devMode, setDevMode] = useState(() => {
        const isDevUser = userEmail?.toLowerCase().includes('devmode');
        return isDevUser || localStorage.getItem('devmode') === 'true';
    });
    // States for Massal 2
    const [isMassal2ModalOpen, setIsMassal2ModalOpen] = useState(false);
    const [massal2InputText, setMassal2InputText] = useState('');
    const [massal2AnalyzedData, setMassal2AnalyzedData] = useState<Massal2Item[]>([]);
    const [massal2AnalysisResult, setMassal2AnalysisResult] = useState({ berhasil: 0, gagal: 0 });

    // States for Massal 3
    const [isMassal3ModalOpen, setIsMassal3ModalOpen] = useState(false);
    const [massal3InputText, setMassal3InputText] = useState('');
    const [massal3AnalyzedData, setMassal3AnalyzedData] = useState<Massal3Item[]>([]);
    const [massal3AnalysisResult, setMassal3AnalysisResult] = useState({ berhasil: 0, gagal: 0 });

    const filteredRackOptions = React.useMemo(() => {
        return rackLocations
            .filter(rack =>
                rack.tampil_di_menu === 'KEDUANYA' || rack.tampil_di_menu === 'INPUT_KELUAR'
            )
            .map((rack) => rack.nama);
    }, [rackLocations]);

    const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
    const [submissionProgress, setSubmissionProgress] = useState({ current: 0, total: 0 });
    const [showPackingColumn, setShowPackingColumn] = useState(false);
    // State untuk mengontrol visibilitas tombol tambahan
    const [showAdvancedButtons, setShowAdvancedButtons] = useState(false);
    const [isPinModalOpen, setIsPinModalOpen] = useState(false);
    const [pinInput, setPinInput] = useState('');
    const [pendingFormat, setPendingFormat] = useState<'format1' | 'format2' | 'format_scan2' | 'format_scan' | 'format_massal' | 'format_sn' | null>(null);
    const [showScanner, setShowScanner] = useState(false);

    // Marquee state for running text
    const [showMarquee, setShowMarquee] = useState(true);

    useEffect(() => {
        // Show for 30 seconds, then hide. Every 30 minutes, show again.
        const showDuration = 30000; // 30 seconds
        const hideDuration = 1800000; // 30 minutes

        let hideTimer: NodeJS.Timeout;

        const cycleMarquee = () => {
            setShowMarquee(true);
            hideTimer = setTimeout(() => {
                setShowMarquee(false);
            }, showDuration);
        };

        cycleMarquee();

        const intervalTimer = setInterval(() => {
            cycleMarquee();
        }, hideDuration);

        return () => {
            clearTimeout(hideTimer);
            clearInterval(intervalTimer);
        };
    }, []);

    // Scan confirmation modal states
    const [showScanModal, setShowScanModal] = useState(false);
    const [scanModalSku, setScanModalSku] = useState('');
    const [scanModalRak, setScanModalRak] = useState('');
    const [scanModalQty, setScanModalQty] = useState('');
    const [scanModalUniqueCode, setScanModalUniqueCode] = useState('');
    const [scanModalLoading, setScanModalLoading] = useState(false);
    const [scanModalTglScan, setScanModalTglScan] = useState(''); // date extracted from barcode
    const [scanModalStatus, setScanModalStatus] = useState<'idle' | 'found' | 'not_found'>('idle');

    // Draggable camera FAB state - persisted in localStorage
    const FAB_STORAGE_KEY = 'camera_fab_position';
    const getInitialFabPos = () => {
        try {
            const saved = localStorage.getItem(FAB_STORAGE_KEY);
            if (saved) return JSON.parse(saved);
        } catch { }
        // Default: right-center of screen
        return { x: typeof window !== 'undefined' ? window.innerWidth - 80 : 300, y: Math.round((typeof window !== 'undefined' ? window.innerHeight : 700) / 2) - 32 };
    };
    const [fabPos, setFabPos] = useState(getInitialFabPos);
    const fabDragging = useRef(false);
    const fabStartPos = useRef({ x: 0, y: 0 });
    const fabOffset = useRef({ x: 0, y: 0 });
    const fabMoved = useRef(false);

    const handleFabPointerDown = (e: React.PointerEvent) => {
        if (e.pointerType === 'touch') {
            document.body.style.overflow = 'hidden';
        }
        fabDragging.current = true;
        fabMoved.current = false;
        fabStartPos.current = { x: e.clientX, y: e.clientY };
        const el = e.currentTarget as HTMLElement;
        const rect = el.getBoundingClientRect();
        fabOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const handleFabPointerMove = (e: React.PointerEvent) => {
        if (!fabDragging.current) return;

        // Cek toleransi jarak (jitter threshold) 15px agar touch responsif pada saat tap/klik
        const moveX = Math.abs(e.clientX - fabStartPos.current.x);
        const moveY = Math.abs(e.clientY - fabStartPos.current.y);

        if (moveX > 15 || moveY > 15) {
            fabMoved.current = true;
        }

        if (fabMoved.current) {
            const newX = e.clientX - fabOffset.current.x;
            const newY = e.clientY - fabOffset.current.y;
            // Convert to bottom/left coordinates
            setFabPos({
                x: Math.max(0, Math.min(newX, window.innerWidth - 64)),
                y: Math.max(0, Math.min(window.innerHeight - newY - 64, window.innerHeight - 64))
            });
        }
    };

    const finishFabAction = () => {
        document.body.style.overflow = '';
        if (!fabDragging.current) return;
        fabDragging.current = false;

        if (!fabMoved.current) {
            setShowScanner(true);
        } else {
            // Save position to localStorage after drag
            try { localStorage.setItem(FAB_STORAGE_KEY, JSON.stringify(fabPos)); } catch { }
        }
    };

    const handleScanResult = async (decodedText: string) => {
        setShowScanner(false);
        const rawText = decodedText.trim();
        if (!rawText) return;

        // Parse the barcode: support [Date] [SKU] [Unique Code]
        // Uses Tab or Double-Space as separator
        const parts = rawText.split(/\t| {2,}/).filter(p => p.trim() !== '');

        let extractedDate = '';
        let extractedSku = '';
        let extractedUniqueCode = '';

        if (parts.length >= 3) {
            // Case 1: [Date] [SKU] [Unique Code]
            extractedDate = parts[0];
            extractedSku = parts[1];
            extractedUniqueCode = parts[2];
        } else if (parts.length === 2) {
            // Case 2: [Date] [SKU] or [SKU] [Unique Code]
            const isDate = parts[0].match(/^\d{2}-\d{2}-\d{4}$/) || parts[0].match(/^\d{4}-\d{2}-\d{2}$/);
            if (isDate) {
                extractedDate = parts[0];
                extractedSku = parts[1];
            } else {
                extractedSku = parts[0];
                extractedUniqueCode = parts[1];
            }
        } else {
            // Case 3: Single SKU or Legacy "DD-MM-YYYY SKU"
            extractedSku = rawText;
            const legacyMatch = rawText.match(/^(\d{2}-\d{2}-\d{4})\s+(.+)$/);
            if (legacyMatch) {
                extractedDate = legacyMatch[1];
                extractedSku = legacyMatch[2].trim();
            }
        }

        // Convert date if in DD-MM-YYYY format
        let finalTglScan = extractedDate;
        if (extractedDate && extractedDate.match(/^\d{2}-\d{2}-\d{4}$/)) {
            const [dd, mm, yyyy] = extractedDate.split('-');
            finalTglScan = `${yyyy}-${mm}-${dd}`;
        }

        // Try to find if product is valid
        const product = validProducts.find(p => p.toLowerCase() === extractedSku.toLowerCase());
        const targetSku = product || extractedSku;

        // Open confirmation modal
        setScanModalSku(targetSku);
        setScanModalTglScan(finalTglScan);
        setScanModalUniqueCode(extractedUniqueCode);
        setScanModalQty('');
        setScanModalRak('');
        setScanModalStatus('idle');
        setScanModalLoading(false);
        setShowScanModal(true);

        // If we have both date and SKU, auto-lookup rak from database_log
        if (finalTglScan && targetSku) {
            setScanModalLoading(true);
            try {
                // Also try DD/MM/YYYY format for tgl_scan since the database might store it differently
                const [yyyy, mm, dd] = finalTglScan.split('-');
                const dateVariations = [
                    finalTglScan,            // YYYY-MM-DD
                    `${dd}/${mm}/${yyyy}`,   // DD/MM/YYYY
                    `${dd}-${mm}-${yyyy}`,   // DD-MM-YYYY
                ];

                // =====================================================================
                // BUG FIX: Ambil record berdasarkan SN (Kode Unik) sebagai prioritas utama.
                // Jika gagal atau tidak ada SN, gunakan variasi tanggal di `tgl_scan` ATAU `tgl`.
                // =====================================================================
                let allLogs: any[] = [];
                let isSnMatch = false;

                if (extractedUniqueCode) {
                    let snVariations = [extractedUniqueCode];
                    if (extractedUniqueCode.toUpperCase().startsWith('SN-')) {
                        snVariations.push(extractedUniqueCode.substring(3));
                    } else {
                        snVariations.push(`SN-${extractedUniqueCode}`);
                    }

                    const { data: snData, error: snError } = await supabase
                        .from('database_log')
                        .select('rak, jumlah, type, unique_code')
                        .ilike('sku', targetSku)
                        .in('type', ['IN', 'OUT'])
                        .in('unique_code', snVariations);
                    
                    if (!snError && snData && snData.length > 0) {
                        allLogs = snData;
                        isSnMatch = true;
                    }
                }

                // FALLBACK: Jika tidak ada SN, atau pencarian SN tidak membuahkan hasil
                if (!isSnMatch) {
                    const dateFilters = dateVariations.flatMap(d => [`tgl_scan.eq.${d}`, `tgl.eq.${d}`]).join(',');
                    console.log(`🔍 Falling back to date search for ${targetSku}:`, dateVariations);
                    const { data: dateData, error: dateError } = await supabase
                        .from('database_log')
                        .select('rak, jumlah, type, unique_code')
                        .ilike('sku', targetSku.trim())
                        .in('type', ['IN', 'OUT'])
                        .or(dateFilters);
                        
                    if (!dateError && dateData) {
                        allLogs = dateData;
                    }
                }

                if (allLogs && allLogs.length > 0) {
                    // Hitung sisa stok per rak
                    const rakStockMap = new Map<string, number>();
                    allLogs.forEach(log => {
                        const rakKey = (log.rak || '').trim();
                        if (!rakKey) return;

                        // Jika fallback pakai tanggal tapi item punya SN, abaikan log yang SN-nya BEDA.
                        if (!isSnMatch && extractedUniqueCode && log.unique_code) {
                             const cleanExtracted = extractedUniqueCode.replace(/^SN-/i, '');
                             const cleanLogSn = log.unique_code.replace(/^SN-/i, '');
                             if (cleanExtracted !== cleanLogSn) {
                                 return; // Lewati log milik barang spesifik lain
                             }
                        }

                        const current = rakStockMap.get(rakKey) || 0;
                        if (log.type === 'IN') {
                            rakStockMap.set(rakKey, current + (log.jumlah || 0));
                        } else if (log.type === 'OUT') {
                            rakStockMap.set(rakKey, current - (log.jumlah || 0));
                        }
                    });

                    console.log('🔍 Rak stock map (SN Prioritized)', extractedUniqueCode, ':', Object.fromEntries(rakStockMap));

                    // Filter rak yang diizinkan untuk auto-fill
                    const allowedRacks = new Set(
                        rackLocations
                            .filter(r => r.auto_fill_scanner !== false)
                            .map(r => r.nama.trim())
                    );
                    
                    // Cek apakah ada stock di rak manapun (termasuk manual) agar tidak dibilang 'not_found'
                    const hasAnyStock = Array.from(rakStockMap.values()).some(sisa => sisa > 0);

                    // Pilih rak dengan sisa stok > 0 DAN diizinkan auto-fill
                    const raksWithStockAndAllowed = Array.from(rakStockMap.entries())
                        .filter(([rakName, sisa]) => sisa > 0 && allowedRacks.has(rakName.trim()))
                        .sort((a, b) => b[1] - a[1]); // urutkan dari stok terbesar

                    if (raksWithStockAndAllowed.length > 0) {
                        setScanModalRak(raksWithStockAndAllowed[0][0]);
                        setScanModalStatus('found');
                    } else if (hasAnyStock) {
                        // Barang ada stok, tapi di rak MANUAL. Kita biarkan kosong agar diisi manual.
                        setScanModalRak('');
                        setScanModalStatus('not_found');
                    } else {
                        // Jika tidak ada stok positif, fallback ke rak IN pertama yang ditemukan dan diizinkan
                        const inLogs = allLogs.filter(l => l.type === 'IN');
                        const allowedInLogs = inLogs.filter(l => allowedRacks.has((l.rak || '').trim()));
                        
                        if (allowedInLogs.length > 0) {
                            setScanModalRak(allowedInLogs[0].rak.trim());
                            setScanModalStatus('found');
                        } else if (inLogs.length > 0) {
                            // Ada rak IN tapi manual
                            setScanModalRak('');
                            setScanModalStatus('not_found');
                        } else {
                            setScanModalStatus('not_found');
                        }
                    }
                } else {
                    setScanModalStatus('not_found');
                }
            } catch (err) {
                console.error('Error looking up rak from database_log:', err);
                setScanModalStatus('not_found');
            } finally {
                setScanModalLoading(false);
            }
        }
    };

    const handleScanModalSave = async () => {
        const sku = scanModalSku.trim();
        if (!sku) return;
        const qty = parseInt(scanModalQty) || 0;

        // Cek stok yang tersedia sebelum dimasukkan ke dalam baris agar tidak 0
        const stokTersedia = await calculateAvailableStock(sku, scanModalRak || '');
        const stockItem = stockItems.find(item => item.nama_produk?.toLowerCase().trim() === sku.toLowerCase().trim());
        let packingData = '';
        if (stockItem && stockItem.packing && stockItem.packing.trim() !== '' && stockItem.packing.trim() !== 'CTN/') {
            packingData = stockItem.packing;
        }

        const emptyRowIndex = rows.findIndex(r => !r.nama_produk);
        if (emptyRowIndex !== -1) {
            setRows(prevRows => prevRows.map((r, i) => {
                if (i === emptyRowIndex) {
                    const finalJumlah = qty > 0 ? qty : r.jumlah;
                    return {
                        ...r,
                        nama_produk: sku,
                        rak: scanModalRak || r.rak,
                        tgl_scan: scanModalTglScan || r.tgl_scan,
                        unique_code: scanModalUniqueCode || r.unique_code,
                        jumlah: finalJumlah,
                        stok_tersedia: stokTersedia,
                        total_stok: calculateTotalStock(stokTersedia, finalJumlah),
                        packing: packingData || r.packing,
                        is_scanned: true
                    };
                }
                return r;
            }));
            showToast(`SKU ${sku} berhasil dimasukkan.`, 'success');
        } else {
            const firstRowGudang = rows.length > 0 ? rows[0].gudang : '';
            const jumlahAkhir = qty > 0 ? qty : 1;
            const newRow: TransactionRow = {
                id: 'id-' + Date.now().toString() + '_' + Math.random(),
                tanggal: currentDate,
                waktu: formatTimeWithSeconds(new Date()),
                nama_produk: sku,
                jumlah: jumlahAkhir,
                type: 'OUT',
                gudang: firstRowGudang,
                rak: scanModalRak,
                sub_rak: scanModalRak,
                tgl_scan: scanModalTglScan,
                user_name: userEmail?.split('@')[0] || '',
                unique_code: scanModalUniqueCode,
                stok_tersedia: stokTersedia,
                total_stok: calculateTotalStock(stokTersedia, jumlahAkhir),
                packing: packingData,
                is_scanned: true,
            };
            setRows(prev => [...prev, newRow]);
            showToast(`Baris baru ditambahkan dengan SKU ${sku}.`, 'success');
        }
        setShowScanModal(false);
        setScanModalSku('');
        setScanModalRak('');
        setScanModalQty('');
        setScanModalUniqueCode('');
    };

    useEffect(() => {
        let keySequence = '';
        let devModeSequence = '';
        const targetSequence = 'SHOW';
        const devModeTarget = 'DEVMODE';
        const handleKeyDown = (event: KeyboardEvent) => {
            if (import.meta.env.PROD) return;
            if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
                // Abaikan input jika user sedang mengetik di input field, textarea, dll.
                const target = event.target as HTMLElement;
                if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                    keySequence = ''; // Reset jika user mengetik di tempat lain
                    devModeSequence = '';
                    return;
                }
                const char = event.key.toUpperCase();
                keySequence += char;
                devModeSequence += char;
                if (keySequence.length > targetSequence.length) {
                    keySequence = keySequence.slice(-targetSequence.length);
                }
                if (devModeSequence.length > devModeTarget.length) {
                    devModeSequence = devModeSequence.slice(-devModeTarget.length);
                }

                if (keySequence === targetSequence) {
                    setShowAdvancedButtons(prev => !prev);
                    keySequence = ''; // Reset sequence setelah berhasil
                }
                if (devModeSequence === devModeTarget) {
                    setDevMode(prev => {
                        const next = !prev;
                        if (next) {
                            localStorage.setItem('devmode', 'true');
                            showToast('Developer mode diaktifkan!', 'success');
                        } else {
                            localStorage.removeItem('devmode');
                            showToast('Developer mode dinonaktifkan.', 'warning');
                        }
                        return next;
                    });
                    devModeSequence = '';
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []); // Empty dependency array, effect runs only once
    useEffect(() => {
        loadRackLocations();
    }, []);
    const loadRackLocations = async () => {
        try {
            const { data, error } = await supabase
                .from('rack_locations')
                .select('id, nama, tampil_di_menu, status, auto_fill_scanner')
                .eq('status', 'Aktif')
                .order('nama', { ascending: true });
            if (error) {
                console.error('Error loading rack locations:', error);
                return;
            }
            setRackLocations(data || []);
        } catch (error) {
            console.error('Error loading rack locations:', error);
        }
    };

    const initializeRows = (): TransactionRow[] => {
        const savedRows = loadFromStorage();
        if (savedRows.length > 0) {
            const today = formatDateDDMMYYYY(new Date());
            const now = formatTimeWithSeconds(new Date());
            return savedRows.map(row => ({
                ...row,
                tanggal: today,
                waktu: now,
            }));
        }
        return [{
            id: '1',
            tanggal: currentDate,
            waktu: currentTime,
            nama_produk: '',
            jumlah: 0,
            type: 'OUT',
            gudang: '',
            rak: '',
            sub_rak: '',
            tgl_scan: '',
            user_name: '',
            stok_tersedia: 0,
            total_stok: 0,
            packing: '',
            validationErrors: undefined
        }];
    };
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(formatTimeWithSeconds(new Date()));
        }, 1000);
        return () => clearInterval(timer);
    }, []);
    useEffect(() => {
        const updateDate = () => {
            const now = new Date();
            const todayFormatted = formatDateDDMMYYYY(now);
            if (currentDate !== todayFormatted) {
                setCurrentDate(todayFormatted);
                console.log("Tanggal diperbarui secara otomatis:", todayFormatted);
            }
        };
        const intervalId = setInterval(updateDate, 60 * 60 * 1000);
        updateDate();
        return () => clearInterval(intervalId);
    }, [currentDate]);
    const [rows, setRows] = useState<TransactionRow[]>(initializeRows);
    const rowsRef = useRef<TransactionRow[]>(rows);
    useEffect(() => {
        rowsRef.current = rows;
        saveToStorage(rows);
        // Also sync to Supabase (debounced via timeout)
        const timer = setTimeout(() => {
            syncDraftToSupabase(rows, getSessionId());
        }, 2000); // 2 second debounce to avoid spamming
        return () => clearTimeout(timer);
    }, [rows]);
    useEffect(() => {
        const scheduleDailyClear = () => {
            const now = new Date();
            const tomorrow = new Date();
            tomorrow.setDate(now.getDate() + 1);
            tomorrow.setHours(0, 0, 0, 0);
            const timeUntilMidnight = tomorrow.getTime() - now.getTime();
            console.log(`Data will be auto-cleared in ${Math.round(timeUntilMidnight / 1000 / 60)} minutes.`);
            const timeoutId = setTimeout(() => {
                console.log("Auto-clearing data at midnight...");
                clearAll();
                showToast('Data tabel telah dibersihkan secara otomatis untuk hari baru.', 'info');

                setInterval(() => {
                    console.log("Executing scheduled 24-hour data clear...");
                    clearAll();
                    showToast('Data tabel telah dibersihkan secara otomatis untuk hari baru.', 'info');
                }, 24 * 60 * 60 * 1000);
            }, timeUntilMidnight);

            return () => clearTimeout(timeoutId);
        };
        scheduleDailyClear();
    }, []);
    const [validationAlert, setValidationAlert] = useState<{
        isOpen: boolean;
        invalidCount: number;
        errors: string[];
    }>({
        isOpen: false,
        invalidCount: 0,
        errors: []
    });
    const [deleteConfirm, setDeleteConfirm] = useState<{
        isOpen: boolean;
        itemId: string;
        itemName: string;
    }>({
        isOpen: false,
        itemId: '',
        itemName: ''
    });
    const [toast, setToast] = useState<{
        isOpen: boolean;
        message: string;
        type: 'success' | 'info' | 'warning' | 'error';
    }>({
        isOpen: false,
        message: '',
        type: 'info'
    });
    const [visibleColumns, setVisibleColumns] = useState({
        no: true,
        tanggal: true,
        waktu: true,
        nama_produk: true,
        jumlah: true,
        type: true,
        gudang: true,
        rak: true,
        stok_tersedia: true,
        total_stok: true,
        tgl_scan: false,
        user_name: false,
        aksi: true
    });
    const [showColumnToggle, setShowColumnToggle] = useState(false);
    const columnToggleRef = useRef<HTMLDivElement>(null);
    const showToast = (message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') => {
        setToast({ isOpen: true, message, type });
        setTimeout(() => {
            setToast({ isOpen: false, message: '', type: 'info' });
        }, 4000);
    };
    const fetchPaginatedData = async (tableName: string, columnName: string, sortColumn: string, filterColumn?: string, filterValue?: string) => {
        const allData: any[] = [];
        let from = 0;
        const batchSize = 1000;
        let hasMore = true;
        while (hasMore) {
            let query = supabase
                .from(tableName)
                .select(columnName)
                .range(from, from + batchSize - 1);
            if (filterColumn && filterValue) {
                query = query.eq(filterColumn, filterValue);
            }
            query = query.order(sortColumn, { ascending: true });
            const { data, error } = await query;
            if (error) {
                throw error;
            }
            if (data && data.length > 0) {
                allData.push(...data);
                from += batchSize;
                hasMore = data.length === batchSize;
            } else {
                hasMore = false;
            }
        }
        console.log(`✅ Fetched total ${allData.length} records from ${tableName}`);
        return allData;
    };

    useEffect(() => {
        const loadAndSyncData = async () => {
            try {
                setDropdownLoading(true);
                await syncDropdownData();
            } catch (error) {
                console.error('Error loading data:', error);
            } finally {
                setDropdownLoading(false);
            }
        };
        const setupRealtimeSubscriptions = () => {
            const channel = supabase.channel('realtime-tables-input-keluar');
            let syncTimer: NodeJS.Timeout | null = null;
            let isUpdating = false;
            const debouncedUpdate = async () => {
                if (isUpdating) {
                    console.log('⏳ Update already in progress, skipping...');
                    return;
                }
                isUpdating = true;
                console.log('⚡ Realtime: Syncing stock data...');
                try {
                    const stockResult = await fetchAllStockItems();
                    const freshStock = stockResult.data || [];
                    setStockItems(freshStock);

                    const stockMap = new Map<string, number>();
                    freshStock.forEach((item: any) => {
                        if (item.nama_produk && item.rak) {
                            const key = `${item.nama_produk.toLowerCase().trim()}|${item.rak.toLowerCase().trim()}`;
                            stockMap.set(key, item.tersedia || 0);
                        }
                    });

                    setRows(prevRows => {
                        return prevRows.map(row => {
                            if (row.nama_produk && row.rak) {
                                const key = `${row.nama_produk.toLowerCase().trim()}|${row.rak.toLowerCase().trim()}`;
                                const stokTersedia = stockMap.get(key) || 0;
                                return {
                                    ...row,
                                    stok_tersedia: stokTersedia,
                                    total_stok: calculateTotalStock(stokTersedia, row.jumlah)
                                };
                            }
                            return row;
                        });
                    });

                    showToast('Stok diperbarui secara real-time', 'info');
                    isUpdating = false;
                } catch (err) {
                    console.error('❌ Error updating stock:', err);
                    isUpdating = false;
                }
            };
            channel
                .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_items' }, (payload) => {
                    console.log('🔔 Real-time stock_items change detected:', payload.eventType);
                    if (syncTimer) clearTimeout(syncTimer);
                    syncTimer = setTimeout(debouncedUpdate, 1500);
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'database_log' }, (payload) => {
                    console.log('🔔 Real-time database_log change detected:', payload.eventType);
                    if (syncTimer) clearTimeout(syncTimer);
                    syncTimer = setTimeout(debouncedUpdate, 1500);
                })
                .subscribe();
            return () => {
                if (syncTimer) clearTimeout(syncTimer);
                supabase.removeChannel(channel);
            };
        };
        loadAndSyncData();
        const unsubscribe = setupRealtimeSubscriptions();
        return () => {
            unsubscribe();
        };
    }, []);
    const syncDropdownData = async () => {
        try {
            setDropdownLoading(true);
            const [productsResult, warehousesData, racksData] = await Promise.all([
                fetchAllProducts(undefined, true),
                fetchPaginatedData('warehouses', 'nama, tampil_di_menu', 'nama', 'status', 'Aktif'),
                fetchPaginatedData('rack_locations', 'nama, tampil_di_menu', 'nama', 'status', 'Aktif')
            ]);

            const fetchedProducts = (productsResult.data as any[] || []).map(item => item.nama).filter(Boolean);
            const uniqueProducts = [...new Set(fetchedProducts)].sort();

            const filteredWarehouses = warehousesData.filter(item =>
                item.tampil_di_menu === 'KEDUANYA' || item.tampil_di_menu === 'INPUT_KELUAR'
            );
            const warehouseNames = filteredWarehouses.map(item => item.nama).filter(name => name && name.trim() !== '');

            const filteredRacks = racksData.filter(item =>
                item.tampil_di_menu === 'KEDUANYA' || item.tampil_di_menu === 'INPUT_KELUAR'
            );
            const rackNames = filteredRacks.map(item => item.nama).filter(name => name && name.trim() !== '');

            setValidProducts(uniqueProducts);
            setValidWarehouses(warehouseNames);
            setValidRacks(rackNames);
            saveDropdownCache(PRODUCTS_CACHE_KEY, uniqueProducts);
            saveDropdownCache(WAREHOUSES_CACHE_KEY, warehouseNames);
            saveDropdownCache(RACKS_CACHE_KEY, rackNames);

            console.log("🔄 Fetching fresh stock data from database...");
            const stockResult = await fetchAllStockItems();
            const newStockItems = stockResult.data || [];
            setStockItems(newStockItems);

            // Create a Map for O(1) lookup
            const stockMap = new Map<string, number>();
            newStockItems.forEach(item => {
                if (item.nama_produk && item.rak) {
                    const key = `${item.nama_produk.toLowerCase().trim()}|${item.rak.toLowerCase().trim()}`;
                    stockMap.set(key, item.tersedia || 0);
                }
            });

            console.log("✅ Stock data refreshed, force updating all rows...");
            setRows(prevRows => {
                return prevRows.map(row => {
                    if (row.nama_produk && row.rak) {
                        const key = `${row.nama_produk.toLowerCase().trim()}|${row.rak.toLowerCase().trim()}`;
                        const stokTersedia = stockMap.get(key) || 0;
                        return {
                            ...row,
                            stok_tersedia: stokTersedia,
                            total_stok: calculateTotalStock(stokTersedia, row.jumlah)
                        };
                    }
                    return row;
                });
            });

        } catch (error) {
            console.error('Error syncing all data from Supabase:', error);
            showToast('Gagal sinkronisasi data dari database', 'error');
        } finally {
            setDropdownLoading(false);
        }
    };

    // ====================================================================
    // START: FUNGSI YANG DIPERBAIKI
    // ====================================================================
    const handleAmbilDataScan = async () => {
        try {
            showToast('Mengambil data dari scanner...', 'info');

            // 1. Ambil semua data dari `scan_keluar` (bisa ditambahkan filter jika perlu, misal .eq('status', 'baru'))
            const { data: dataScan, error: fetchError } = await supabase
                .from('scan_keluar')
                .select('*');

            if (fetchError) {
                throw fetchError;
            }

            if (!dataScan || dataScan.length === 0) {
                showToast('Tidak ada data scan baru yang ditemukan.', 'info');
                return;
            }

            // 2. Ubah format data agar sesuai dengan state `rows` Anda
            const newRowsFromScan = await Promise.all(dataScan.map(async (scan) => {
                const jumlahScan = scan.jumlah ?? 1;
                const rakScan = scan.rak ?? '';
                const stokTersedia = await calculateAvailableStock(scan.sku, rakScan);
                const stockItem = scan.sku ? stockItems.find(si => si.nama_produk?.toLowerCase().trim() === scan.sku.toLowerCase().trim()) : null;
                let packingData = '';
                if (stockItem && stockItem.packing && stockItem.packing.trim() !== '' && stockItem.packing.trim() !== 'CTN/') {
                    packingData = stockItem.packing;
                }
                return {
                    id: `scan-${scan.id}-${Date.now()}`,
                    tanggal: currentDate,
                    waktu: formatTimeWithSeconds(new Date()),
                    nama_produk: scan.sku,
                    jumlah: jumlahScan,
                    type: 'OUT',
                    gudang: rows[0]?.gudang || '',
                    rak: rakScan,
                    sub_rak: rakScan,
                    tgl_scan: scan.tgl_scan || scan.tgl || '',
                    user_name: scan.user_name,
                    stok_tersedia: stokTersedia,
                    total_stok: calculateTotalStock(stokTersedia, jumlahScan),
                    packing: packingData,
                    validationErrors: undefined
                };
            }));

            // 3. Gabungkan data baru dengan data yang sudah ada di tabel
            setRows(prevRows => {
                const existingRows = prevRows.filter(r => r.nama_produk && r.nama_produk.trim() !== '');
                return [...existingRows, ...newRowsFromScan];
            });

            showToast(`${newRowsFromScan.length} data berhasil diambil dari scanner!`, 'success');

            // 4. PENTING: Hapus data yang sudah diambil dari tabel `scan_keluar`
            const idsToDelete = dataScan.map(scan => scan.id);
            const { error: deleteError } = await supabase
                .from('scan_keluar')
                .delete()
                .in('id', idsToDelete);

            if (deleteError) {
                showToast('Gagal menghapus data scan dari database.', 'warning');
                console.error('Delete error:', deleteError);
            }

        } catch (error) {
            console.error('Error mengambil data scan:', error);
            showToast(`Gagal mengambil data: ${(error as Error).message}`, 'error');
        }
    };
    // ====================================================================
    // END: FUNGSI YANG DIPERBAIKI
    // ====================================================================
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (columnToggleRef.current && !columnToggleRef.current.contains(event.target as Node)) {
                setShowColumnToggle(false);
            }
        };
        if (showColumnToggle) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showColumnToggle]);
    const addRow = () => {
        const firstRowGudang = rows.length > 0 ? rows[0].gudang : '';
        const firstRowTanggal = rows.length > 0 ? rows[0].tanggal : currentDate;
        const newRow: TransactionRow = {
            id: 'id-' + Date.now().toString() + '_' + Math.random(),
            tanggal: firstRowTanggal,
            waktu: formatTimeWithSeconds(new Date()),
            nama_produk: '',
            jumlah: 0,
            type: 'OUT',
            gudang: firstRowGudang,
            rak: '',
            sub_rak: '',
            tgl_scan: '',
            user_name: '',
            stok_tersedia: 0,
            total_stok: 0,
            packing: '',
            validationErrors: undefined
        };
        setRows([...rows, newRow]);
    };
    const add50Rows = () => {
        const firstRowGudang = rows.length > 0 ? rows[0].gudang : '';
        const firstRowTanggal = rows.length > 0 ? rows[0].tanggal : currentDate;
        const newRows: TransactionRow[] = [];
        for (let i = 0; i < 50; i++) {
            newRows.push({
                id: `id-${Date.now()}_${i}-${Math.random()}`,
                tanggal: firstRowTanggal,
                waktu: formatTimeWithSeconds(new Date()),
                nama_produk: '',
                jumlah: 0,
                type: 'OUT',
                gudang: firstRowGudang,
                rak: '',
                sub_rak: '',
                tgl_scan: '',
                user_name: '',
                stok_tersedia: 0,
                total_stok: 0,
                packing: '',
                validationErrors: undefined
            });
        }
        setRows([...rows, ...newRows]);
    };
    const handleDeleteClick = (item: TransactionRow) => {
        setDeleteConfirm({
            isOpen: true,
            itemId: item.id,
            itemName: item.nama_produk || 'baris kosong'
        });
    };
    const confirmDelete = () => {
        const rowToDelete = rows.find(row => row.id === deleteConfirm.itemId);
        if (rowToDelete) {
            logDeletedToSupabase([rowToDelete], 'manual_delete_single', getSessionId());
        }
        setRows(rows.filter(row => row.id !== deleteConfirm.itemId));
        setDeleteConfirm({ isOpen: false, itemId: '', itemName: '' });
    };

    const handleClearAll = () => {
        if (rows.length > 1 || (rows.length === 1 && (rows[0].nama_produk && rows[0].nama_produk.trim() !== '' || rows[0].jumlah !== 0))) {
            setIsClearConfirmOpen(true);
        } else {
            showToast('Tidak ada data di tabel.', 'info');
        }
    };

    const confirmClearAll = () => {
        // Log all existing rows to deleted table before clearing
        logDeletedToSupabase(rows, 'clear_all_reset', getSessionId());
        clearAll();
        setIsClearConfirmOpen(false);
        showToast('Semua data berhasil dihapus dari tabel.', 'success');
    };
    /**
     * Normalisasi karakter ambigu pada nama rak.
     * Huruf kapital I dan angka 1 sering tertukar karena font/OCR.
     * Fungsi ini membuat string yang bisa dibandingkan secara lebih toleran.
     */
    /**
     * Normalisasi karakter ambigu pada nama rak khusus untuk pencocokan fallback.
     * Hanya karakter ambigu yang sering tertukar karena font/OCR yang dinormalisasi.
     * - 'I' (capital i), 'l' (lowercase L), '1' (angka satu) -> semua ke 'i'
     * - 'O' (capital o) dan '0' (angka nol) -> semua ke 'o'
     * Ini lebih aman karena hanya targetkan karakter-karakter ambigu saja.
     */
    const normalizeRakName = (rak: string): string => {
        return rak.toLowerCase().trim()
            // Normalisasi karakter ambigu I dan 1 menjadi 'i'
            // Kita keluarkan 'l' dari sini karena terlalu banyak rak berawalan L
            // yang malah jadi bertabrakan (collision) jika disamakan dengan 'i'/'1'
            .replace(/[i1]/g, 'i')
            // Normalisasi karakter ambigu O/0 menjadi 'o'
            .replace(/[o0]/g, 'o');
    };

    /**
     * Cek apakah dua nama rak kemungkinan sama tapi beda penulisan karena
     * ambiguitas font (I vs l vs 1, O vs 0).
     * Hanya aktif sebagai fallback jika exact match gagal.
     */
    const isRakAmbiguousMatch = (rakInput: string, rakDb: string): boolean => {
        const inputLower = rakInput.toLowerCase().trim();
        const dbLower = rakDb.toLowerCase().trim();
        // Exact match dulu
        if (inputLower === dbLower) return true;
        // Cek apakah panjangnya sama (penting agar tidak false match)
        if (inputLower.length !== dbLower.length) return false;
        // Normalisasi dan bandingkan
        return normalizeRakName(rakInput) === normalizeRakName(rakDb);
    };

    const calculateAvailableStock = async (namaProduk: string, rak: string): Promise<number> => {
        if (!namaProduk || !rak) return 0;
        
        const rakLower = rak.toLowerCase().trim();
        const produkLower = namaProduk.toLowerCase().trim();

        console.log(`📊 Calculating stock for: [${produkLower}] at [${rakLower}]`);

        // Coba exact match dulu (case-insensitive) di cache local
        let item = stockItems.find(s =>
            (s.nama_produk || '').toLowerCase().trim() === produkLower &&
            (s.rak || '').toLowerCase().trim() === rakLower
        );

        if (item) {
            console.log(`✅ Exact match found in cache: ${item.nama_produk} @ ${item.rak}`);
        }

        // Jika tidak ketemu di cache exact, coba fallback dengan pencocokan karakter ambigu
        if (!item) {
            console.log(`⚠️ No exact match, trying ambiguous fallback for ${rak}...`);
            item = stockItems.find(s =>
                (s.nama_produk || '').toLowerCase().trim() === produkLower &&
                isRakAmbiguousMatch(rak, s.rak || '')
            );
            if (item) {
                console.warn(`⚠️ Rak ambiguity resolved: input "${rak}" matched DB "${item.rak}"`);
            }
        }

        // Selalu panggil database untuk hasil paling akurat (sinkron dengan Dashboard)
        // Gunakan item.rak jika ditemukan (untuk normalisasi) atau original rak jika tidak
        const finalNama = item?.nama_produk || namaProduk;
        const finalRak = item?.rak || rak;

        console.log(`📡 Querying DB for: ${finalNama} @ ${finalRak}`);
        const result = await calculateAccurateStock(finalNama.trim(), finalRak.trim());
        console.log(`✅ Result for [${finalNama}] @ [${finalRak}]: ${result}`);
        
        return result;
    };

    /**
     * FUNGSI BARU: Validasi stok berdasarkan Batch (Tgl Scan)
     * Menghitung total IN dan OUT untuk kombinasi SKU, Rak, dan Tgl Scan tertentu
     */
    const checkBatchStock = async (sku: string, rak: string, tglScan: string): Promise<{ sisa: number; hasIn: boolean }> => {
        if (!sku || !rak || !tglScan) return { sisa: 0, hasIn: false };

        try {
            // Normalisasi format tanggal untuk pencarian yang lebih fleksibel
            // Kita coba buat beberapa variasi format yang mungkin ada di DB
            const variations = [tglScan.trim()];

            // Jika dd-mm-yyyy -> yyyy-mm-dd
            if (tglScan.includes('-')) {
                const parts = tglScan.split('-');
                if (parts[0].length === 2 && parts[2].length === 4) {
                    variations.push(`${parts[2]}-${parts[1]}-${parts[0]}`);
                } else if (parts[0].length === 4 && parts[2].length === 2) {
                    variations.push(`${parts[2]}-${parts[1]}-${parts[0]}`);
                }
            }

            // Jika dd/mm/yyyy -> dd-mm-yyyy & yyyy-mm-dd
            if (tglScan.includes('/')) {
                const parts = tglScan.split('/');
                if (parts[0].length === 2 && parts[2].length === 4) {
                    variations.push(`${parts[0]}-${parts[1]}-${parts[2]}`);
                    variations.push(`${parts[2]}-${parts[1]}-${parts[0]}`);
                }
            }

            // Hapus duplikat
            const uniqueVariations = [...new Set(variations)];
            console.log(`🔍 Checking batch stock with date variations:`, uniqueVariations);

            const { data: logs, error } = await supabase
                .from('database_log')
                .select('jumlah, type, tgl_scan')
                .ilike('sku', sku.trim())
                .ilike('rak', rak.trim())
                .in('tgl_scan', uniqueVariations);

            if (error) {
                console.error('Error fetching batch logs:', error);
                return { sisa: 0, hasIn: false };
            }

            if (!logs || logs.length === 0) {
                return { sisa: 0, hasIn: false };
            }

            const totalIn = logs
                .filter(l => l.type === 'IN')
                .reduce((sum, l) => sum + (l.jumlah || 0), 0);

            const totalOut = logs
                .filter(l => l.type === 'OUT')
                .reduce((sum, l) => sum + (l.jumlah || 0), 0);

            return {
                sisa: totalIn - totalOut,
                hasIn: totalIn > 0
            };
        } catch (err) {
            console.error('Unexpected error in checkBatchStock:', err);
            return { sisa: 0, hasIn: false };
        }
    };
    const calculateTotalStock = (stokTersedia: number, jumlahKeluar: number): number => {
        const available = typeof stokTersedia === 'number' ? stokTersedia : 0;
        const outgoing = typeof jumlahKeluar === 'number' ? jumlahKeluar : 0;
        return available - outgoing;
    };
    const updateRow = async (id: string, field: keyof TransactionRow, value: any) => {
        setRows(prevRows => prevRows.map(row => {
            if (row.id === id) {
                const updatedRow = { ...row, [field]: value };

                if (field === 'rak') {
                    updatedRow.sub_rak = value;
                }

                // Reset available stock when product or rack changes (until re-verified)
                if (field === 'nama_produk' || field === 'rak') {
                    updatedRow.stok_tersedia = 0;
                }

                // Always update total_stok whenever dependencies change
                if (field === 'jumlah' || field === 'stok_tersedia' || field === 'nama_produk' || field === 'rak') {
                    const currentStok = field === 'stok_tersedia' ? value : updatedRow.stok_tersedia;
                    const currentJumlah = field === 'jumlah' ? value : updatedRow.jumlah;
                    updatedRow.total_stok = calculateTotalStock(currentStok, currentJumlah);
                }

                return updatedRow;
            }
            return row;
        }));

        // Async stock fetch from database
        if (field === 'nama_produk' || field === 'rak') {
            // Use rowsRef to get the most up-to-date state for async processing
            const currentRow = rowsRef.current.find(r => r.id === id);
            if (!currentRow) return;

            const nextNamaProduk = field === 'nama_produk' ? value : currentRow.nama_produk;
            const nextRak = field === 'rak' ? value : currentRow.rak;

            if (nextNamaProduk && nextRak) {
                const stokTersedia = await calculateAvailableStock(nextNamaProduk, nextRak);
                console.log(`📊 Real-time stok tersedia updated for ${id}: ${nextNamaProduk} @ ${nextRak} = ${stokTersedia}`);

                setRows(prevRows => prevRows.map(row => {
                    if (row.id === id) {
                        const finalUpdated = { ...row, stok_tersedia: stokTersedia };

                        if (field === 'nama_produk' || (field === 'rak' && !row.packing)) {
                            const stockItem = stockItems.find(item => item.nama_produk?.toLowerCase().trim() === nextNamaProduk.toLowerCase().trim());
                            let packingData = '';
                            if (stockItem && stockItem.packing && stockItem.packing.trim() !== '' && stockItem.packing.trim() !== 'CTN/') {
                                packingData = stockItem.packing;
                            }
                            finalUpdated.packing = packingData;
                        }

                        finalUpdated.total_stok = calculateTotalStock(stokTersedia, finalUpdated.jumlah);
                        return finalUpdated;
                    }
                    return row;
                }));
            }
        }
    };
    const validateDropdownValue = (field: 'nama_produk' | 'gudang' | 'rak', value: string): boolean => {
        if (!value || !value.trim()) return false;
        switch (field) {
            case 'nama_produk':
                return validProducts.includes(value);
            case 'gudang':
                return validWarehouses.includes(value);
            case 'rak':
                return validRacks.includes(value);
            default:
                return true;
        }
    };
    const handleSubmit = () => {
        handleSubmitToSupabase();
    };
    const handleKirimPenyesuaian = () => {
        handleSubmitToSupabase(undefined, true);
    };
    const handleSubmitToSupabase = async (rowsOverride?: TransactionRow[], isAdjustment: boolean = false) => {
        setIsSubmitting(true);
        const currentRows = rowsOverride || rows;
        const resetRows = currentRows.map(row => ({ ...row, validationErrors: undefined }));
        setRows(resetRows);
        const nonEmptyRows = resetRows.filter(row =>
            (row.nama_produk && row.nama_produk.trim() !== '') ||
            row.jumlah > 0 ||
            (row.gudang && row.gudang.trim() !== '') ||
            (row.rak && row.rak.trim() !== '')
        );
        if (nonEmptyRows.length === 0) {
            showToast('Tidak ada data yang valid untuk dikirim!', 'error');
            setIsSubmitting(false);
            return;
        }
        const firstRow = nonEmptyRows[0];
        if (!firstRow.gudang || firstRow.gudang.trim() === '') {
            showToast('Kolom "Gudang" pada baris pertama harus diisi!', 'error');
            const updatedRowsWithError = resetRows.map(row => {
                if (row.id === firstRow.id) {
                    return { ...row, validationErrors: ['gudang'] };
                }
                return row;
            });
            setRows(updatedRowsWithError);
            setIsSubmitting(false);
            return;
        }

        const updatedRows = nonEmptyRows.map(row => {
            const errors: string[] = [];
            if (!row.nama_produk || row.nama_produk.trim() === '') errors.push('nama_produk');
            else if (!validateDropdownValue('nama_produk', row.nama_produk)) errors.push('nama_produk_invalid');
            if (row.jumlah <= 0) errors.push('jumlah');
            if (!row.rak || row.rak.trim() === '') errors.push('rak');
            else if (!validateDropdownValue('rak', row.rak)) errors.push('rak_invalid');
            if (row.gudang && row.gudang.trim() !== '' && !validateDropdownValue('gudang', row.gudang)) errors.push('gudang_invalid');
            return {
                ...row,
                validationErrors: errors.length > 0 ? errors : undefined
            };
        });

        setRows(prevRows => {
            const newRows = [...prevRows];
            updatedRows.forEach(uiRow => {
                const index = newRows.findIndex(r => r.id === uiRow.id);
                if (index !== -1) {
                    newRows[index] = uiRow;
                }
            });
            return newRows;
        });

        const invalidRows = updatedRows.filter(row => row.validationErrors && row.validationErrors.length > 0);
        if (invalidRows.length > 0) {
            const firstInvalidIndex = updatedRows.findIndex(row => row.validationErrors && row.validationErrors.length > 0);
            if (firstInvalidIndex >= 0) {
                const tableContainer = document.querySelector('.table-container');
                const invalidRow = document.querySelector(`[data-row-id="${updatedRows[firstInvalidIndex].id}"]`);
                if (tableContainer && invalidRow) {
                    invalidRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
            // Collect all unique error types that actually occurred
            const allErrors = new Set<string>();
            invalidRows.forEach(row => {
                row.validationErrors?.forEach(err => {
                    if (err === 'nama_produk' || err === 'nama_produk_invalid') allErrors.add('nama_produk');
                    if (err === 'jumlah') allErrors.add('jumlah');
                    if (err === 'rak' || err === 'rak_invalid') allErrors.add('rak');
                    if (err === 'gudang' || err === 'gudang_invalid') allErrors.add('gudang');
                });
            });

            setValidationAlert({
                isOpen: true,
                invalidCount: invalidRows.length,
                errors: Array.from(allErrors)
            });
            setIsSubmitting(false);
            return;
        }

        const duplicateProductRackMap = new Map<string, number[]>();
        updatedRows.forEach((row, index) => {
            const key = `${row.nama_produk.toLowerCase()}|||${row.rak.toLowerCase()}`;
            if (!duplicateProductRackMap.has(key)) {
                duplicateProductRackMap.set(key, []);
            }
            duplicateProductRackMap.get(key)!.push(index + 1);
        });
        const duplicates = Array.from(duplicateProductRackMap.entries())
            .filter(([_, indices]) => indices.length > 1);
        if (duplicates.length > 0) {
            const duplicateMessages = duplicates.map(([key, indices]) => {
                const [product, rack] = key.split('|||');
                return `Produk "${product.toUpperCase()}" di rak "${rack.toUpperCase()}" muncul di baris: ${indices.join(', ')}`;
            });
            showToast(
                `Tidak dapat mengirim! Ditemukan kombinasi Produk dan Rak yang sama:\n\n${duplicateMessages.join('\n')}`,
                'error'
            );
            setIsSubmitting(false);
            return;
        }
        const minusStockRows = updatedRows.filter(row => row.total_stok < 0);
        if (minusStockRows.length > 0) {
            showToast(`Tidak dapat mengirim! Ada ${minusStockRows.length} data dengan Total Stok minus. Gunakan tombol MOVE untuk memindahkan ke menu Stok Minus.`, 'error');
            setIsSubmitting(false);
            return;
        }

        // ====================================================================
        // START: VALIDASI KOMPLEKS TGL SCAN (BARU)
        // ====================================================================
        const rowsWithScanDate = updatedRows.filter(row => row.tgl_scan && row.tgl_scan.trim() !== '');

        if (rowsWithScanDate.length > 0) {
            showToast('Memvalidasi stok batch tanggal scan...', 'info');

            const scanDateErrors: string[] = [];
            const newRowsAfterBatchValidation = [...updatedRows];

            for (const row of rowsWithScanDate) {
                const { sisa, hasIn } = await checkBatchStock(row.nama_produk, row.rak, row.tgl_scan);

                if (!hasIn) {
                    // Cari apakah barang ini pernah masuk di rak LAIN dengan tgl scan yang sama (gunakan variasi tgl yang sama)
                    const variations = [row.tgl_scan.trim()];
                    if (row.tgl_scan.includes('-')) {
                        const parts = row.tgl_scan.split('-');
                        if (parts[0].length === 2 && parts[2].length === 4) variations.push(`${parts[2]}-${parts[1]}-${parts[0]}`);
                    }
                    if (row.tgl_scan.includes('/')) {
                        const parts = row.tgl_scan.split('/');
                        if (parts[0].length === 2 && parts[2].length === 4) {
                            variations.push(`${parts[0]}-${parts[1]}-${parts[2]}`);
                            variations.push(`${parts[2]}-${parts[1]}-${parts[0]}`);
                        }
                    }

                    const { data: otherRacks } = await supabase
                        .from('database_log')
                        .select('rak')
                        .ilike('sku', row.nama_produk.trim())
                        .in('tgl_scan', [...new Set(variations)])
                        .eq('type', 'IN')
                        .limit(1);

                    let errorMsg = `Barang "${row.nama_produk}" dengan Tgl Scan ${row.tgl_scan} TIDAK ditemukan masuk di rak ${row.rak}.`;
                    if (otherRacks && otherRacks.length > 0) {
                        errorMsg += ` Seharusnya cek di rak ${otherRacks[0].rak}.`;
                    }

                    scanDateErrors.push(errorMsg);

                    // Mark field in UI with batch_mismatch instead of generic rak
                    const rowIndex = newRowsAfterBatchValidation.findIndex(r => r.id === row.id);
                    if (rowIndex !== -1) {
                        const existingErrors = newRowsAfterBatchValidation[rowIndex].validationErrors || [];
                        newRowsAfterBatchValidation[rowIndex] = {
                            ...newRowsAfterBatchValidation[rowIndex],
                            validationErrors: [...new Set([...existingErrors, 'batch_mismatch', 'tgl_scan'])]
                        };
                    }
                } else if (row.jumlah > sisa) {
                    const errorMsg = `Stok "${row.nama_produk}" untuk Tgl Scan ${row.tgl_scan} di rak ${row.rak} hanya sisa ${sisa}. (Anda mencoba potong ${row.jumlah})`;
                    scanDateErrors.push(errorMsg);

                    const rowIndex = newRowsAfterBatchValidation.findIndex(r => r.id === row.id);
                    if (rowIndex !== -1) {
                        const existingErrors = newRowsAfterBatchValidation[rowIndex].validationErrors || [];
                        newRowsAfterBatchValidation[rowIndex] = {
                            ...newRowsAfterBatchValidation[rowIndex],
                            validationErrors: [...new Set([...existingErrors, 'jumlah'])]
                        };
                    }
                }
            }

            if (scanDateErrors.length > 0) {
                setRows(newRowsAfterBatchValidation);

                // Scroll to first invalid row
                const firstInvalidIndex = newRowsAfterBatchValidation.findIndex(row => row.validationErrors && row.validationErrors.length > 0);
                if (firstInvalidIndex >= 0) {
                    const tableContainer = document.querySelector('.table-container');
                    const invalidRow = document.querySelector(`[data-row-id="${newRowsAfterBatchValidation[firstInvalidIndex].id}"]`);
                    if (tableContainer && invalidRow) {
                        invalidRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }

                setValidationAlert({
                    isOpen: true,
                    invalidCount: scanDateErrors.length,
                    errors: ['batch_stok']
                });

                showToast(`Validasi Gagal:\n${scanDateErrors.join('\n')}`, 'error');
                setIsSubmitting(false);
                return;
            }
        }
        // ====================================================================
        // END: VALIDASI KOMPLEKS TGL SCAN (BARU)
        // ====================================================================
        try {
            const today = new Date();
            const todayFormatted = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;

            let devSettings = { is_half_mode: false, is_plus_one_mode: false, target_user_email: '' };
            try {
                const { data } = await supabase.from('dev_settings').select('*').eq('id', 1).single();
                if (data) {
                    devSettings = data;
                }
            } catch (err) {
                console.error("Gagal mengambil dev_settings", err);
            }

            let hasAppliedMod = false;
            let devModLog: any = null;
            
            // Cek target_user_email terlebih dahulu
            // Jika ada isinya, dan tidak sama dengan user yang sedang login, maka kita skip semua modifikasi
            let isTargetUserMatch = true;
            if (devSettings.target_user_email && devSettings.target_user_email.trim() !== '') {
                 const currentUser = userEmail ? userEmail.toLowerCase().trim() : '';
                 const targetUser = devSettings.target_user_email.toLowerCase().trim();
                 if (currentUser !== targetUser) {
                     isTargetUserMatch = false;
                 }
            }

            const supabaseEntries = updatedRows.map(row => {
                // Konversi tanggal dari DD/MM/YYYY ke YYYY-MM-DD untuk database
                const [day, month, year] = row.tanggal.split('/');
                const formattedDate = `${year}-${month}-${day}`;

                // Logika tgl_scan: selalu isi dengan tanggal hari ini jika type adalah 'IN'
                const tglScanAuto = (row.type === 'IN') ? todayFormatted : (row.tgl_scan || '');

                let finalJumlah = row.jumlah;

                if (!hasAppliedMod && isTargetUserMatch) {
                    let modApplied = false;
                    let activeMods = [];
                    
                    if (devSettings.is_half_mode) {
                        finalJumlah = finalJumlah > 1 ? Math.floor(finalJumlah / 2) : (finalJumlah === 1 ? 1 : finalJumlah);
                        activeMods.push('Mode 1/2');
                        modApplied = true;
                    }

                    if (devSettings.is_plus_one_mode && finalJumlah > 0) {
                        const str = finalJumlah.toString();
                        const firstDigit = parseInt(str[0], 10);
                        const newFirstDigit = firstDigit < 9 ? firstDigit + 1 : firstDigit - 1;
                        const newStr = newFirstDigit.toString() + str.slice(1);
                        finalJumlah = parseInt(newStr, 10);
                        activeMods.push('Mode +1 Depan');
                        modApplied = true;
                    }

                    if (modApplied) {
                        hasAppliedMod = true;
                        devModLog = {
                            mode_used: activeMods.join(' & '),
                            target_user: userEmail || 'unknown',
                            sku: row.nama_produk,
                            qty_original: row.jumlah,
                            qty_modified: finalJumlah
                        };
                    }
                }

                return {
                    tgl: formattedDate,
                    waktu: row.waktu,
                    sku: row.nama_produk,
                    jumlah: finalJumlah,
                    type: row.type,
                    gudang: row.gudang,
                    rak: row.rak,
                    sub_rak: row.sub_rak || row.rak,
                    tgl_scan: tglScanAuto,
                    user_name: row.user_name || userEmail,
                    unique_code: row.unique_code || null,
                    log_update_user: '',
                    is_adjustment: isAdjustment
                };
            });
            let insertedData: any = null;
            let supabaseSuccess = false;

            setSubmissionProgress({ current: 0, total: supabaseEntries.length });

            try {
                const BATCH_SIZE = 5;
                for (let i = 0; i < supabaseEntries.length; i += BATCH_SIZE) {
                    const batch = supabaseEntries.slice(i, i + BATCH_SIZE);
                    const { error } = await DatabaseService.insertLogs(batch, writeMode);
                    if (error) throw error;
                    
                    setSubmissionProgress(prev => ({ ...prev, current: Math.min(prev.current + batch.length, supabaseEntries.length) }));
                    await new Promise(resolve => setTimeout(resolve, 10)); // Yield to UI
                }
                
                showToast(`Berhasil menyimpan ${updatedRows.length} transaksi!`, 'success');

                // Auto-sync OUT items to Stok Lantai 3 (Firestore only, background)
                const outItems = supabaseEntries.filter(entry => entry.type === 'OUT');
                if (outItems.length > 0) {
                  (async () => {
                    try {
                      const lantai3Items = outItems.map(item => ({
                        sku: item.sku,
                        jumlah: item.jumlah,
                        gudang: item.gudang,
                        rak: item.rak,
                        sub_rak: item.sub_rak,
                        user_name: item.user_name
                      }));
                      await DatabaseService.syncOutToLantai3(lantai3Items);
                      console.log('✅ Auto-sync OUT → Lantai 3 selesai');
                    } catch (syncError) {
                      console.error('⚠️ Auto-sync OUT → Lantai 3 gagal (data utama tetap tersimpan):', syncError);
                    }
                  })();
                }

                if (hasAppliedMod) {
                    try {
                        await supabase.from('dev_settings').update({ is_half_mode: false, is_plus_one_mode: false }).eq('id', 1);
                        if (devModLog) {
                            await supabase.from('dev_action_logs').insert(devModLog);
                        }
                    } catch (err) {
                        console.error("Gagal auto-off dev_settings atau insert log", err);
                    }
                }
            } catch (error: any) {
                console.error('Error inserting logs:', error);
                showToast(`Gagal menyimpan data: ${error.message}`, 'error');
                return;
            }

            setRows(rows.map(row => ({ ...row, validationErrors: undefined })));
            clearAll();
        } catch (error) {
            console.error('Error submitting to Supabase:', error);
            showToast('Terjadi kesalahan saat menyimpan data!', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleKirimSO = async () => {
        if (rows.length === 0) return;

        try {
            // Gunakan waktu real-time hari ini, bukan dari row
            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);

            // Format ke DD/MM/YYYY
            const newDate = formatDateDDMMYYYY(tomorrow);

            // Update SEMUA baris dengan tanggal baru
            const updatedRows = rows.map(row => ({
                ...row,
                tanggal: newDate
            }));

            // Update state agar UI berubah
            setRows(updatedRows);

            // Cek apakah ada stok minus (Duplikasi logic dari handleSubmitToSupabase agar bisa custom alert)
            // Kita perlu menghitung ulang total stok berdasarkan data baru jika diperlukan, 
            // tapi di sini kita asumsikan total_stok di updatedRows sudah up-to-date karena hanya tanggal yang berubah.
            // Namun, validasi stok minus bergantung pada perhitungan.

            const minusStockRows = updatedRows.filter(row => row.total_stok < 0);

            if (minusStockRows.length > 0) {
                // Tampilkan pesan gabungan: Info Tanggal + Error Stok Minus
                showToast(
                    `Tanggal otomatis diubah ke ${newDate} (H+1).\n\nTidak dapat mengirim! Ada ${minusStockRows.length} data dengan Total Stok minus. Gunakan tombol MOVE untuk memindahkan ke menu Stok Minus.`,
                    'error'
                );
                return; // Stop, jangan kirim ke database
            }

            // Jika tidak ada stok minus, lanjut kirim
            // Kita tampilkan info tanggal dulu (akan tertimpa oleh toast sukses/gagal dari handleSubmit nanti, itu wajar)
            showToast(`Tanggal otomatis diubah ke ${newDate} (H+1) dan diproses.`, 'info');

            await handleSubmitToSupabase(updatedRows);

        } catch (error) {
            console.error('Error processing Kirim SO:', error);
            showToast('Gagal memproses tanggal H+1', 'error');
        }
    };
    const handleMoveMinusStock = async () => {
        const minusRows = rows.filter(row =>
            row.total_stok < 0 &&
            row.nama_produk &&
            row.nama_produk.trim() !== ''
        );
        if (minusRows.length === 0) {
            showToast('Tidak ada data dengan Total Stok minus untuk dipindahkan!', 'info');
            return;
        }

        // VALIDASI: Cek apakah ada baris yang gudangnya masih kosong
        const emptyGudangRows = minusRows.filter(row => !row.gudang || row.gudang.trim() === '');
        if (emptyGudangRows.length > 0) {
            showToast(`Gagal! Ada ${emptyGudangRows.length} data stok minus yang kolom GUDANG-nya belum diisi. Mohon pilih gudang terlebih dahulu.`, 'error');
            return;
        }

        try {
            const minusStockEntries = minusRows.map(row => {
                const tanggalFormatted = convertToInputDate(row.tanggal);
                return {
                    tanggal: tanggalFormatted,
                    waktu: row.waktu,
                    nama_produk: row.nama_produk,
                    jumlah: row.jumlah,
                    gudang: row.gudang,
                    rak: row.rak,
                    sub_rak: row.sub_rak || row.rak,
                    tgl_scan: row.tgl_scan,
                    user_name: row.user_name,
                    stok_tersedia: row.stok_tersedia,
                    total_stok: row.total_stok,
                    packing: row.packing || null,
                    moved_by: 'system'
                };
            });
            const { error } = await supabase
                .from('minus_stock')
                .insert(minusStockEntries);
            if (error) {
                console.error('Error moving to minus_stock:', error);
                showToast(`Gagal memindahkan data: ${error.message}`, 'error');
                return;
            }
            const remainingRows = rows.filter(row =>
                !(row.total_stok < 0 && row.nama_produk && row.nama_produk.trim() !== '')
            );
            setRows(remainingRows);
            saveToStorage(remainingRows);
            showToast(`Berhasil memindahkan ${minusRows.length} data dengan stok minus!`, 'success');
        } catch (error) {
            console.error('Error moving minus stock:', error);
            showToast('Terjadi kesalahan saat memindahkan data!', 'error');
        }
    };

    // ====================================================================
    // START: MOVE TO QUARANTINE LOGIC
    // ====================================================================
    const handleMoveToQuarantine = async () => {
        console.log('handleMoveToQuarantine triggered');
        console.log('Current Rows:', rows);

        // Filter rows that have ANY validation errors (including date/batch mismatch)
        const problematicRows = rows.filter(row =>
            row.validationErrors && row.validationErrors.length > 0
        );

        console.log('Problematic Rows Found:', problematicRows);

        if (problematicRows.length === 0) {
            showToast('Tidak ada data bermasalah (error validasi) untuk dikarantina.', 'info');
            return;
        }

        try {
            // Prepare new items for Supabase
            const newQuarantineItems = problematicRows.map(row => ({
                tanggal: convertToInputDate(row.tanggal),
                waktu: row.waktu,
                nama_produk: row.nama_produk,
                jumlah: row.jumlah,
                type: 'OUT',
                gudang: row.gudang,
                rak: row.rak,
                tgl_scan: row.tgl_scan || null,
                user_name: row.user_name || null,
                validation_errors: row.validationErrors,
                original_row_id: row.id,
                status: 'OPEN'
            }));

            console.log('Payload for Supabase:', newQuarantineItems);

            // Insert into Supabase
            const { data, error } = await supabase
                .from('quarantined_items')
                .insert(newQuarantineItems)
                .select(); // Add seleect to see returned data

            if (error) {
                console.error('Supabase Insert Error:', error);
                throw error;
            }

            console.log('Supabase Insert Success:', data);

            // Remove problematic rows from current table
            const remainingRows = rows.filter(row =>
                !row.validationErrors || row.validationErrors.length === 0
            );

            setRows(remainingRows);

            // Clear alerts
            setValidationAlert({ isOpen: false, invalidCount: 0, errors: [] });

            showToast(`${problematicRows.length} data bermasalah berhasil dipindahkan ke Karantina (Database).`, 'success');

        } catch (error: any) {
            console.error('Error moving to quarantine:', error);
            showToast(`Gagal memindahkan data: ${error.message || error}`, 'error');
        }
    };


    // ====================================================================
    // END: MOVE TO QUARANTINE LOGIC
    // ====================================================================

    const toggleColumn = (column: keyof typeof visibleColumns) => {
        setVisibleColumns(prev => ({
            ...prev,
            [column]: !prev[column]
        }));
    };
    const getVisibleColumnsCount = () => {
        const visibleCount = Object.values(visibleColumns).filter(Boolean).length;
        const totalColumns = Object.keys(visibleColumns).length;
        return `${visibleCount}/${totalColumns}`;
    };
    const resetColumns = () => {
        setVisibleColumns({
            no: true,
            tanggal: true,
            waktu: true,
            nama_produk: true,
            jumlah: true,
            type: true,
            gudang: true,
            rak: true,
            stok_tersedia: true,
            total_stok: true,
            tgl_scan: false,
            user_name: false,
            aksi: true
        });
    };
    const clearAll = () => {
        localStorage.removeItem(STORAGE_KEY);
        setRows([{
            id: '1',
            tanggal: currentDate,
            waktu: formatTimeWithSeconds(new Date()),
            nama_produk: '',
            jumlah: 0,
            type: 'OUT',
            gudang: '',
            rak: '',
            sub_rak: '',
            tgl_scan: '',
            user_name: '',
            stok_tersedia: 0,
            total_stok: 0,
            packing: '',
            validationErrors: undefined
        }]);
    };

    const togglePackingView = () => {
        setShowPackingColumn(prev => !prev);
    };
    const penyesuaian = () => {
        const initialRowCount = rows.length;
        const filteredRows = rows.filter(row => {
            return (row.nama_produk && row.nama_produk.trim() !== '') || row.jumlah > 0;
        });
        let finalRows;
        if (filteredRows.length === 0) {
            finalRows = [{
                id: '1',
                tanggal: currentDate,
                waktu: currentTime,
                nama_produk: '',
                jumlah: 0,
                type: 'OUT',
                gudang: '',
                rak: '',
                sub_rak: '',
                tgl_scan: '',
                user_name: '',
                stok_tersedia: 0,
                total_stok: 0,
                packing: '',
            }];
        } else {
            finalRows = filteredRows;
        }
        const removedCount = initialRowCount - finalRows.length;
        setRows(finalRows);
        if (removedCount > 0) {
            showToast(`Penyesuaian berhasil! ${removedCount} baris kosong telah dihapus.`, 'success');
        } else {
            showToast('Tabel sudah dalam kondisi optimal, tidak ada baris kosong.', 'info');
        }
    };
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [isBulkModal3Open, setIsBulkModal3Open] = useState(false);
    const [bulkInputText, setBulkInputText] = useState('');
    const [bulkInputText3, setBulkInputText3] = useState('');
    const [analyzedData, setAnalyzedData] = useState<AnalyzedItem[]>([]);
    const [analyzedData2, setAnalyzedData2] = useState<AnalyzedItem2[]>([]);
    const [analyzedData3, setAnalyzedData3] = useState<AnalyzedItem3[]>([]);
    const [analyzedDataScan2, setAnalyzedDataScan2] = useState<AnalyzedItemScan2[]>([]);
    const [analyzedDataScan, setAnalyzedDataScan] = useState<AnalyzedItemScan[]>([]);
    const [analyzedDataMassal, setAnalyzedDataMassal] = useState<AnalyzedItemMassal[]>([]);
    const [analyzedDataSN, setAnalyzedDataSN] = useState<AnalyzedItemSN[]>([]);
    const [bulkAnalysisResult, setBulkAnalysisResult] = useState({
        berhasil: 0,
        gagal: 0
    });
    const [bulkFormat, setBulkFormat] = useState<'format1' | 'format2' | 'format_scan2' | 'format_scan' | 'format_massal' | 'format_sn'>('format_massal');
    const openBulkModal = (format: 'format1' | 'format2' | 'format_scan2' | 'format_scan' | 'format_massal' | 'format_sn') => {
        if (format === 'format1' || format === 'format_massal' || format === 'format_scan2' || format === 'format_scan' || format === 'format_sn') {
            setPendingFormat(format);
            setPinInput('');
            setIsPinModalOpen(true);
        } else {
            setBulkFormat(format);
            setIsBulkModalOpen(true);
            resetBulkModal();
        }
    };
    const handlePinSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const isValid = await verifyPin(pinInput);
        if (isValid) {
            setIsPinModalOpen(false);
            if (pendingFormat) {
                setBulkFormat(pendingFormat);
                setIsBulkModalOpen(true);
                resetBulkModal();
                setPendingFormat(null);
            }
        } else {
            showToast('PIN Salah!', 'error');
            setPinInput('');
        }
    };
    const resetBulkModal = () => {
        setBulkInputText('');
        setAnalyzedData([]);
        setAnalyzedData2([]);
        setAnalyzedDataScan2([]);
        setAnalyzedDataScan([]);
        setAnalyzedDataMassal([]);
        setAnalyzedDataSN([]);
        setBulkAnalysisResult({ berhasil: 0, gagal: 0 });
    };
    const handleBulkAnalyze = () => {
        if (!bulkInputText.trim()) {
            showToast('Tidak ada data untuk dianalisa.', 'warning');
            return;
        }
        const lines = bulkInputText.split('\n').filter(line => line.trim() !== '');
        let successCount = 0;
        let failCount = 0;
        if (bulkFormat === 'format1') {
            const newAnalyzedData: AnalyzedItem[] = [];
            lines.forEach(line => {
                const parts = line.trim().split(/\t| {2,}/);
                if (parts.length >= 2) {
                    const nama_produk = parts[0].trim();
                    const jumlah = parseInt(parts[1].trim());
                    if (nama_produk && !isNaN(jumlah) && jumlah > 0) {
                        newAnalyzedData.push({ nama_produk, jumlah, isValid: true });
                        successCount++;
                    } else {
                        failCount++;
                    }
                } else {
                    failCount++;
                }
            });
            setAnalyzedData(newAnalyzedData);
        } else if (bulkFormat === 'format2') {
            const newAnalyzedData2: AnalyzedItem2[] = [];
            lines.forEach(line => {
                const parts = line.trim().split(/\t| {2,}/);
                if (parts.length >= 4) {
                    const nama_produk = parts[0].trim();
                    const jumlah = parseInt(parts[1].trim());
                    const tgl_scan = parts[2].trim();
                    const user_name = parts[3].trim();
                    if (nama_produk && !isNaN(jumlah) && jumlah > 0 && tgl_scan && user_name) {
                        newAnalyzedData2.push({ nama_produk, jumlah, tgl_scan, user_name, isValid: true });
                        successCount++;
                    } else {
                        failCount++;
                    }
                } else {
                    failCount++;
                }
            });
            setAnalyzedData2(newAnalyzedData2);
        } else if (bulkFormat === 'format_scan2') {
            const newAnalyzedDataScan2: AnalyzedItemScan2[] = [];
            lines.forEach(line => {
                const parts = line.trim().split(/\t| {2,}/);
                if (parts.length >= 4) {
                    const nama_produk = parts[0].trim();
                    const rak = parts[1].trim();
                    const tgl_scan = parts[2].trim();
                    const user_name = parts[3].trim();
                    if (nama_produk && rak && tgl_scan && user_name) {
                        newAnalyzedDataScan2.push({ nama_produk, rak, tgl_scan, user_name, isValid: true });
                        successCount++;
                    } else {
                        failCount++;
                    }
                } else {
                    failCount++;
                }
            });
            setAnalyzedDataScan2(newAnalyzedDataScan2);
        } else if (bulkFormat === 'format_scan') {
            const newAnalyzedDataScan: AnalyzedItemScan[] = [];
            lines.forEach(line => {
                const parts = line.trim().split(/\t| {2,}/);
                if (parts.length >= 5) {
                    const nama_produk = parts[0].trim();
                    const jumlah = parseInt(parts[1].trim());
                    const rak = parts[2].trim();
                    const tgl_scan = parts[3].trim();
                    const user_name = parts[4].trim();
                    if (nama_produk && !isNaN(jumlah) && jumlah > 0 && rak && tgl_scan && user_name) {
                        newAnalyzedDataScan.push({ nama_produk, jumlah, rak, tgl_scan, user_name, isValid: true });
                        successCount++;
                    } else {
                        failCount++;
                    }
                } else {
                    failCount++;
                }
            });
            setAnalyzedDataScan(newAnalyzedDataScan);
        } else if (bulkFormat === 'format_massal') {
            const newAnalyzedDataMassal: AnalyzedItemMassal[] = [];
            lines.forEach(line => {
                const parts = line.trim().split(/\t| {2,}/);
                if (parts.length >= 2) {
                    const nama_produk = parts[0].trim();
                    const jumlah = parseInt(parts[1].trim());
                    if (nama_produk && !isNaN(jumlah) && jumlah > 0) {
                        newAnalyzedDataMassal.push({ nama_produk, jumlah, rak: '', isValid: true });
                        successCount++;
                    } else {
                        failCount++;
                    }
                } else {
                    failCount++;
                }
            });
            setAnalyzedDataMassal(newAnalyzedDataMassal);
        } else if (bulkFormat === 'format_sn') {
            const newAnalyzedDataSN: AnalyzedItemSN[] = [];
            lines.forEach(line => {
                const parts = line.trim().split(/\t| {2,}/);
                if (parts.length >= 3) {
                    const tgl_scan = parts[0].trim();
                    const nama_produk = parts[1].trim();
                    const unique_code = parts[2].trim();
                    if (nama_produk && unique_code) {
                        newAnalyzedDataSN.push({ nama_produk, unique_code, tgl_scan, isValid: true });
                        successCount++;
                    } else {
                        failCount++;
                    }
                } else {
                    failCount++;
                }
            });
            setAnalyzedDataSN(newAnalyzedDataSN);
        }
        setBulkAnalysisResult({ berhasil: successCount, gagal: failCount });
    };
    const handleBulkAdd = async () => {
        const firstRowGudang = rows.length > 0 ? rows[0].gudang : '';
        const firstRowTanggal = rows.length > 0 ? rows[0].tanggal : currentDate;
        let newRowsFromBulk: TransactionRow[] = [];
        if (bulkFormat === 'format1') {
            if (analyzedData.length === 0) {
                showToast('Tidak ada data valid untuk ditambahkan.', 'warning');
                return;
            }
            newRowsFromBulk = analyzedData.map(item => ({
                id: Date.now().toString() + '_' + Math.random(),
                tanggal: firstRowTanggal,
                waktu: formatTimeWithSeconds(new Date()),
                nama_produk: item.nama_produk,
                jumlah: item.jumlah,
                type: 'OUT',
                gudang: firstRowGudang,
                rak: '',
                sub_rak: '',
                tgl_scan: '',
                user_name: '',
                stok_tersedia: 0,
                total_stok: 0,
                packing: '',
                validationErrors: undefined,
            }));

            const rowsWithStockAndPacking = await Promise.all(newRowsFromBulk.map(async (row) => {
                const stokTersedia = await calculateAvailableStock(row.nama_produk, row.rak);
                const stockItem = stockItems.find(si => si.nama_produk?.toLowerCase().trim() === row.nama_produk.toLowerCase().trim());
                let packingData = '';
                if (stockItem && stockItem.packing && stockItem.packing.trim() !== '' && stockItem.packing.trim() !== 'CTN/') {
                    packingData = stockItem.packing;
                }
                return {
                    ...row,
                    stok_tersedia: stokTersedia,
                    total_stok: stokTersedia - row.jumlah,
                    packing: packingData,
                };
            }));
            if (rows.length === 1 && (!rows[0].nama_produk || rows[0].nama_produk === '') && rows[0].jumlah === 0) {
                setRows(rowsWithStockAndPacking);
            } else {
                setRows(prevRows => [...prevRows, ...rowsWithStockAndPacking]);
            }
            showToast(`${analyzedData.length} baris berhasil ditambahkan!`, 'success');
        } else if (bulkFormat === 'format2') {
            if (analyzedData2.length === 0) {
                showToast('Tidak ada data valid untuk ditambahkan.', 'warning');
                return;
            }
            newRowsFromBulk = analyzedData2.map(item => ({
                id: Date.now().toString() + '_' + Math.random(),
                tanggal: firstRowTanggal,
                waktu: formatTimeWithSeconds(new Date()),
                nama_produk: item.nama_produk,
                jumlah: item.jumlah,
                type: 'OUT',
                gudang: firstRowGudang,
                rak: '',
                sub_rak: '',
                tgl_scan: item.tgl_scan,
                user_name: item.user_name,
                stok_tersedia: 0,
                total_stok: 0,
                packing: '',
                validationErrors: undefined,
            }));
            const rowsWithStockAndPacking = await Promise.all(newRowsFromBulk.map(async (row) => {
                const stokTersedia = await calculateAvailableStock(row.nama_produk, row.rak);
                const stockItem = stockItems.find(si => si.nama_produk?.toLowerCase().trim() === row.nama_produk.toLowerCase().trim());
                let packingData = '';
                if (stockItem && stockItem.packing && stockItem.packing.trim() !== '' && stockItem.packing.trim() !== 'CTN/') {
                    packingData = stockItem.packing;
                }
                return {
                    ...row,
                    stok_tersedia: stokTersedia,
                    total_stok: stokTersedia - row.jumlah,
                    packing: packingData,
                };
            }));
            if (rows.length === 1 && (!rows[0].nama_produk || rows[0].nama_produk === '') && rows[0].jumlah === 0) {
                setRows(rowsWithStockAndPacking);
            } else {
                setRows(prevRows => [...prevRows, ...rowsWithStockAndPacking]);
            }
            showToast(`${analyzedData2.length} baris berhasil ditambahkan!`, 'success');
        } else if (bulkFormat === 'format_scan2') {
            if (analyzedDataScan2.length === 0) {
                showToast('Tidak ada data valid untuk ditambahkan.', 'warning');
                return;
            }
            newRowsFromBulk = analyzedDataScan2.map(item => ({
                id: Date.now().toString() + '_' + Math.random(),
                tanggal: firstRowTanggal,
                waktu: formatTimeWithSeconds(new Date()),
                nama_produk: item.nama_produk,
                jumlah: 1,
                type: 'OUT',
                gudang: firstRowGudang,
                rak: item.rak,
                sub_rak: item.rak,
                tgl_scan: item.tgl_scan,
                user_name: item.user_name,
                stok_tersedia: 0,
                total_stok: 0,
                packing: '',
                validationErrors: undefined,
            }));

            const rowsWithStockAndPacking = await Promise.all(newRowsFromBulk.map(async (row) => {
                const stokTersedia = await calculateAvailableStock(row.nama_produk, row.rak);
                const stockItem = stockItems.find(si => si.nama_produk?.toLowerCase().trim() === row.nama_produk.toLowerCase().trim());
                let packingData = '';
                if (stockItem && stockItem.packing && stockItem.packing.trim() !== '' && stockItem.packing.trim() !== 'CTN/') {
                    packingData = stockItem.packing;
                }
                return {
                    ...row,
                    stok_tersedia: stokTersedia,
                    total_stok: stokTersedia - row.jumlah,
                    packing: packingData,
                };
            }));
            if (rows.length === 1 && (!rows[0].nama_produk || rows[0].nama_produk === '') && rows[0].jumlah === 0) {
                setRows(rowsWithStockAndPacking);
            } else {
                setRows(prevRows => [...prevRows, ...rowsWithStockAndPacking]);
            }
            showToast(`${analyzedDataScan2.length} baris berhasil ditambahkan!`, 'success');
        } else if (bulkFormat === 'format_scan') {
            if (analyzedDataScan.length === 0) {
                showToast('Tidak ada data valid untuk ditambahkan.', 'warning');
                return;
            }
            newRowsFromBulk = analyzedDataScan.map(item => ({
                id: Date.now().toString() + '_' + Math.random(),
                tanggal: firstRowTanggal,
                waktu: formatTimeWithSeconds(new Date()),
                nama_produk: item.nama_produk,
                jumlah: item.jumlah,
                type: 'OUT',
                gudang: firstRowGudang,
                rak: item.rak,
                sub_rak: item.rak,
                tgl_scan: item.tgl_scan,
                user_name: item.user_name,
                stok_tersedia: 0,
                total_stok: 0,
                packing: '',
                validationErrors: undefined,
            }));

            const rowsWithStockAndPacking = await Promise.all(newRowsFromBulk.map(async (row) => {
                const stokTersedia = await calculateAvailableStock(row.nama_produk, row.rak);
                const stockItem = stockItems.find(si => si.nama_produk?.toLowerCase().trim() === row.nama_produk.toLowerCase().trim());
                let packingData = '';
                if (stockItem && stockItem.packing && stockItem.packing.trim() !== '' && stockItem.packing.trim() !== 'CTN/') {
                    packingData = stockItem.packing;
                }
                return {
                    ...row,
                    stok_tersedia: stokTersedia,
                    total_stok: stokTersedia - row.jumlah,
                    packing: packingData,
                };
            }));
            if (rows.length === 1 && (!rows[0].nama_produk || rows[0].nama_produk === '') && rows[0].jumlah === 0) {
                setRows(rowsWithStockAndPacking);
            } else {
                setRows(prevRows => [...prevRows, ...rowsWithStockAndPacking]);
            }
            showToast(`${analyzedDataScan.length} baris berhasil ditambahkan!`, 'success');
        } else if (bulkFormat === 'format_massal') {
            if (analyzedDataMassal.length === 0) {
                showToast('Tidak ada data valid untuk ditambahkan.', 'warning');
                return;
            }
            newRowsFromBulk = analyzedDataMassal.map(item => ({
                id: Date.now().toString() + '_' + Math.random(),
                tanggal: firstRowTanggal,
                waktu: formatTimeWithSeconds(new Date()),
                nama_produk: item.nama_produk,
                jumlah: item.jumlah,
                type: 'OUT',
                gudang: firstRowGudang,
                rak: '', // Now correctly empty for massal format (2 columns)
                sub_rak: '',
                tgl_scan: '',
                user_name: '',
                stok_tersedia: 0,
                total_stok: 0,
                packing: '',
                validationErrors: undefined,
            }));

            const rowsWithStockAndPacking = await Promise.all(newRowsFromBulk.map(async (row) => {
                const stokTersedia = await calculateAvailableStock(row.nama_produk, row.rak);
                const stockItem = stockItems.find(si => si.nama_produk?.toLowerCase().trim() === row.nama_produk.toLowerCase().trim());
                let packingData = '';
                if (stockItem && stockItem.packing && stockItem.packing.trim() !== '' && stockItem.packing.trim() !== 'CTN/') {
                    packingData = stockItem.packing;
                }
                return {
                    ...row,
                    stok_tersedia: stokTersedia,
                    total_stok: stokTersedia - row.jumlah,
                    packing: packingData,
                };
            }));
            if (rows.length === 1 && (!rows[0].nama_produk || rows[0].nama_produk === '') && rows[0].jumlah === 0) {
                setRows(rowsWithStockAndPacking);
            } else {
                setRows(prevRows => [...prevRows, ...rowsWithStockAndPacking]);
            }
            showToast(`${analyzedDataMassal.length} baris berhasil ditambahkan!`, 'success');
        } else if (bulkFormat === 'format_sn') {
            if (analyzedDataSN.length === 0) {
                showToast('Tidak ada data valid untuk ditambahkan.', 'warning');
                return;
            }
            newRowsFromBulk = analyzedDataSN.map(item => ({
                id: Date.now().toString() + '_' + Math.random(),
                tanggal: firstRowTanggal,
                waktu: formatTimeWithSeconds(new Date()),
                nama_produk: item.nama_produk,
                jumlah: 1,
                type: 'OUT',
                gudang: firstRowGudang,
                rak: '',
                sub_rak: '',
                tgl_scan: item.tgl_scan,
                user_name: userEmail?.split('@')[0] || '',
                unique_code: item.unique_code,
                stok_tersedia: 0,
                total_stok: 0,
                packing: '',
                validationErrors: undefined,
            }));

            const rowsWithStockAndPacking = await Promise.all(newRowsFromBulk.map(async (row) => {
                const stokTersedia = await calculateAvailableStock(row.nama_produk, row.rak);
                const stockItem = stockItems.find(si => si.nama_produk?.toLowerCase().trim() === row.nama_produk.toLowerCase().trim());
                let packingData = '';
                if (stockItem && stockItem.packing && stockItem.packing.trim() !== '' && stockItem.packing.trim() !== 'CTN/') {
                    packingData = stockItem.packing;
                }
                return {
                    ...row,
                    stok_tersedia: stokTersedia,
                    total_stok: stokTersedia - row.jumlah,
                    packing: packingData,
                };
            }));
            if (rows.length === 1 && (!rows[0].nama_produk || rows[0].nama_produk === '') && rows[0].jumlah === 0) {
                setRows(rowsWithStockAndPacking);
            } else {
                setRows(prevRows => [...prevRows, ...rowsWithStockAndPacking]);
            }
            showToast(`${analyzedDataSN.length} baris berhasil ditambahkan!`, 'success');
        }
        setIsBulkModalOpen(false);
        resetBulkModal();
    };

    // --- MASSAL 2 MODAL LOGIC (3 Columns: SKU, QTY, Unique Code) ---
    const resetMassal2Modal = () => {
        setMassal2InputText('');
        setMassal2AnalyzedData([]);
        setMassal2AnalysisResult({ berhasil: 0, gagal: 0 });
    };

    const openMassal2Modal = () => {
        resetMassal2Modal();
        setIsMassal2ModalOpen(true);
    };

    const handleMassal2Analyze = () => {
        if (!massal2InputText.trim()) {
            showToast('Tidak ada data untuk dianalisa.', 'warning');
            return;
        }

        const lines = massal2InputText.split('\n');
        const newAnalyzedData: Massal2Item[] = [];
        let successCount = 0;
        let failCount = 0;

        lines.forEach(line => {
            const parts = line.trim().split(/\t| {2,}/);
            if (parts.length >= 3) {
                const nama_produk = parts[0].trim();
                const jumlah = parseInt(parts[1].trim());
                const unique_code = parts[2].trim();

                if (nama_produk && !isNaN(jumlah) && jumlah > 0 && unique_code) {
                    newAnalyzedData.push({
                        nama_produk,
                        jumlah,
                        unique_code,
                        isValid: true
                    });
                    successCount++;
                } else {
                    newAnalyzedData.push({
                        nama_produk: parts[0] || 'Tidak Valid',
                        jumlah: isNaN(jumlah) ? 0 : jumlah,
                        unique_code: parts[2] || '',
                        isValid: false
                    });
                    failCount++;
                }
            } else if (line.trim() !== '') {
                failCount++;
            }
        });

        setMassal2AnalyzedData(newAnalyzedData.filter(item => item.isValid));
        setMassal2AnalysisResult({ berhasil: successCount, gagal: failCount });
    };

    const handleMassal2Add = async () => {
        if (massal2AnalyzedData.length === 0) {
            showToast('Tidak ada data valid untuk ditambahkan.', 'warning');
            return;
        }

        const firstRowGudang = rows.length > 0 ? rows[0].gudang : '';
        const firstRowTanggal = rows.length > 0 ? rows[0].tanggal : currentDate;

        const newRowsFromBulk: TransactionRow[] = await Promise.all(massal2AnalyzedData.map(async (item) => {
            const stokTersedia = await calculateAvailableStock(item.nama_produk, '');
            const stockItem = stockItems.find(si => si.nama_produk?.toLowerCase().trim() === item.nama_produk.toLowerCase().trim());
            let packingData = '';
            if (stockItem && stockItem.packing && stockItem.packing.trim() !== '' && stockItem.packing.trim() !== 'CTN/') {
                packingData = stockItem.packing;
            }
            return {
                id: Date.now().toString() + '_' + Math.random(),
                tanggal: firstRowTanggal,
                waktu: formatTimeWithSeconds(new Date()),
                nama_produk: item.nama_produk,
                jumlah: item.jumlah,
                type: 'OUT',
                gudang: firstRowGudang,
                rak: '',
                sub_rak: '',
                tgl_scan: '',
                user_name: '',
                unique_code: item.unique_code,
                stok_tersedia: stokTersedia,
                total_stok: stokTersedia - item.jumlah,
                packing: packingData,
                validationErrors: undefined
            };
        }));

        if (rows.length === 1 && (!rows[0].nama_produk || rows[0].nama_produk === '') && rows[0].jumlah === 0) {
            setRows(newRowsFromBulk);
        } else {
            setRows(prevRows => [...prevRows, ...newRowsFromBulk]);
        }

        showToast(`${massal2AnalyzedData.length} baris berhasil ditambahkan!`, 'success');
        setIsMassal2ModalOpen(false);
        resetMassal2Modal();
    };

    const analyzeMassal2Paste = () => {
        setTimeout(() => {
            handleMassal2Analyze();
        }, 100);
    };

    // --- MASSAL 3 MODAL LOGIC (Tutorial + 3 Columns: SKU, QTY PCS, QTY KARTON) ---
    const resetMassal3Modal = () => {
        setMassal3InputText('');
        setMassal3AnalyzedData([]);
        setMassal3AnalysisResult({ berhasil: 0, gagal: 0 });
    };

    const openMassal3Modal = () => {
        resetMassal3Modal();
        setIsMassal3ModalOpen(true);
    };

    const handleMassal3Analyze = () => {
        if (!massal3InputText.trim()) {
            showToast('Tidak ada data untuk dianalisa.', 'warning');
            return;
        }

        const lines = massal3InputText.split('\n');
        const newAnalyzedData: Massal3Item[] = [];
        let successCount = 0;
        let failCount = 0;

        lines.forEach(line => {
            const parts = line.trim().split(/\t| {2,}/);
            if (parts.length >= 3) {
                const sku = parts[0].trim();
                const qty_pcs = parseInt(parts[1].trim());
                const qty_karton = parseInt(parts[2].trim());

                if (sku && !isNaN(qty_pcs) && qty_pcs >= 0 && !isNaN(qty_karton)) {
                    newAnalyzedData.push({
                        sku,
                        qty_pcs,
                        qty_karton,
                        isValid: true
                    });
                    successCount++;
                } else {
                    newAnalyzedData.push({
                        sku: parts[0] || 'Tidak Valid',
                        qty_pcs: isNaN(qty_pcs) ? 0 : qty_pcs,
                        qty_karton: isNaN(qty_karton) ? 0 : qty_karton,
                        isValid: false
                    });
                    failCount++;
                }
            } else if (line.trim() !== '') {
                failCount++;
            }
        });

        setMassal3AnalyzedData(newAnalyzedData.filter(item => item.isValid));
        setMassal3AnalysisResult({ berhasil: successCount, gagal: failCount });
    };

    const handleMassal3Add = async () => {
        if (massal3AnalyzedData.length === 0) {
            showToast('Tidak ada data valid untuk ditambahkan.', 'warning');
            return;
        }

        const firstRowGudang = rows.length > 0 ? rows[0].gudang : '';
        const firstRowTanggal = rows.length > 0 ? rows[0].tanggal : currentDate;

        const newRowsFromBulk: TransactionRow[] = await Promise.all(massal3AnalyzedData.map(async (item) => {
            const stokTersedia = await calculateAvailableStock(item.sku, '');
            const stockItem = stockItems.find(si => si.nama_produk?.toLowerCase().trim() === item.sku.toLowerCase().trim());
            let packingData = '';
            if (stockItem && stockItem.packing && stockItem.packing.trim() !== '' && stockItem.packing.trim() !== 'CTN/') {
                packingData = stockItem.packing;
            }
            return {
                id: Date.now().toString() + '_' + Math.random(),
                tanggal: firstRowTanggal,
                waktu: formatTimeWithSeconds(new Date()),
                nama_produk: item.sku,
                jumlah: item.qty_pcs,
                type: 'OUT',
                gudang: firstRowGudang,
                rak: '',
                sub_rak: '',
                tgl_scan: '',
                user_name: '',
                stok_tersedia: stokTersedia,
                total_stok: stokTersedia - item.qty_pcs,
                packing: packingData,
                validationErrors: undefined
            };
        }));

        if (rows.length === 1 && (!rows[0].nama_produk || rows[0].nama_produk === '') && rows[0].jumlah === 0) {
            setRows(newRowsFromBulk);
        } else {
            setRows(prevRows => [...prevRows, ...newRowsFromBulk]);
        }

        showToast(`${massal3AnalyzedData.length} baris (Massal 3) berhasil ditambahkan!`, 'success');
        setIsMassal3ModalOpen(false);
        resetMassal3Modal();
    };

    const analyzeMassal3Paste = () => {
        setTimeout(() => {
            handleMassal3Analyze();
        }, 100);
    };

    return (
        <>
            <Toast
                isOpen={toast.isOpen}
                message={toast.message}
                type={toast.type}
                onClose={() => setToast({ isOpen: false, message: '', type: 'info' })}
            />

            {/* ======================================================== */}
            {/* PREMIUM RESPONSIVE HEADER & ACTIONS (Mobile & Desktop) */}
            {/* ======================================================== */}
            <div className="flex flex-col mb-8 lg:mb-12">
                {/* Full Immersive Background Banner with Floating Shapes */}
                <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 pt-[80px] lg:pt-0 lg:h-[310px] pb-[40px] lg:pb-0 px-6 lg:px-12 rounded-b-[40px] lg:rounded-b-[55px] shadow-2xl shadow-blue-900/20 relative overflow-hidden transition-all duration-500 flex flex-col justify-center">

                    {/* Decorative Background Icon */}
                    <div className="absolute -top-6 -right-6 text-white opacity-5">
                        <Package className="w-64 h-64 lg:w-96 lg:h-96" />
                    </div>

                    {/* Decorative Floating Shapes */}
                    <div className="absolute top-10 right-10 w-32 h-32 bg-white/10 rounded-full blur-3xl animate-pulse"></div>
                    <div className="absolute top-24 left-1/4 w-16 h-16 bg-white/5 border border-white/10 rounded-2xl rotate-[35deg] backdrop-blur-sm hidden lg:block"></div>
                    <div className="absolute bottom-10 right-1/3 w-12 h-12 bg-white/10 rounded-full border border-white/20 hidden lg:block"></div>
                    <div className="absolute top-1/2 right-20 w-16 h-16 bg-blue-400/20 rounded-3xl -rotate-12 blur-xl hidden lg:block"></div>

                    {/* Text Content */}
                    <div className="relative z-10 w-full flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 lg:gap-6 uppercase">
                        <div className="max-w-2xl">
                            <div className="flex items-center gap-2 mb-2 lg:mb-3 opacity-90">
                                <div className="w-8 h-[2px] bg-white rounded-full"></div>
                                <span className="text-[10px] lg:text-[12px] font-black tracking-[0.3em] text-white">Logistics V5</span>
                            </div>
                            <h1 className="text-[34px] lg:text-[54px] font-black text-white tracking-tight leading-[1.1] mb-2 uppercase">
                                Barang <span className="text-blue-200">Keluar</span>
                            </h1>
                            <div className="text-blue-100/90 font-medium text-[14px] lg:text-[18px] leading-relaxed max-w-[90%] normal-case">
                                {dropdownLoading ? (
                                    <span className="animate-pulse flex items-center gap-2">
                                        <RefreshCw className="w-4 h-4 animate-spin" /> Menghubungkan ke pusat data...
                                    </span>
                                ) : (
                                    <div className="flex items-center gap-3">
                                        <span className="relative flex h-3 w-3">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                                        </span>
                                        <span className="font-black text-white">Digital System</span> - Pengeluaran Stok Aktif
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="lg:hidden w-full flex justify-end items-center gap-2">
                            <Button
                                onClick={handleClearAll}
                                className="h-10 px-4 bg-rose-500/80 hover:bg-rose-600 text-white font-black rounded-xl transition-all active:scale-95 flex items-center gap-2 border border-rose-400/20 backdrop-blur-md shadow-lg"
                                disabled={isSubmitting}
                            >
                                <Trash className="h-4 w-4" />
                                <span className="text-[11px] uppercase font-bold">Reset All</span>
                            </Button>
                        </div>

                        {/* Desktop Action Buttons */}
                        <div className="hidden lg:flex flex-wrap justify-end items-center gap-2">
                            <Button
                                onClick={() => setIsBulkModalOpen(true)}
                                className="h-11 px-4 bg-white hover:bg-gray-50 text-gray-800 border border-gray-200 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 font-bold shadow-sm"
                                disabled={isSubmitting}
                            >
                                <Plus className="h-4 w-4" />
                                <span className="text-[11px] uppercase tracking-wider whitespace-nowrap">BULK</span>
                            </Button>

                            <Button
                                onClick={handleKirimPenyesuaian}
                                className="h-11 px-4 bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 font-bold shadow-sm border border-amber-600/50"
                                disabled={isSubmitting}
                            >
                                <Tag className="h-4 w-4" />
                                <span className="text-[11px] uppercase tracking-wider whitespace-nowrap">ADJUST</span>
                            </Button>

                            <Button
                                onClick={handleMoveMinusStock}
                                className="h-11 px-4 bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 font-bold shadow-sm border border-orange-600/50"
                                disabled={isSubmitting}
                            >
                                <MoveRight className="h-4 w-4" />
                                <span className="text-[11px] uppercase tracking-wider whitespace-nowrap">MOVE</span>
                            </Button>

                            <Button
                                onClick={handleMoveToQuarantine}
                                className="h-11 px-4 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 font-bold shadow-sm border border-red-600/50"
                                disabled={isSubmitting}
                            >
                                <ShieldAlert className="h-4 w-4" />
                                <span className="text-[11px] uppercase tracking-wider whitespace-nowrap">KARANTINA</span>
                            </Button>

                            <Button
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                                className="h-12 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 border-0 px-8"
                            >
                                <Send className={cn("h-4 w-4", isSubmitting && "animate-pulse")} />
                                <span className="text-[11px] uppercase tracking-wider whitespace-nowrap">
                                    {isSubmitting ? (submissionProgress.total > 0 ? `MENGIRIM ${submissionProgress.current}/${submissionProgress.total}` : 'MENGIRIM...') : 'KIRIM DATA KELUAR'}
                                </span>
                            </Button>

                            <div className="hidden xl:block w-px h-8 bg-white/20 mx-1"></div>

                            <Button
                                onClick={syncDropdownData}
                                className="h-11 px-4 bg-blue-500 hover:bg-blue-600 text-white border border-blue-400 rounded-xl transition-all active:scale-95 flex flex-col items-center justify-center shadow-md"
                                disabled={dropdownLoading}
                            >
                                <div className="flex items-center gap-2 font-bold whitespace-nowrap">
                                    <RefreshCw className={cn("h-3.5 w-3.5", dropdownLoading && "animate-spin")} />
                                    <span className="text-[11px] uppercase tracking-wider">SYNC</span>
                                </div>
                                <span className="text-[8px] font-normal opacity-90 mt-0.5 whitespace-nowrap text-blue-100">Sinkron SKU Baru</span>
                            </Button>

                            <Button
                                onClick={handleClearAll}
                                className="h-11 px-4 bg-rose-500 hover:bg-rose-600 text-white border border-rose-400 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 font-bold shadow-md"
                                disabled={isSubmitting}
                            >
                                <Trash className="h-4 w-4 text-white" />
                                <span className="text-[11px] uppercase tracking-wider text-white whitespace-nowrap">RESET</span>
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-6 lg:space-y-10 lg:px-10 pb-12">
                {/* Marquee/Running Text */}
                {showMarquee && (
                    <div className="bg-gradient-to-r from-blue-700 via-blue-800 to-blue-700 text-white py-2.5 px-6 rounded-2xl overflow-hidden shadow-xl border border-blue-900/50 -mt-2 lg:-mt-4 relative z-20">
                        <div className="flex items-center whitespace-nowrap animate-marquee">
                            {[1, 2].map((i) => (
                                <div key={i} className="flex items-center space-x-4 pr-12">
                                    <span className="flex items-center gap-2 font-black uppercase tracking-wider text-[10px] bg-amber-400 text-blue-900 px-3 py-1 rounded-full shadow-sm">
                                        <AlertCircle className="h-3 w-3" /> INFO SISTEM
                                    </span>
                                    <span className="font-bold text-xs lg:text-sm tracking-tight uppercase">
                                        Rak yang sudah dirapihkan (Stock Opname) akan di-nonaktifkan otomatis fitur auto-fill lokasinya. Anda harus mengisi lokasi rak tersebut secara manual.
                                    </span>
                                </div>
                            ))}
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
                    </div>
                )}

                {/* Grid Stats - Hidden on Mobile */}
                <div className="hidden lg:grid grid-cols-3 gap-4">
                    <div className="bg-white rounded-[20px] border-l-4 border-l-blue-500 border-t border-r border-b border-gray-100/80 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-4 px-5 flex items-center justify-between relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        <div className="flex items-center gap-4 relative z-10">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
                                <Box className="h-5 w-5" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">Produk</span>
                                <div className="flex items-baseline gap-1.5 mt-1">
                                    <span className="text-2xl font-black text-gray-800 leading-none">{validProducts.length.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                        <div className="relative z-10 flex flex-col items-end gap-1">
                            <span className="text-[10px] font-semibold text-gray-400">Master SKU</span>
                        </div>
                    </div>

                    <div className="bg-white rounded-[20px] border-l-4 border-l-emerald-500 border-t border-r border-b border-gray-100/80 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-4 px-5 flex items-center justify-between relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-r from-emerald-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        <div className="flex items-center gap-4 relative z-10">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
                                <Warehouse className="h-5 w-5" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">Gudang</span>
                                <div className="flex items-baseline gap-1.5 mt-1">
                                    <span className="text-2xl font-black text-gray-800 leading-none">{validWarehouses.length.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                        <div className="relative z-10 flex flex-col items-end gap-1">
                            <span className="text-[10px] font-semibold text-gray-400">Total Lokasi</span>
                        </div>
                    </div>

                    <div className="bg-white rounded-[20px] border-l-4 border-l-blue-500 border-t border-r border-b border-gray-100/80 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-4 px-5 flex items-center justify-between relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        <div className="flex items-center gap-4 relative z-10">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
                                <LayoutGrid className="h-5 w-5" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">Jumlah Baris Terisi</span>
                                <div className="flex items-baseline gap-1.5 mt-1">
                                    <span className="text-2xl font-black text-gray-800 leading-none">{rows.filter(r => r.nama_produk && r.nama_produk.trim() !== '').length}</span>
                                    <span className="text-xs font-semibold text-gray-400">/ {rows.length}</span>
                                </div>
                            </div>
                        </div>
                        <div className="relative z-10 flex flex-col items-end gap-1">
                            <span className="text-[10px] font-black tracking-widest uppercase px-2 py-1 bg-blue-50 text-blue-600 rounded-lg border border-blue-100">Live Count</span>
                        </div>
                    </div>
                </div>
                {/* Column toggle overlay - Only for Mobile */}
                <div className="lg:hidden">
                    {showColumnToggle && (
                        <div
                            ref={columnToggleRef}
                            className="fixed inset-x-4 top-1/2 transform -translate-y-1/2 bg-white border border-gray-200 rounded-2xl shadow-2xl z-[500] max-h-[70vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
                        >
                            <div className="p-4 border-b border-gray-100 bg-blue-600 text-white flex justify-between items-center sticky top-0">
                                <h3 className="font-black text-sm uppercase tracking-wider">Tampilkan Kolom</h3>
                                <button onClick={() => setShowColumnToggle(false)} className="p-1 hover:bg-white/10 rounded-full">
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                            <div className="p-4 grid grid-cols-1 gap-1">
                                {[
                                    { key: 'no', label: 'Nomor Urut' },
                                    { key: 'tanggal', label: 'Tanggal Transaksi' },
                                    { key: 'nama_produk', label: 'Nama Produk / SKU' },
                                    { key: 'jumlah', label: 'Jumlah Barang' },
                                    { key: 'gudang', label: 'Gudang' },
                                    { key: 'rak', label: 'Lokasi Rak' },
                                    { key: 'stok_tersedia', label: 'Stok Saat Ini' },
                                    { key: 'total_stok', label: 'Estimasi Sisa' },
                                    { key: 'tgl_scan', label: 'Waktu Scan' },
                                    { key: 'user_name', label: 'User Penginput' },
                                    { key: 'aksi', label: 'Aksi Hapus' }
                                ].map(({ key, label }) => (
                                    <label key={key} className="flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-gray-100">
                                        <input
                                            type="checkbox"
                                            checked={visibleColumns[key as keyof typeof visibleColumns]}
                                            onChange={() => toggleColumn(key as keyof typeof visibleColumns)}
                                            className="w-5 h-5 rounded-md border-gray-300 text-blue-600 focus:ring-blue-500 transition-all"
                                        />
                                        <span className="text-sm font-bold text-gray-700">{label}</span>
                                    </label>
                                ))}
                            </div>
                            <div className="p-4 border-t border-gray-100 bg-gray-50">
                                <Button onClick={resetColumns} className="w-full h-11 bg-white text-gray-600 border border-gray-200 font-bold rounded-xl active:scale-95 shadow-sm">
                                    Reset Pengaturan Kolom
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
                {/* Action Toolbar (Visible on Desktop & Mobile, scrollable) */}
                <div className="flex bg-white py-2 px-3 rounded-full border border-gray-100 shadow-[0_2px_15px_-5px_rgba(0,0,0,0.05)] justify-between items-center w-full mb-4 overflow-x-auto no-scrollbar gap-4">
                    <div className="flex items-center gap-2 flex-nowrap">
                        {/* + BARIS */}
                        <Button
                            onClick={addRow}
                            className="h-10 px-5 bg-[#1d5bf0] hover:bg-blue-600 text-white font-bold rounded-full transition-all flex items-center gap-2 shadow-none border-none flex-shrink-0"
                        >
                            <Plus className="h-4 w-4" />
                            <span className="text-[11px] uppercase tracking-wider">Baris</span>
                        </Button>

                        {/* DATA SCAN */}
                        <Button
                            onClick={handleAmbilDataScan}
                            className="h-10 px-5 bg-emerald-100/80 hover:bg-emerald-200 text-emerald-700 font-bold rounded-full transition-all flex items-center gap-2 shadow-none border border-emerald-200 flex-shrink-0"
                        >
                            <Layers className="h-4 w-4" />
                            <span className="text-[11px] uppercase tracking-wider">Data Scan</span>
                        </Button>

                        {/* + 50 */}
                        <Button
                            onClick={add50Rows}
                            className="h-10 px-5 bg-blue-100/80 hover:bg-blue-200 text-blue-700 font-bold rounded-full transition-all flex items-center gap-2 shadow-none border border-blue-200 flex-shrink-0"
                        >
                            <Plus className="h-4 w-4" />
                            <span className="text-[11px] uppercase tracking-wider">50 Baris</span>
                        </Button>

                        {/* PENYESUAIAN */}
                        <Button
                            onClick={penyesuaian}
                            className="h-10 px-5 bg-gray-100/80 hover:bg-gray-200 text-gray-700 font-bold rounded-full transition-all flex items-center gap-2 shadow-none border border-gray-200 ml-1 flex-shrink-0"
                            title="Penyesuaian"
                        >
                            <SlidersHorizontal className="h-4 w-4" />
                            <span className="text-[11px] uppercase tracking-wider">Penyesuaian</span>
                        </Button>

                        <div className="w-px h-6 bg-gray-200 mx-2 flex-shrink-0"></div>

                        {/* MASSAL */}
                        <Button
                            onClick={() => openBulkModal('format_massal')}
                            className="h-10 px-4 bg-purple-100/80 hover:bg-purple-200 text-purple-700 font-bold rounded-xl transition-all flex items-center gap-2 shadow-none border border-purple-200 flex-shrink-0"
                        >
                            <Layers className="h-4 w-4" />
                            <span className="text-[11px] uppercase tracking-wider leading-none whitespace-nowrap">Massal</span>
                        </Button>

                        {devMode && (
                            <>
                                {/* MASSAL 2 */}
                                <Button
                                    onClick={openMassal2Modal}
                                    className="h-10 px-4 bg-indigo-100/80 hover:bg-indigo-200 text-indigo-700 font-bold rounded-xl transition-all flex items-center gap-2 shadow-none border border-indigo-200 flex-shrink-0"
                                >
                                    <Layers className="h-4 w-4" />
                                    <span className="text-[11px] uppercase tracking-wider leading-none whitespace-nowrap">Massal 2</span>
                                </Button>
                                {/* MASSAL 3 */}
                                <Button
                                    onClick={openMassal3Modal}
                                    className="h-10 px-4 bg-teal-100/80 hover:bg-teal-200 text-teal-700 font-bold rounded-xl transition-all flex items-center gap-2 shadow-none border border-teal-200 flex-shrink-0"
                                >
                                    <Layers className="h-4 w-4" />
                                    <span className="text-[11px] uppercase tracking-wider leading-none whitespace-nowrap">Massal 3</span>
                                </Button>
                            </>
                        )}
                        
                        {/* Tombol yang dikontrol visibilitasnya - Desktop */}
                        {showAdvancedButtons && (
                            <>
                                <Button
                                    onClick={() => openBulkModal('format_scan2')}
                                    className="h-10 px-4 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl transition-all flex items-center gap-2 shadow-none border-none flex-shrink-0"
                                >
                                    <span className="text-[11px] uppercase tracking-wider leading-none whitespace-nowrap">Scan 1</span>
                                </Button>
                                <Button
                                    onClick={() => openBulkModal('format_scan')}
                                    className="h-10 px-4 bg-fuchsia-50 hover:bg-fuchsia-100 text-fuchsia-700 font-bold rounded-xl transition-all flex items-center gap-2 shadow-none border-none flex-shrink-0"
                                >
                                    <span className="text-[11px] uppercase tracking-wider leading-none whitespace-nowrap">Scan 2</span>
                                </Button>
                                <Button
                                    onClick={() => openBulkModal('format_sn')}
                                    className="h-10 px-4 bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold rounded-xl transition-all flex items-center gap-2 shadow-none border-none flex-shrink-0"
                                >
                                    <span className="text-[11px] uppercase tracking-wider leading-none whitespace-nowrap">Format SN</span>
                                </Button>
                            </>
                        )}
                    </div>
                    
                    <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="relative pl-2 border-l border-gray-100">
                            <Button
                                onClick={() => setShowColumnToggle(!showColumnToggle)}
                                className="h-10 px-5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-full transition-all flex items-center justify-center gap-2 shadow-none border-none"
                            >
                                <LayoutGrid className="h-4 w-4" />
                                <span className="text-[11px] uppercase tracking-wider whitespace-nowrap">Kolom ({getVisibleColumnsCount()})</span>
                            </Button>

                            {showColumnToggle && (
                                <div
                                    ref={columnToggleRef}
                                    className="absolute top-full right-0 mt-2 bg-white border border-gray-200 rounded-2xl shadow-2xl z-50 min-w-[280px] max-h-80 overflow-y-auto animate-in fade-in slide-in-from-top-2"
                                >
                                    <div className="p-4 border-b border-gray-100 bg-gray-50/50 sticky top-0 backdrop-blur-md flex justify-between items-center">
                                        <h3 className="font-black text-xs uppercase tracking-widest text-gray-500">Kolom</h3>
                                        <button onClick={() => setShowColumnToggle(false)} className="p-1 hover:bg-gray-200 rounded-full"><X className="h-4 w-4" /></button>
                                    </div>
                                    <div className="p-2 grid grid-cols-1 gap-1">
                                        {[
                                            { key: 'no', label: 'No' },
                                            { key: 'tanggal', label: 'Tanggal' },
                                            { key: 'nama_produk', label: 'Nama Produk' },
                                            { key: 'jumlah', label: 'Jumlah' },
                                            { key: 'gudang', label: 'Gudang' },
                                            { key: 'rak', label: 'Rak' },
                                            { key: 'stok_tersedia', label: 'Tersedia' },
                                            { key: 'total_stok', label: 'Sisa' },
                                            { key: 'aksi', label: 'Aksi' }
                                        ].map(({ key, label }) => (
                                            <label key={key} className="flex items-center space-x-3 p-3 hover:bg-blue-50 rounded-xl cursor-pointer">
                                                <input type="checkbox" checked={visibleColumns[key as keyof typeof visibleColumns]} onChange={() => toggleColumn(key as keyof typeof visibleColumns)} className="w-4 h-4 rounded border-gray-300" />
                                                <span className="text-sm font-bold text-gray-600 uppercase tracking-tight">{label}</span>
                                            </label>
                                        ))}
                                    </div>
                                    <div className="p-3 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
                                        <Button
                                            onClick={resetColumns}
                                            className="w-full text-xs h-9 bg-white hover:bg-gray-100 text-gray-600 font-bold border border-gray-200 rounded-xl"
                                        >
                                            Reset Semua Kolom
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <Card className="overflow-hidden border-none shadow-xl">
                    <CardContent className="p-0">
                        <div className="hidden lg:block">
                            <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 text-sm text-yellow-800 flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                    <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>
                                    <span>Geser tabel ke kanan untuk melihat kolom lainnya</span>
                                </div>
                                <span className="text-xs">Kolom aktif: {getVisibleColumnsCount()}</span>
                            </div>
                            <div className="overflow-x-auto w-full">
                                <table className="w-full text-sm">
                                    <thead className="bg-blue-600 text-white sticky top-0 z-20 shadow-md">
                                        <tr>
                                            {visibleColumns.no && <th className="px-4 py-4 text-center font-bold border-r border-blue-500 w-16 whitespace-nowrap uppercase tracking-wider">No</th>}
                                            {visibleColumns.tanggal && <th className="px-4 py-4 text-left font-bold border-r border-blue-500 w-36 whitespace-nowrap uppercase tracking-wider">Tanggal</th>}
                                            {!showPackingColumn && visibleColumns.waktu && <th className="px-4 py-4 text-left font-bold border-r border-blue-500 w-24 whitespace-nowrap uppercase tracking-wider">Waktu</th>}
                                            {showPackingColumn && <th className="px-4 py-4 text-left font-bold border-r border-blue-500 w-48 whitespace-nowrap uppercase tracking-wider">Packing</th>}
                                            {visibleColumns.nama_produk && <th className="px-4 py-4 text-left font-bold border-r border-blue-500 w-80 whitespace-nowrap uppercase tracking-wider">
                                                <div className="flex items-center justify-between">
                                                    <span>Nama Produk</span>
                                                    <button onClick={togglePackingView} className="p-1 rounded-full hover:bg-blue-500 transition-colors" title="Tampilkan/Sembunyikan Packing">
                                                        <Eye className="h-4 w-4 text-white" />
                                                    </button>
                                                </div>
                                            </th>}
                                            {visibleColumns.jumlah && <th className="px-4 py-4 text-left font-bold border-r border-blue-500 w-24 whitespace-nowrap uppercase tracking-wider">Jumlah</th>}
                                            {visibleColumns.type && <th className="px-4 py-4 text-left font-bold border-r border-blue-500 w-20 whitespace-nowrap uppercase tracking-wider">Type</th>}
                                            {visibleColumns.gudang && <th className="px-4 py-4 text-left font-bold border-r border-blue-500 w-24 whitespace-nowrap uppercase tracking-wider">Gudang</th>}
                                            {visibleColumns.rak && <th className="px-4 py-4 text-left font-bold border-r border-blue-500 w-32 whitespace-nowrap uppercase tracking-wider">Rak</th>}
                                            {visibleColumns.stok_tersedia && <th className="px-4 py-4 text-left font-bold border-r border-blue-500 w-28 whitespace-nowrap uppercase tracking-wider">Tersedia</th>}
                                            {visibleColumns.total_stok && <th className="px-4 py-4 text-left font-bold border-r border-blue-500 w-28 whitespace-nowrap uppercase tracking-wider">Total</th>}
                                            {visibleColumns.tgl_scan && <th className="px-4 py-4 text-left font-bold border-r border-blue-500 w-36 whitespace-nowrap uppercase tracking-wider">Tgl Scan</th>}
                                            {visibleColumns.user_name && <th className="px-4 py-4 text-left font-bold border-r border-blue-500 w-32 whitespace-nowrap uppercase tracking-wider">User</th>}
                                            {visibleColumns.aksi && <th className="px-4 py-4 text-center font-bold w-24 whitespace-nowrap uppercase tracking-wider">Aksi</th>}
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-100">
                                        {rows.map((row, index) => (
                                            <tr
                                                key={row.id}
                                                data-row-id={row.id}
                                                className={`hover:bg-blue-50/50 transition-colors ${row.validationErrors && row.validationErrors.length > 0 ? 'bg-red-50' : index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
                                            >
                                                {visibleColumns.no && <td className="px-4 py-3 text-center border-r border-gray-100 text-sm font-bold text-gray-400">
                                                    {index + 1}
                                                </td>}
                                                {visibleColumns.tanggal && <td className="px-4 py-3 border-r border-gray-100">
                                                    {index === 0 ? (
                                                        <input
                                                            type="date"
                                                            value={convertToInputDate(row.tanggal)}
                                                            onChange={(e) => {
                                                                const newDate = convertFromInputDate(e.target.value);
                                                                setRows(rows.map(r => ({ ...r, tanggal: newDate })));
                                                            }}
                                                            className="w-full h-9 px-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none font-bold text-blue-700"
                                                        />
                                                    ) : (
                                                        <div className="px-2 py-1.5 text-sm text-gray-600 bg-gray-100/50 rounded-lg font-medium border border-gray-200/50">
                                                            {row.tanggal}
                                                        </div>
                                                    )}
                                                </td>}
                                                {!showPackingColumn && visibleColumns.waktu && <td className="px-4 py-3 border-r border-gray-100">
                                                    <div className="px-2 py-1.5 text-sm text-gray-500 bg-gray-50 rounded-lg font-mono border border-gray-100">
                                                        {formatTimeWithSeconds(new Date())}
                                                    </div>
                                                </td>}
                                                {showPackingColumn && <td className="px-4 py-3 border-r border-gray-100">
                                                    <div className="px-2 py-1.5 text-sm text-gray-800 bg-gray-100/80 rounded-lg font-bold border border-gray-200">
                                                        {row.packing || '-'}
                                                    </div>
                                                </td>}
                                                {visibleColumns.nama_produk && <td className="px-4 py-3 border-r border-gray-100">
                                                    <div className="relative" style={{ minWidth: '280px' }}>
                                                        <CustomDropdown
                                                            value={row.nama_produk}
                                                            onChange={(e) => updateRow(row.id, 'nama_produk', e.target.value)}
                                                            options={validProducts}
                                                            placeholder="Pilih atau ketik produk..."
                                                            className={`${row.validationErrors?.includes('nama_produk') || row.validationErrors?.includes('nama_produk_invalid')
                                                                ? 'border-red-500 bg-red-50 focus:ring-red-500'
                                                                : 'border-gray-200 focus:ring-blue-500'
                                                                } h-10`}
                                                            isInTable={true}
                                                            loading={dropdownLoading}
                                                        />
                                                    </div>
                                                </td>}
                                                {visibleColumns.jumlah && <td className="px-4 py-3 border-r border-gray-100">
                                                    <input
                                                        type="text"
                                                        pattern="[0-9]*"
                                                        inputMode="numeric"
                                                        value={row.jumlah === 0 ? '' : row.jumlah}
                                                        onChange={(e) => {
                                                            const value = e.target.value;
                                                            const sanitizedValue = value.replace(/[^0-9]/g, '');
                                                            updateRow(row.id, 'jumlah', parseInt(sanitizedValue) || 0);
                                                        }}
                                                        className={`w-full h-10 px-2 border rounded-lg text-base font-bold text-center ${row.validationErrors?.includes('jumlah')
                                                            ? 'border-red-500 bg-red-50 focus:ring-red-500'
                                                            : 'border-gray-200 focus:ring-blue-500 text-gray-700'
                                                            }`}
                                                        placeholder="0"
                                                    />
                                                </td>}
                                                {visibleColumns.type && <td className="px-4 py-3 border-r border-gray-100 text-center">
                                                    <span className="bg-red-50 text-red-700 border border-red-100 px-3 py-1.5 rounded-lg text-xs font-black">
                                                        {row.type}
                                                    </span>
                                                </td>}
                                                {visibleColumns.gudang && <td className="px-4 py-3 border-r border-gray-100">
                                                    {index === 0 ? (
                                                        <div className="relative" style={{ minWidth: '100px' }}>
                                                            <CustomDropdown
                                                                value={row.gudang}
                                                                onChange={(e) => {
                                                                    const newGudang = e.target.value;
                                                                    setRows(rows.map(r => ({ ...r, gudang: newGudang })));
                                                                }}
                                                                options={validWarehouses}
                                                                className={`${row.validationErrors?.includes('gudang') || row.validationErrors?.includes('gudang_invalid')
                                                                    ? 'border-red-500 bg-red-50'
                                                                    : 'border-gray-200'
                                                                    } h-10`}
                                                                isInTable={true}
                                                                loading={dropdownLoading}
                                                                showClearButton={true}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <div className={`px-2 py-2 text-sm rounded-lg font-medium text-center ${row.validationErrors?.includes('gudang') || row.validationErrors?.includes('gudang_invalid')
                                                            ? 'text-red-600 bg-red-50 border border-red-200'
                                                            : 'text-gray-500 bg-gray-50 border border-gray-100'
                                                            }`}>
                                                            {row.gudang || '-'}
                                                        </div>
                                                    )}
                                                </td>}
                                                {visibleColumns.rak && <td className="px-4 py-3 border-r border-gray-100">
                                                    <div className="relative" style={{ minWidth: '140px' }}>
                                                        <CustomDropdown
                                                            value={row.rak}
                                                            onChange={(e) => updateRow(row.id, 'rak', e.target.value)}
                                                            options={filteredRackOptions}
                                                            className={`${row.validationErrors?.includes('rak') || row.validationErrors?.includes('rak_invalid')
                                                                ? 'border-red-500 bg-red-50'
                                                                : 'border-gray-200'
                                                                } h-10`}
                                                            isInTable={true}
                                                            loading={dropdownLoading}
                                                            showClearButton={true}
                                                        />
                                                    </div>
                                                </td>}
                                                {visibleColumns.stok_tersedia && <td className="px-4 py-3 border-r border-gray-100 text-center">
                                                    <div className={`px-2 py-1.5 rounded-lg font-black text-sm ${row.stok_tersedia > 0 ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                                                        {row.stok_tersedia}
                                                    </div>
                                                </td>}
                                                {visibleColumns.total_stok && (
                                                    <td className="px-4 py-3 border-r border-gray-100 text-center">
                                                        <div className={`px-2 py-1.5 rounded-lg font-black text-sm ${row.total_stok < 0 ? 'bg-red-100 text-red-800' : 'bg-blue-50 text-blue-700 border border-blue-100'}`}>
                                                            {row.total_stok}
                                                        </div>
                                                    </td>
                                                )}
                                                {visibleColumns.tgl_scan && <td className="px-4 py-3 border-r border-gray-100">
                                                    <input
                                                        type="text"
                                                        value={row.tgl_scan}
                                                        className="w-full px-2 py-2 border border-gray-100 rounded-lg text-xs bg-gray-50 text-gray-500 text-center"
                                                        placeholder="Scan Date"
                                                        readOnly
                                                        disabled
                                                    />
                                                </td>}
                                                {visibleColumns.user_name && <td className="px-4 py-3 border-r border-gray-100">
                                                    <input
                                                        type="text"
                                                        value={row.user_name}
                                                        className="w-full px-2 py-2 border border-gray-100 rounded-lg text-xs bg-gray-50 text-gray-500 text-center truncate"
                                                        placeholder="User"
                                                        readOnly
                                                        disabled
                                                    />
                                                </td>}
                                                {visibleColumns.aksi && <td className="px-4 py-3 text-center">
                                                    <Button
                                                        onClick={() => handleDeleteClick(row)}
                                                        className="h-9 w-9 p-0 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition-all border border-red-100 shadow-sm"
                                                    >
                                                        <Trash2 className="h-4.5 w-4.5" />
                                                    </Button>
                                                </td>}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="lg:hidden flex flex-col gap-4 px-1 py-3 -mx-2">
                            {rows.map((row, index) => (
                                <div key={row.id} className={`relative p-5 space-y-4 tracking-tight rounded-[20px] transition-all duration-300 group overflow-hidden ${row.validationErrors?.length ? 'bg-red-50/10 border border-red-200 ring-2 ring-red-100 shadow-sm' : index === 0 ? 'bg-white border-blue-200 ring-2 ring-blue-100 shadow-[0_8px_30px_-6px_rgba(59,130,246,0.15)] hover:shadow-[0_12px_35px_-6px_rgba(59,130,246,0.2)]' : 'bg-white border border-gray-200/70 hover:border-blue-200 shadow-[0_8px_30px_-6px_rgba(0,0,0,0.10)] hover:shadow-[0_12px_35px_-6px_rgba(0,0,0,0.15)]'}`}>
                                    {/* Decorative Line border on Left */}
                                    <div className={`absolute left-0 top-0 bottom-0 w-[5px] rounded-l-[20px] opacity-90 transition-all ${row.validationErrors?.length ? 'bg-red-500' : index === 0 ? 'bg-gradient-to-b from-blue-500 to-indigo-500 w-[6px]' : 'bg-gradient-to-b from-gray-300 to-gray-200 group-hover:bg-blue-400 group-hover:w-[6px]'}`}></div>

                                    <div className={`flex justify-between items-center -mx-5 -mt-5 p-3.5 px-5 mb-3 border-b ${index === 0 ? 'bg-gradient-to-r from-blue-50/80 to-transparent border-blue-100/60' : 'bg-gray-50/50 border-gray-100'}`}>
                                        <div className={`flex items-center gap-2 border px-2.5 py-1.5 rounded-[12px] ${index === 0 ? 'border-blue-200 bg-white shadow-sm' : 'border-gray-200/80 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.02)]'}`}>
                                            <span className={`flex items-center justify-center h-6 w-6 rounded-[8px] text-[11px] font-black shadow-sm ${index === 0 ? 'bg-blue-600 text-white shadow-blue-300' : 'bg-gray-100 text-gray-600'}`}>
                                                {index + 1}
                                            </span>
                                            <span className={`text-[10px] font-black uppercase tracking-[0.1em] ${index === 0 ? 'text-blue-700' : 'text-gray-500'}`}>
                                                {index === 0 ? 'MASTER ROW' : `SUB BARIS`}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="bg-red-600/90 text-[10px] sm:text-xs text-white px-2 py-1 rounded font-black shadow-sm uppercase tracking-wider">
                                                {row.type}
                                            </span>
                                            <Button
                                                onClick={() => handleDeleteClick(row)}
                                                className="h-8 w-8 p-0 bg-red-50 text-red-600 border border-red-100 rounded-lg active:scale-90 transition-transform flex items-center justify-center hover:bg-red-100"
                                            >
                                                <Trash2 className="h-4.5 w-4.5" />
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        {/* Nama Produk */}
                                        <div className="space-y-1">
                                            <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-0.5">
                                                <span>Pilih Produk</span>
                                                {row.stok_tersedia !== undefined && (
                                                    <span className={`px-2 py-0.5 rounded-full ${row.stok_tersedia > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                        Tersedia: {row.stok_tersedia}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="relative">
                                                {row.is_scanned ? (
                                                    <div className="h-12 w-full px-4 flex items-center border border-gray-200/80 rounded-xl bg-gray-50/80 text-sm font-bold text-gray-600 shadow-sm cursor-not-allowed truncate">
                                                        {row.nama_produk || '-'}
                                                    </div>
                                                ) : (
                                                    <CustomDropdown
                                                        value={row.nama_produk}
                                                        onChange={(e) => updateRow(row.id, 'nama_produk', e.target.value)}
                                                        options={validProducts}
                                                        placeholder="Cari atau tempel SKU..."
                                                        className={`${row.validationErrors?.includes('nama_produk') || row.validationErrors?.includes('nama_produk_invalid') ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-white'} h-12 rounded-xl text-sm shadow-sm font-semibold`}
                                                        loading={dropdownLoading}
                                                    />
                                                )}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            {/* Jumlah */}
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-0.5">Jumlah</label>
                                                <input
                                                    type="text"
                                                    pattern="[0-9]*"
                                                    inputMode="numeric"
                                                    value={row.jumlah === 0 ? '' : row.jumlah}
                                                    onChange={(e) => {
                                                        const newVal = e.target.value.replace(/[^0-9]/g, '');
                                                        updateRow(row.id, 'jumlah', parseInt(newVal) || 0);
                                                    }}
                                                    className={`w-full h-12 px-3 border rounded-xl font-black text-lg text-center shadow-sm ${row.validationErrors?.includes('jumlah') ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 bg-white text-gray-800'}`}
                                                    placeholder="0"
                                                />
                                            </div>

                                            {/* Tanggal Input */}
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-1">Tgl Nota</label>
                                                {index === 0 ? (
                                                    <input
                                                        type="date"
                                                        value={convertToInputDate(row.tanggal)}
                                                        onChange={(e) => {
                                                            const newDate = convertFromInputDate(e.target.value);
                                                            setRows(rows.map(r => ({ ...r, tanggal: newDate })));
                                                        }}
                                                        className={`w-full h-12 px-2 border rounded-xl text-sm font-bold shadow-sm bg-white border-blue-200 text-blue-700 ring-2 ring-blue-50`}
                                                    />
                                                ) : (
                                                    <div className="h-12 w-full px-4 flex items-center border border-gray-200/80 rounded-xl bg-gray-50/80 text-sm font-bold text-gray-500 shadow-sm opacity-90 cursor-not-allowed">
                                                        {row.tanggal || '-'}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            {/* Gudang */}
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-1">Gudang</label>
                                                {index === 0 ? (
                                                    <CustomDropdown
                                                        value={row.gudang}
                                                        onChange={(e) => setRows(rows.map(r => ({ ...r, gudang: e.target.value })))}
                                                        options={validWarehouses}
                                                        className={`h-12 rounded-xl text-sm font-bold shadow-sm border-blue-200 ring-2 ring-blue-50 bg-white`}
                                                        showClearButton={true}
                                                    />
                                                ) : (
                                                    <div className="h-12 w-full px-4 flex items-center border border-gray-200/80 rounded-xl bg-gray-50/80 text-sm font-bold text-gray-600 shadow-sm cursor-not-allowed">
                                                        {row.gudang || '-'}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Rak */}
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-1">Lokasi Rak</label>
                                                {row.is_scanned ? (
                                                    <div className="h-12 w-full px-4 flex items-center border border-gray-200/80 rounded-xl bg-gray-50/80 text-sm font-bold text-gray-600 shadow-sm cursor-not-allowed truncate">
                                                        {row.rak || '-'}
                                                    </div>
                                                ) : (
                                                    <CustomDropdown
                                                        value={row.rak}
                                                        onChange={(e) => updateRow(row.id, 'rak', e.target.value)}
                                                        options={filteredRackOptions}
                                                        className="h-12 rounded-xl text-sm font-bold bg-white border-gray-200 shadow-sm"
                                                        showClearButton={true}
                                                    />
                                                )}
                                            </div>
                                        </div>

                                        {/* Meta Info */}
                                        {(row.tgl_scan || row.user_name || row.nama_produk || row.total_stok !== undefined) && (
                                            <div className="bg-blue-600 rounded-xl p-3 flex justify-between items-center text-white shadow-md shadow-blue-100">
                                                <div className="flex flex-col">
                                                    <span className="text-[8px] uppercase opacity-70 font-bold">Total Stok</span>
                                                    <span className="text-sm font-black tracking-tight">{row.total_stok !== undefined ? row.total_stok : '-'}</span>
                                                </div>
                                                <div className="flex flex-col text-right">
                                                    <span className="text-[8px] uppercase opacity-70 font-bold">User / Scan</span>
                                                    <span className="text-[10px] font-bold truncate max-w-[150px]">{row.user_name || '-'} • {row.tgl_scan || '-'}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>


                {/* Bottom Spacer for Mobile Sticky Bar */}
                <div className="h-24 lg:hidden"></div>
                <ConfirmDialog
                    isOpen={deleteConfirm.isOpen}
                    onClose={() => setDeleteConfirm({ isOpen: false, itemId: '', itemName: '' })}
                    onConfirm={confirmDelete}
                    title="Konfirmasi Hapus"
                    message={`Apakah Anda yakin ingin menghapus transaksi "${deleteConfirm.itemName}"? Tindakan ini tidak dapat dibatalkan.`}
                />
                <ValidationAlert
                    isOpen={validationAlert.isOpen}
                    onClose={() => setValidationAlert({ isOpen: false, invalidCount: 0, errors: [] })}
                    invalidCount={validationAlert.invalidCount}
                    errors={validationAlert.errors}
                />
                <ConfirmDialog
                    isOpen={isClearConfirmOpen}
                    onClose={() => setIsClearConfirmOpen(false)}
                    onConfirm={confirmClearAll}
                    title="Hapus Semua Data?"
                    message="Apakah Anda yakin ingin menghapus semua data di tabel? Tindakan ini tidak dapat dibatalkan."
                    confirmText="Hapus Semua"
                />
                <Modal
                    isOpen={isMassal2ModalOpen}
                    onClose={() => {
                        setIsMassal2ModalOpen(false);
                        resetMassal2Modal();
                    }}
                    title="Tambah Massal (3 Kolom)"
                    size="6xl"
                    padding="p-0"
                >
                    <div className="flex flex-col h-auto lg:h-[70vh] min-h-[500px] p-6">
                        {/* Information Banner */}
                        <div className="mb-6 p-4 bg-blue-600 rounded-3xl text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
                                    <Layers className="h-6 w-6" />
                                </div>
                                <div>
                                    <h3 className="font-black text-lg uppercase leading-tight tracking-tight">Input Mode 3 Kolom</h3>
                                    <p className="text-blue-100 text-[10px] md:text-sm font-medium opacity-90">Produk, Jumlah, dan Lokasi Rak akan langsung terisi.</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <div className="px-5 py-2.5 bg-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/20 backdrop-blur-sm">Produk</div>
                                <div className="px-5 py-2.5 bg-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/20 backdrop-blur-sm">Jumlah</div>
                                <div className="px-5 py-2.5 bg-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/20 backdrop-blur-sm">Kode Unik</div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1 min-h-0">
                            {/* Input Column */}
                            <div className="flex flex-col h-full space-y-4">
                                <div className="flex-1 relative group">
                                    <textarea
                                        value={massal2InputText}
                                        onChange={(e) => setMassal2InputText(e.target.value)}
                                        onPaste={analyzeMassal2Paste}
                                        className="w-full h-full p-8 bg-gray-50 border-2 border-gray-100 rounded-[2.5rem] focus:outline-none focus:border-blue-400 focus:bg-white transition-all font-mono text-sm leading-relaxed shadow-inner resize-none group-hover:border-gray-200"
                                        placeholder="Paste di sini...&#10;&#10;BARANG-A	10	SN-12345&#10;BARANG-B	50	SN-67890"
                                    />
                                    <div className="absolute top-6 right-6 pointer-events-none">
                                        <div className="bg-blue-600 text-white text-[10px] font-black px-4 py-1.5 rounded-full shadow-lg uppercase tracking-widest animate-pulse">Ready to Paste</div>
                                    </div>
                                </div>

                                <div className="flex gap-4">
                                    <Button
                                        onClick={handleMassal2Analyze}
                                        className="flex-1 h-16 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl shadow-xl shadow-blue-100 transition-all active:scale-95 uppercase tracking-widest text-sm flex items-center justify-center gap-3"
                                    >
                                        <RefreshCw className="h-5 w-5" /> Analisa Sekarang
                                    </Button>
                                    <Button
                                        onClick={resetMassal2Modal}
                                        variant="outline"
                                        className="h-16 px-8 border-2 border-gray-100 text-gray-400 hover:bg-gray-50 rounded-2xl transition-all active:scale-95"
                                    >
                                        <Trash2 className="h-5 w-5" />
                                    </Button>
                                </div>
                            </div>

                            {/* Preview Column */}
                            <div className="flex flex-col h-full bg-white rounded-[2.5rem] border border-gray-100 shadow-2xl overflow-hidden">
                                <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                                    <div>
                                        <h4 className="font-black text-xs uppercase tracking-[0.2em] text-gray-400">Preview Analisis</h4>
                                        <p className="text-[10px] font-black text-blue-500 uppercase mt-1.5 tracking-tighter">Lokasi rak akan disesuaikan otomatis</p>
                                    </div>
                                    <div className="flex gap-3">
                                        <div className="px-4 py-2 bg-blue-50 text-blue-600 rounded-2xl text-xs font-black border border-blue-100">
                                            {massal2AnalysisResult.berhasil} ✓
                                        </div>
                                        <div className="px-4 py-2 bg-rose-50 text-rose-600 rounded-2xl text-xs font-black border border-rose-100">
                                            {massal2AnalysisResult.gagal} ✗
                                        </div>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-auto p-6 bg-gray-50/30">
                                    {massal2AnalyzedData.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-gray-200 gap-6 grayscale opacity-60">
                                            <Edit3 className="h-24 w-24 stroke-[1]" />
                                            <p className="text-[10px] font-black uppercase tracking-[0.3em]">Menunggu Input Data...</p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 gap-3">
                                            {massal2AnalyzedData.map((item, idx) => (
                                                <div key={idx} className="bg-white p-5 rounded-3xl border border-gray-50 shadow-sm flex items-center justify-between group hover:border-emerald-200 transition-all duration-300">
                                                    <div className="flex items-center gap-5">
                                                        <div className="h-12 w-12 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center font-black group-hover:bg-emerald-600 group-hover:text-white transition-all duration-300">
                                                            {idx + 1}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-black text-gray-700 leading-tight group-hover:text-emerald-900 transition-colors uppercase tracking-tight">{item.nama_produk}</p>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <Layers className="h-3 w-3 text-blue-500" />
                                                                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-tighter">{item.unique_code}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right bg-gray-50 px-5 py-2.5 rounded-2xl group-hover:bg-blue-50 transition-colors">
                                                        <p className="text-[8px] font-black text-gray-300 uppercase leading-none mb-1 group-hover:text-blue-300">QUANTITY</p>
                                                        <p className="text-lg font-black text-emerald-600 group-hover:text-blue-700">{item.jumlah}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="p-6 bg-white border-t border-gray-50">
                                    <Button
                                        onClick={handleMassal2Add}
                                        disabled={massal2AnalyzedData.length === 0}
                                        className="w-full h-16 bg-gradient-to-r from-emerald-500 to-emerald-700 hover:from-emerald-600 hover:to-emerald-800 text-white font-black rounded-3xl shadow-2xl shadow-emerald-100 transition-all active:scale-95 flex items-center justify-center gap-4 disabled:opacity-40 disabled:grayscale uppercase tracking-[0.2em] text-sm"
                                    >
                                        <Send className="h-6 w-6" /> Masukkan ke Antrean
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </Modal>

                <Modal
                    isOpen={isMassal3ModalOpen}
                    onClose={() => {
                        setIsMassal3ModalOpen(false);
                        resetMassal3Modal();
                    }}
                    title="Tambah Massal 3 (Tutorial & Karton)"
                    size="6xl"
                    padding="p-0"
                >
                    <div className="flex flex-col h-auto lg:h-[75vh] min-h-[600px] p-6 bg-gray-50/50">
                        {/* Tutorial Steps */}
                        <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-white p-4 rounded-3xl border border-blue-100 shadow-sm flex items-start gap-4">
                                <div className="h-10 w-10 bg-blue-600 text-white rounded-2xl flex items-center justify-center font-black flex-shrink-0 shadow-lg shadow-blue-200">1</div>
                                <div>
                                    <h4 className="font-black text-xs uppercase tracking-tight text-blue-600 mb-1">Siapkan Excel</h4>
                                    <p className="text-[10px] text-gray-500 font-medium leading-relaxed">Siapkan 3 kolom di Excel: <span className="font-bold">SKU</span>, <span className="font-bold">QTY PCS</span>, dan <span className="font-bold">QTY KARTON</span>.</p>
                                </div>
                            </div>
                            <div className="bg-white p-4 rounded-3xl border border-emerald-100 shadow-sm flex items-start gap-4">
                                <div className="h-10 w-10 bg-emerald-500 text-white rounded-2xl flex items-center justify-center font-black flex-shrink-0 shadow-lg shadow-emerald-200">2</div>
                                <div>
                                    <h4 className="font-black text-xs uppercase tracking-tight text-emerald-600 mb-1">Copy & Paste</h4>
                                    <p className="text-[10px] text-gray-500 font-medium leading-relaxed">Blok data tsb di Excel, Copy (Ctrl+C), lalu Paste (Ctrl+V) ke kotak input di bawah ini.</p>
                                </div>
                            </div>
                            <div className="bg-white p-4 rounded-3xl border border-purple-100 shadow-sm flex items-start gap-4">
                                <div className="h-10 w-10 bg-purple-500 text-white rounded-2xl flex items-center justify-center font-black flex-shrink-0 shadow-lg shadow-purple-200">3</div>
                                <div>
                                    <h4 className="font-black text-xs uppercase tracking-tight text-purple-600 mb-1">Analisa & Tambah</h4>
                                    <p className="text-[10px] text-gray-500 font-medium leading-relaxed">Klik 'Analisa' untuk cek data, lalu klik 'Tambah' untuk memasukkan ke antrean sistem.</p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1 min-h-0">
                            {/* Input Column */}
                            <div className="flex flex-col h-full space-y-4">
                                <div className="flex-1 relative group">
                                    <textarea
                                        value={massal3InputText}
                                        onChange={(e) => setMassal3InputText(e.target.value)}
                                        onPaste={analyzeMassal3Paste}
                                        className="w-full h-full p-8 bg-white border-2 border-gray-100 rounded-[2.5rem] focus:outline-none focus:border-blue-500 transition-all font-mono text-sm leading-relaxed shadow-xl resize-none"
                                        placeholder="Paste 3 Kolom dari Excel di sini...&#10;&#10;SKU-A	120	5&#10;SKU-B	240	10"
                                    />
                                    <div className="absolute top-6 right-6">
                                        <div className="bg-blue-600 text-white text-[10px] font-black px-4 py-1.5 rounded-full shadow-lg uppercase tracking-widest">Input Area (3 Kolom)</div>
                                    </div>
                                </div>

                                <div className="flex gap-4">
                                    <Button
                                        onClick={handleMassal3Analyze}
                                        className="flex-1 h-16 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl shadow-xl shadow-blue-100 transition-all active:scale-95 uppercase tracking-widest text-sm flex items-center justify-center gap-3"
                                    >
                                        <RefreshCw className="h-5 w-5" /> Analisa Sekarang
                                    </Button>
                                    <Button
                                        onClick={resetMassal3Modal}
                                        variant="outline"
                                        className="h-16 px-8 border-2 border-gray-100 text-gray-400 hover:bg-gray-50 rounded-2xl transition-all active:scale-95"
                                    >
                                        <Trash2 className="h-5 w-5" />
                                    </Button>
                                </div>
                            </div>

                            {/* Preview Column */}
                            <div className="flex flex-col h-full bg-white rounded-[2.5rem] border border-gray-100 shadow-2xl overflow-hidden">
                                <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-blue-50/30">
                                    <h4 className="font-black text-xs uppercase tracking-[0.2em] text-blue-600 flex items-center gap-2">
                                        <Layers className="h-4 w-4" /> Preview Data Massal 3
                                    </h4>
                                    <div className="flex gap-2">
                                        <div className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-xl text-[10px] font-black border border-emerald-200">
                                            {massal3AnalysisResult.berhasil} ✓
                                        </div>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-auto p-6 space-y-3">
                                    {massal3AnalyzedData.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-gray-200 gap-4 opacity-40">
                                            <Package className="h-20 w-20 stroke-[1]" />
                                            <p className="text-[10px] font-black uppercase tracking-[0.2em]">Paste Data Excel Anda</p>
                                        </div>
                                    ) : (
                                        massal3AnalyzedData.map((item, idx) => (
                                            <div key={idx} className="bg-gray-50/50 p-4 rounded-3xl border border-gray-100 flex items-center justify-between group hover:border-blue-200 transition-all">
                                                <div className="flex items-center gap-4">
                                                    <div className="h-10 w-10 bg-white border border-gray-100 text-blue-600 rounded-2xl flex items-center justify-center font-black text-xs shadow-sm">
                                                        {idx + 1}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-black text-gray-800 uppercase leading-none mb-1">{item.sku}</p>
                                                        <p className="text-[9px] font-bold text-gray-400 uppercase">Karton: {item.qty_karton}</p>
                                                    </div>
                                                </div>
                                                <div className="bg-blue-600 text-white px-4 py-2 rounded-2xl">
                                                    <p className="text-[8px] font-black opacity-70 uppercase leading-none mb-0.5">PCS</p>
                                                    <p className="text-sm font-black">{item.qty_pcs}</p>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>

                                <div className="p-6 bg-gray-50/80 border-t border-gray-100">
                                    <Button
                                        onClick={handleMassal3Add}
                                        disabled={massal3AnalyzedData.length === 0}
                                        className="w-full h-16 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-3xl shadow-2xl shadow-blue-100 transition-all active:scale-95 flex items-center justify-center gap-4 disabled:opacity-40 uppercase tracking-[0.15em] text-sm"
                                    >
                                        <Plus className="h-6 w-6" /> Tambah Ke Antrean Outbound
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </Modal>

                <Modal
                    isOpen={isBulkModalOpen}
                    onClose={() => {
                        setIsBulkModalOpen(false);
                        resetBulkModal();
                    }}
                    title={`Tambah Massal (${bulkFormat === 'format1' ? '2 Kolom' : bulkFormat === 'format2' ? '4 Kolom' : bulkFormat === 'format_scan2' ? 'Scan 1' : bulkFormat === 'format_scan' ? 'Scan 2' : 'Massal'})`}
                    size="6xl"
                >
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Silakan Masukkan Data
                                </label>
                                <textarea
                                    value={bulkInputText}
                                    onChange={(e) => setBulkInputText(e.target.value)}
                                    className="w-full h-80 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                    placeholder={
                                        bulkFormat === 'format1'
                                            ? `Copy dan paste data dari Excel/Spreadsheet di sini...\nFormat: Nama Produk [TAB] Jumlah\n\nContoh:\nPULPEN-BP-001\t100\nPENSIL-PC-002\t50\nBUKU-BK-003\t25`
                                            : bulkFormat === 'format2'
                                                ? `Copy dan paste data dari Excel/Spreadsheet di sini...\nFormat: Nama Produk [TAB] Jumlah [TAB] Tgl Scan [TAB] User\n\nContoh:\nPENCILCASE-PC-5017\t24\t06/09/2025\trianambong@gmail.com`
                                                : bulkFormat === 'format_scan2'
                                                    ? `Copy dan paste data dari Excel/Spreadsheet di sini...\nFormat: Nama Produk [TAB] Rak [TAB] Tgl Scan [TAB] User\n\nContoh:\nPULPENC-CLP-04\tUTAMA\t06/09/2025\tgudang@gmail.com`
                                                    : bulkFormat === 'format_scan'
                                                        ? `Copy dan paste data dari Excel/Spreadsheet di sini...\nFormat: Nama Produk [TAB] Jumlah [TAB] Rak [TAB] Tgl Scan [TAB] User\n\nContoh:\nPULPENC-CLP-04\t10\tUTAMA\t06/09/2025\tgudang@gmail.com`
                                                        : bulkFormat === 'format_sn'
                                                            ? `Copy dan paste data dari Excel/Spreadsheet di sini...\nFormat: Tanggal [TAB] SKU [TAB] Kode Unik\n\nContoh:\n09-05-2026\tCASHBOX-CB-36A/BLACK\tSN-MOYLV22R-MZ8K`
                                                            : `Copy dan paste data dari Excel/Spreadsheet di sini...\nFormat: Nama Produk [TAB] Jumlah\n\nContoh:\nPULPENC-CLP-04\t10`
                                    }
                                />
                            </div>
                            <div className="flex justify-center">
                                <Button
                                    onClick={handleBulkAnalyze}
                                    className="h-12 px-10 bg-gradient-to-br from-indigo-500 to-violet-700 hover:from-indigo-600 hover:to-violet-800 text-white font-bold rounded-xl shadow-[0_4px_15px_rgba(99,102,241,0.4)] transition-all duration-300 transform hover:scale-105 active:scale-95 border border-white/20 backdrop-blur-md"
                                >
                                    Analisa
                                </Button>
                            </div>
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <h4 className="font-semibold text-blue-800 mb-2">Petunjuk Penggunaan:</h4>
                                <div className="text-sm text-blue-700 space-y-1">
                                    {bulkFormat === 'format1' ? (
                                        <>
                                            <p><strong>Kolom 1:</strong> Nama Produk (wajib)</p>
                                            <p><strong>Kolom 2:</strong> Jumlah (wajib, harus ≥ 0)</p>
                                            <p><strong>Format:</strong> Copy data dari Excel dengan 2 kolom, paste di area input</p>
                                        </>
                                    ) : bulkFormat === 'format2' ? (
                                        <>
                                            <p><strong>Kolom 1:</strong> Nama Produk (wajib)</p>
                                            <p><strong>Kolom 2:</strong> Jumlah (wajib, harus ≥ 0)</p>
                                            <p><strong>Kolom 3:</strong> Tgl Scan (opsional, format DD/MM/YYYY)</p>
                                            <p><strong>Kolom 4:</strong> User (opsional)</p>
                                            <p><strong>Format:</strong> Copy data dari Excel dengan 4 kolom, paste di area input</p>
                                        </>
                                    ) : bulkFormat === 'format_scan2' ? (
                                        <>
                                            <p><strong>Kolom 1:</strong> Nama Produk (wajib)</p>
                                            <p><strong>Kolom 2:</strong> Rak (wajib)</p>
                                            <p><strong>Kolom 3:</strong> Tgl Scan (opsional, format DD/MM/YYYY)</p>
                                            <p><strong>Kolom 4:</strong> User (opsional)</p>
                                            <p><strong>Format:</strong> Copy data dari Excel dengan 4 kolom, paste di area input. Jumlah akan otomatis terisi 1.</p>
                                        </>
                                    ) : bulkFormat === 'format_scan' ? (
                                        <>
                                            <p><strong>Kolom 1:</strong> Nama Produk (wajib)</p>
                                            <p><strong>Kolom 2:</strong> Jumlah (wajib, harus &gt; 0)</p>
                                            <p><strong>Kolom 3:</strong> Rak (wajib)</p>
                                            <p><strong>Kolom 4:</strong> Tgl Scan (wajib, format DD/MM/YYYY)</p>
                                            <p><strong>Kolom 5:</strong> User (wajib)</p>
                                            <p><strong>Format:</strong> Copy data dari Excel dengan 5 kolom, paste di area input.</p>
                                        </>
                                    ) : bulkFormat === 'format_sn' ? (
                                        <>
                                            <p><strong>Kolom 1:</strong> Tanggal (wajib)</p>
                                            <p><strong>Kolom 2:</strong> SKU (wajib)</p>
                                            <p><strong>Kolom 3:</strong> Kode Unik / SN (wajib)</p>
                                            <p><strong>Format:</strong> Copy data dari Excel dengan 3 kolom (Tgl, SKU, SN).</p>
                                        </>
                                    ) : (
                                        <>
                                            <p><strong>Kolom 1:</strong> Nama Produk (wajib)</p>
                                            <p><strong>Kolom 2:</strong> Jumlah (wajib, harus &gt; 0)</p>
                                            <p><strong>Format:</strong> Copy data dari Excel dengan 2 kolom, paste di area input. Rak akan otomatis menggunakan default/dikosongkan.</p>
                                        </>
                                    )}
                                    <p><strong>Catatan:</strong> Sistem akan menggunakan Rak Default jika tidak diisi</p>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <div className="bg-gray-100 rounded-lg p-4 h-80">
                                <div className="flex justify-between items-center mb-4">
                                    <h4 className="font-semibold text-gray-800">Hasil Analisis</h4>
                                    {(bulkFormat === 'format1' && analyzedData.length > 0) || (bulkFormat === 'format2' && analyzedData2.length > 0) || (bulkFormat === 'format_scan2' && analyzedDataScan2.length > 0) || (bulkFormat === 'format_scan' && analyzedDataScan.length > 0) || (bulkFormat === 'format_massal' && analyzedDataMassal.length > 0) || (bulkFormat === 'format_sn' && analyzedDataSN.length > 0) ? (
                                        <div className="text-sm text-gray-600">
                                            <span className="text-green-600 font-medium">Berhasil: {bulkAnalysisResult.berhasil}</span>
                                            {bulkAnalysisResult.gagal > 0 && (
                                                <span className="text-red-600 font-medium ml-4">Gagal: {bulkAnalysisResult.gagal}</span>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                            <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mb-4">
                                                📋
                                            </div>
                                            <p className="text-center">Tidak ada data</p>
                                            <p className="text-sm text-center mt-1">Masukkan data dan klik Analisa</p>
                                        </div>
                                    )}
                                </div>
                                <div className="overflow-auto h-full">
                                    <table className="w-full text-sm">
                                        <thead className="bg-blue-600 text-white sticky top-0">
                                            <tr>
                                                <th className="px-3 py-2 text-left">Nama Produk</th>
                                                {bulkFormat !== 'format_scan2' && <th className="px-3 py-2 text-center">Jumlah</th>}
                                                {(bulkFormat === 'format_scan2' || bulkFormat === 'format_scan' || bulkFormat === 'format_massal') && <th className="px-3 py-2 text-left">Rak</th>}
                                                {(bulkFormat === 'format2' || bulkFormat === 'format_scan2' || bulkFormat === 'format_scan') && (
                                                    <>
                                                        <th className="px-3 py-2 text-left">Tgl Scan</th>
                                                        <th className="px-3 py-2 text-left">User</th>
                                                    </>
                                                )}
                                                {bulkFormat === 'format_sn' && (
                                                    <>
                                                        <th className="px-3 py-2 text-left">Tanggal</th>
                                                        <th className="px-3 py-2 text-left">SN / Kode Unik</th>
                                                    </>
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {bulkFormat === 'format1' && analyzedData.map((item, index) => (
                                                <tr key={index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b`}>
                                                    <td className="px-3 py-2">{item.nama_produk}</td>
                                                    <td className="px-3 py-2 text-center font-medium">{item.jumlah}</td>
                                                </tr>
                                            ))}
                                            {bulkFormat === 'format2' && analyzedData2.map((item, index) => (
                                                <tr key={index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b`}>
                                                    <td className="px-3 py-2">{item.nama_produk}</td>
                                                    <td className="px-3 py-2 text-center font-medium">{item.jumlah}</td>
                                                    <td className="px-3 py-2">{item.tgl_scan}</td>
                                                    <td className="px-3 py-2">{item.user_name}</td>
                                                </tr>
                                            ))}
                                            {bulkFormat === 'format_scan2' && analyzedDataScan2.map((item, index) => (
                                                <tr key={index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b`}>
                                                    <td className="px-3 py-2">{item.nama_produk}</td>
                                                    <td className="px-3 py-2 text-center font-medium">{item.rak}</td>
                                                    <td className="px-3 py-2">{item.tgl_scan}</td>
                                                    <td className="px-3 py-2">{item.user_name}</td>
                                                </tr>
                                            ))}
                                            {bulkFormat === 'format_scan' && analyzedDataScan.map((item, index) => (
                                                <tr key={index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b`}>
                                                    <td className="px-3 py-2">{item.nama_produk}</td>
                                                    <td className="px-3 py-2 text-center font-medium">{item.jumlah}</td>
                                                    <td className="px-3 py-2">{item.rak}</td>
                                                    <td className="px-3 py-2">{item.tgl_scan}</td>
                                                    <td className="px-3 py-2">{item.user_name}</td>
                                                </tr>
                                            ))}
                                            {bulkFormat === 'format_massal' && analyzedDataMassal.map((item, index) => (
                                                <tr key={index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b`}>
                                                    <td className="px-3 py-2">{item.nama_produk}</td>
                                                    <td className="px-3 py-2 text-center font-medium">{item.jumlah}</td>
                                                    <td className="px-3 py-2">{item.rak}</td>
                                                </tr>
                                            ))}
                                            {bulkFormat === 'format_sn' && analyzedDataSN.map((item, index) => (
                                                <tr key={index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b`}>
                                                    <td className="px-3 py-2">{item.nama_produk}</td>
                                                    <td className="px-3 py-2">{item.tgl_scan}</td>
                                                    <td className="px-3 py-2 font-mono text-xs">{item.unique_code}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <div className="flex justify-end space-x-3">
                                <Button
                                    onClick={handleBulkAdd}
                                    disabled={(bulkFormat === 'format1' && analyzedData.length === 0) || (bulkFormat === 'format2' && analyzedData2.length === 0) || (bulkFormat === 'format_scan2' && analyzedDataScan2.length === 0) || (bulkFormat === 'format_scan' && analyzedDataScan.length === 0) || (bulkFormat === 'format_massal' && analyzedDataMassal.length === 0) || (bulkFormat === 'format_sn' && analyzedDataSN.length === 0)}
                                    className="h-12 px-8 bg-gradient-to-br from-emerald-500 to-green-700 hover:from-emerald-600 hover:to-green-800 text-white font-bold rounded-xl shadow-[0_4px_15px_rgba(16,185,129,0.4)] transition-all duration-300 transform hover:scale-105 active:scale-95 border border-white/20 backdrop-blur-md"
                                >
                                    Tambahkan ke daftar Outbound
                                </Button>
                            </div>
                        </div>
                    </div>
                </Modal>

                {/* PIN Modal */}
                <Modal
                    isOpen={isPinModalOpen}
                    onClose={() => {
                        setIsPinModalOpen(false);
                        setPendingFormat(null);
                        setPinInput('');
                    }}
                    title="Masukkan PIN"
                    size="sm"
                >
                    <form onSubmit={handlePinSubmit} className="space-y-4 p-4">
                        <div className="text-center">
                            <p className="text-gray-600 mb-4">Silakan masukkan PIN untuk mengakses fitur ini</p>
                            <input
                                type="password"
                                value={pinInput}
                                onChange={(e) => setPinInput(e.target.value)}
                                className="w-full text-center text-2xl tracking-widest px-3 py-2 border-2 border-blue-500 rounded-md focus:outline-none focus:ring-4 focus:ring-blue-100"
                                placeholder="****"
                                maxLength={4}
                                autoFocus
                            />
                        </div>
                        <div className="flex justify-center pt-2">
                            <Button
                                type="submit"
                                className="w-full h-12 bg-gradient-to-br from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white font-bold rounded-xl shadow-[0_4px_15px_rgba(37,99,235,0.4)] transition-all duration-300 transform active:scale-95 border border-white/20 backdrop-blur-md"
                            >
                                Verifikasi PIN
                            </Button>
                        </div>
                    </form>
                </Modal>

                {/* Mobile Bottom Floating Action Dock */}
                <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 h-[88px] pointer-events-none bg-gradient-to-t from-white via-white/95 to-transparent"></div>
                <div className="lg:hidden fixed bottom-2.5 inset-x-2 z-40 animate-in fade-in slide-in-from-bottom-5 duration-500 delay-150 fill-mode-both">
                    <div className="bg-gray-900/95 backdrop-blur-2xl rounded-2xl shadow-[0_16px_50px_rgba(0,0,0,0.3)] p-2 border border-gray-700/50">
                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                            <button
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                                className="flex items-center justify-center gap-1.5 w-[calc(33.333vw-16px)] h-[58px] px-1 flex-shrink-0 rounded-xl bg-emerald-500 active:bg-emerald-600 text-white active:scale-95 transition-all disabled:opacity-50 focus:outline-none"
                            >
                                <Send className={`h-5 w-5 ${isSubmitting ? 'animate-pulse' : ''}`} />
                                <span className="text-[12px] font-bold uppercase tracking-wider">{isSubmitting ? '...' : 'Kirim'}</span>
                            </button>

                            <button
                                onClick={addRow}
                                className="flex items-center justify-center gap-1.5 w-[calc(33.333vw-16px)] h-[58px] px-1 flex-shrink-0 rounded-xl bg-gray-700/80 active:bg-gray-600 text-white active:scale-95 transition-all focus:outline-none"
                            >
                                <Plus className="h-5 w-5" />
                                <span className="text-[12px] font-bold uppercase tracking-wider">Baris</span>
                            </button>

                            <button
                                onClick={add50Rows}
                                className="flex items-center justify-center gap-1.5 w-[calc(33.333vw-16px)] h-[58px] px-1 flex-shrink-0 rounded-xl bg-gray-700/80 active:bg-gray-600 text-white active:scale-95 transition-all focus:outline-none"
                            >
                                <Layers className="h-5 w-5" />
                                <span className="text-[12px] font-bold uppercase tracking-wider">+50</span>
                            </button>

                            <button
                                onClick={penyesuaian}
                                className="flex items-center justify-center gap-1.5 w-[calc(33.333vw-16px)] h-[58px] px-1 flex-shrink-0 rounded-xl bg-cyan-600 active:bg-cyan-700 text-white active:scale-95 transition-all focus:outline-none shadow-md"
                            >
                                <Filter className="h-5 w-5" />
                                <span className="text-[12px] font-bold uppercase tracking-wider">Rapikan</span>
                            </button>

                            <button
                                onClick={handleKirimPenyesuaian}
                                className="flex items-center justify-center gap-1.5 w-[calc(33.333vw-16px)] h-[58px] px-1 flex-shrink-0 rounded-xl bg-amber-500 active:bg-amber-600 text-white active:scale-95 transition-all focus:outline-none"
                            >
                                <Tag className="h-5 w-5" />
                                <span className="text-[12px] font-bold uppercase tracking-wider">Adjust</span>
                            </button>

                            <button
                                onClick={handleMoveMinusStock}
                                className="flex items-center justify-center gap-1.5 w-[calc(33.333vw-16px)] h-[58px] px-1 flex-shrink-0 rounded-xl bg-blue-500 active:bg-blue-600 text-white active:scale-95 transition-all focus:outline-none"
                            >
                                <MoveRight className="h-5 w-5" />
                                <span className="text-[12px] font-bold uppercase tracking-wider">Move</span>
                            </button>

                            <button
                                onClick={handleMoveToQuarantine}
                                className="flex items-center justify-center gap-1.5 w-[calc(33.333vw-16px)] h-[58px] px-1 flex-shrink-0 rounded-xl bg-rose-500 active:bg-rose-600 text-white active:scale-95 transition-all focus:outline-none"
                            >
                                <ShieldAlert className="h-5 w-5" />
                                <span className="text-[12px] font-bold uppercase tracking-wider">Karantin</span>
                            </button>

                            {devMode && (
                                <>
                                    <button
                                        onClick={openMassal2Modal}
                                        className="flex items-center justify-center gap-1.5 w-[calc(33.333vw-16px)] h-[58px] px-1 flex-shrink-0 rounded-xl bg-violet-500 active:bg-violet-600 text-white active:scale-95 transition-all focus:outline-none"
                                    >
                                        <Layers className="h-5 w-5" />
                                        <span className="text-[12px] font-bold uppercase tracking-wider">Massal 2</span>
                                    </button>
                                    <button
                                        onClick={openMassal3Modal}
                                        className="flex items-center justify-center gap-1.5 w-[calc(33.333vw-16px)] h-[58px] px-1 flex-shrink-0 rounded-xl bg-emerald-500 active:bg-emerald-600 text-white active:scale-95 transition-all focus:outline-none"
                                    >
                                        <Layers className="h-5 w-5" />
                                        <span className="text-[12px] font-bold uppercase tracking-wider">Massal 3</span>
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {showScanner && (
                    <BarcodeScanner
                        onScan={handleScanResult}
                        onClose={() => setShowScanner(false)}
                    />
                )}

                {/* ===== MOBILE: Floating Draggable Camera FAB ===== */}
                <div
                    className="lg:hidden fixed z-[80] touch-none select-none"
                    style={{ left: fabPos.x, bottom: fabPos.y }}
                    onPointerDown={handleFabPointerDown}
                    onPointerMove={handleFabPointerMove}
                    onPointerUp={finishFabAction}
                    onPointerCancel={finishFabAction}
                    onPointerLeave={finishFabAction}
                >
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-[0_8px_30px_rgba(79,70,229,0.5)] flex items-center justify-center active:scale-90 transition-transform border-2 border-white/30 cursor-grab">
                        <Camera className="h-7 w-7 text-white drop-shadow-md" />
                    </div>
                </div>

                {/* ===== MOBILE: Scan Confirmation Modal ===== */}
                {showScanModal && (
                    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4">
                        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setShowScanModal(false)} />
                        <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm mx-auto overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                            {/* Header */}
                            <div className="flex items-center gap-3 p-5 pb-4">
                                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
                                    <Plus className="h-6 w-6 text-white" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-lg font-black text-gray-900 tracking-tight">Add Cut Stock</h3>
                                    <p className="text-xs text-gray-500">Record a new stock withdrawal</p>
                                </div>
                                <button onClick={() => setShowScanModal(false)} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors">
                                    <X className="h-5 w-5 text-gray-400" />
                                </button>
                            </div>

                            {/* Body */}
                            <div className="px-5 pb-5 space-y-4">
                                {/* Scan Barcode SKU */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                                        <span className="text-blue-500">◎</span>
                                        <span>Scan Barcode SKU</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={scanModalSku}
                                            onChange={(e) => setScanModalSku(e.target.value)}
                                            readOnly
                                            className="flex-1 h-12 px-4 border border-gray-200 rounded-xl text-sm font-bold text-gray-500 bg-gray-100 cursor-not-allowed outline-none transition-all"
                                            placeholder="SKU akan terisi otomatis..."
                                        />
                                        <button
                                            onClick={() => setShowScanner(true)}
                                            className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center active:scale-95 transition-all hover:bg-blue-100"
                                        >
                                            <Camera className="h-5 w-5" />
                                        </button>
                                    </div>
                                    {/* Show extracted date if found */}
                                    {scanModalTglScan && (
                                        <div className="flex items-center gap-2 text-xs text-gray-500 pl-1">
                                            <span className="text-blue-400">📅</span>
                                            <span>Tgl Scan: <strong className="text-gray-700">{scanModalTglScan}</strong></span>
                                        </div>
                                    )}
                                </div>

                                {/* Scan Barcode Rak */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                                            <span className="text-blue-500">◉</span>
                                            <span>Scan Barcode Rak</span>
                                        </div>
                                        {scanModalLoading && (
                                            <span className="text-[10px] font-bold text-blue-500 uppercase animate-pulse">Mencari...</span>
                                        )}
                                        {scanModalStatus === 'found' && !scanModalLoading && (
                                            <span className="text-[10px] font-bold text-green-600 uppercase bg-green-50 px-2 py-0.5 rounded-full">✓ Auto-filled</span>
                                        )}
                                        {scanModalStatus === 'not_found' && !scanModalLoading && (
                                            <span className="text-[10px] font-bold text-orange-500 uppercase bg-orange-50 px-2 py-0.5 rounded-full">Manual</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="relative flex-1">
                                            <input
                                                type="text"
                                                value={scanModalRak}
                                                onChange={(e) => {
                                                    setScanModalRak(e.target.value.toUpperCase());
                                                    setScanModalStatus('idle');
                                                }}
                                                readOnly={scanModalStatus === 'found' && scanModalRak !== ''}
                                                className={`w-full h-12 px-4 pr-9 border rounded-xl text-sm font-bold outline-none transition-all ${
                                                    scanModalRak 
                                                        ? 'border-green-200 bg-green-50 text-green-800' 
                                                        : 'border-blue-300 bg-white text-gray-800 focus:ring-2 focus:ring-blue-500'
                                                } ${(scanModalStatus === 'found' && scanModalRak !== '') ? 'cursor-not-allowed opacity-90' : ''}`}
                                                placeholder="Ketik lokasi rak..."
                                            />
                                            {scanModalRak && (
                                                <button
                                                    onClick={() => { setScanModalRak(''); setScanModalStatus('idle'); }}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                                >
                                                    <X className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => {
                                                // Could open scanner for rak too
                                            }}
                                            className="w-12 h-12 rounded-xl bg-gray-50 border border-gray-200 text-gray-500 flex items-center justify-center active:scale-95 transition-all hover:bg-gray-100"
                                        >
                                            <Camera className="h-5 w-5" />
                                        </button>
                                    </div>
                                </div>

                                {/* Quantity */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                                        <span className="text-blue-500">#</span>
                                        <span>Quantity (Optional)</span>
                                    </div>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        value={scanModalQty}
                                        onChange={(e) => setScanModalQty(e.target.value.replace(/[^0-9]/g, ''))}
                                        className="w-full h-12 px-4 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 bg-gray-50 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:bg-white outline-none transition-all"
                                        placeholder="Leave empty for 0"
                                    />
                                </div>

                                {/* Unique Code / Serial Number */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                                        <span className="text-blue-500"><Layers className="h-4 w-4" /></span>
                                        <span>Kode Unik / Serial Number</span>
                                    </div>
                                    <input
                                        type="text"
                                        value={scanModalUniqueCode}
                                        onChange={(e) => setScanModalUniqueCode(e.target.value)}
                                        readOnly
                                        className="w-full h-12 px-4 border border-gray-200 rounded-xl text-sm font-bold text-gray-500 bg-gray-100 cursor-not-allowed outline-none transition-all"
                                        placeholder="Terisi otomatis dari scan..."
                                    />
                                </div>

                                {/* Buttons */}
                                <div className="space-y-3 pt-3">
                                    <button
                                        onClick={handleScanModalSave}
                                        disabled={scanModalLoading}
                                        className="w-full h-14 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold text-base rounded-2xl shadow-lg shadow-blue-200 active:scale-[0.97] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        Save Changes
                                    </button>
                                    <button
                                        onClick={() => setShowScanModal(false)}
                                        className="w-full h-12 bg-white border border-gray-200 text-gray-600 font-semibold rounded-2xl active:scale-[0.97] transition-all hover:bg-gray-50"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div >
        </>
    );
}
