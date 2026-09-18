import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { 
    Search, Package, CheckCircle, CheckCircle2, CheckCheck, XCircle, 
    SearchCode, ArrowDownToLine, Archive, AlertTriangle, RefreshCw, 
    QrCode, Camera, Menu, X, ChevronRight, ChevronDown, ArrowRightLeft, Loader, 
    MoveRight, Lock, MapPin, LayoutGrid, List, Sparkles, Layers, History,
    Box, ExternalLink, HelpCircle, Eye, Check, Copy, Table, Grid3X3, ShieldCheck, MessageSquare, Printer,
    Compass, ArrowUpRight
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Toast } from './ui/Toast';
import { Modal } from './ui/Modal';
import { CustomDropdown } from './ui/CustomDropdown';
import { BarcodeScanner } from './ui/BarcodeScanner';
import { cn } from '../lib/utils';
import { DatabaseService } from '../lib/DatabaseService';
import { useDatabaseConfig } from '../lib/DatabaseContext';
import { useAuth } from '../lib/AuthContext';
import { getRealtimeDateTime } from '../lib/transferDateHelper';
import { KarantinaRevisiOutModal } from './KarantinaRevisiOutModal';
import { 
    initOpnameZoneBridgeService, 
    subscribeToOpnameZones, 
    toggleOpnameZoneSession, 
    isOpnameZoneActive, 
    getTempRackForPrefix,
    ActiveOpnameZonesState,
    batchMoveToTemp,
    countRemainingTempItems,
    BatchMoveProgress
} from '../services/opnameZoneBridgeService';
import { skuConversionService } from '../services/skuConversionService';

interface StockItem {
    id: string;
    nama_produk: string;
    sku?: string;
    rak: string;
    sub_rak?: string;
    tersedia: number;
    satuan: string;
    packing: string;
    is_verified?: boolean;
}

export function CekRak2() {
    const { userRole, user, userName, userPermissions, userEmail } = useAuth();
    const { writeMode, dbMode } = useDatabaseConfig();
    const isDeveloper = userRole === 'developer' || user?.email === 'devmode';
    const isAdminOrDev = isDeveloper || userRole === 'admin' || userRole?.includes('admin');

    const [rackId, setRackId] = useState('');
    const [lastScanned, setLastScanned] = useState<string | null>(null);
    const [items, setItems] = useState<StockItem[]>([]);
    const [verifiedIds, setVerifiedIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const [itemSearchTerm, setItemSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'terkonfirmasi' | 'belum_terkonfirmasi'>('all');

    // View Mode: 'grid' (Kartu Visual) or 'table' (Tabel Rapat)
    const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

    // Main Tab state: 'opname_rak' (Cek & Scan Rak) vs 'selesai_proses' (Data Selesai Diproses Live)
    const [activeMainTab, setActiveMainTab] = useState<'opname_rak' | 'selesai_proses'>('opname_rak');
    const [finishedLogs, setFinishedLogs] = useState<any[]>([]);
    const [isLoadingFinished, setIsLoadingFinished] = useState(false);
    const [finishedSearchTerm, setFinishedSearchTerm] = useState('');

    // Interactive Rack Explorer State
    const [selectedPrefixTab, setSelectedPrefixTab] = useState<string>('ALL');
    const [explorerSearch, setExplorerSearch] = useState<string>('');
    const [pullSourceFilter, setPullSourceFilter] = useState<'TEMP' | 'ALL'>('TEMP');
    const [recentRacks, setRecentRacks] = useState<string[]>(() => {
        try {
            return JSON.parse(localStorage.getItem('stock_opname_recent_racks') || localStorage.getItem('cek_rak_2_recent_racks') || '[]');
        } catch {
            return [];
        }
    });

    // Audit / Susun Ulang State (New Flow)
    const [isAuditMode, setIsAuditMode] = useState(false);

    // Global Product Search across all racks
    const [globalSearchTerm, setGlobalSearchTerm] = useState('');
    const [globalSearchResults, setGlobalSearchResults] = useState<StockItem[]>([]);
    const [isGlobalSearching, setIsGlobalSearching] = useState(false);
    const [showGlobalResults, setShowGlobalResults] = useState(false);

    // Pull Modal State
    const [showPullModal, setShowPullModal] = useState(false);
    const [allPullableItems, setAllPullableItems] = useState<any[]>([]);
    const [pullDropdownOptions, setPullDropdownOptions] = useState<string[]>([]);
    const [isFetchingPullData, setIsFetchingPullData] = useState(false);
    const [pullSearchTerm, setPullSearchTerm] = useState('');
    const [pullSearchResults, setPullSearchResults] = useState<any[]>([]);
    const [isSearchingPull, setIsSearchingPull] = useState(false);
    const [isCompletingAudit, setIsCompletingAudit] = useState(false);

    // Pull Quantity Modal State & Barcode Count Options
    const [showPullQuantityModal, setShowPullQuantityModal] = useState(false);
    const [pullItem, setPullItem] = useState<any>(null);
    const [pullQuantity, setPullQuantity] = useState<number | ''>('');
    const [pullBoxCount, setPullBoxCount] = useState<number | ''>('');
    const [isPulling, setIsPulling] = useState(false);


    // Wadah Karantina Revisi State
    const [showKarantinaModal, setShowKarantinaModal] = useState(false);
    const [pendingKarantinaCount, setPendingKarantinaCount] = useState(0);

    // OUT History Trace (Fisik Ada Tapi Data 0) State
    const [showOutTraceModal, setShowOutTraceModal] = useState(false);
    const [outTraceSku, setOutTraceSku] = useState('');
    const [outTracePhysicalQty, setOutTracePhysicalQty] = useState<number | ''>('');
    const [outTraceLogs, setOutTraceLogs] = useState<any[]>([]);
    const [isLoadingOutLogs, setIsLoadingOutLogs] = useState(false);
    const [selectedOutLog, setSelectedOutLog] = useState<any | null>(null);
    const [isExecutingOutTrace, setIsExecutingOutTrace] = useState(false);

    // WhatsApp Report Success Modal State
    const [showWaSuccessModal, setShowWaSuccessModal] = useState(false);
    const [waReportData, setWaReportData] = useState<any | null>(null);
    const [isWaCopied, setIsWaCopied] = useState(false);

    // Thermal Print Settings state & real-time sync with Supabase & localStorage
    const [thermalPrintSettings, setThermalPrintSettings] = useState<any>(null);

    const activeUserEmail = useMemo(() => {
        return (user?.email || userEmail || 'staf@gudang').trim();
    }, [user?.email, userEmail]);

    useEffect(() => {
        if (!activeUserEmail) return;
        const loadSettings = async () => {
            const cacheKey = 'thermal_style_pref_' + encodeURIComponent(activeUserEmail);
            let initialFromCache = null;
            try {
                const cached = localStorage.getItem(cacheKey);
                if (cached) {
                    initialFromCache = JSON.parse(cached);
                    setThermalPrintSettings(initialFromCache);
                }
            } catch (e) {}

            try {
                const { data, error } = await supabase
                    .from('user_print_settings')
                    .select('settings')
                    .eq('user_email', activeUserEmail)
                    .maybeSingle();

                if (!error && data && data.settings) {
                    setThermalPrintSettings(data.settings);
                    try {
                        localStorage.setItem(cacheKey, JSON.stringify(data.settings));
                    } catch (e) {}
                }
            } catch (err) {
                console.warn('Supabase load user_print_settings error:', err);
            }
        };

        loadSettings();
    }, [activeUserEmail]);

    // Listen for postMessage from about:blank or popup print windows to sync settings to Supabase
    useEffect(() => {
        const handleMessage = async (event: MessageEvent) => {
            if (event.data && event.data.type === 'SAVE_THERMAL_PRINT_SETTINGS') {
                const { email, settings } = event.data;
                const targetEmail = email || activeUserEmail;
                if (!targetEmail || !settings) return;

                const cacheKey = 'thermal_style_pref_' + encodeURIComponent(targetEmail);
                try {
                    localStorage.setItem(cacheKey, JSON.stringify(settings));
                } catch (e) {}
                setThermalPrintSettings(settings);

                try {
                    await supabase.from('user_print_settings').upsert({
                        user_email: targetEmail,
                        settings: settings,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'user_email' });
                } catch (err) {
                    console.warn('Failed to upsert user_print_settings from print window message:', err);
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [activeUserEmail]);

    // Universal Active Opname Zone Sessions state (Real-Time Synchronized)
    const [activeOpnameZones, setActiveOpnameZones] = useState<ActiveOpnameZonesState>({});
    const [isTogglingZone, setIsTogglingZone] = useState<string | null>(null);
    const [isZonePanelExpanded, setIsZonePanelExpanded] = useState<boolean>(false);

    // Batch migration progress state
    const [showBatchProgressModal, setShowBatchProgressModal] = useState(false);
    const [batchProgress, setBatchProgress] = useState<BatchMoveProgress | null>(null);
    const [isBatchMigrating, setIsBatchMigrating] = useState(false);
    const [batchMigrationDone, setBatchMigrationDone] = useState(false);

    useEffect(() => {
        initOpnameZoneBridgeService().then(zones => {
            setActiveOpnameZones(zones || {});
        });

        const unsubscribe = subscribeToOpnameZones((zones) => {
            setActiveOpnameZones(zones || {});
        });

        return () => unsubscribe();
    }, []);

    const handleToggleZoneSession = async (prefix: string, targetActive: boolean) => {
        if (!isDeveloper) {
            setToast({
                isOpen: true,
                message: '❌ Hanya Developer yang dapat mengaktifkan/menonaktifkan Sesi Opname Zona.',
                type: 'error'
            });
            return;
        }

        const cleanPrefix = prefix.trim().toUpperCase();
        if (!cleanPrefix) return;

        // DEACTIVATION: Check remaining TEMP items first
        if (!targetActive) {
            const remaining = await countRemainingTempItems(cleanPrefix);
            let deactivateMsg = `MENYELESAIKAN Sesi Stock Opname untuk Zona ${cleanPrefix}?\n\n` +
                `✅ Sesi Zona ${cleanPrefix} akan ditutup dan validasi pemotongan stok kembali Normal.`;
            if (remaining.count > 0) {
                deactivateMsg += `\n\n⚠️ PERHATIAN: Masih ada ${remaining.count} item (total ${remaining.totalStock} pcs) di TEMP-${cleanPrefix}. ` +
                    `Item tersebut akan TETAP di TEMP-${cleanPrefix} sampai di-pull manual ke rak tujuan.`;
            }
            if (!window.confirm(deactivateMsg)) return;

            try {
                setIsTogglingZone(cleanPrefix);
                const res = await toggleOpnameZoneSession(cleanPrefix, false, activeUserEmail);
                if (res.success) {
                    setActiveOpnameZones(res.zones);
                    setToast({
                        isOpen: true,
                        message: `✅ Sesi Opname Zona ${cleanPrefix} SELESAI (Validasi Kembali Normal)`,
                        type: 'info'
                    });
                } else {
                    setToast({ isOpen: true, message: 'Gagal memperbarui status sesi opname di database.', type: 'error' });
                }
            } catch (err: any) {
                console.error('Error deactivating zone session:', err);
                setToast({ isOpen: true, message: `Error: ${err.message || 'Unknown error'}`, type: 'error' });
            } finally {
                setIsTogglingZone(null);
            }
            return;
        }

        // ACTIVATION: Confirm + batch migrate
        const activateMsg = `MEMULAI Sesi Stock Opname untuk Zona ${cleanPrefix}?\n\n` +
            `⚡ Seluruh data stock_items dari rak ${cleanPrefix}1-${cleanPrefix}999 akan dipindahkan ke TEMP-${cleanPrefix}.\n` +
            `⚡ Pemotongan stok keluar otomatis diarahkan ke TEMP-${cleanPrefix}.\n` +
            `⚡ Operasional gudang tetap berjalan normal.`;

        if (!window.confirm(activateMsg)) return;

        try {
            setIsTogglingZone(cleanPrefix);

            // Step 1: Toggle the zone session flag
            const res = await toggleOpnameZoneSession(cleanPrefix, true, activeUserEmail);
            if (!res.success) {
                setToast({ isOpen: true, message: 'Gagal memperbarui status sesi opname di database.', type: 'error' });
                setIsTogglingZone(null);
                return;
            }
            setActiveOpnameZones(res.zones);

            // Step 2: Start batch migration with progress modal
            setShowBatchProgressModal(true);
            setIsBatchMigrating(true);
            setBatchMigrationDone(false);
            setBatchProgress({ total: 0, moved: 0, errors: [], originRacks: [] });

            const result = await batchMoveToTemp(cleanPrefix, activeUserEmail, (progress) => {
                setBatchProgress({ ...progress });
            });

            setBatchProgress(result);
            setIsBatchMigrating(false);
            setBatchMigrationDone(true);

            // Update session with items_moved count
            const updatedZones = { ...res.zones };
            if (updatedZones[cleanPrefix]) {
                updatedZones[cleanPrefix] = {
                    ...updatedZones[cleanPrefix],
                    items_moved: result.moved,
                    origin_racks: result.originRacks,
                    batch_started_at: new Date().toISOString()
                };
            }
            setActiveOpnameZones(updatedZones);

            if (result.errors.length === 0) {
                setToast({
                    isOpen: true,
                    message: `⚡ Sesi Opname Zona ${cleanPrefix} AKTIF — ${result.moved}/${result.total} item dipindah ke TEMP-${cleanPrefix}`,
                    type: 'success'
                });
            } else {
                setToast({
                    isOpen: true,
                    message: `⚠️ Sesi Zona ${cleanPrefix} aktif, tapi ${result.errors.length} error selama migrasi. ${result.moved}/${result.total} berhasil.`,
                    type: 'warning'
                });
            }
        } catch (err: any) {
            console.error('Error activating zone session:', err);
            setToast({ isOpen: true, message: `Error: ${err.message || 'Unknown error'}`, type: 'error' });
            setIsBatchMigrating(false);
            setShowBatchProgressModal(false);
        } finally {
            setIsTogglingZone(null);
        }
    };

    const [rackOptions, setRackOptions] = useState<string[]>([]);
    const [showScanner, setShowScanner] = useState(false);
    const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
    const [toast, setToast] = useState<{ isOpen: boolean; message: string; type: 'success' | 'info' | 'error' | 'warning' }>({
        isOpen: false,
        message: '',
        type: 'info'
    });

    // Modal Pindah Data State
    const [showMoveModal, setShowMoveModal] = useState(false);
    const [selectedMoveItem, setSelectedMoveItem] = useState<StockItem | null>(null);
    const [moveData, setMoveData] = useState<{ rak_tujuan: string; jumlah_pindah: number | '' }>({ rak_tujuan: '', jumlah_pindah: '' });
    const [isMoving, setIsMoving] = useState(false);
    const [showRakTujuanDropdown, setShowRakTujuanDropdown] = useState(false);
    const rakTujuanInputRef = useRef<HTMLInputElement>(null);
    const rakDropdownRef = useRef<HTMLDivElement>(null);
    const submitButtonRef = useRef<HTMLButtonElement>(null);

    // Bulk Unverify (Dev Mode) State & Helpers
    const [showBulkUnverifyModal, setShowBulkUnverifyModal] = useState(false);
    const [selectedRacksToUnverify, setSelectedRacksToUnverify] = useState<Set<string>>(new Set());
    const [bulkPrefixFilter, setBulkPrefixFilter] = useState<string>('ALL');
    const [bulkStartRack, setBulkStartRack] = useState<string>('');
    const [bulkEndRack, setBulkEndRack] = useState<string>('');
    const [bulkRackSearch, setBulkRackSearch] = useState<string>('');
    const [isBulkUnverifying, setIsBulkUnverifying] = useState(false);

    // PIN 1234 Protection Modal State for Direct Confirmation
    const [showPinModal, setShowPinModal] = useState(false);
    const [pinInput, setPinInput] = useState('');
    const [pendingConfirmAction, setPendingConfirmAction] = useState<{ type: 'single' | 'all' | 'unverify' | 'clear_all_finished'; item?: any } | null>(null);

    const updateRecentRacks = (rak: string) => {
        if (!rak) return;
        const upper = rak.trim().toUpperCase();
        setRecentRacks(prev => {
            const next = [upper, ...prev.filter(r => r !== upper)].slice(0, 8);
            try {
                localStorage.setItem('stock_opname_recent_racks', JSON.stringify(next));
            } catch (e) {}
            return next;
        });
    };

    const handleCloseActiveRack = () => {
        setLastScanned(null);
        setRackId('');
        setItems([]);
        setVerifiedIds(new Set());
        setItemSearchTerm('');
        setStatusFilter('all');
    };

    const confirmedCount = useMemo(() => {
        return items.filter(item => verifiedIds.has(item.id)).length;
    }, [items, verifiedIds]);

    const unconfirmedCount = useMemo(() => {
        return items.filter(item => !verifiedIds.has(item.id)).length;
    }, [items, verifiedIds]);

    const filteredItems = useMemo(() => {
        const term = itemSearchTerm.toLowerCase().trim();
        return items.filter(item => {
            const matchesSearch = !term || (
                item.nama_produk?.toLowerCase().includes(term) ||
                item.satuan?.toLowerCase().includes(term) ||
                item.packing?.toLowerCase().includes(term)
            );

            const isConfirmed = verifiedIds.has(item.id);
            const matchesStatus = 
                statusFilter === 'all' ? true :
                statusFilter === 'terkonfirmasi' ? isConfirmed :
                !isConfirmed;

            return matchesSearch && matchesStatus;
        });
    }, [items, itemSearchTerm, statusFilter, verifiedIds]);

    const handleGlobalSearch = async (term: string) => {
        setGlobalSearchTerm(term);
        if (!term.trim() || term.trim().length < 1) {
            setGlobalSearchResults([]);
            setShowGlobalResults(false);
            return;
        }

        setIsGlobalSearching(true);
        setShowGlobalResults(true);
        try {
            const cleanTerm = term.trim();
            // Search flexibly across nama_produk and rak without rigid status restriction
            const { data, error } = await supabase
                .from('stock_items')
                .select('*')
                .or(`nama_produk.ilike.%${cleanTerm}%,rak.ilike.%${cleanTerm}%`)
                .neq('status', 'Non-Aktif')
                .gt('tersedia', 0)
                .order('nama_produk', { ascending: true })
                .limit(50);

            if (error) {
                console.warn('Primary global search query failed, attempting fallback...', error);
                const { data: fallbackData } = await supabase
                    .from('stock_items')
                    .select('*')
                    .ilike('nama_produk', `%${cleanTerm}%`)
                    .gt('tersedia', 0)
                    .limit(50);
                
                if (fallbackData) {
                    const aggregatedMap = new Map<string, StockItem>();
                    fallbackData.forEach((item: StockItem) => {
                        const key = `${item.nama_produk}-${item.rak}`;
                        if (aggregatedMap.has(key)) {
                            aggregatedMap.get(key)!.tersedia += item.tersedia;
                        } else {
                            aggregatedMap.set(key, { ...item });
                        }
                    });
                    setGlobalSearchResults(Array.from(aggregatedMap.values()));
                }
            } else if (data) {
                const aggregatedMap = new Map<string, StockItem>();
                data.forEach((item: StockItem) => {
                    const key = `${item.nama_produk}-${item.rak}`;
                    if (aggregatedMap.has(key)) {
                        aggregatedMap.get(key)!.tersedia += item.tersedia;
                    } else {
                        aggregatedMap.set(key, { ...item });
                    }
                });
                setGlobalSearchResults(Array.from(aggregatedMap.values()));
            }
        } catch (err) {
            console.error('Error in global search:', err);
        } finally {
            setIsGlobalSearching(false);
        }
    };

    const isFetchingFinishedRef = useRef(false);

    // Real-Time Finished / Verified Items Fetching
    const fetchAllFinishedItems = async () => {
        if (isFetchingFinishedRef.current) return;
        isFetchingFinishedRef.current = true;
        try {
            // 1. Fetch from Supabase database_log with fast indexed query
            const { data, error } = await supabase
                .from('database_log')
                .select('id, sku, rak, sub_rak, gudang, type, status, user_name, tgl, waktu, created_at, jumlah, log_update_user')
                .in('gudang', ['VERIFY', 'UNVERIFY'])
                .order('created_at', { ascending: false })
                .limit(2000);

            if (error) {
                console.warn('Error fetching verify logs from DB:', error);
            }

            const seenMap = new Map<string, any>();
            const excludedKeys = new Set<string>();

            (data || []).forEach((log: any) => {
                const sku = (log.sku || log.nama_barang || log.nama_produk || '').trim().toLowerCase();
                const rak = (log.sub_rak || log.rak || '').trim().toUpperCase();
                if (!sku || !rak) return;

                const pairKey = `${sku}:::${rak}`;

                if (seenMap.has(pairKey) || excludedKeys.has(pairKey)) {
                    return;
                }

                const gudangUpper = (log.gudang || '').toUpperCase();
                const typeUpper = (log.type || '').toUpperCase();

                if (gudangUpper === 'UNVERIFY' || typeUpper === 'UNVERIFY') {
                    excludedKeys.add(pairKey);
                } else if (gudangUpper === 'VERIFY' || typeUpper === 'VERIFY' || log.status === 'VERIFIED') {
                    seenMap.set(pairKey, {
                        ...log,
                        sku: log.sku || log.nama_barang || log.nama_produk,
                        rak: rak,
                        sub_rak: rak,
                        log_update_user: log.log_update_user || undefined
                    });
                }
            });

            // 2. Also check localStorage verified_rak_* keys to ensure immediate live reflection
            if (typeof window !== 'undefined') {
                try {
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key && key.startsWith('verified_rak_')) {
                            const rak = key.replace('verified_rak_', '').trim().toUpperCase();
                            if (rak.startsWith('TEMP')) continue; // Skip TEMP racks
                            const raw = localStorage.getItem(key);
                            if (raw) {
                                const prodNames: string[] = JSON.parse(raw);
                                if (Array.isArray(prodNames)) {
                                    prodNames.forEach(pName => {
                                        const cleanP = (pName || '').trim().toLowerCase();
                                        if (!cleanP) return;
                                        const pairKey = `${cleanP}:::${rak}`;
                                        if (!seenMap.has(pairKey) && !excludedKeys.has(pairKey)) {
                                            seenMap.set(pairKey, {
                                                id: `local-${rak}-${cleanP}`,
                                                sku: pName.toUpperCase(),
                                                nama_barang: pName.toUpperCase(),
                                                nama_produk: pName.toUpperCase(),
                                                rak: rak,
                                                sub_rak: rak,
                                                gudang: 'VERIFY',
                                                type: 'MOVE',
                                                user_name: userEmail?.split('@')[0] || userName || 'User',
                                                tgl: new Date().toISOString().split('T')[0],
                                                waktu: new Date().toLocaleTimeString('id-ID'),
                                                created_at: new Date().toISOString()
                                            });
                                        }
                                    });
                                }
                            }
                        }
                    }
                } catch (lsErr) {
                    console.warn('Error reading localStorage for verified items:', lsErr);
                }
            }

            setFinishedLogs(Array.from(seenMap.values()));
        } catch (err: any) {
            console.error('Error fetching finished stock opname items:', err);
        } finally {
            isFetchingFinishedRef.current = false;
            setIsLoadingFinished(false);
        }
    };

    useEffect(() => {
        // Fetch immediately on mount
        fetchAllFinishedItems();
        
        // Supabase Realtime channel subscription
        const channel = supabase
            .channel('realtime_stock_opname_finished_logs_' + Date.now())
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'database_log'
            }, () => {
                fetchAllFinishedItems();
            })
            .subscribe();

        // Cross-tab and window listeners
        const handleSyncEvent = () => fetchAllFinishedItems();
        window.addEventListener('focus', handleSyncEvent);
        window.addEventListener('storage', handleSyncEvent);
        window.addEventListener('finished-logs-updated', handleSyncEvent);

        // Periodic live heartbeat polling every 10 seconds as safety fallback
        const interval = setInterval(() => {
            fetchAllFinishedItems();
        }, 10000);

        return () => {
            supabase.removeChannel(channel);
            window.removeEventListener('focus', handleSyncEvent);
            window.removeEventListener('storage', handleSyncEvent);
            window.removeEventListener('finished-logs-updated', handleSyncEvent);
            clearInterval(interval);
        };
    }, []);

    const filteredFinishedLogs = useMemo(() => {
        if (!finishedSearchTerm.trim()) return finishedLogs;
        const term = finishedSearchTerm.toLowerCase().trim();
        return finishedLogs.filter(log => {
            const sku = (log.sku || log.nama_barang || '').toLowerCase();
            const rak = (log.sub_rak || log.rak || '').toLowerCase();
            const user = (log.user_name || '').toLowerCase();
            const status = (log.status || '').toLowerCase();
            return sku.includes(term) || rak.includes(term) || user.includes(term) || status.includes(term);
        });
    }, [finishedLogs, finishedSearchTerm]);

    // Helper to generate or derive standard Serial Number (SN-XXXXXXXX-XXXX)
    const generateSnCode = (item: any, index = 0): string => {
        if (item.unique_code && item.unique_code.trim()) return item.unique_code.trim();
        if (item.kode_unik && item.kode_unik.trim()) return item.kode_unik.trim();
        if (item.sn && item.sn.trim()) return item.sn.trim();
        
        const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const rawSku = (item.sku || item.nama_barang || item.nama_produk || 'ITEM').replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase();
        let hash = 0;
        const seed = `${rawSku}_${index}_${item.id || ''}_${item.created_at || ''}`;
        for (let i = 0; i < seed.length; i++) {
            hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
        }
        const gen = (len: number, offset: number) => {
            let res = '';
            for (let i = 0; i < len; i++) {
                res += chars[(hash + i * 7 + offset) % chars.length];
            }
            return res;
        };
        return `SN-${gen(8, 3)}-${gen(4, 9)}`;
    };

    // Helper to format Sub-Rak Tujuan according to user requirements:
    // Any rack -> 'UTAMA', except 'LANTAI 4', 'LANTAI 2', 'ECER-M', 'ECER-O', 'ECER-N', 'BLOK-I'
    const formatSubRakTujuan = (rawRak?: string): string => {
        if (!rawRak) return 'UTAMA';
        const clean = rawRak.trim().toUpperCase();
        const preservedRacks = ['LANTAI 4', 'LANTAI 2', 'ECER-M', 'ECER-O', 'ECER-N', 'BLOK-I', 'LANTAI4', 'LANTAI2'];
        if (preservedRacks.includes(clean)) {
            return clean;
        }
        return 'UTAMA';
    };

    // Helper to format any date string strictly into DD-MM-YYYY (e.g. 17-09-2026) without time or prefix
    const formatToDDMMYYYY = (dateInput?: any): string => {
        if (!dateInput) {
            const d = new Date();
            const dd = String(d.getDate()).padStart(2, '0');
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const yyyy = d.getFullYear();
            return `${dd}-${mm}-${yyyy}`;
        }
        const clean = String(dateInput).trim();
        if (!clean) {
            const d = new Date();
            const dd = String(d.getDate()).padStart(2, '0');
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const yyyy = d.getFullYear();
            return `${dd}-${mm}-${yyyy}`;
        }

        // Match YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD (e.g. 2026-09-17 08:20:20)
        const ymdMatch = clean.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
        if (ymdMatch) {
            const year = ymdMatch[1];
            const month = ymdMatch[2].padStart(2, '0');
            const day = ymdMatch[3].padStart(2, '0');
            return `${day}-${month}-${year}`;
        }

        // Match DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
        const dmyMatch = clean.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
        if (dmyMatch) {
            const day = dmyMatch[1].padStart(2, '0');
            const month = dmyMatch[2].padStart(2, '0');
            const year = dmyMatch[3];
            return `${day}-${month}-${year}`;
        }

        // Try new Date parsing
        const parsed = new Date(clean);
        if (!isNaN(parsed.getTime())) {
            const dd = String(parsed.getDate()).padStart(2, '0');
            const mm = String(parsed.getMonth() + 1).padStart(2, '0');
            const yyyy = parsed.getFullYear();
            return `${dd}-${mm}-${yyyy}`;
        }

        return clean;
    };

    interface ThermalPrintConfig {
        title: string;
        mode: 'single' | 'batch';
        singleItem?: {
            sku: string;
            sn1: string;
            sn2: string;
            sn3: string;
            rak: string;
            tgl_scan?: string;
            waktu?: string;
            totalQty?: number;
            boxQty?: number;
        };
        batchItems?: Array<{
            sku: string;
            sn: string;
            rak: string;
            slotNum?: number;
            tgl_scan?: string;
            waktu?: string;
            qty?: number;
        }>;
    }

    // Open Thermal Label Print in a New Tab with Interactive Customizer & Supabase Sync
    const renderThermalPrintWindow = (config: ThermalPrintConfig) => {
        const activeEmail = (user?.email || userEmail || 'staf@gudang').trim();
        const metaEnv = typeof import.meta !== 'undefined' && (import.meta as any).env ? (import.meta as any).env : {};
        const activeSupabaseUrl = (typeof window !== 'undefined' ? localStorage.getItem('custom_supabase_url') : null) || metaEnv.VITE_SUPABASE_URL || 'https://eojyqaffjqiuxldprwph.supabase.co';
        const activeSupabaseKey = (typeof window !== 'undefined' ? localStorage.getItem('custom_supabase_anon_key') : null) || metaEnv.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvanlxYWZmanFpdXhsZHByd3BoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1ODYwNzUsImV4cCI6MjEwNTE2MjA3NX0.pGTbwCdpMOG8X4N-_GZJidulS7KmzZd82ocv6zFUmuA';

        // Read latest saved style preferences from component state or localStorage
        const cacheKey = 'thermal_style_pref_' + encodeURIComponent(activeEmail);
        let savedPref: any = thermalPrintSettings;
        if (!savedPref && typeof window !== 'undefined') {
            try {
                const cached = localStorage.getItem(cacheKey);
                if (cached) savedPref = JSON.parse(cached);
            } catch (e) {}
        }

        const effective = {
            paperWidth: Number(savedPref?.paperWidth ?? 100),
            pageHeight: Number(savedPref?.pageHeight ?? 140),
            rowHeight: Number(savedPref?.rowHeight ?? 46),
            layoutDirection: (savedPref?.layoutDirection === 'row-reverse' ? 'row-reverse' : 'row'),
            qrSize: Number(savedPref?.qrSize ?? 32),
            qrOffsetX: Number(savedPref?.qrOffsetX ?? 0),
            qrOffsetY: Number(savedPref?.qrOffsetY ?? 0),
            textOffsetX: Number(savedPref?.textOffsetX ?? 5),
            textOffsetY: Number(savedPref?.textOffsetY ?? 0),
            textAlign: savedPref?.textAlign ?? 'left',
            skuSize: Number(savedPref?.skuSize ?? 22),
            skuWeight: savedPref?.skuWeight ?? '900',
            idSize: Number(savedPref?.idSize ?? 14),
            dateSize: Number(savedPref?.dateSize ?? 12),
            dateWeight: savedPref?.dateWeight ?? '800',
            showDate: savedPref?.showDate ?? 'block',
            showRak: savedPref?.showRak ?? 'inline-block',
            showKoli: savedPref?.showKoli ?? 'none',
            showQty: savedPref?.showQty ?? 'none',
            rakSize: Number(savedPref?.rakSize ?? 11),
            koliSize: Number(savedPref?.koliSize ?? 11),
            qtySize: Number(savedPref?.qtySize ?? 13),
            qtyWeight: savedPref?.qtyWeight ?? '900',
            slotPosition: savedPref?.slotPosition ?? 'bottom-right',
            slotSize: Number(savedPref?.slotSize ?? 9),
            slotOffsetX: Number(savedPref?.slotOffsetX ?? 0),
            cellPadY: Number(savedPref?.cellPadY ?? 6),
            cellPadX: Number(savedPref?.cellPadX ?? 8),
            borderStyle: savedPref?.borderStyle ?? 'dashed',
            borderWidth: savedPref?.borderWidth ?? '2px',
            borderColor: savedPref?.borderColor ?? '#000',
            showSlot: savedPref?.showSlot ?? 'block',
            sizePreset: savedPref?.sizePreset ?? '140'
        };

        const isLeftSlot = effective.slotPosition.includes('left');
        const isTopSlot = effective.slotPosition.includes('top');

        const isSingle = config.mode === 'single';
        const effectiveSplitMode = isSingle && config.singleItem?.splitMode ? config.singleItem.splitMode : 'capacity';
        let initialPagesHtml = '';
        let initialSummaryBadge = '';

        if (isSingle && config.singleItem) {
            const item = config.singleItem;
            const totalQty = Math.max(1, Number(item.totalQty || 1));
            const formattedDate = formatToDDMMYYYY(item.tgl_scan || item.waktu);
            
            const totalBoxes = Math.max(1, Number(item.boxCount || 1));
            const boxes: Array<{ boxIndex: number; totalBoxes: number; qty: number; totalQty: number; isRemainder: boolean }> = [];

            for (let i = 0; i < totalBoxes; i++) {
                boxes.push({ boxIndex: i + 1, totalBoxes, qty: totalQty, totalQty, isRemainder: false });
            }

            const numSheets = Math.ceil(boxes.length / 3);
            initialSummaryBadge = totalBoxes > 1 
                ? `${numSheets} Halaman (${boxes.length} Barcode Label)`
                : `1 Halaman (1 Barcode Label)`;

            for (let p = 0; p < boxes.length; p += 3) {
                const pageBoxes = boxes.slice(p, p + 3);
                initialPagesHtml += '<div class="thermal-sheet">';
                pageBoxes.forEach((box, bIdx) => {
                    const sn = box.totalBoxes > 1 ? `${item.sn1}-B${box.boxIndex}` : item.sn1;
                    const qrPayload = `${formattedDate}\t${item.sku}\t${sn}`;
                    const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=' + encodeURIComponent(qrPayload);
                    const slotText = 'No.' + (bIdx + 1);
                    const rakText = item.rak && item.rak !== '-' ? `RAK: ${item.rak}` : '';

                    initialPagesHtml += `<div class="label-cell" data-qr="${encodeURIComponent(qrPayload)}" onclick="copyLabelData(this)" title="Klik untuk salin 3 Kolom: Tgl [TAB] SKU [TAB] ID">` +
                        `<div class="qr-wrapper">` +
                            `<img src="${qrUrl}" alt="QR" />` +
                        `</div>` +
                        `<div class="details-wrapper">` +
                            `<div class="meta-row">` +
                                `<span class="scan-date">${formattedDate}</span>` +
                                (rakText ? `<span class="rack-badge">${rakText}</span>` : '') +
                            `</div>` +
                            `<div class="product-sku">${item.sku}</div>` +
                            `<div class="serial-id">ID: ${sn}</div>` +
                        `</div>` +
                        `<div class="slot-indicator">${slotText}</div>` +
                    `</div>`;
                });
                initialPagesHtml += '</div>';
            }
        } else if (config.batchItems && config.batchItems.length > 0) {
            const batch = config.batchItems;
            const pages: Array<Array<{ sku: string; sn: string; rak: string; slotNum?: number; tgl_scan?: string; waktu?: string; qty?: number }>> = [];
            for (let i = 0; i < batch.length; i += 3) {
                pages.push(batch.slice(i, i + 3));
            }
            initialSummaryBadge = pages.length + ' Halaman (' + batch.length + ' Data)';
            
            pages.forEach((pageRows) => {
                initialPagesHtml += '<div class="thermal-sheet">';
                pageRows.forEach((row, rIdx) => {
                    const formattedDate = formatToDDMMYYYY(row.tgl_scan || row.waktu);
                    const qrPayload = `${formattedDate}\t${row.sku}\t${row.sn}`;
                    const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=' + encodeURIComponent(qrPayload);
                    const slotText = 'No.' + (rIdx + 1);
                    const rakText = row.rak && row.rak !== '-' ? `RAK: ${row.rak}` : '';

                    initialPagesHtml += `<div class="label-cell" data-qr="${encodeURIComponent(qrPayload)}" onclick="copyLabelData(this)" title="Klik untuk salin 3 Kolom: Tgl [TAB] SKU [TAB] ID">` +
                        `<div class="qr-wrapper">` +
                            `<img src="${qrUrl}" alt="QR" />` +
                        `</div>` +
                        `<div class="details-wrapper">` +
                            `<div class="meta-row">` +
                                `<span class="scan-date">${formattedDate}</span>` +
                                (rakText ? `<span class="rack-badge">${rakText}</span>` : '') +
                            `</div>` +
                            `<div class="product-sku">${row.sku}</div>` +
                            `<div class="serial-id">ID: ${row.sn}</div>` +
                        `</div>` +
                        `<div class="slot-indicator">${slotText}</div>` +
                    `</div>`;
                });
                initialPagesHtml += '</div>';
            });
        }

        const singleDataJs = isSingle && config.singleItem ? JSON.stringify(config.singleItem) : 'null';

        const html = `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${config.title}</title>
    <style id="dynamic-page-css">
        @page {
            size: ${effective.paperWidth}mm ${effective.sizePreset === 'auto' ? 'auto' : effective.pageHeight + 'mm'};
            margin: 0;
        }
    </style>
    <style id="dynamic-vars-css">
        :root {
            --paper-width: ${effective.paperWidth}mm;
            --page-height: ${effective.pageHeight}mm;
            --row-height: ${effective.rowHeight}mm;
            --layout-direction: ${effective.layoutDirection};
            --qr-size: ${effective.qrSize}mm;
            --qr-offset-x: ${effective.qrOffsetX}px;
            --qr-offset-y: ${effective.qrOffsetY}px;
            --text-offset-x: ${effective.textOffsetX}px;
            --text-offset-y: ${effective.textOffsetY}px;
            --text-align: ${effective.textAlign};
            --sku-size: ${effective.skuSize}px;
            --sku-weight: ${effective.skuWeight};
            --id-size: ${effective.idSize}px;
            --date-size: ${effective.dateSize}px;
            --date-weight: ${effective.dateWeight};
            --show-date: ${effective.showDate};
            --show-rak: ${effective.showRak};
            --show-koli: ${effective.showKoli};
            --show-qty: ${effective.showQty};
            --rak-size: ${effective.rakSize}px;
            --koli-size: ${effective.koliSize}px;
            --qty-size: ${effective.qtySize}px;
            --qty-weight: ${effective.qtyWeight};
            --slot-size: ${effective.slotSize}px;
            --slot-pos-left: ${isLeftSlot ? '8px' : 'auto'};
            --slot-pos-right: ${isLeftSlot ? 'auto' : '8px'};
            --slot-pos-top: ${isTopSlot ? '4px' : 'auto'};
            --slot-pos-bottom: ${isTopSlot ? 'auto' : '4px'};
            --slot-offset-x: ${effective.slotOffsetX}px;
            --cell-pad-y: ${effective.cellPadY}px;
            --cell-pad-x: ${effective.cellPadX}px;
            --border-style: ${effective.borderStyle};
            --border-width: ${effective.borderWidth};
            --border-color: ${effective.borderColor};
            --show-slot: ${effective.showSlot};
        }
    </style>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background-color: #0b0f19;
            color: #000;
            margin: 0;
            padding: 0;
            min-height: 100vh;
            overflow-x: hidden;
        }

        /* Fixed Top Header Toolbar - Brand on Left, All Buttons Grouped on Right */
        .toolbar-header {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: rgba(15, 23, 42, 0.95);
            backdrop-filter: blur(16px);
            color: #fff;
            padding: 10px 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            z-index: 99999;
            box-shadow: 0 4px 25px rgba(0,0,0,0.5);
            border-bottom: 1px solid rgba(255,255,255,0.12);
            gap: 16px;
        }
        .toolbar-brand {
            font-size: 13px;
            font-weight: 900;
            letter-spacing: 0.5px;
            display: flex;
            align-items: center;
            gap: 8px;
            text-transform: uppercase;
            flex-shrink: 0;
        }
        .badge-pill {
            background: #2563eb;
            color: #fff;
            padding: 3px 9px;
            border-radius: 6px;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0.2px;
            white-space: nowrap;
        }

        /* Right Group Controls */
        .controls-group-right {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 8px;
            flex-wrap: wrap;
        }
        .control-label {
            font-size: 10px;
            font-weight: 800;
            color: #94a3b8;
            text-transform: uppercase;
            margin-right: 2px;
        }
        .toolbar-divider {
            border-right: 1px solid #334155;
            height: 18px;
            margin: 0 4px;
            display: inline-block;
        }
        .btn-toggle {
            background: #1e293b;
            color: #94a3b8;
            border: 1px solid #334155;
            padding: 6px 11px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            transition: all 0.2s;
            display: inline-flex;
            align-items: center;
            gap: 5px;
        }
        .btn-toggle:hover {
            background: #334155;
            color: #fff;
        }
        .btn-toggle.active {
            background: #2563eb;
            color: #fff;
            border-color: #60a5fa;
            box-shadow: 0 0 10px rgba(37,99,235,0.4);
        }
        .btn-action-split {
            background: linear-gradient(135deg, #ea580c, #c2410c);
            color: #fff;
            border: 1px solid #f97316;
            padding: 7px 13px;
            border-radius: 9px;
            cursor: pointer;
            font-weight: 900;
            font-size: 11px;
            text-transform: uppercase;
            display: flex;
            align-items: center;
            gap: 5px;
            box-shadow: 0 2px 10px rgba(234, 88, 12, 0.4);
            transition: all 0.2s;
        }
        .btn-action-split:hover {
            background: linear-gradient(135deg, #f97316, #ea580c);
            transform: translateY(-1px);
            box-shadow: 0 4px 14px rgba(234, 88, 12, 0.6);
        }
        .btn-action-customizer {
            background: linear-gradient(135deg, #4f46e5, #3730a3);
            color: #fff;
            border: 1px solid #6366f1;
            padding: 7px 14px;
            border-radius: 9px;
            cursor: pointer;
            font-weight: 900;
            font-size: 11px;
            text-transform: uppercase;
            display: flex;
            align-items: center;
            gap: 6px;
            box-shadow: 0 2px 12px rgba(79, 70, 229, 0.4);
            transition: all 0.2s;
        }
        .btn-action-customizer:hover {
            background: linear-gradient(135deg, #6366f1, #4f46e5);
            transform: translateY(-1px);
        }
        .btn-action-customizer.open {
            background: #e11d48;
            border-color: #f43f5e;
            box-shadow: 0 0 12px rgba(225, 29, 72, 0.5);
        }
        .btn-action-save {
            background: linear-gradient(135deg, #0284c7, #0369a1);
            color: #fff;
            border: 1px solid #38bdf8;
            padding: 7px 13px;
            border-radius: 9px;
            cursor: pointer;
            font-weight: 900;
            font-size: 11px;
            text-transform: uppercase;
            display: flex;
            align-items: center;
            gap: 5px;
            transition: all 0.2s;
        }
        .btn-action-save:hover {
            transform: translateY(-1px);
            background: linear-gradient(135deg, #0ea5e9, #0284c7);
        }
        .btn-action-copy {
            background: linear-gradient(135deg, #0d9488, #0f766e);
            color: #fff;
            border: 1px solid #14b8a6;
            padding: 7px 13px;
            border-radius: 9px;
            cursor: pointer;
            font-weight: 900;
            font-size: 11px;
            text-transform: uppercase;
            display: flex;
            align-items: center;
            gap: 5px;
            transition: all 0.2s;
        }
        .btn-action-copy:hover {
            transform: translateY(-1px);
            background: linear-gradient(135deg, #14b8a6, #0d9488);
        }
        .btn-action-print {
            background: linear-gradient(135deg, #10b981, #059669);
            color: #fff;
            border: none;
            padding: 7px 18px;
            border-radius: 9px;
            cursor: pointer;
            font-weight: 900;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            display: flex;
            align-items: center;
            gap: 6px;
            box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4);
            transition: all 0.2s;
        }
        .btn-action-print:hover {
            transform: translateY(-1px);
            box-shadow: 0 6px 18px rgba(16, 185, 129, 0.6);
        }
        .floating-toast {
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%) translateY(100px);
            background: #0f172a;
            color: #38bdf8;
            border: 1px solid #0284c7;
            padding: 10px 20px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 800;
            box-shadow: 0 10px 30px rgba(0,0,0,0.6);
            z-index: 999999;
            opacity: 0;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            white-space: pre-line;
            text-align: center;
            pointer-events: none;
        }
        .floating-toast.show {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }

        /* Right-Side Sliding Customizer Drawer */
        .customizer-drawer-right {
            position: fixed;
            top: 0;
            right: 0;
            bottom: 0;
            width: 390px;
            max-width: 92vw;
            background: rgba(15, 23, 42, 0.98);
            backdrop-filter: blur(20px);
            border-left: 1px solid rgba(255,255,255,0.15);
            z-index: 100000;
            box-shadow: -10px 0 40px rgba(0,0,0,0.7);
            display: flex;
            flex-direction: column;
            transform: translateX(100%);
            transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            color: #fff;
        }
        .customizer-drawer-right.active {
            transform: translateX(0);
        }
        .drawer-header {
            padding: 16px 20px;
            border-bottom: 1px solid #334155;
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: #0f172a;
        }
        .drawer-title {
            font-size: 13px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #38bdf8;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .drawer-close-btn {
            background: #1e293b;
            border: 1px solid #334155;
            color: #94a3b8;
            width: 28px;
            height: 28px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
        }
        .drawer-close-btn:hover {
            background: #e11d48;
            color: #fff;
            border-color: #f43f5e;
        }
        .drawer-body {
            flex: 1;
            overflow-y: auto;
            padding: 16px 20px;
            display: flex;
            flex-direction: column;
            gap: 18px;
        }
        .drawer-section {
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: 12px;
            padding: 14px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .drawer-section-highlight {
            border: 1.5px solid #38bdf8 !important;
            background: linear-gradient(180deg, rgba(14, 165, 233, 0.12), rgba(30, 41, 59, 0.95)) !important;
            box-shadow: 0 0 15px rgba(56, 189, 248, 0.15);
        }
        .drawer-section-title {
            font-size: 11px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            color: #94a3b8;
            display: flex;
            align-items: center;
            gap: 6px;
            border-bottom: 1px solid #334155;
            padding-bottom: 8px;
        }
        .split-mode-selector {
            display: flex;
            background: #0f172a;
            padding: 3px;
            border-radius: 8px;
            border: 1px solid #334155;
            gap: 4px;
        }
        .btn-mode {
            flex: 1;
            padding: 6px 4px;
            background: transparent;
            border: none;
            color: #94a3b8;
            font-size: 10px;
            font-weight: 800;
            border-radius: 6px;
            cursor: pointer;
            text-transform: uppercase;
            transition: all 0.2s;
        }
        .btn-mode:hover {
            color: #fff;
        }
        .btn-mode.active {
            background: #2563eb;
            color: #fff;
            box-shadow: 0 2px 6px rgba(37,99,235,0.4);
        }
        .custom-number-input {
            background: #0f172a;
            color: #38bdf8;
            border: 1px solid #334155;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 900;
            outline: none;
            width: 100%;
            box-sizing: border-box;
        }
        .btn-quick-tag {
            background: #1e293b;
            color: #cbd5e1;
            border: 1px solid #334155;
            padding: 4px 8px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 10px;
            font-weight: 800;
            white-space: nowrap;
            transition: all 0.2s;
        }
        .btn-quick-tag:hover {
            background: #38bdf8;
            color: #0f172a;
            border-color: #38bdf8;
        }
        .split-calc-box {
            background: #0f172a;
            border: 1px solid #0284c7;
            border-radius: 8px;
            padding: 10px;
            margin-top: 10px;
            font-size: 11px;
            color: #e2e8f0;
            display: flex;
            flex-direction: column;
            gap: 4px;
            line-height: 1.4;
        }
        .form-group {
            display: flex;
            flex-direction: column;
            gap: 5px;
        }
        .form-group label {
            font-size: 10px;
            font-weight: 800;
            color: #cbd5e1;
            text-transform: uppercase;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .val-badge {
            background: #0f172a;
            color: #38bdf8;
            font-size: 11px;
            font-weight: 900;
            padding: 1px 6px;
            border-radius: 4px;
            border: 1px solid #334155;
        }
        .custom-range {
            width: 100%;
            height: 6px;
            background: #0f172a;
            border-radius: 3px;
            outline: none;
            -webkit-appearance: none;
            cursor: pointer;
        }
        .custom-range::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 16px;
            height: 16px;
            background: #38bdf8;
            border-radius: 50%;
            cursor: pointer;
            box-shadow: 0 0 6px rgba(56, 189, 248, 0.8);
        }
        .custom-select {
            background: #0f172a;
            color: #fff;
            border: 1px solid #334155;
            padding: 7px 10px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 700;
            outline: none;
            cursor: pointer;
        }
        .drawer-footer {
            padding: 14px 20px;
            border-top: 1px solid #334155;
            background: #0f172a;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .toast-msg {
            font-size: 11px;
            font-weight: 800;
            color: #34d399;
            opacity: 0;
            transition: opacity 0.3s;
            text-align: center;
        }
        .toast-msg.show {
            opacity: 1;
        }

        /* Container of pages - Smooth margin shift when drawer open */
        .pages-wrapper {
            margin-top: 135px;
            padding: 24px 12px 60px 12px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 28px;
            transition: margin-right 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        body.drawer-open .pages-wrapper {
            margin-right: 390px;
        }

        /* Single Thermal Sticker Page */
        .thermal-sheet {
            background: #ffffff;
            width: var(--paper-width, 100mm);
            border-radius: 4px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            position: relative;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            overflow: hidden;
            box-sizing: border-box;
            transition: width 0.2s;
        }

        /* Height presets */
        body.size-140 .thermal-sheet {
            height: 138mm;
            min-height: 138mm;
            max-height: 138mm;
        }
        body.size-150 .thermal-sheet {
            height: 148mm;
            min-height: 148mm;
            max-height: 148mm;
        }
        body.size-auto .thermal-sheet {
            height: auto;
            min-height: auto;
            max-height: none;
        }

        /* Individual Label Slot / Row (Dashed divider ALWAYS shown on every row) */
        .label-cell {
            width: 100%;
            height: var(--row-height, 46mm);
            min-height: var(--row-height, 46mm);
            max-height: var(--row-height, 46mm);
            display: flex;
            flex-direction: var(--layout-direction, row);
            align-items: center;
            padding: var(--cell-pad-y, 6px) var(--cell-pad-x, 8px);
            position: relative;
            border-bottom: var(--border-width, 2px) var(--border-style, dashed) var(--border-color, #000) !important;
            box-sizing: border-box;
            background: #fff;
            overflow: hidden;
            flex-shrink: 0;
            cursor: pointer;
        }

        /* QR Code Container with Independent Position Shifting */
        .qr-wrapper {
            flex-shrink: 0;
            width: var(--qr-size, 32mm);
            height: var(--qr-size, 32mm);
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 8px;
            transform: translate(var(--qr-offset-x, 0px), var(--qr-offset-y, 0px));
            transition: width 0.1s, height 0.1s, transform 0.1s;
        }
        .qr-wrapper img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            image-rendering: -webkit-optimize-contrast;
            image-rendering: pixelated;
        }

        /* Details Container with Independent Position Shifting */
        .details-wrapper {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            justify-content: center;
            padding: 0 8px;
            text-align: var(--text-align, left);
            transform: translate(var(--text-offset-x, 0px), var(--text-offset-y, 0px));
            transition: transform 0.1s;
        }
        .meta-row {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 5px;
            margin-bottom: 2px;
        }
        .scan-date {
            font-family: 'Arial Black', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: var(--date-size, 12px);
            font-weight: var(--date-weight, 800);
            color: #111;
            text-transform: uppercase;
            letter-spacing: 0.2px;
            display: var(--show-date, inline-block);
            line-height: 1.15;
        }
        .rack-badge {
            display: var(--show-rak, inline-block);
            font-family: 'Arial Black', -apple-system, sans-serif;
            font-size: var(--rak-size, 11px);
            font-weight: 900;
            background: #000;
            color: #fff;
            padding: 1px 5px;
            border-radius: 3px;
            letter-spacing: 0.3px;
            text-transform: uppercase;
            line-height: 1.1;
        }
        .koli-badge {
            display: var(--show-koli, none);
            font-family: 'Arial Black', -apple-system, sans-serif;
            font-size: var(--koli-size, 11px);
            font-weight: 900;
            border: 1.5px solid #000;
            color: #000;
            padding: 0px 5px;
            border-radius: 4px;
            letter-spacing: 0.3px;
            text-transform: uppercase;
            line-height: 1.1;
            background: #fff;
        }
        .product-sku {
            font-family: 'Arial Black', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: var(--sku-size, 22px);
            font-weight: var(--sku-weight, 900);
            line-height: 1.15;
            color: #000;
            text-transform: uppercase;
            word-break: break-word;
            letter-spacing: -0.2px;
        }
        .serial-id {
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: var(--id-size, 14px);
            font-weight: 800;
            color: #222;
            margin-top: 3px;
            text-transform: uppercase;
            letter-spacing: 0.2px;
        }
        .qty-info {
            display: var(--show-qty, none);
            font-family: 'Arial Black', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: var(--qty-size, 13px);
            font-weight: var(--qty-weight, 900);
            color: #000;
            margin-top: 3px;
            letter-spacing: 0.2px;
            line-height: 1.15;
        }

        /* Corner Number Badge (No.1, No.2, No.3) with Position Control */
        .slot-indicator {
            position: absolute;
            left: var(--slot-pos-left, auto);
            right: var(--slot-pos-right, 6px);
            top: var(--slot-pos-top, auto);
            bottom: var(--slot-pos-bottom, 3px);
            font-size: var(--slot-size, 9px);
            font-style: italic;
            font-weight: 900;
            color: #94a3b8;
            font-family: sans-serif;
            display: var(--show-slot, block);
            transform: translateX(var(--slot-offset-x, 0px));
        }

        /* PRINT MEDIA QUERIES */
        @media print {
            .no-print, .customizer-drawer-right, .toolbar-header, .floating-toast {
                display: none !important;
            }
            body {
                background: #ffffff !important;
                margin: 0 !important;
                padding: 0 !important;
            }
            .pages-wrapper {
                margin: 0 !important;
                padding: 0 !important;
                gap: 0 !important;
            }
            .thermal-sheet {
                box-shadow: none !important;
                border-radius: 0 !important;
                width: var(--paper-width, 100mm) !important;
                page-break-after: always !important;
                page-break-inside: avoid !important;
            }
            body.size-140 .thermal-sheet {
                height: 138mm !important;
                min-height: 138mm !important;
                max-height: 138mm !important;
            }
            body.size-150 .thermal-sheet {
                height: 148mm !important;
                min-height: 148mm !important;
                max-height: 148mm !important;
            }
            body.size-auto .thermal-sheet {
                height: auto !important;
                min-height: auto !important;
                max-height: none !important;
            }
            .label-cell {
                border-bottom: var(--border-width, 2px) var(--border-style, dashed) var(--border-color, #000) !important;
                page-break-inside: avoid !important;
            }
        }
    </style>
</head>
<body class="size-${effective.sizePreset}">
    <div class="toolbar-header no-print">
        <div class="toolbar-brand">
            <span>🖨️ Cetak QR Thermal</span>
            <span id="page-summary-badge" class="badge-pill">${initialSummaryBadge}</span>
        </div>
        <div class="controls-group-right">
            ${isSingle ? `
            <span class="control-label">Jumlah Barcode:</span>
            <button id="btn-quick-1" class="btn-toggle ${(config.singleItem?.boxCount || 1) === 1 ? 'active' : ''}" onclick="quickSelectSplit('1')">1 Barcode</button>
            <button id="btn-quick-2" class="btn-toggle ${(config.singleItem?.boxCount || 1) === 2 ? 'active' : ''}" onclick="quickSelectSplit('2')">2 Barcode</button>
            <button id="btn-quick-3" class="btn-toggle ${(config.singleItem?.boxCount || 1) === 3 ? 'active' : ''}" onclick="quickSelectSplit('3')">3 Barcode</button>
            <span class="toolbar-divider"></span>
            ` : ''}
            <span class="control-label">Preset:</span>
            <button id="btn-100" class="btn-toggle ${effective.paperWidth === 100 ? 'active' : ''}" onclick="switchPresetPaper(100)">100 mm</button>
            <button id="btn-140" class="btn-toggle ${effective.sizePreset === '140' ? 'active' : ''}" onclick="switchSize('140')">140 mm</button>
            <button id="btn-150" class="btn-toggle ${effective.sizePreset === '150' ? 'active' : ''}" onclick="switchSize('150')">150 mm</button>
            <button id="btn-80" class="btn-toggle ${effective.paperWidth === 80 ? 'active' : ''}" onclick="switchPresetPaper(80)">80mm POS</button>
            <button id="btn-58" class="btn-toggle ${effective.paperWidth === 58 ? 'active' : ''}" onclick="switchPresetPaper(58)">58mm Mini</button>
            <button id="btn-auto" class="btn-toggle ${effective.sizePreset === 'auto' ? 'active' : ''}" onclick="switchSize('auto')">Auto/Roll</button>
            <span class="toolbar-divider"></span>
            <button id="btn-toggle-customizer" class="btn-action-customizer" onclick="toggleCustomizer()">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                <span>Atur Style & QTY</span>
            </button>
            <button class="btn-action-save" onclick="saveSettingsToSupabase(true)">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                <span>Simpan Style</span>
            </button>
            <button class="btn-action-copy" onclick="copyAllDataTSV()" title="Salin seluruh data QR ke Clipboard (Format 3 Kolom: Tgl [TAB] SKU [TAB] ID)">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                <span>Salin 3 Kolom</span>
            </button>
            <button class="btn-action-print" onclick="window.print()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                <span>Cetak Label</span>
            </button>
        </div>
    </div>

    <!-- Right-Side Sliding Style Customizer Drawer -->
    <div id="customizer-drawer-right" class="customizer-drawer-right no-print">
        <div class="drawer-header">
            <div class="drawer-title">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                <span>Atur Style & QTY</span>
            </div>
            <button class="drawer-close-btn" onclick="toggleCustomizer()" title="Tutup">✕</button>
        </div>

        <div class="drawer-body">
            <!-- SECTION: BARCODE COUNT (SINGLE ITEM MODE ONLY) -->
            ${isSingle ? `
            <div id="drawer-box-split-section" class="drawer-section drawer-section-highlight">
                <div class="drawer-section-title" style="color: #38bdf8;">🖨️ Jumlah Barcode Dicetak</div>
                
                <div class="form-group" style="margin-top: 6px;">
                    <label>Jumlah Barcode yang Ingin Dicetak:</label>
                    <div style="display:flex; gap:6px;">
                        <input id="input-copies-count" type="number" class="custom-number-input" min="1" max="50" oninput="onBoxSplitParamsChange()" />
                        <button type="button" class="btn-quick-tag" onclick="setQuickCopies(1)">1</button>
                        <button type="button" class="btn-quick-tag" onclick="setQuickCopies(2)">2</button>
                        <button type="button" class="btn-quick-tag" onclick="setQuickCopies(3)">3</button>
                        <button type="button" class="btn-quick-tag" onclick="setQuickCopies(4)">4</button>
                        <button type="button" class="btn-quick-tag" onclick="setQuickCopies(6)">6</button>
                    </div>
                </div>

                <div id="split-calc-summary" class="split-calc-box"></div>
            </div>
            ` : ''}

            <!-- SECTION: BADGE QTY, KOLI & LOKASI RAK -->
            <div class="drawer-section">
                <div class="drawer-section-title">🏷️ Label QTY, Koli & Lokasi Rak</div>
                <div class="form-group">
                    <label>Tampilkan Lokasi Rak (contoh: RAK: A1):</label>
                    <select id="input-show-rak" class="custom-select" onchange="onCustomChange()">
                        <option value="inline-block" ${effective.showRak !== 'none' ? 'selected' : ''}>Tampilkan (Aktif)</option>
                        <option value="none" ${effective.showRak === 'none' ? 'selected' : ''}>Sembunyikan</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Tampilkan Badge Koli (contoh: KOLI 1/2):</label>
                    <select id="input-show-koli" class="custom-select" onchange="onCustomChange()">
                        <option value="inline-block" ${effective.showKoli !== 'none' ? 'selected' : ''}>Tampilkan (Aktif)</option>
                        <option value="none" ${effective.showKoli === 'none' ? 'selected' : ''}>Sembunyikan</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Tampilkan Teks QTY (contoh: QTY: 48 PCS):</label>
                    <select id="input-show-qty" class="custom-select" onchange="onCustomChange()">
                        <option value="block" ${effective.showQty !== 'none' ? 'selected' : ''}>Tampilkan (Aktif)</option>
                        <option value="none" ${effective.showQty === 'none' ? 'selected' : ''}>Sembunyikan</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Ukuran Font QTY: <span id="val-qty-size" class="val-badge">${effective.qtySize} px</span></label>
                    <input id="input-qty-size" type="range" class="custom-range" min="9" max="22" step="1" value="${effective.qtySize}" oninput="onCustomChange()" />
                </div>
                <div class="form-group">
                    <label>Ukuran Font Rak: <span id="val-rak-size" class="val-badge">${effective.rakSize} px</span></label>
                    <input id="input-rak-size" type="range" class="custom-range" min="8" max="18" step="1" value="${effective.rakSize}" oninput="onCustomChange()" />
                </div>
                <div class="form-group">
                    <label>Ukuran Font Koli: <span id="val-koli-size" class="val-badge">${effective.koliSize} px</span></label>
                    <input id="input-koli-size" type="range" class="custom-range" min="8" max="18" step="1" value="${effective.koliSize}" oninput="onCustomChange()" />
                </div>
            </div>

            <!-- SECTION: QR CODE -->
            <div class="drawer-section">
                <div class="drawer-section-title">🔲 Posisi & Ukuran QR Code</div>
                <div class="form-group">
                    <label>Posisi Tampil QR:</label>
                    <select id="input-qr-position" class="custom-select" onchange="onCustomChange()">
                        <option value="left" ${effective.layoutDirection !== 'row-reverse' ? 'selected' : ''}>QR di Kiri (Teks di Kanan)</option>
                        <option value="right" ${effective.layoutDirection === 'row-reverse' ? 'selected' : ''}>QR di Kanan (Teks di Kiri)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Ukuran QR: <span id="val-qr-size" class="val-badge">${effective.qrSize} mm</span></label>
                    <input id="input-qr-size" type="range" class="custom-range" min="16" max="55" step="1" value="${effective.qrSize}" oninput="onCustomChange()" />
                </div>
                <div class="form-group">
                    <label>Geser QR (Kiri ◀ ▶ Kanan): <span id="val-qr-offset-x" class="val-badge">${effective.qrOffsetX} px</span></label>
                    <input id="input-qr-offset-x" type="range" class="custom-range" min="-45" max="45" step="1" value="${effective.qrOffsetX}" oninput="onCustomChange()" />
                </div>
                <div class="form-group">
                    <label>Geser QR (Atas ▲ ▼ Bawah): <span id="val-qr-offset-y" class="val-badge">${effective.qrOffsetY} px</span></label>
                    <input id="input-qr-offset-y" type="range" class="custom-range" min="-25" max="25" step="1" value="${effective.qrOffsetY}" oninput="onCustomChange()" />
                </div>
            </div>

            <!-- SECTION: SKU, ID & TANGGAL TEXT -->
            <div class="drawer-section">
                <div class="drawer-section-title">🔤 Teks Tanggal, SKU & ID</div>
                <div class="form-group">
                    <label>Tampilkan Tanggal Scan:</label>
                    <select id="input-show-date" class="custom-select" onchange="onCustomChange()">
                        <option value="block" ${effective.showDate === 'block' ? 'selected' : ''}>Tampilkan (Aktif)</option>
                        <option value="none" ${effective.showDate === 'none' ? 'selected' : ''}>Sembunyikan</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Ukuran Font Tanggal: <span id="val-date-size" class="val-badge">${effective.dateSize} px</span></label>
                    <input id="input-date-size" type="range" class="custom-range" min="8" max="22" step="1" value="${effective.dateSize}" oninput="onCustomChange()" />
                </div>
                <div class="form-group">
                    <label>Geser Teks (Kiri ◀ ▶ Kanan): <span id="val-text-offset-x" class="val-badge">${effective.textOffsetX} px</span></label>
                    <input id="input-text-offset-x" type="range" class="custom-range" min="-45" max="45" step="1" value="${effective.textOffsetX}" oninput="onCustomChange()" />
                </div>
                <div class="form-group">
                    <label>Geser Teks (Atas ▲ ▼ Bawah): <span id="val-text-offset-y" class="val-badge">${effective.textOffsetY} px</span></label>
                    <input id="input-text-offset-y" type="range" class="custom-range" min="-25" max="25" step="1" value="${effective.textOffsetY}" oninput="onCustomChange()" />
                </div>
                <div class="form-group">
                    <label>Ukuran Font SKU: <span id="val-sku-size" class="val-badge">${effective.skuSize} px</span></label>
                    <input id="input-sku-size" type="range" class="custom-range" min="9" max="32" step="1" value="${effective.skuSize}" oninput="onCustomChange()" />
                </div>
                <div class="form-group">
                    <label>Ketebalan SKU:</label>
                    <select id="input-sku-weight" class="custom-select" onchange="onCustomChange()">
                        <option value="900" ${effective.skuWeight === '900' ? 'selected' : ''}>Black (Ekstra Tebal - 900)</option>
                        <option value="700" ${effective.skuWeight === '700' ? 'selected' : ''}>Bold (Tebal - 700)</option>
                        <option value="600" ${effective.skuWeight === '600' ? 'selected' : ''}>Semi-Bold (600)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Ukuran Font ID: <span id="val-id-size" class="val-badge">${effective.idSize} px</span></label>
                    <input id="input-id-size" type="range" class="custom-range" min="7" max="22" step="1" value="${effective.idSize}" oninput="onCustomChange()" />
                </div>
                <div class="form-group">
                    <label>Perataan Teks:</label>
                    <select id="input-text-align" class="custom-select" onchange="onCustomChange()">
                        <option value="left" ${effective.textAlign === 'left' ? 'selected' : ''}>Rata Kiri</option>
                        <option value="right" ${effective.textAlign === 'right' ? 'selected' : ''}>Rata Kanan</option>
                        <option value="center" ${effective.textAlign === 'center' ? 'selected' : ''}>Rata Tengah</option>
                    </select>
                </div>
            </div>

            <!-- SECTION: SLOT INDICATOR -->
            <div class="drawer-section">
                <div class="drawer-section-title">🏷️ Nomor Slot (No.1/2/3)</div>
                <div class="form-group">
                    <label>Tampilkan Nomor Slot:</label>
                    <select id="input-show-slot" class="custom-select" onchange="onCustomChange()">
                        <option value="block" ${effective.showSlot === 'block' ? 'selected' : ''}>Tampilkan (Aktif)</option>
                        <option value="none" ${effective.showSlot === 'none' ? 'selected' : ''}>Sembunyikan</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Posisi Nomor Slot:</label>
                    <select id="input-slot-position" class="custom-select" onchange="onCustomChange()">
                        <option value="bottom-right" ${effective.slotPosition === 'bottom-right' ? 'selected' : ''}>Pojok Kanan Bawah</option>
                        <option value="bottom-left" ${effective.slotPosition === 'bottom-left' ? 'selected' : ''}>Pojok Kiri Bawah</option>
                        <option value="top-right" ${effective.slotPosition === 'top-right' ? 'selected' : ''}>Pojok Kanan Atas</option>
                        <option value="top-left" ${effective.slotPosition === 'top-left' ? 'selected' : ''}>Pojok Kiri Atas</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Ukuran Font Slot: <span id="val-slot-size" class="val-badge">${effective.slotSize} px</span></label>
                    <input id="input-slot-size" type="range" class="custom-range" min="6" max="16" step="1" value="${effective.slotSize}" oninput="onCustomChange()" />
                </div>
                <div class="form-group">
                    <label>Geser Nomor Slot (X): <span id="val-slot-offset-x" class="val-badge">${effective.slotOffsetX} px</span></label>
                    <input id="input-slot-offset-x" type="range" class="custom-range" min="-30" max="30" step="1" value="${effective.slotOffsetX}" oninput="onCustomChange()" />
                </div>
            </div>

            <!-- SECTION: PAPER & ROW SIZES -->
            <div class="drawer-section">
                <div class="drawer-section-title">📐 Kertas & Baris Thermal</div>
                <div class="form-group">
                    <label>Lebar Kertas: <span id="val-paper-width" class="val-badge">${effective.paperWidth} mm</span></label>
                    <input id="input-paper-width" type="range" class="custom-range" min="48" max="120" step="1" value="${effective.paperWidth}" oninput="onCustomChange()" />
                </div>
                <div class="form-group">
                    <label>Tinggi Baris Label: <span id="val-row-height" class="val-badge">${effective.rowHeight} mm</span></label>
                    <input id="input-row-height" type="range" class="custom-range" min="25" max="70" step="1" value="${effective.rowHeight}" oninput="onCustomChange()" />
                </div>
                <div class="form-group">
                    <label>Gaya Garis Pemisah:</label>
                    <select id="input-border-style" class="custom-select" onchange="onCustomChange()">
                        <option value="dashed" ${effective.borderStyle === 'dashed' ? 'selected' : ''}>Putus-putus (Dashed)</option>
                        <option value="dotted" ${effective.borderStyle === 'dotted' ? 'selected' : ''}>Titik-titik (Dotted)</option>
                        <option value="solid" ${effective.borderStyle === 'solid' ? 'selected' : ''}>Garis Lurus (Solid)</option>
                        <option value="none" ${effective.borderStyle === 'none' ? 'selected' : ''}>Tanpa Garis</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Tebal Garis Pemisah:</label>
                    <select id="input-border-width" class="custom-select" onchange="onCustomChange()">
                        <option value="1px" ${effective.borderWidth === '1px' ? 'selected' : ''}>1 px (Halus)</option>
                        <option value="2px" ${effective.borderWidth === '2px' ? 'selected' : ''}>2 px (Standar)</option>
                        <option value="3px" ${effective.borderWidth === '3px' ? 'selected' : ''}>3 px (Tebal)</option>
                        <option value="4px" ${effective.borderWidth === '4px' ? 'selected' : ''}>4 px (Ekstra)</option>
                    </select>
                </div>
            </div>
        </div>

        <div class="drawer-footer">
            <button class="btn-action-save" style="width: 100%; justify-content: center;" onclick="saveSettingsToSupabase(true)">
                💾 Simpan Style Default Akun (${activeEmail})
            </button>
            <button class="btn-toggle" style="width: 100%; justify-content: center;" onclick="resetToFactoryDefaults()">
                🔄 Reset Default Pabrik
            </button>
            <span id="toast-indicator" class="toast-msg">✅ Style tersimpan di Akun Supabase!</span>
        </div>
    </div>

    <div id="pages-container" class="pages-wrapper">
        ${initialPagesHtml}
    </div>

    <script>
        // Global variables safely serialized
        window.singleData = ${singleDataJs};
        window.activeUserEmail = ${JSON.stringify(activeEmail)};
        window.SUPABASE_URL = ${JSON.stringify(activeSupabaseUrl)};
        window.SUPABASE_ANON_KEY = ${JSON.stringify(activeSupabaseKey)};
        window.STORAGE_KEY = "thermal_style_pref_" + encodeURIComponent(window.activeUserEmail);

        window.defaultSettings = ${JSON.stringify(effective)};
        window.currentSettings = Object.assign({}, window.defaultSettings);

        // Splitting Parameters for Single Item Mode
        var initialTot = window.singleData ? Math.max(1, Number(window.singleData.totalQty || 1)) : 1;
        var initialCount = window.singleData && window.singleData.boxCount ? Math.max(1, Number(window.singleData.boxCount)) : 1;
        window.splitParams = {
            mode: 'copies',
            totalQty: initialTot,
            boxCount: initialCount,
            numCopies: initialCount
        };

        // Core Date Formatting
        window.formatToDDMMYYYY = function(dateInput) {
            if (!dateInput) {
                var d = new Date();
                var dd = String(d.getDate()).padStart(2, '0');
                var mm = String(d.getMonth() + 1).padStart(2, '0');
                var yyyy = d.getFullYear();
                return dd + '-' + mm + '-' + yyyy;
            }
            var clean = String(dateInput).trim();
            if (!clean) {
                var d = new Date();
                var dd = String(d.getDate()).padStart(2, '0');
                var mm = String(d.getMonth() + 1).padStart(2, '0');
                var yyyy = d.getFullYear();
                return dd + '-' + mm + '-' + yyyy;
            }
            var ymdMatch = clean.match(/^([0-9]{4})[-/.]([0-9]{1,2})[-/.]([0-9]{1,2})/);
            if (ymdMatch) {
                return ymdMatch[3].padStart(2, '0') + '-' + ymdMatch[2].padStart(2, '0') + '-' + ymdMatch[1];
            }
            var dmyMatch = clean.match(/^([0-9]{1,2})[-/.]([0-9]{1,2})[-/.]([0-9]{4})/);
            if (dmyMatch) {
                return dmyMatch[1].padStart(2, '0') + '-' + dmyMatch[2].padStart(2, '0') + '-' + dmyMatch[3];
            }
            var parsed = new Date(clean);
            if (!isNaN(parsed.getTime())) {
                var dd = String(parsed.getDate()).padStart(2, '0');
                var mm = String(parsed.getMonth() + 1).padStart(2, '0');
                var yyyy = parsed.getFullYear();
                return dd + '-' + mm + '-' + yyyy;
            }
            return clean;
        };

        window.toggleCustomizer = function() {
            try {
                var drawer = document.getElementById('customizer-drawer-right');
                var btn = document.getElementById('btn-toggle-customizer');
                if (!drawer) return;
                var isOpen = drawer.classList.toggle('active');
                if (btn) btn.classList.toggle('open', isOpen);
                document.body.classList.toggle('drawer-open', isOpen);
            } catch (e) {
                console.error('toggleCustomizer error:', e);
            }
        };

        window.openBoxSplitDrawer = function() {
            try {
                var drawer = document.getElementById('customizer-drawer-right');
                var btn = document.getElementById('btn-toggle-customizer');
                if (!drawer) return;
                drawer.classList.add('active');
                if (btn) btn.classList.add('open', true);
                document.body.classList.add('drawer-open');
                var sec = document.getElementById('drawer-box-split-section');
                if (sec) sec.scrollIntoView({ behavior: 'smooth' });
            } catch (e) {}
        };

        window.onBoxSplitParamsChange = function() {
            try {
                var getNum = function(id, def) {
                    var el = document.getElementById(id);
                    var val = el ? Number(el.value) : def;
                    return isNaN(val) || val <= 0 ? def : val;
                };

                window.splitParams.numCopies = getNum('input-copies-count', 1);
                window.splitParams.boxCount = window.splitParams.numCopies;

                window.recalculateAndRenderBoxes();
            } catch (e) {
                console.error('onBoxSplitParamsChange error:', e);
            }
        };

        window.setQuickCopies = function(cp) {
            window.splitParams.numCopies = cp;
            window.splitParams.boxCount = cp;
            var el = document.getElementById('input-copies-count');
            if (el) el.value = cp;
            window.recalculateAndRenderBoxes();
        };

        window.quickSelectSplit = function(type) {
            try {
                document.querySelectorAll('#btn-quick-1, #btn-quick-2, #btn-quick-3').forEach(function(b) { b.classList.remove('active'); });
                var btn = document.getElementById('btn-quick-' + type);
                if (btn) btn.classList.add('active');

                var cnt = parseInt(type, 10) || 1;
                window.splitParams.numCopies = cnt;
                window.splitParams.boxCount = cnt;
                var el = document.getElementById('input-copies-count');
                if (el) el.value = cnt;
                window.recalculateAndRenderBoxes();
            } catch (e) {}
        };

        // Recalculate Box Array & Re-render Pages in DOM
        window.recalculateAndRenderBoxes = function() {
            try {
                if (!window.singleData) return;
                var p = window.splitParams;
                var tot = Math.max(1, p.totalQty);
                var cnt = Math.max(1, p.numCopies || p.boxCount || 1);
                var boxes = [];

                for (var i = 0; i < cnt; i++) {
                    boxes.push({ boxIndex: i + 1, totalBoxes: cnt, qty: tot, totalQty: tot, isRemainder: false });
                }

                // Render into Sheets (3 labels per sheet)
                var container = document.getElementById('pages-container');
                if (!container) return;

                var formattedDate = window.formatToDDMMYYYY(window.singleData.tgl_scan || window.singleData.waktu);
                var rakText = window.singleData.rak && window.singleData.rak !== '-' ? 'RAK: ' + window.singleData.rak : '';
                var tabChar = String.fromCharCode(9);
                var html = '';

                for (var pIdx = 0; pIdx < boxes.length; pIdx += 3) {
                    var pageBoxes = boxes.slice(pIdx, pIdx + 3);
                    html += '<div class="thermal-sheet">';
                    pageBoxes.forEach(function(box, bIdx) {
                        var sn = box.totalBoxes > 1 ? window.singleData.sn1 + '-B' + box.boxIndex : window.singleData.sn1;
                        var qrPayload = formattedDate + tabChar + window.singleData.sku + tabChar + sn;
                        var qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=' + encodeURIComponent(qrPayload);
                        var slotText = 'No.' + (bIdx + 1);
                        html += '<div class="label-cell" data-qr="' + encodeURIComponent(qrPayload) + '" onclick="copyLabelData(this)" title="Klik untuk salin 3 Kolom: Tgl [TAB] SKU [TAB] ID">' +
                            '<div class="qr-wrapper">' +
                                '<img src="' + qrUrl + '" alt="QR" />' +
                            '</div>' +
                            '<div class="details-wrapper">' +
                                '<div class="meta-row">' +
                                    '<span class="scan-date">' + formattedDate + '</span>' +
                                    (rakText ? '<span class="rack-badge">' + rakText + '</span>' : '') +
                                '</div>' +
                                '<div class="product-sku">' + window.singleData.sku + '</div>' +
                                '<div class="serial-id">ID: ' + sn + '</div>' +
                            '</div>' +
                            '<div class="slot-indicator">' + slotText + '</div>' +
                        '</div>';
                    });
                    html += '</div>';
                }

                container.innerHTML = html;

                // Update summary badge
                var badge = document.getElementById('page-summary-badge');
                var numSheets = Math.ceil(boxes.length / 3);
                if (badge) {
                    badge.innerText = numSheets + ' Halaman (' + boxes.length + ' Barcode Label)';
                }

                // Update Drawer Calculation Summary Preview
                var sumBox = document.getElementById('split-calc-summary');
                if (sumBox) {
                    var summaryLines = [];
                    summaryLines.push('<strong>✨ Dicetak: ' + boxes.length + ' Barcode Label</strong>');
                    summaryLines.push('📄 Total Kertas Thermal: <strong>' + numSheets + ' Lembar</strong> (maks 3 barcode / lembar)');
                    sumBox.innerHTML = summaryLines.join('<br/>');
                }
            } catch (e) {
                console.error('recalculateAndRenderBoxes error:', e);
            }
        };

        window.applyStylesToDom = function(s) {
            try {
                var isLeftSlot = (s.slotPosition || '').indexOf('left') !== -1;
                var isTopSlot = (s.slotPosition || '').indexOf('top') !== -1;

                var varsTag = document.getElementById('dynamic-vars-css');
                if (varsTag) {
                    varsTag.innerHTML = ':root {' +
                        '--paper-width: ' + (s.paperWidth || 100) + 'mm;' +
                        '--page-height: ' + (s.pageHeight || 140) + 'mm;' +
                        '--row-height: ' + (s.rowHeight || 46) + 'mm;' +
                        '--layout-direction: ' + (s.layoutDirection || 'row') + ';' +
                        '--qr-size: ' + (s.qrSize || 32) + 'mm;' +
                        '--qr-offset-x: ' + (s.qrOffsetX || 0) + 'px;' +
                        '--qr-offset-y: ' + (s.qrOffsetY || 0) + 'px;' +
                        '--text-offset-x: ' + (s.textOffsetX || 0) + 'px;' +
                        '--text-offset-y: ' + (s.textOffsetY || 0) + 'px;' +
                        '--text-align: ' + (s.textAlign || 'left') + ';' +
                        '--sku-size: ' + (s.skuSize || 22) + 'px;' +
                        '--sku-weight: ' + (s.skuWeight || '900') + ';' +
                        '--id-size: ' + (s.idSize || 14) + 'px;' +
                        '--date-size: ' + (s.dateSize || 12) + 'px;' +
                        '--date-weight: ' + (s.dateWeight || '800') + ';' +
                        '--show-date: ' + (s.showDate || 'block') + ';' +
                        '--show-rak: ' + (s.showRak || 'inline-block') + ';' +
                        '--show-koli: ' + (s.showKoli || 'inline-block') + ';' +
                        '--show-qty: ' + (s.showQty || 'block') + ';' +
                        '--rak-size: ' + (s.rakSize || 11) + 'px;' +
                        '--koli-size: ' + (s.koliSize || 11) + 'px;' +
                        '--qty-size: ' + (s.qtySize || 13) + 'px;' +
                        '--qty-weight: ' + (s.qtyWeight || '900') + ';' +
                        '--slot-size: ' + (s.slotSize || 9) + 'px;' +
                        '--slot-pos-left: ' + (isLeftSlot ? '8px' : 'auto') + ';' +
                        '--slot-pos-right: ' + (isLeftSlot ? 'auto' : '8px') + ';' +
                        '--slot-pos-top: ' + (isTopSlot ? '4px' : 'auto') + ';' +
                        '--slot-pos-bottom: ' + (isTopSlot ? 'auto' : '4px') + ';' +
                        '--slot-offset-x: ' + (s.slotOffsetX || 0) + 'px;' +
                        '--cell-pad-y: ' + (s.cellPadY || 6) + 'px;' +
                        '--cell-pad-x: ' + (s.cellPadX || 8) + 'px;' +
                        '--border-style: ' + (s.borderStyle || 'dashed') + ';' +
                        '--border-width: ' + (s.borderWidth || '2px') + ';' +
                        '--border-color: ' + (s.borderColor || '#000') + ';' +
                        '--show-slot: ' + (s.showSlot || 'block') + ';' +
                    '}';
                }

                var pageTag = document.getElementById('dynamic-page-css');
                if (pageTag) {
                    if (s.sizePreset === 'auto') {
                        pageTag.innerHTML = '@page { size: ' + (s.paperWidth || 100) + 'mm auto; margin: 0; }';
                    } else {
                        pageTag.innerHTML = '@page { size: ' + (s.paperWidth || 100) + 'mm ' + (s.pageHeight || 140) + 'mm; margin: 0; }';
                    }
                }
            } catch (e) {
                console.error('applyStylesToDom error:', e);
            }
        };

        window.updateFormInputs = function(s) {
            try {
                var setVal = function(id, val) { var el = document.getElementById(id); if (el) el.value = val; };
                var setText = function(id, txt) { var el = document.getElementById(id); if (el) el.innerText = txt; };

                // Split inputs
                setVal('input-total-qty', window.splitParams.totalQty);
                setVal('input-box-capacity', window.splitParams.boxCapacity);
                setVal('input-box-count', window.splitParams.boxCount);
                setVal('input-copies-count', window.splitParams.numCopies);

                // Style inputs
                setVal('input-show-rak', s.showRak || 'inline-block');
                setVal('input-show-koli', s.showKoli || 'inline-block');
                setVal('input-show-qty', s.showQty || 'block');
                setVal('input-qty-size', s.qtySize || 13);
                setText('val-qty-size', (s.qtySize || 13) + ' px');
                setVal('input-rak-size', s.rakSize || 11);
                setText('val-rak-size', (s.rakSize || 11) + ' px');
                setVal('input-koli-size', s.koliSize || 11);
                setText('val-koli-size', (s.koliSize || 11) + ' px');

                setVal('input-qr-position', s.layoutDirection === 'row-reverse' ? 'right' : 'left');
                setVal('input-qr-size', s.qrSize || 32);
                setText('val-qr-size', (s.qrSize || 32) + ' mm');

                setVal('input-qr-offset-x', s.qrOffsetX || 0);
                setText('val-qr-offset-x', (s.qrOffsetX || 0) + ' px');

                setVal('input-qr-offset-y', s.qrOffsetY || 0);
                setText('val-qr-offset-y', (s.qrOffsetY || 0) + ' px');

                setVal('input-text-offset-x', s.textOffsetX || 0);
                setText('val-text-offset-x', (s.textOffsetX || 0) + ' px');

                setVal('input-text-offset-y', s.textOffsetY || 0);
                setText('val-text-offset-y', (s.textOffsetY || 0) + ' px');

                setVal('input-sku-size', s.skuSize || 22);
                setText('val-sku-size', (s.skuSize || 22) + ' px');

                setVal('input-sku-weight', s.skuWeight || '900');
                setVal('input-text-align', s.textAlign || 'left');

                setVal('input-id-size', s.idSize || 14);
                setText('val-id-size', (s.idSize || 14) + ' px');

                setVal('input-date-size', s.dateSize || 12);
                setText('val-date-size', (s.dateSize || 12) + ' px');
                setVal('input-show-date', s.showDate || 'block');

                setVal('input-show-slot', s.showSlot || 'block');
                setVal('input-slot-position', s.slotPosition || 'bottom-right');

                setVal('input-slot-size', s.slotSize || 9);
                setText('val-slot-size', (s.slotSize || 9) + ' px');

                setVal('input-slot-offset-x', s.slotOffsetX || 0);
                setText('val-slot-offset-x', (s.slotOffsetX || 0) + ' px');

                setVal('input-row-height', s.rowHeight || 46);
                setText('val-row-height', (s.rowHeight || 46) + ' mm');

                setVal('input-paper-width', s.paperWidth || 100);
                setText('val-paper-width', (s.paperWidth || 100) + ' mm');

                setVal('input-border-style', s.borderStyle || 'dashed');
                setVal('input-border-width', s.borderWidth || '2px');
            } catch (e) {
                console.error('updateFormInputs error:', e);
            }
        };

        window.syncSettingsWithStorageAndParent = function() {
            try {
                localStorage.setItem(window.STORAGE_KEY, JSON.stringify(window.currentSettings));
            } catch (e) {}
            if (window.opener && !window.opener.closed) {
                try {
                    window.opener.postMessage({
                        type: 'SAVE_THERMAL_PRINT_SETTINGS',
                        email: window.activeUserEmail,
                        settings: window.currentSettings
                    }, '*');
                } catch (e) {}
            }
        };

        window.onCustomChange = function() {
            try {
                var getVal = function(id, def) {
                    var el = document.getElementById(id);
                    return el ? el.value : def;
                };
                var getNum = function(id, def) {
                    var val = getVal(id, def);
                    var num = Number(val);
                    return isNaN(num) ? def : num;
                };
                
                window.currentSettings.showRak = getVal('input-show-rak', 'inline-block');
                window.currentSettings.showKoli = getVal('input-show-koli', 'inline-block');
                window.currentSettings.showQty = getVal('input-show-qty', 'block');
                window.currentSettings.qtySize = getNum('input-qty-size', 13);
                window.currentSettings.rakSize = getNum('input-rak-size', 11);
                window.currentSettings.koliSize = getNum('input-koli-size', 11);

                window.currentSettings.layoutDirection = getVal('input-qr-position', 'left') === 'right' ? 'row-reverse' : 'row';
                window.currentSettings.qrSize = getNum('input-qr-size', 32);
                window.currentSettings.qrOffsetX = getNum('input-qr-offset-x', 0);
                window.currentSettings.qrOffsetY = getNum('input-qr-offset-y', 0);
                window.currentSettings.textOffsetX = getNum('input-text-offset-x', 0);
                window.currentSettings.textOffsetY = getNum('input-text-offset-y', 0);
                window.currentSettings.textAlign = getVal('input-text-align', 'left');
                window.currentSettings.skuSize = getNum('input-sku-size', 22);
                window.currentSettings.skuWeight = getVal('input-sku-weight', '900');
                window.currentSettings.idSize = getNum('input-id-size', 14);
                window.currentSettings.dateSize = getNum('input-date-size', 12);
                window.currentSettings.showDate = getVal('input-show-date', 'block');
                window.currentSettings.showSlot = getVal('input-show-slot', 'block');
                window.currentSettings.slotPosition = getVal('input-slot-position', 'bottom-right');
                window.currentSettings.slotSize = getNum('input-slot-size', 9);
                window.currentSettings.slotOffsetX = getNum('input-slot-offset-x', 0);
                window.currentSettings.rowHeight = getNum('input-row-height', 46);
                window.currentSettings.paperWidth = getNum('input-paper-width', 100);
                window.currentSettings.borderStyle = getVal('input-border-style', 'dashed');
                window.currentSettings.borderWidth = getVal('input-border-width', '2px');

                window.updateFormInputs(window.currentSettings);
                window.applyStylesToDom(window.currentSettings);
                window.syncSettingsWithStorageAndParent();
            } catch (e) {
                console.error('onCustomChange error:', e);
            }
        };

        window.switchSize = function(size) {
            try {
                document.body.classList.remove('size-140', 'size-150', 'size-auto');
                document.body.classList.add('size-' + size);
                
                document.querySelectorAll('#btn-140, #btn-150, #btn-auto').forEach(function(btn) { btn.classList.remove('active'); });
                var activeBtn = document.getElementById('btn-' + size);
                if (activeBtn) activeBtn.classList.add('active');

                window.currentSettings.sizePreset = size;
                if (size === '140') {
                    window.currentSettings.pageHeight = 140;
                    window.currentSettings.rowHeight = 46;
                } else if (size === '150') {
                    window.currentSettings.pageHeight = 150;
                    window.currentSettings.rowHeight = 49.3;
                } else {
                    window.currentSettings.pageHeight = 140;
                }

                window.updateFormInputs(window.currentSettings);
                window.applyStylesToDom(window.currentSettings);
                window.syncSettingsWithStorageAndParent();
            } catch (e) {
                console.error('switchSize error:', e);
            }
        };

        window.switchPresetPaper = function(widthMm) {
            try {
                document.querySelectorAll('#btn-100, #btn-80, #btn-58').forEach(function(btn) { btn.classList.remove('active'); });
                var activeBtn = document.getElementById('btn-' + widthMm);
                if (activeBtn) activeBtn.classList.add('active');

                window.currentSettings.paperWidth = Number(widthMm);
                window.updateFormInputs(window.currentSettings);
                window.applyStylesToDom(window.currentSettings);
                window.syncSettingsWithStorageAndParent();
            } catch (e) {
                console.error('switchPresetPaper error:', e);
            }
        };

        window.copyLabelData = function(el) {
            try {
                var raw = el ? el.getAttribute('data-qr') : '';
                if (!raw) return;
                var text = decodeURIComponent(raw);
                var tabChar = String.fromCharCode(9);
                var nlChar = String.fromCharCode(10);
                var displayFormatted = text.split(tabChar).join('   |   ');
                window.copyTextToClipboard(text, '📋 Data QR Tersalin (3 Kolom Excel):' + nlChar + displayFormatted);
            } catch (e) {
                console.error('copyLabelData error:', e);
            }
        };

        window.copyAllDataTSV = function() {
            try {
                var cells = document.querySelectorAll('.label-cell');
                if (!cells || cells.length === 0) return;
                var rows = [];
                cells.forEach(function(c) {
                    var raw = c.getAttribute('data-qr');
                    if (raw) rows.push(decodeURIComponent(raw));
                });
                if (rows.length === 0) return;
                var nlChar = String.fromCharCode(10);
                var allTsv = rows.join(nlChar);
                window.copyTextToClipboard(allTsv, '📋 ' + rows.length + ' Baris Data QR Tersalin ke Clipboard (3 Kolom Excel)');
            } catch (e) {
                console.error('copyAllDataTSV error:', e);
            }
        };

        window.copyTextToClipboard = function(text, successMsg) {
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(text).then(function() {
                    window.showToastBanner(successMsg);
                }).catch(function() {
                    window.fallbackCopy(text, successMsg);
                });
            } else {
                window.fallbackCopy(text, successMsg);
            }
        };

        window.fallbackCopy = function(text, successMsg) {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand('copy');
                window.showToastBanner(successMsg);
            } catch (e) {
                var nlChar = String.fromCharCode(10);
                alert('Data:' + nlChar + text);
            }
            document.body.removeChild(ta);
        };

        window.showToastBanner = function(msg) {
            var t = document.getElementById('floating-copy-toast');
            if (!t) {
                t = document.createElement('div');
                t.id = 'floating-copy-toast';
                t.className = 'floating-toast no-print';
                document.body.appendChild(t);
            }
            t.innerText = msg;
            t.classList.add('show');
            setTimeout(function() { t.classList.remove('show'); }, 3200);
        };

        window.saveSettingsToSupabase = async function(showToast) {
            window.syncSettingsWithStorageAndParent();

            var toast = document.getElementById('toast-indicator');
            if (toast && showToast) {
                toast.innerText = '⏳ Menyimpan style...';
                toast.classList.add('show');
            }

            try {
                var resp = await fetch(window.SUPABASE_URL + '/rest/v1/user_print_settings', {
                    method: 'POST',
                    headers: {
                        'apikey': window.SUPABASE_ANON_KEY,
                        'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY,
                        'Content-Type': 'application/json',
                        'Prefer': 'resolution=merge-duplicates'
                    },
                    body: JSON.stringify({
                        user_email: window.activeUserEmail,
                        settings: window.currentSettings,
                        updated_at: new Date().toISOString()
                    })
                });

                if (toast && showToast) {
                    toast.innerText = '✅ Style tersimpan di Akun & Browser!';
                    setTimeout(function() { toast.classList.remove('show'); }, 3500);
                }
            } catch (err) {
                if (toast && showToast) {
                    toast.innerText = '✅ Style tersimpan di Akun & Browser!';
                    setTimeout(function() { toast.classList.remove('show'); }, 3500);
                }
            }
        };

        window.resetToFactoryDefaults = function() {
            if (!confirm('Kembalikan seluruh ukuran & style cetak ke default pabrik?')) return;
            window.currentSettings = {
                paperWidth: 100,
                pageHeight: 140,
                rowHeight: 46,
                layoutDirection: "row",
                qrSize: 32,
                qrOffsetX: 0,
                qrOffsetY: 0,
                textOffsetX: 5,
                textOffsetY: 0,
                textAlign: "left",
                skuSize: 22,
                skuWeight: "900",
                idSize: 14,
                dateSize: 12,
                dateWeight: "800",
                showDate: "block",
                showRak: "inline-block",
                showKoli: "none",
                showQty: "none",
                rakSize: 11,
                koliSize: 11,
                qtySize: 13,
                qtyWeight: "900",
                slotPosition: "bottom-right",
                slotSize: 9,
                slotOffsetX: 0,
                cellPadY: 6,
                cellPadX: 8,
                borderStyle: "dashed",
                borderWidth: "2px",
                borderColor: "#000",
                showSlot: "block",
                sizePreset: "140"
            };
            window.updateFormInputs(window.currentSettings);
            window.applyStylesToDom(window.currentSettings);
            window.saveSettingsToSupabase(true);
        };

        // Initialize and apply styles
        try {
            window.updateFormInputs(window.currentSettings);
            window.applyStylesToDom(window.currentSettings);
            if (window.singleData) {
                window.recalculateAndRenderBoxes();
            }
        } catch (e) {
            console.error('Init thermal print style error:', e);
        }
    </script>
</body>
</html>`;

        try {
            const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
            const blobUrl = URL.createObjectURL(blob);
            const win = window.open(blobUrl, '_blank');
            if (!win) {
                setToast({ isOpen: true, message: 'Pop-up browser diblokir! Izinkan pop-up untuk mencetak label.', type: 'warning' });
            }
        } catch (err) {
            console.error('Error opening thermal print window:', err);
            setToast({ isOpen: true, message: 'Gagal membuka halaman cetak label.', type: 'error' });
        }
    };

    // Print Single Item (Directly prints requested Barcode Count without unwanted carton division)
    const handlePrintThermalLabel = (
        item: any,
        overrideMode?: 'capacity' | 'count' | 'copies',
        overrideVal?: number
    ) => {
        const sku = item.sku || item.nama_barang || item.nama_produk || '-';
        const rak = item.sub_rak || item.rak || '-';
        const tgl_scan = item.tgl_scan || item.tgl || '';
        const waktu = item.waktu || '';
        const rawQty = Number(item.jumlah ?? item.qty ?? item.tersedia ?? 1);
        const totalQty = isNaN(rawQty) || rawQty <= 0 ? 1 : rawQty;

        // Directly resolve requested barcode count
        let barcodeCount = 1;
        if (typeof item.boxCount === 'number' && item.boxCount > 0) {
            barcodeCount = item.boxCount;
        } else if (typeof item.box_count === 'number' && item.box_count > 0) {
            barcodeCount = item.box_count;
        } else {
            const rawNote = String(item.log_update_user || item.status || item.keterangan || '');
            const match = rawNote.match(/BOX_COUNT:(\d+)/i);
            if (match && match[1]) {
                const parsed = parseInt(match[1], 10);
                if (!isNaN(parsed) && parsed > 0) {
                    barcodeCount = parsed;
                }
            }
            if (barcodeCount === 1 && typeof window !== 'undefined') {
                const cleanR = (rak || item.sub_rak || item.rak || '').trim().toUpperCase();
                const cleanS = (sku || item.sku || item.nama_barang || item.nama_produk || '').trim().toLowerCase();
                const localKey = `box_count_${cleanR}_${cleanS}`;
                const cached = localStorage.getItem(localKey);
                if (cached) {
                    const parsed = parseInt(cached, 10);
                    if (!isNaN(parsed) && parsed > 0) barcodeCount = parsed;
                }
            }
        }

        if (overrideVal && overrideVal > 0) {
            barcodeCount = overrideVal;
        }

        const sn1 = generateSnCode(item, 1);
        const sn2 = generateSnCode(item, 2);
        const sn3 = generateSnCode(item, 3);

        renderThermalPrintWindow({
            title: `Print Label QR Thermal - ${sku}`,
            mode: 'single',
            singleItem: { 
                sku, 
                sn1, 
                sn2, 
                sn3, 
                rak, 
                tgl_scan, 
                waktu, 
                totalQty, 
                boxQty: totalQty, 
                boxCount: barcodeCount, 
                splitMode: 'count' 
            }
        });
    };

    // Print All Finished Items in Batch (Grouped up to 3 items per thermal page: 1 item=1 label, 2 items=2 labels, 3 items=3 labels)
    const handlePrintBatchThermalLabels = () => {
        const targetList = filteredFinishedLogs.length > 0 ? filteredFinishedLogs : finishedLogs;
        if (!targetList || targetList.length === 0) {
            setToast({ isOpen: true, message: 'Tidak ada data selesai yang dapat dicetak.', type: 'info' });
            return;
        }

        const batchItems: Array<{ sku: string; sn: string; rak: string; slotNum: number; tgl_scan: string; waktu: string; qty?: number }> = [];
        targetList.forEach((log, idx) => {
            const sku = log.sku || log.nama_barang || log.nama_produk || '-';
            const rak = log.sub_rak || log.rak || '-';
            const tgl_scan = log.tgl_scan || log.tgl || '';
            const waktu = log.waktu || '';
            const rawQty = Number(log.jumlah ?? log.qty ?? 0);
            const sn = generateSnCode(log, idx + 1);
            const slotNum = (idx % 3) + 1;
            batchItems.push({ sku, sn, rak, slotNum, tgl_scan, waktu, qty: rawQty > 0 ? rawQty : undefined });
        });

        renderThermalPrintWindow({
            title: `Print Batch QR Thermal (${batchItems.length} Data)`,
            mode: 'batch',
            batchItems
        });
    };

    const handleSelectRackFromSearch = (targetRak: string) => {
        if (!targetRak) return;
        const cleanRak = targetRak.trim().toUpperCase();
        setRackId(cleanRak);
        fetchItems(cleanRak);
        setShowGlobalResults(false);
        setGlobalSearchTerm('');
    };

    // Helper to check if source item in its origin rack is ALREADY verified (global multi-user check)
    const checkIfSourceItemVerified = async (sourceRak: string, prodName: string): Promise<boolean> => {
        if (!sourceRak || !prodName) return false;
        const cleanRak = sourceRak.trim().toUpperCase();
        if (cleanRak.startsWith('TEMP')) return false; // Temporary racks are never verified

        // Check Database Log for latest VERIFY/UNVERIFY status (single source of truth)
        try {
            const { data: vLogs } = await supabase
                .from('database_log')
                .select('gudang, created_at, id')
                .or(`rak.eq.${cleanRak},sub_rak.eq.${cleanRak}`)
                .ilike('sku', prodName.trim())
                .in('gudang', ['VERIFY', 'UNVERIFY'])
                .order('created_at', { ascending: false })
                .order('id', { ascending: false })
                .limit(1);

            if (vLogs && vLogs.length > 0) {
                return vLogs[0].gudang === 'VERIFY';
            }
        } catch (err) {
            console.error('Error checking source rack verification status:', err);
        }

        // No DB log found = not verified
        return false;
    };

    // Unique rack prefixes (A, B, C, D...)
    const availablePrefixes = useMemo(() => {
        const setPrefixes = new Set<string>();
        rackOptions.forEach(r => {
            const match = r.trim().toUpperCase().match(/^([A-Z]+)/);
            if (match) {
                setPrefixes.add(match[1]);
            }
        });
        return Array.from(setPrefixes).sort();
    }, [rackOptions]);

    // Racks filtered by prefix & search for DevMode modal
    const bulkFilteredRacks = useMemo(() => {
        return rackOptions.filter(r => {
            const upper = r.trim().toUpperCase();
            const matchesSearch = !bulkRackSearch || upper.includes(bulkRackSearch.trim().toUpperCase());
            const matchesPrefix = bulkPrefixFilter === 'ALL' || upper.startsWith(bulkPrefixFilter);
            return matchesSearch && matchesPrefix;
        });
    }, [rackOptions, bulkPrefixFilter, bulkRackSearch]);

    // Racks filtered for Interactive Rack Explorer Dashboard
    const explorerFilteredRacks = useMemo(() => {
        return rackOptions.filter(r => {
            const upper = r.trim().toUpperCase();
            const matchesSearch = !explorerSearch || upper.includes(explorerSearch.trim().toUpperCase());
            const matchesPrefix = selectedPrefixTab === 'ALL' || upper.startsWith(selectedPrefixTab);
            return matchesSearch && matchesPrefix;
        });
    }, [rackOptions, selectedPrefixTab, explorerSearch]);

    // Fetch rack options & pending karantina count on mount
    useEffect(() => {
        fetchRackOptions();
        fetchPendingKarantinaCount();

        const channel = supabase
            .channel('realtime:cekrak2_karantina_count')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'karantina_revisi_out' }, () => {
                fetchPendingKarantinaCount();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'quarantined_items' }, () => {
                fetchPendingKarantinaCount();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchPendingKarantinaCount = async () => {
        try {
            const { data } = await DatabaseService.fetchKarantina();
            if (data) {
                const pending = data.filter((item: any) => item.status === 'MENUNGGU_REVISI').length;
                setPendingKarantinaCount(pending);
            }
        } catch {
            // Abaikan jika tabel belum siap
        }
    };

    const fetchRackOptions = async () => {
        try {
            const [rackRes, stockRes] = await Promise.all([
                supabase.from('rack_locations').select('nama'),
                supabase.from('stock_items').select('rak, sub_rak').neq('status', 'Non-Aktif')
            ]);

            const allRackNames: string[] = [];

            if (rackRes.data) {
                rackRes.data.forEach(r => {
                    if (r.nama) allRackNames.push(r.nama.trim().toUpperCase());
                });
            }

            if (stockRes.data) {
                stockRes.data.forEach(s => {
                    if (s.rak) allRackNames.push(s.rak.trim().toUpperCase());
                    if (s.sub_rak) allRackNames.push(s.sub_rak.trim().toUpperCase());
                });
            }

            // Natural numerical sorting (A1, A2, A3... A10, A11... A99, B1, B2...)
            const uniqueOptions = Array.from(new Set(allRackNames)).sort((a, b) => {
                return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
            });

            setRackOptions(uniqueOptions);
        } catch (error) {
            console.error('Error fetching rack options:', error);
        }
    };

    // Real-time subscription for 100% instant sync with database
    useEffect(() => {
        if (!lastScanned) return;
        const currentRackClean = lastScanned.trim().toUpperCase();

        let debounceTimeout: NodeJS.Timeout | null = null;
        const debouncedFetch = () => {
            if (debounceTimeout) clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(() => {
                fetchItems(lastScanned, true);
            }, 1000);
        };

        const subscription = supabase
            .channel(`cek-rak-changes-${currentRackClean}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'stock_items'
                },
                (payload) => {
                    const newRow = payload.new as StockItem;
                    const oldRow = payload.old as StockItem;

                    const matchRack = (r?: string) => r && r.trim().toUpperCase() === currentRackClean;
                    if (matchRack(newRow?.rak) || matchRack(newRow?.sub_rak) || matchRack(oldRow?.rak) || matchRack(oldRow?.sub_rak)) {
                        debouncedFetch();
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'database_log'
                },
                (payload) => {
                    const newLog = payload.new as any;
                    const matchLogRack = (r?: string) => r && r.trim().toUpperCase() === currentRackClean;
                    if (matchLogRack(newLog?.rak) || matchLogRack(newLog?.sub_rak)) {
                        debouncedFetch();
                    }
                }
            )
            .subscribe();

        return () => {
            if (debounceTimeout) clearTimeout(debounceTimeout);
            supabase.removeChannel(subscription);
        };
    }, [lastScanned]);

    const showToast = (message: string, type: 'success' | 'info' | 'error') => {
        setToast({ isOpen: true, message, type });
        setTimeout(() => setToast(prev => ({ ...prev, isOpen: false })), 3000);
    };

    const fetchItems = async (rak: string, isUpdate = false) => {
        if (!rak) return;

        if (!isUpdate) {
            setLoading(true);
            setLastScanned(rak);
            setRackId(rak);
            setVerifiedIds(new Set());
            updateRecentRacks(rak);
        }

        try {
            const cleanRak = rak.trim();

            let allData = [];
            let hasMore = true;
            let page = 0;
            const pageSize = 1000;

            while (hasMore) {
                const { data, error } = await supabase
                    .from('stock_items')
                    .select('*')
                    .or(`rak.ilike.${cleanRak},sub_rak.ilike.${cleanRak}`)
                    .eq('status', 'Aktif')
                    .gt('tersedia', 0)
                    .order('nama_produk', { ascending: true })
                    .range(page * pageSize, (page + 1) * pageSize - 1);

                if (error) throw error;

                if (data && data.length > 0) {
                    allData = [...allData, ...data];
                    page++;
                    if (data.length < pageSize) hasMore = false;
                } else {
                    hasMore = false;
                }
            }

            // Aggregate data by sku/nama_produk to prevent visual duplicates if database has redundant rows
            const aggregatedMap = new Map<string, StockItem>();
            allData.forEach((item: StockItem) => {
                const key = `${item.nama_produk}-${item.rak}`;
                if (aggregatedMap.has(key)) {
                    const existing = aggregatedMap.get(key)!;
                    existing.tersedia += item.tersedia;
                    // Note: We use the first ID we encounter for UI purposes
                } else {
                    aggregatedMap.set(key, { ...item });
                }
            });

            const finalData = Array.from(aggregatedMap.values());
            setItems(finalData);
            const data = finalData;

            // Load persistently verified items from localStorage for this rack
            // If current rack is a temporary rack (TEMP-A, TEMP-B, etc.), DO NOT mark items as TERKONFIRMASI
            const isTempRak = cleanRak.toUpperCase().startsWith('TEMP');

            if (!isTempRak) {
                const storageKey = `verified_rak_${cleanRak.toUpperCase()}`;
                const unverifiedKey = `unverified_rak_${cleanRak.toUpperCase()}`;
                const localVerified = JSON.parse(localStorage.getItem(storageKey) || '[]');
                const localVerifiedSet = new Set(localVerified.map((s: string) => String(s).trim().toLowerCase()));

                const localUnverified = JSON.parse(localStorage.getItem(unverifiedKey) || '[]');
                const localUnverifiedSet = new Set(localUnverified.map((s: string) => String(s).trim().toLowerCase()));

                // Query Universal Verification logs from Supabase database_log
                // IMPORTANT: Use exact match (eq) NOT ilike to prevent cross-rack contamination
                const { data: vLogs } = await supabase
                    .from('database_log')
                    .select('sku, type, created_at, gudang, id')
                    .or(`rak.eq.${cleanRak.toUpperCase()},sub_rak.eq.${cleanRak.toUpperCase()}`)
                    .in('gudang', ['VERIFY', 'UNVERIFY'])
                    .order('created_at', { ascending: true })
                    .order('id', { ascending: true });

                // Map product_name -> latest status ('VERIFY' | 'UNVERIFY')
                const latestDbStatusMap = new Map<string, 'VERIFY' | 'UNVERIFY'>();
                (vLogs || []).forEach(l => {
                    const skuKey = l.sku?.trim().toLowerCase();
                    if (skuKey) {
                        if (l.gudang === 'UNVERIFY') {
                            latestDbStatusMap.set(skuKey, 'UNVERIFY');
                        } else if (l.gudang === 'VERIFY') {
                            latestDbStatusMap.set(skuKey, 'VERIFY');
                        }
                    }
                });

                // Update localStorage to stay 100% in sync with Supabase
                const updatedVerifiedList: string[] = [];
                const updatedUnverifiedList: string[] = [];

                setVerifiedIds(prev => {
                    const nextSet = new Set<string>();
                    finalData.forEach(item => {
                        const itemProd = item.nama_produk?.trim().toLowerCase();
                        if (itemProd) {
                            const latestStatus = latestDbStatusMap.get(itemProd);
                            if (latestStatus === 'UNVERIFY') {
                                updatedUnverifiedList.push(itemProd);
                            } else if (latestStatus === 'VERIFY') {
                                nextSet.add(item.id);
                                updatedVerifiedList.push(itemProd);
                            } else {
                                // Fallback to localStorage if no universal DB log exists yet
                                if (localUnverifiedSet.has(itemProd)) {
                                    updatedUnverifiedList.push(itemProd);
                                } else if (localVerifiedSet.has(itemProd)) {
                                    nextSet.add(item.id);
                                    updatedVerifiedList.push(itemProd);
                                }
                            }
                        }
                    });
                    return nextSet;
                });

                if (latestDbStatusMap.size > 0) {
                    localStorage.setItem(storageKey, JSON.stringify(Array.from(new Set(updatedVerifiedList))));
                    localStorage.setItem(unverifiedKey, JSON.stringify(Array.from(new Set(updatedUnverifiedList))));
                }
            }

            if (!isUpdate) {
                if (data && data.length > 0) {
                    showToast(`Ditemukan ${data.length} barang di Rak ${cleanRak}`, 'success');
                } else {
                    showToast(`Rak ${cleanRak} kosong atau tidak ditemukan`, 'info');
                }
            }
        } catch (error) {
            console.error('Error fetching items:', error);
            showToast('Gagal memuat data rak', 'error');
        } finally {
            setLoading(false);
            setIsSideMenuOpen(false);
        }
    };

    
    const calculateExactStockByTglScan = async (sku: string, rak: string, jumlah_pindah: number) => {
        const { data: logs, error } = await supabase
            .from('database_log')
            .select('*')
            .eq('sku', sku)
            .eq('rak', rak)
            .in('type', ['IN', 'OUT'])
            .order('tgl_scan', { ascending: true })
            .order('waktu', { ascending: true });
            
        if (error || !logs) return [];

        const stockMap = new Map();
        logs.forEach(log => {
            const date = log.tgl_scan;
            if (!stockMap.has(date)) stockMap.set(date, { in: 0, out: 0, records: [] });
            if (log.type === 'IN') {
                stockMap.get(date).in += log.jumlah;
                stockMap.get(date).records.push(log);
            } else if (log.type === 'OUT') {
                stockMap.get(date).out += log.jumlah;
            }
        });

        let remainingNeeded = jumlah_pindah;
        const slices = [];
        
        for (const [date, data] of Array.from(stockMap.entries())) {
            const available = data.in - data.out;
            if (available > 0) {
                const take = Math.min(available, remainingNeeded);
                if (take > 0) {
                    slices.push({
                        tgl_scan: date,
                        waktu: data.records[0]?.waktu || new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
                        jumlah: take
                    });
                    remainingNeeded -= take;
                }
            }
            if (remainingNeeded <= 0) break;
        }
        
        if (remainingNeeded > 0) {
            const now = new Date();
            slices.push({
                tgl_scan: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
                waktu: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
                jumlah: remainingNeeded
            });
        }
        return slices;
    };

    // --- AUDIT MODE FUNCTIONS (NEW FLOW) ---

    // Mengambil sisa stok asli berdasarkan log transfer agar akurat per tgl_scan
    const calculateStockForPullByTglScan = async (sku: string, rakAsal: string, tgl_scan: string) => {
        const { data: logs, error } = await supabase
            .from('database_log')
            .select('*')
            .eq('sku', sku)
            .eq('tgl_scan', tgl_scan)
            .or(`rak.eq.${rakAsal},rak_tujuan.eq.${rakAsal}`);

        if (error) {
            console.error('Error fetching logs:', error);
            return 0;
        }

        let totalIn = 0;
        let totalOut = 0;

        logs?.forEach(log => {
            if (log.jenis_log === 'IN' && log.rak === rakAsal) totalIn += log.jumlah;
            if (log.jenis_log === 'OUT' && log.rak === rakAsal) totalOut += log.jumlah;
            if (log.jenis_log === 'TRANSFER') {
                if (log.rak === rakAsal) totalOut += log.jumlah; // keluar dari rak ini
                if (log.rak_tujuan === rakAsal) totalIn += log.jumlah; // masuk ke rak ini
            }
        });

        return totalIn - totalOut;
    };

    
    const openPullModal = async () => {
        setShowPullModal(true);
        setIsFetchingPullData(true);
        try {
            const cleanRak = (lastScanned || '').trim();

            const confirmedProductNames = new Set(
                items
                    .filter(item => verifiedIds.has(item.id))
                    .map(item => item.nama_produk?.trim().toLowerCase())
            );

            // Fetch transfer logs to find all (sku, rak) pairs that are already TERKONFIRMASI in any audit rack
            const { data: transferLogs } = await supabase
                .from('database_log')
                .select('sku, rak')
                .eq('gudang', 'TRANSFER')
                .eq('type', 'IN');

            const confirmedPairs = new Set(
                (transferLogs || [])
                    .filter(l => l.rak && !l.rak.trim().toUpperCase().startsWith('TEMP'))
                    .map(l => `${l.sku?.trim().toLowerCase()}|||${l.rak?.trim().toLowerCase()}`)
            );

            // Fetch top initial available items instantly (sub-100ms)
            const { data, error } = await supabase
                .from('stock_items')
                .select('*')
                .eq('status', 'Aktif')
                .neq('rak', cleanRak)
                .gt('tersedia', 0)
                .order('nama_produk', { ascending: true })
                .limit(200);

            if (error) throw error;

            // Filter out items already confirmed in their source physical rack
            // (Barang dari wadah penampung TEMP-* SELALU BISA ditarik ke rak tujuan untuk menambah/akumulasi stok)
            const filteredData = data?.filter((item: any) => {
                const prodName = item.nama_produk?.trim().toLowerCase();
                const itemRak = (item.rak || '').trim().toUpperCase();

                if (!itemRak.startsWith('TEMP')) {
                    if (confirmedProductNames.has(prodName)) return false;
                    if (confirmedPairs.has(`${prodName}|||${item.rak?.trim().toLowerCase()}`)) return false;
                }

                // Khusus staf gudang / admin atau mode filter TEMP: HANYA tampilkan stok dari wadah penampung TEMP
                if (pullSourceFilter === 'TEMP' || !isDeveloper) {
                    if (!itemRak.startsWith('TEMP')) return false;
                }
                return true;
            });

            // Aggregate duplicate stock items by nama_produk and rak
            const aggregatedMap = new Map<string, any>();
            filteredData?.forEach((item: any) => {
                const key = `${item.nama_produk}-${item.rak}`;
                if (aggregatedMap.has(key)) {
                    const existing = aggregatedMap.get(key);
                    existing.tersedia += item.tersedia;
                } else {
                    aggregatedMap.set(key, { ...item });
                }
            });
            const finalPullable = Array.from(aggregatedMap.values());

            setAllPullableItems(finalPullable);
            setPullSearchResults(finalPullable);
        } catch (error: any) {
            console.error('Failed to load pull items', error);
            setToast({ isOpen: true, message: 'Gagal memuat daftar barang untuk ditarik', type: 'error' });
        } finally {
            setIsFetchingPullData(false);
        }
        
        setPullSearchTerm('');
    };

    const handleSearchPull = async (term: string) => {
        setPullSearchTerm(term);
        if (!term.trim()) {
            setPullSearchResults(allPullableItems);
            return;
        }

        setIsSearchingPull(true);
        try {
            const cleanRak = (lastScanned || '').trim();

            const confirmedProductNames = new Set(
                items
                    .filter(item => verifiedIds.has(item.id))
                    .map(item => item.nama_produk?.trim().toLowerCase())
            );

            // Fetch transfer logs to find all (sku, rak) pairs that are already TERKONFIRMASI in any audit rack
            const { data: transferLogs } = await supabase
                .from('database_log')
                .select('sku, rak')
                .eq('gudang', 'TRANSFER')
                .eq('type', 'IN');

            const confirmedPairs = new Set(
                (transferLogs || [])
                    .filter(l => l.rak && !l.rak.trim().toUpperCase().startsWith('TEMP'))
                    .map(l => `${l.sku?.trim().toLowerCase()}|||${l.rak?.trim().toLowerCase()}`)
            );

            const { data, error } = await supabase
                .from('stock_items')
                .select('*')
                .eq('status', 'Aktif')
                .neq('rak', cleanRak)
                .gt('tersedia', 0)
                .ilike('nama_produk', `%${term.trim()}%`)
                .limit(100);

            if (error) throw error;

            // Filter out items already confirmed in their source physical rack
            // (Barang dari wadah penampung TEMP-* SELALU BISA ditarik ke rak tujuan untuk menambah/akumulasi stok)
            const filteredData = data?.filter((item: any) => {
                const prodName = item.nama_produk?.trim().toLowerCase();
                const itemRak = (item.rak || '').trim().toUpperCase();

                if (!itemRak.startsWith('TEMP')) {
                    if (confirmedProductNames.has(prodName)) return false;
                    if (confirmedPairs.has(`${prodName}|||${item.rak?.trim().toLowerCase()}`)) return false;
                }

                // Khusus staf gudang / admin atau mode filter TEMP: HANYA tampilkan stok dari wadah penampung TEMP
                if (pullSourceFilter === 'TEMP' || !isDeveloper) {
                    if (!itemRak.startsWith('TEMP')) return false;
                }
                return true;
            });

            const aggregatedMap = new Map<string, any>();
            filteredData?.forEach((item: any) => {
                const key = `${item.nama_produk}-${item.rak}`;
                if (aggregatedMap.has(key)) {
                    const existing = aggregatedMap.get(key);
                    existing.tersedia += item.tersedia;
                } else {
                    aggregatedMap.set(key, { ...item });
                }
            });

            setPullSearchResults(Array.from(aggregatedMap.values()));
        } catch (err) {
            console.error('Error searching pull items:', err);
        } finally {
            setIsSearchingPull(false);
        }
    };

    
    // Auto-detect default packaging carton size for a SKU
    const detectDefaultPacking = (skuName: string, itemPacking?: string, availableQty?: number): number => {
        try {
            if (itemPacking) {
                const match = itemPacking.match(/(\d+)/);
                if (match) {
                    const num = parseInt(match[1], 10);
                    if (num > 0) return num;
                }
            }
            const conversions = skuConversionService.getCachedConversions();
            const cleanSku = (skuName || '').trim().toUpperCase();
            const foundConv = conversions.find(c => 
                (c.sku_pcs || '').trim().toUpperCase() === cleanSku || 
                (c.sku_konversi || '').trim().toUpperCase() === cleanSku
            );
            if (foundConv && foundConv.qty > 0) return foundConv.qty;
        } catch (e) {}
        
        const q = availableQty || 0;
        if (q >= 96 && q % 48 === 0) return 48;
        if (q >= 48 && q % 24 === 0) return 24;
        if (q >= 24 && q % 12 === 0) return 12;
        return 48; // Standard default carton capacity
    };

    const handlePullDropdownSelect = (selectedString: string) => {
        const match = selectedString.match(/^\[(.*?)\] (.*?) \| RAK: (.*?) \| STOK: (.*?)$/);
        if (match) {
            const id = match[1];
            if (id) {
                // Cari data aslinya
                const item = allPullableItems.find(x => x.id === id);
                if (item) {
                    setPullItem(item);
                    setPullQuantity(item.tersedia);
                    setPullBoxCount('');
                    setShowPullQuantityModal(true);
                }
            }
        }
    };

    const selectPullItem = async (item: any) => {
        try {
            // Check if item is already verified in its source rack (with await)
            const isVerified = await checkIfSourceItemVerified(item.rak, item.nama_produk);
            if (isVerified) {
                setToast({
                    isOpen: true,
                    message: `⚠️ Barang "${item.nama_produk}" di Rak asal "${item.rak}" sudah TERKONFIRMASI! Tidak dapat ditarik.`,
                    type: 'error'
                });
                return;
            }
            const { data } = await supabase
                .from('stock_items')
                .select('tersedia, keluar, packing')
                .eq('nama_produk', item.nama_produk)
                .eq('rak', item.rak)
                .eq('status', 'Aktif');

            const freshTersedia = data?.reduce((sum, r) => sum + (r.tersedia || 0), 0) ?? item.tersedia;
            const freshKeluar = data?.reduce((sum, r) => sum + (r.keluar || 0), 0) ?? item.keluar;
            const freshPacking = data?.[0]?.packing || item.packing;

            const updatedItem = {
                ...item,
                tersedia: freshTersedia,
                keluar: freshKeluar,
                packing: freshPacking
            };

            // Update allPullableItems & search results in state real-time
            setAllPullableItems(prev => prev.map(x => {
                if (x.nama_produk === item.nama_produk && x.rak === item.rak) {
                    return { ...x, tersedia: freshTersedia, packing: freshPacking };
                }
                return x;
            }));

            setPullBoxCount('');
            setPullItem(updatedItem);
            setPullQuantity(''); // Default kosong agar pengguna bisa input manual
            setShowPullQuantityModal(true);
            setPullSearchTerm('');
        } catch (error) {
            console.error('Error fetching fresh pull item:', error);
            setPullBoxCount('');
            setPullItem(item);
            setPullQuantity(''); // Default kosong agar pengguna bisa input manual
            setShowPullQuantityModal(true);
        }
    };

    const handleConfirmPull = async () => {
        if (isPulling) return;
        if (!lastScanned || !pullItem || pullQuantity === '' || pullQuantity <= 0) return;

        setIsPulling(true);
        try {
            if (pullQuantity > pullItem.tersedia) {
                setToast({ isOpen: true, message: `Stok tidak cukup. Maks: ${pullItem.tersedia}`, type: 'error' });
                return;
            }

            // Check if source item in its origin rack is ALREADY verified (tidak bisa ditarik ke rak lain)
            const isSourceVerified = await checkIfSourceItemVerified(pullItem.rak, pullItem.nama_produk);
            if (isSourceVerified) {
                setToast({
                    isOpen: true,
                    message: `⚠️ Barang "${pullItem.nama_produk}" di Rak asal "${pullItem.rak}" sudah TERKONFIRMASI! Tidak dapat ditarik.`,
                    type: 'error'
                });
                return;
            }

            // Realtime timestamp for transfer log
            const { todayTgl, nowWaktu } = getRealtimeDateTime();
            
            const now = new Date();
            // Use current timestamp for created_at so transaction logs sort properly to the top
            const createdAtOut = new Date(now.getTime() + 1000).toISOString();
            const createdAtIn = new Date(now.getTime() + 2000).toISOString();

            const countNum = typeof pullBoxCount === 'number' && pullBoxCount > 0 ? pullBoxCount : undefined;
            const logEntries = [
                {
                    tgl: todayTgl,
                    waktu: nowWaktu,
                    sku: pullItem.nama_produk,
                    jumlah: pullQuantity,
                    type: 'OUT',
                    gudang: 'TRANSFER',
                    rak: pullItem.rak,
                    tgl_scan: todayTgl,
                    user_name: 'System (Tarik Fisik)',
                    sub_rak: pullItem.sub_rak || pullItem.rak,
                    created_at: createdAtOut,
                    log_update_user: countNum ? `BOX_COUNT:${countNum}` : undefined
                },
                {
                    tgl: todayTgl,
                    waktu: nowWaktu,
                    sku: pullItem.nama_produk,
                    jumlah: pullQuantity,
                    type: 'IN',
                    gudang: 'TRANSFER',
                    rak: lastScanned,
                    tgl_scan: todayTgl,
                    user_name: 'System (Tarik Fisik)',
                    sub_rak: lastScanned,
                    created_at: createdAtIn,
                    log_update_user: countNum ? `BOX_COUNT:${countNum}` : undefined
                }
            ];

            // Ensure destination stock item exists and has correct stock numbers
            const pullQty = Number(pullQuantity);
            const { data: existingTargets } = await supabase
                .from('stock_items')
                .select('id, stok_awal, masuk, keluar, tersedia')
                .eq('nama_produk', pullItem.nama_produk)
                .eq('rak', lastScanned)
                .limit(1);
            
            const targetStock = existingTargets?.[0];

            if (!targetStock) {
                await DatabaseService.insertStockItems([{
                    nama_produk: pullItem.nama_produk,
                    satuan: pullItem.satuan,
                    stok_awal: 0,
                    masuk: pullQty,
                    keluar: 0,
                    tersedia: pullQty,
                    packing: pullItem.packing || '',
                    rak: lastScanned,
                    sub_rak: lastScanned,
                    status: 'Aktif'
                }], writeMode);
            } else {
                const newMasuk = (targetStock.masuk || 0) + pullQty;
                const newTersedia = (targetStock.stok_awal || 0) + newMasuk - (targetStock.keluar || 0);
                await DatabaseService.updateStockItem(targetStock.id, {
                    masuk: newMasuk,
                    tersedia: Math.max(0, newTersedia)
                }, writeMode);
            }

            // Update source stock item in stock_items
            const newSourceKeluar = (pullItem.keluar || 0) + pullQty;
            const newSourceTersedia = Math.max(0, (pullItem.stok_awal || 0) + (pullItem.masuk || 0) - newSourceKeluar);
            await DatabaseService.updateStockItem(pullItem.id, {
                keluar: newSourceKeluar,
                tersedia: newSourceTersedia
            }, writeMode);

            // Insert log entries
            const { error: logError } = await DatabaseService.insertLogs(logEntries, writeMode);
            if (logError) throw logError;

            setToast({ isOpen: true, message: `Berhasil menarik ${pullQuantity} ${pullItem.satuan} ${pullItem.nama_produk} dari Rak ${pullItem.rak}`, type: 'success' });
            
            // Automatically mark pulled item as verified (terkonfirmasi) UNLESS it's a TEMP rack
            if (lastScanned && !lastScanned.toUpperCase().trim().startsWith('TEMP')) {
                const cleanRak = lastScanned.toUpperCase().trim();
                const prodName = pullItem.nama_produk?.trim().toLowerCase();
                
                // Update Local Storage
                const storageKey = `verified_rak_${cleanRak}`;
                const unverifiedKey = `unverified_rak_${cleanRak}`;
                const existing: string[] = JSON.parse(localStorage.getItem(storageKey) || '[]');
                if (!existing.includes(prodName)) {
                    existing.push(prodName);
                    localStorage.setItem(storageKey, JSON.stringify(existing));
                }
                const existingUnverified: string[] = JSON.parse(localStorage.getItem(unverifiedKey) || '[]');
                const filteredUnverified = existingUnverified.filter((name: string) => name.trim().toLowerCase() !== prodName);
                localStorage.setItem(unverifiedKey, JSON.stringify(filteredUnverified));
                
                if (countNum && typeof window !== 'undefined') {
                    localStorage.setItem(`box_count_${cleanRak}_${prodName}`, String(countNum));
                }

                // Clean up any old UNVERIFY records for this item in this rack so VERIFY is cleanly recorded
                try {
                    await supabase
                        .from('database_log')
                        .delete()
                        .eq('gudang', 'UNVERIFY')
                        .ilike('sku', pullItem.nama_produk)
                        .or(`rak.eq.${cleanRak},sub_rak.eq.${cleanRak}`);
                } catch (delErr) {
                    console.warn('Could not cleanup UNVERIFY logs:', delErr);
                }

                // Insert VERIFY log inheriting realtime todayTgl & nowWaktu
                await DatabaseService.insertLogs([{
                    tgl: todayTgl,
                    waktu: nowWaktu,
                    sku: pullItem.nama_produk,
                    jumlah: pullQty,
                    type: 'MOVE',
                    gudang: 'VERIFY',
                    rak: cleanRak,
                    tgl_scan: todayTgl,
                    user_name: user?.email || userName || 'System (Tarik Fisik)',
                    sub_rak: cleanRak,
                    log_update_user: countNum ? `BOX_COUNT:${countNum}` : undefined
                }], writeMode);

                // Ensure it gets marked visually right away
                const { data: targetItem } = await supabase
                    .from('stock_items')
                    .select('id')
                    .eq('nama_produk', pullItem.nama_produk)
                    .eq('rak', lastScanned)
                    .maybeSingle();
    
                if (targetItem?.id) {
                    setVerifiedIds(prev => new Set(prev).add(targetItem.id));
                }
            }

            setShowPullQuantityModal(false);
            setPullItem(null);
            setPullQuantity('');
            setPullBoxCount('');

            // Refresh data rak ini & data selesai diproses
            await fetchItems(lastScanned, true);
            await fetchAllFinishedItems();
            
            // Update list state agar angka di modal pencarian langsung ter-update (misal 480 -> 400)
            const newRemaining = pullItem.tersedia - Number(pullQuantity);
            setAllPullableItems(prev => prev.map(x => {
                if (x.nama_produk === pullItem.nama_produk && x.rak === pullItem.rak) {
                    return { ...x, tersedia: newRemaining };
                }
                return x;
            }).filter(x => x.tersedia > 0));

            setPullSearchResults(prev => prev.map(x => {
                if (x.nama_produk === pullItem.nama_produk && x.rak === pullItem.rak) {
                    return { ...x, tersedia: newRemaining };
                }
                return x;
            }).filter(x => x.tersedia > 0));

            setShowPullModal(false);

        } catch (error: any) {
            console.error('Pull error:', error);
            setToast({ isOpen: true, message: 'Gagal menarik barang: ' + error.message, type: 'error' });
        } finally {
            setIsPulling(false);
        }
    };

    // Handler Penelusuran OUT (Fisik Ada Tapi Data 0 - Opsi 2)
    const handleOpenOutTrace = (skuToSearch?: string) => {
        const targetSku = (skuToSearch || pullSearchTerm || '').trim();
        setOutTraceSku(targetSku);
        setOutTracePhysicalQty('');
        setSelectedOutLog(null);
        setShowOutTraceModal(true);
        if (targetSku) {
            fetchOutLogsForSku(targetSku);
        } else {
            setOutTraceLogs([]);
        }
    };

    const fetchOutLogsForSku = async (sku: string) => {
        if (!sku.trim()) return;
        setIsLoadingOutLogs(true);
        setSelectedOutLog(null);
        try {
            // 1. Dapatkan daftar log_id yang SEDANG AKTIF di wadah karantina revisi
            const activeKarantinaLogIds = new Set<string>();
            try {
                const { data: kData } = await DatabaseService.fetchKarantina();
                if (kData && Array.isArray(kData)) {
                    kData
                        .filter((k: any) => k.status === 'MENUNGGU_REVISI')
                        .forEach((k: any) => {
                            if (k.original_log_id) activeKarantinaLogIds.add(String(k.original_log_id));
                        });
                }
            } catch (kErr) {
                console.warn('Gagal memuat id karantina aktif untuk filter:', kErr);
            }

            // 2. Ambil data log OUT dan MOVE (REVISI_KARANTINA)
            const { data, error } = await supabase
                .from('database_log')
                .select('*')
                .ilike('sku', `%${sku.trim()}%`)
                .in('type', ['OUT', 'MOVE'])
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) throw error;

            // Filter log yang relevan untuk ditarik
            const filtered = (data || []).filter(log => {
                const logIdStr = String(log.id);
                const uName = (log.user_name || log.user || '').toLowerCase().trim();
                const gudang = (log.gudang || '').toUpperCase().trim();
                const status = (log.status || log.keterangan || '').toUpperCase().trim();
                const type = (log.type || '').toUpperCase().trim();

                // Jangan tampilkan jika log ini SEDANG AKTIF di wadah karantina
                if (activeKarantinaLogIds.has(logIdStr)) {
                    return false;
                }

                // Jika type MOVE, hanya tampilkan jika log tersebut bekas REVISI_KARANTINA yang sudah dibatalkan/dihapus
                if (type === 'MOVE' && status !== 'REVISI_KARANTINA') {
                    return false;
                }

                // Abaikan log internal transfer
                if (gudang === 'TRANSFER' || gudang === 'SYSTEM' || status === 'TRANSFER_REVISI') {
                    return false;
                }

                // Abaikan log cron / devmode system sync
                if (
                    uName.includes('dev mode') || 
                    uName.includes('devmode') || 
                    uName.includes('developer') ||
                    uName.includes('auto_bg')
                ) {
                    return false;
                }

                return true;
            });

            setOutTraceLogs(filtered.slice(0, 30));
        } catch (err: any) {
            console.error('Error fetching OUT logs for trace:', err);
            setToast({
                isOpen: true,
                message: `Gagal mencari riwayat OUT: ${err.message}`,
                type: 'error'
            });
        } finally {
            setIsLoadingOutLogs(false);
        }
    };

    const handleConfirmOutTrace = async () => {
        if (!lastScanned || !selectedOutLog || outTracePhysicalQty === '' || Number(outTracePhysicalQty) <= 0) {
            setToast({
                isOpen: true,
                message: 'Silakan isi jumlah fisik yang ditemukan dan pilih salah satu transaksi OUT!',
                type: 'error'
            });
            return;
        }

        const physical = Number(outTracePhysicalQty);
        const pulihQty = Number(selectedOutLog.jumlah);
        const sisaBelumAdaData = Math.max(0, physical - pulihQty);

        setIsExecutingOutTrace(true);
        try {
            const currentRack = lastScanned.trim().toUpperCase();
            // Target transit is the active TEMP / Bridge rack (e.g. TEMP-A for rack A1)
            const activeTempRak = getTempRackForPrefix(currentRack) || getTempRackForPrefix(selectedOutLog.rak) || 'TEMP-A';
            const actor = userName || user?.email || 'Staf Gudang';

            // 1. Simpan ke wadah karantina_revisi_out (Dual-write Supabase & Firestore)
            try {
                const karantinaRow = {
                    original_log_id: String(selectedOutLog.id),
                    sku: selectedOutLog.sku,
                    nama_barang: selectedOutLog.nama_barang || selectedOutLog.sku,
                    packing: selectedOutLog.packing || '',
                    jumlah: pulihQty,
                    rak_asal: selectedOutLog.rak || activeTempRak,
                    sub_rak_tujuan: activeTempRak,
                    tgl_out_asli: selectedOutLog.tgl || selectedOutLog.tgl_scan || '',
                    gudang: selectedOutLog.gudang || '',
                    user_pemotong_out: selectedOutLog.user_name || 'System',
                    user_penarik: actor,
                    keterangan_out_asli: selectedOutLog.status || '-',
                    status: 'MENUNGGU_REVISI',
                    sisa_fisik_belum_cocok: sisaBelumAdaData,
                    created_at: new Date().toISOString()
                };

                await DatabaseService.insertKarantina(karantinaRow, writeMode);
                fetchPendingKarantinaCount();
            } catch (kErr) {
                console.warn('Karantina insert error:', kErr);
            }

            // 2. Update log OUT di database_log menjadi MOVE agar tidak memotong saldo aktif (tetap mematuhi check constraint database_log_type_check: IN, OUT, MOVE)
            try {
                const { error: updateLogErr } = await supabase
                    .from('database_log')
                    .update({
                        type: 'MOVE',
                        status: 'REVISI_KARANTINA',
                        log_update_user: `[REVISI KARANTINA] Dipulihkan oleh ${actor} ke wadah ${activeTempRak} (Fisik di: ${currentRack})`
                    })
                    .eq('id', selectedOutLog.id);

                if (updateLogErr) {
                    console.warn('Gagal update log OUT di database_log:', updateLogErr);
                }
            } catch (upErr) {
                console.warn('Error updating database_log:', upErr);
            }

            // 3. Masukkan transfer resmi (OUT dari rak asal dan IN ke rak TEMP transit aktif)
            const now = new Date();
            const tglNormalized = now.toISOString().split('T')[0];
            const tglFormatted = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
            const waktuFormatted = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
            const tglScanFinal = selectedOutLog.tgl_scan || tglNormalized;

            const transferLogs = [
                {
                    sku: selectedOutLog.sku,
                    rak: selectedOutLog.rak || activeTempRak,
                    sub_rak: selectedOutLog.rak || activeTempRak,
                    jumlah: pulihQty,
                    type: 'OUT',
                    gudang: 'TRANSFER',
                    tgl: selectedOutLog.tgl || tglFormatted,
                    waktu: selectedOutLog.waktu || waktuFormatted,
                    tgl_scan: tglScanFinal,
                    tgl_normalized: tglNormalized,
                    user_name: `System (Revisi: ${actor})`,
                    status: 'TRANSFER_REVISI',
                    created_at: new Date(now.getTime() + 500).toISOString()
                },
                {
                    sku: selectedOutLog.sku,
                    rak: activeTempRak,
                    sub_rak: activeTempRak,
                    jumlah: pulihQty,
                    type: 'IN',
                    gudang: 'TRANSFER',
                    tgl: selectedOutLog.tgl || tglFormatted,
                    waktu: selectedOutLog.waktu || waktuFormatted,
                    tgl_scan: tglScanFinal,
                    tgl_normalized: tglNormalized,
                    user_name: `System (Revisi: ${actor})`,
                    status: 'TRANSFER_REVISI',
                    created_at: new Date(now.getTime() + 1000).toISOString()
                }
            ];

            await DatabaseService.insertLogs(transferLogs, writeMode);

            // 4. Update atau Insert ke stock_items untuk rak TEMP transit aktif (akumulasi sub total jika SKU sama)
            const { data: existingDest } = await supabase
                .from('stock_items')
                .select('*')
                .eq('nama_produk', selectedOutLog.sku)
                .eq('rak', activeTempRak)
                .limit(1);

            let targetItemRow = existingDest?.[0];
            if (!targetItemRow) {
                await DatabaseService.insertStockItems([{
                    nama_produk: selectedOutLog.sku,
                    satuan: 'PCS',
                    stok_awal: 0,
                    masuk: pulihQty,
                    keluar: 0,
                    tersedia: pulihQty,
                    packing: selectedOutLog.packing || '',
                    rak: activeTempRak,
                    sub_rak: activeTempRak,
                    status: 'Aktif'
                }], writeMode);
            } else {
                const newMasuk = (targetItemRow.masuk || 0) + pulihQty;
                const newTersedia = (targetItemRow.stok_awal || 0) + newMasuk - (targetItemRow.keluar || 0);
                await DatabaseService.updateStockItem(targetItemRow.id, {
                    masuk: newMasuk,
                    tersedia: Math.max(0, newTersedia)
                }, writeMode);
            }

            // 5. Siapkan Data Laporan WhatsApp
            const reportPayload = {
                sku: selectedOutLog.sku,
                sub_rak_tujuan: `${activeTempRak} (Fisik di: ${currentRack})`,
                qty: pulihQty,
                tgl_out: selectedOutLog.tgl || selectedOutLog.tgl_scan || '-',
                gudang: selectedOutLog.gudang || '-',
                sisa_belum_ada_data: sisaBelumAdaData,
                original_log_id: selectedOutLog.id,
                user_pemotong: selectedOutLog.user_name,
                keterangan_out: selectedOutLog.keterangan,
                user_penarik: actor,
                tgl_laporan: new Date().toLocaleDateString('id-ID', {
                    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                })
            };

            setWaReportData(reportPayload);
            setIsWaCopied(false);
            setShowWaSuccessModal(true);

            // Tutup modal pemilihan OUT dan Pull modal
            setShowOutTraceModal(false);
            setShowPullModal(false);

            // Refresh tampilan rak aktif & antrian karantina
            await fetchItems(currentRack, true);
            fetchPendingKarantinaCount();

            setToast({
                isOpen: true,
                message: `✅ Berhasil memulihkan ${pulihQty} pcs ke ${activeTempRak}! Silakan tarik ke Rak ${currentRack} melalui menu Tarik Barang.`,
                type: 'success'
            });

        } catch (err: any) {
            console.error('Error executing OUT trace restoration:', err);
            setToast({
                isOpen: true,
                message: `Gagal memproses penarikan: ${err.message}`,
                type: 'error'
            });
        } finally {
            setIsExecutingOutTrace(false);
        }
    };

    const generateWaTextFromPayload = (data: any): string => {
        if (!data) return '';
        const cleanRakTujuan = formatSubRakTujuan(data.sub_rak_tujuan);
        const qtyVal = data.qty ?? data.pulih_qty ?? data.fisik_ditemukan ?? 0;
        const tglOutVal = data.tgl_out || data.tgl_out_asli || '-';
        const gudangVal = data.gudang || '-';

        let sisaLine = '';
        if (data.sisa_belum_ada_data > 0) {
            sisaLine = `\nSisa Fisik Belum Ada Data: ${data.sisa_belum_ada_data} pcs (Perlu Pengecekan Admin/Accurate)`;
        }

        return `*LAPORAN FISIK TIDAK TURUN (STOCK OPNAME)*
━━━━━━━━━━━━━━━━━━
*SKU:* ${data.sku}
*Sub-Rak Tujuan:* ${cleanRakTujuan}
*QTY:* ${qtyVal} pcs
*Tgl OUT:* ${tglOutVal}
*Gudang:* ${gudangVal}${sisaLine}
━━━━━━━━━━━━━━━━━━
_Mohon Tim Crosscheck memeriksa dan membatalkan/revisi potong stok nota tersebut di Accurate._`;
    };

    // Direct confirmation trigger (opens PIN 1234 Modal with PIN prefilled - Developer Only)
    const handleMarkAsVerified = (item: any) => {
        if (!isDeveloper) {
            setToast({
                isOpen: true,
                message: '❌ Hanya role Developer yang dapat melakukan konfirmasi barang.',
                type: 'error'
            });
            return;
        }
        setPendingConfirmAction({ type: 'single', item });
        setPinInput('1234');
        setShowPinModal(true);
    };

    const executeMarkAsVerified = async (item: any) => {
        try {
            setVerifiedIds(prev => new Set(prev).add(item.id));
            const cleanRak = (lastScanned || item.rak || item.sub_rak || '').trim();
            const prodName = (item.nama_produk || item.sku || item.nama_barang || '').trim();

            if (cleanRak && prodName) {
                const storageKey = `verified_rak_${cleanRak.toUpperCase()}`;
                const unverifiedKey = `unverified_rak_${cleanRak.toUpperCase()}`;
                
                const existing: string[] = JSON.parse(localStorage.getItem(storageKey) || '[]');
                if (!existing.some(n => n.trim().toLowerCase() === prodName.toLowerCase())) {
                    existing.push(prodName);
                    localStorage.setItem(storageKey, JSON.stringify(existing));
                }
                const existingUnverified: string[] = JSON.parse(localStorage.getItem(unverifiedKey) || '[]');
                const filteredUnverified = existingUnverified.filter(name => name.trim().toLowerCase() !== prodName.toLowerCase());
                localStorage.setItem(unverifiedKey, JSON.stringify(filteredUnverified));

                // Clean up any old UNVERIFY records for this item in this rack so VERIFY is cleanly recorded
                try {
                    await supabase
                        .from('database_log')
                        .delete()
                        .eq('gudang', 'UNVERIFY')
                        .ilike('sku', prodName)
                        .or(`rak.eq.${cleanRak.toUpperCase()},sub_rak.eq.${cleanRak.toUpperCase()}`);
                } catch (delErr) {
                    console.warn('Could not cleanup UNVERIFY logs:', delErr);
                }

                // Insert Universal VERIFY log into Supabase database_log
                const now = new Date();
                const tglHariIni = now.toISOString().split('T')[0];
                const waktuSekarang = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                await DatabaseService.insertLogs([{
                    tgl: tglHariIni,
                    waktu: waktuSekarang,
                    sku: prodName,
                    jumlah: item.tersedia || item.jumlah || 0,
                    type: 'MOVE',
                    gudang: 'VERIFY',
                    rak: cleanRak.toUpperCase(),
                    tgl_scan: item.tgl_scan || tglHariIni,
                    user_name: user?.email || userName || 'User',
                    sub_rak: item.sub_rak || cleanRak.toUpperCase()
                }], writeMode);
            }

            await fetchAllFinishedItems();
            setToast({ isOpen: true, message: 'Barang ditandai AKURAT (Terkonfirmasi Universal)!', type: 'success' });
        } catch (error: any) {
            console.error('Error marking as verified:', error);
            setToast({ isOpen: true, message: 'Gagal menandai barang', type: 'error' });
        }
    };

    const handleMarkAsUnverified = (item: any) => {
        if (!isDeveloper) {
            setToast({
                isOpen: true,
                message: '❌ Hanya role Developer yang dapat membatalkan konfirmasi.',
                type: 'error'
            });
            return;
        }
        setPendingConfirmAction({ type: 'unverify', item });
        setPinInput('1234');
        setShowPinModal(true);
    };

    const executeUnverifyItem = async (item: any) => {
        const cleanRak = (item.sub_rak || item.rak || lastScanned || '').trim();
        const prodName = (item.nama_produk || item.sku || item.nama_barang || '').trim();

        try {
            setVerifiedIds(prev => {
                const next = new Set(prev);
                next.delete(item.id);
                return next;
            });

            if (cleanRak && prodName) {
                const storageKey = `verified_rak_${cleanRak.toUpperCase()}`;
                const unverifiedKey = `unverified_rak_${cleanRak.toUpperCase()}`;
                
                const existingVerified: string[] = JSON.parse(localStorage.getItem(storageKey) || '[]');
                const filtered = existingVerified.filter(name => name.trim().toLowerCase() !== prodName.toLowerCase());
                localStorage.setItem(storageKey, JSON.stringify(filtered));

                const existingUnverified: string[] = JSON.parse(localStorage.getItem(unverifiedKey) || '[]');
                if (!existingUnverified.some(n => n.trim().toLowerCase() === prodName.toLowerCase())) {
                    existingUnverified.push(prodName.toLowerCase());
                    localStorage.setItem(unverifiedKey, JSON.stringify(existingUnverified));
                }

                // 1. Direct delete matching VERIFY logs from Supabase database_log so it will never reappear on fetch
                try {
                    await supabase
                        .from('database_log')
                        .delete()
                        .eq('gudang', 'VERIFY')
                        .ilike('sku', prodName)
                        .or(`rak.eq.${cleanRak.toUpperCase()},sub_rak.eq.${cleanRak.toUpperCase()}`);

                    if (item.id || item.logId) {
                        await supabase
                            .from('database_log')
                            .delete()
                            .eq('id', item.id || item.logId);
                    }
                } catch (delErr) {
                    console.warn('Could not delete old VERIFY log:', delErr);
                }

                // 2. Insert Universal UNVERIFY log into Supabase database_log for universal sync
                const now = new Date();
                const tglHariIni = now.toISOString().split('T')[0];
                const waktuSekarang = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                await DatabaseService.insertLogs([{
                    tgl: tglHariIni,
                    waktu: waktuSekarang,
                    sku: prodName,
                    jumlah: item.tersedia || item.jumlah || 0,
                    type: 'MOVE',
                    gudang: 'UNVERIFY',
                    rak: cleanRak.toUpperCase(),
                    tgl_scan: item.tgl_scan || tglHariIni,
                    user_name: user?.email || userName || 'User (Batal Konfirmasi)',
                    sub_rak: item.sub_rak || cleanRak.toUpperCase()
                }], writeMode);
            }

            // Immediately filter out from finishedLogs state so it disappears from the table with 0 latency
            setFinishedLogs(prev => prev.filter(l => {
                const lSku = (l.sku || l.nama_barang || l.nama_produk || '').trim().toLowerCase();
                const lRak = (l.sub_rak || l.rak || '').trim().toUpperCase();
                return !(lSku === prodName.toLowerCase() && lRak === cleanRak.toUpperCase());
            }));

            await fetchAllFinishedItems();

            if (lastScanned) {
                fetchItems(lastScanned, true);
            }

            setToast({ isOpen: true, message: `Status terkonfirmasi "${prodName}" berhasil dibatalkan secara Universal!`, type: 'info' });
        } catch (error: any) {
            console.error('Error unverifying item:', error);
            setToast({ isOpen: true, message: 'Gagal membatalkan status terkonfirmasi', type: 'error' });
        }
    };

    // Direct confirm all trigger (opens PIN 1234 Modal with PIN prefilled)
    const handleConfirmAll = () => {
        if (!items || items.length === 0) return;
        setPendingConfirmAction({ type: 'all' });
        setPinInput('1234');
        setShowPinModal(true);
    };

    const executeConfirmAll = async () => {
        if (!items || items.length === 0) return;
        const allIds = new Set(items.map(i => i.id));
        setVerifiedIds(allIds);

        const cleanRak = (lastScanned || '').trim();

        if (cleanRak) {
            const storageKey = `verified_rak_${cleanRak.toUpperCase()}`;
            const unverifiedKey = `unverified_rak_${cleanRak.toUpperCase()}`;
            const allNames = items.map(i => i.nama_produk?.trim().toLowerCase()).filter(Boolean);
            localStorage.setItem(storageKey, JSON.stringify(allNames));
            localStorage.removeItem(unverifiedKey);

            try {
                const now = new Date();
                const tglHariIni = now.toISOString().split('T')[0];
                const waktuSekarang = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                // Clean up any old UNVERIFY records for this rack
                try {
                    await supabase
                        .from('database_log')
                        .delete()
                        .eq('gudang', 'UNVERIFY')
                        .or(`rak.eq.${cleanRak.toUpperCase()},sub_rak.eq.${cleanRak.toUpperCase()}`);
                } catch (delErr) {
                    console.warn('Could not cleanup UNVERIFY logs:', delErr);
                }

                const logsToInsert = items.map(i => ({
                    tgl: tglHariIni,
                    waktu: waktuSekarang,
                    sku: i.nama_produk,
                    jumlah: i.tersedia || 0,
                    type: 'MOVE',
                    gudang: 'VERIFY',
                    rak: cleanRak.toUpperCase(),
                    tgl_scan: i.tgl_scan || tglHariIni,
                    user_name: user?.email || userName || 'User',
                    sub_rak: i.sub_rak || cleanRak.toUpperCase()
                }));

                await DatabaseService.insertLogs(logsToInsert, writeMode);
                await fetchAllFinishedItems();
            } catch (err) {
                console.error('Error inserting bulk verify logs:', err);
            }
        }

        setToast({ isOpen: true, message: `Berhasil mengonfirmasi seluruh (${items.length}) barang di Rak ${cleanRak}`, type: 'success' });
    };

    const handleVerifyPinSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        if (pinInput.trim() !== '1234') {
            setToast({ isOpen: true, message: '❌ PIN Salah! Konfirmasi dibatalkan (PIN yang benar: 1234)', type: 'error' });
            setPinInput('');
            return;
        }

        setShowPinModal(false);
        const action = pendingConfirmAction;
        setPendingConfirmAction(null);
        setPinInput('');

        if (action?.type === 'single' && action.item) {
            executeMarkAsVerified(action.item);
        } else if (action?.type === 'all') {
            executeConfirmAll();
        } else if (action?.type === 'unverify' && action.item) {
            executeUnverifyItem(action.item);
        } else if (action?.type === 'clear_all_finished') {
            executeClearAllFinished();
        }
    };

    const executeClearAllFinished = async () => {
        setIsLoadingFinished(true);
        try {
            const now = new Date();
            const tglHariIni = now.toISOString().split('T')[0];
            const waktuSekarang = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            const unverifyLogs = finishedLogs.map(log => ({
                tgl: tglHariIni,
                waktu: waktuSekarang,
                sku: log.sku || log.nama_barang || log.nama_produk,
                jumlah: log.jumlah || 0,
                type: 'MOVE',
                gudang: 'UNVERIFY',
                rak: log.rak || log.sub_rak,
                tgl_scan: tglHariIni,
                user_name: user?.email || userName || 'Dev (Clear All Selesai)',
                sub_rak: log.sub_rak || log.rak
            }));

            if (unverifyLogs.length > 0) {
                await DatabaseService.insertLogs(unverifyLogs, writeMode);
            }

            // Direct purge all VERIFY logs from Supabase
            try {
                await supabase.from('database_log').delete().eq('gudang', 'VERIFY');
            } catch (delErr) {
                console.warn('Could not batch delete VERIFY logs:', delErr);
            }

            // Clear local storage verification keys
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('verified_rak_') || key.startsWith('unverified_rak_')) {
                    localStorage.removeItem(key);
                }
            });

            setVerifiedIds(new Set());
            setFinishedLogs([]);
            await fetchAllFinishedItems();
            if (lastScanned) {
                fetchItems(lastScanned, true);
            }

            setToast({ isOpen: true, message: 'Seluruh Data Selesai Diproses berhasil dibatalkan dan direset!', type: 'success' });
        } catch (err) {
            console.error('Error clearing all finished logs:', err);
            setToast({ isOpen: true, message: 'Gagal membatalkan seluruh data selesai', type: 'error' });
        } finally {
            setIsLoadingFinished(false);
        }
    };

    const handleClearAllFinishedPrompt = () => {
        if (!isAdminOrDev) {
            setToast({
                isOpen: true,
                message: '❌ Hanya Developer & Admin yang dapat membatalkan/reset seluruh data selesai.',
                type: 'error'
            });
            return;
        }

        if (finishedLogs.length === 0) {
            setToast({ isOpen: true, message: 'Tidak ada data selesai yang dapat dibatalkan.', type: 'info' });
            return;
        }

        if (!window.confirm(`⚠️ PERINGATAN DEV/ADMIN:\n\nApakah Anda yakin ingin membatalkan SEMUA (${finishedLogs.length} baris) Data Selesai Diproses?\n\nSemua barang di seluruh rak akan kembali berstatus "Belum Cek".`)) {
            return;
        }

        setPendingConfirmAction({ type: 'clear_all_finished' });
        setPinInput('1234');
        setShowPinModal(true);
    };

    const handleUnverifyFromFinishedLog = (log: any) => {
        if (!isAdminOrDev) {
            setToast({
                isOpen: true,
                message: '❌ Hanya Developer & Admin yang dapat membatalkan konfirmasi.',
                type: 'error'
            });
            return;
        }
        const itemToUnverify = {
            id: log.id,
            logId: log.id,
            nama_produk: log.sku || log.nama_barang || log.nama_produk,
            sku: log.sku || log.nama_barang || log.nama_produk,
            rak: log.sub_rak || log.rak,
            sub_rak: log.sub_rak || log.rak,
            tersedia: log.jumlah
        };
        handleMarkAsUnverified(itemToUnverify);
    };

    // --- DevMode Bulk Unverify Handlers ---
    const handleSelectPrefixRacks = (prefix: string) => {
        setBulkPrefixFilter(prefix);
        const matching = rackOptions.filter(r => prefix === 'ALL' || r.trim().toUpperCase().startsWith(prefix));
        setSelectedRacksToUnverify(prev => {
            const next = new Set(prev);
            matching.forEach(r => next.add(r));
            return next;
        });

        if (matching.length > 0) {
            setBulkStartRack(matching[0]);
            setBulkEndRack(matching[matching.length - 1]);
        }
    };

    const handleSelectRangeRacks = () => {
        if (!bulkStartRack || !bulkEndRack) {
            setToast({ isOpen: true, message: 'Mohon pilih Rak Awal dan Rak Akhir terlebih dahulu', type: 'warning' });
            return;
        }

        const startIndex = rackOptions.indexOf(bulkStartRack);
        const endIndex = rackOptions.indexOf(bulkEndRack);

        if (startIndex === -1 || endIndex === -1) {
            setToast({ isOpen: true, message: 'Rak awal atau rak akhir tidak ditemukan di daftar rak', type: 'warning' });
            return;
        }

        const minIdx = Math.min(startIndex, endIndex);
        const maxIdx = Math.max(startIndex, endIndex);
        const rangeRacks = rackOptions.slice(minIdx, maxIdx + 1);

        setSelectedRacksToUnverify(prev => {
            const next = new Set(prev);
            rangeRacks.forEach(r => next.add(r));
            return next;
        });

        setToast({ isOpen: true, message: `Berhasil menambahkan ${rangeRacks.length} rak (${bulkStartRack} s/d ${bulkEndRack})`, type: 'success' });
    };

    const handleToggleRackSelection = (rackName: string) => {
        setSelectedRacksToUnverify(prev => {
            const next = new Set(prev);
            if (next.has(rackName)) {
                next.delete(rackName);
            } else {
                next.add(rackName);
            }
            return next;
        });
    };

    const handleSelectAllFilteredRacks = () => {
        setSelectedRacksToUnverify(prev => {
            const next = new Set(prev);
            bulkFilteredRacks.forEach(r => next.add(r));
            return next;
        });
    };

    const handleClearRackSelection = () => {
        setSelectedRacksToUnverify(new Set());
    };

    const handleExecuteBulkUnverify = async () => {
        if (selectedRacksToUnverify.size === 0) {
            setToast({ isOpen: true, message: 'Silakan pilih minimal 1 rak untuk dibatalkan konfirmasinya', type: 'warning' });
            return;
        }

        const racksList = Array.from(selectedRacksToUnverify);
        const previewText = racksList.length > 10 ? `${racksList.slice(0, 10).join(', ')} ... (+${racksList.length - 10} rak lagi)` : racksList.join(', ');

        if (!window.confirm(`Dev Mode: Batalkan status Terkonfirmasi secara UNIVERSAL untuk ${racksList.length} rak terpilih?\n\nRak terpilih: ${previewText}`)) {
            return;
        }

        try {
            setIsBulkUnverifying(true);
            setToast({ isOpen: true, message: `Memproses pembatalan konfirmasi massal untuk ${racksList.length} rak...`, type: 'info' });

            // Query active stock items matching selected racks in EITHER rak OR sub_rak
            const racksListClean = racksList.map(r => r.trim().toUpperCase());
            const [stockByRakRes, stockBySubRakRes] = await Promise.all([
                supabase
                    .from('stock_items')
                    .select('id, nama_produk, rak, sub_rak, tersedia')
                    .in('rak', racksListClean)
                    .neq('status', 'Non-Aktif'),
                supabase
                    .from('stock_items')
                    .select('id, nama_produk, rak, sub_rak, tersedia')
                    .in('sub_rak', racksListClean)
                    .neq('status', 'Non-Aktif')
            ]);

            if (stockByRakRes.error) throw stockByRakRes.error;
            if (stockBySubRakRes.error) throw stockBySubRakRes.error;

            // Combine and deduplicate by item id
            const combinedItemsMap = new Map<string, any>();
            (stockByRakRes.data || []).forEach(item => combinedItemsMap.set(item.id, item));
            (stockBySubRakRes.data || []).forEach(item => combinedItemsMap.set(item.id, item));
            const stockData = Array.from(combinedItemsMap.values());

            if (!stockData || stockData.length === 0) {
                setToast({ isOpen: true, message: 'Tidak ditemukan data barang di rak/sub-rak terpilih', type: 'warning' });
                setIsBulkUnverifying(false);
                return;
            }

            // Direct purge VERIFY logs for selected racks from Supabase
            try {
                await supabase
                    .from('database_log')
                    .delete()
                    .eq('gudang', 'VERIFY')
                    .in('rak', racksListClean);
                await supabase
                    .from('database_log')
                    .delete()
                    .eq('gudang', 'VERIFY')
                    .in('sub_rak', racksListClean);
            } catch (delErr) {
                console.warn('Could not batch delete VERIFY logs for racks:', delErr);
            }

            const now = new Date();
            const tglHariIni = now.toISOString().split('T')[0];
            const waktuSekarang = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            const logsToInsert = stockData.map(item => ({
                tgl: tglHariIni,
                waktu: waktuSekarang,
                sku: item.nama_produk,
                jumlah: item.tersedia || 0,
                type: 'MOVE',
                gudang: 'UNVERIFY',
                rak: item.rak,
                tgl_scan: item.tgl_scan || tglHariIni,
                user_name: user?.email || userName || 'Dev (Batal Konfirmasi Massal)',
                sub_rak: item.sub_rak || item.rak
            }));

            // Batch insert in chunks of 100
            const chunkSize = 100;
            for (let i = 0; i < logsToInsert.length; i += chunkSize) {
                const chunk = logsToInsert.slice(i, i + chunkSize);
                await DatabaseService.insertLogs(chunk, writeMode);
            }

            // Group product names by rack to update localStorage unverifiedKey accurately
            const rackToProdNamesMap = new Map<string, string[]>();
            stockData.forEach(item => {
                const r1 = (item.rak || '').trim().toUpperCase();
                const r2 = (item.sub_rak || '').trim().toUpperCase();
                const prodName = item.nama_produk?.trim().toLowerCase();
                if (prodName) {
                    if (r1) {
                        if (!rackToProdNamesMap.has(r1)) rackToProdNamesMap.set(r1, []);
                        rackToProdNamesMap.get(r1)!.push(prodName);
                    }
                    if (r2 && r2 !== r1) {
                        if (!rackToProdNamesMap.has(r2)) rackToProdNamesMap.set(r2, []);
                        rackToProdNamesMap.get(r2)!.push(prodName);
                    }
                }
            });

            // Clear local storage cache for all affected racks
            racksList.forEach(cleanRak => {
                const rKey = cleanRak.trim().toUpperCase();
                const storageKey = `verified_rak_${rKey}`;
                const unverifiedKey = `unverified_rak_${rKey}`;
                localStorage.removeItem(storageKey);
                const unverifiedProds = rackToProdNamesMap.get(rKey) || [];
                localStorage.setItem(unverifiedKey, JSON.stringify(Array.from(new Set(unverifiedProds))));
            });

            // If current opened rack is included, reset verifiedIds and refetch
            if (lastScanned && racksListClean.includes(lastScanned.trim().toUpperCase())) {
                setVerifiedIds(new Set());
                fetchItems(lastScanned, true);
            }

            await fetchAllFinishedItems();

            setToast({ isOpen: true, message: `Berhasil membatalkan konfirmasi secara Universal untuk ${racksList.length} rak (${logsToInsert.length} barang)!`, type: 'success' });
            setShowBulkUnverifyModal(false);
            setSelectedRacksToUnverify(new Set());

        } catch (error: any) {
            console.error('Error executing bulk unverify:', error);
            setToast({ isOpen: true, message: `Gagal membatalkan konfirmasi massal: ${error.message || 'Unknown error'}`, type: 'error' });
        } finally {
            setIsBulkUnverifying(false);
        }
    };

    const handleClearRack = async () => {
        if (!lastScanned) return;
        
        if (!window.confirm(`Bersihkan sisa stok di layar untuk Rak ${lastScanned}? \n\nCatatan: Ini HANYA membersihkan tampilan secara visual agar layar rapi. Data asli tetap utuh di database.`)) {
            return;
        }

        try {
            // Hapus secara visual barang-barang yang belum dikonfirmasi dari layar
            setItems(prev => prev.filter(item => verifiedIds.has(item.id)));

            setToast({ isOpen: true, message: 'Tampilan rak berhasil dibersihkan.', type: 'success' });
        } catch (error: any) {
            console.error('Clear rack error:', error);
            setToast({ isOpen: true, message: 'Gagal membersihkan layar.', type: 'error' });
        }
    };



    const handleMoveSubmit = async () => {
        if (isMoving) return;
        if (!selectedMoveItem || !moveData.rak_tujuan || moveData.jumlah_pindah === '' || moveData.jumlah_pindah <= 0) {
            showToast('Mohon lengkapi semua data yang diperlukan', 'warning');
            return;
        }

        setIsMoving(true);
        // Check if source item in its origin rack is ALREADY verified
        const isSourceVerified = await checkIfSourceItemVerified(selectedMoveItem.rak, selectedMoveItem.nama_produk);
        if (isSourceVerified) {
            showToast(`⚠️ Barang "${selectedMoveItem.nama_produk}" di Rak asal "${selectedMoveItem.rak}" sudah TERKONFIRMASI! Tidak dapat dipindahkan.`, 'error');
            setIsMoving(false);
            return;
        }

        const rakTujuanUpper = moveData.rak_tujuan.toUpperCase().trim();

        
        if (moveData.jumlah_pindah > selectedMoveItem.tersedia) {
            showToast(`Jumlah pindah tidak boleh melebihi stok tersedia (${selectedMoveItem.tersedia})`, 'error');
            setIsMoving(false);
            return;
        }

        try {

            const now = new Date();
            const tglHariIni = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const waktu = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

            // Realtime timestamp for transfer log
            const { todayTgl, nowWaktu } = getRealtimeDateTime();

            // Use current timestamp for created_at so transaction logs sort properly to the top of active transactions
            const createdAtOut = new Date(now.getTime() + 1000).toISOString();
            const createdAtIn = new Date(now.getTime() + 2000).toISOString();

            const logEntries = [
                {
                    tgl: todayTgl,
                    waktu: nowWaktu,
                    sku: selectedMoveItem.nama_produk,
                    jumlah: moveData.jumlah_pindah,
                    type: 'OUT',
                    gudang: 'TRANSFER',
                    rak: selectedMoveItem.rak,
                    tgl_scan: todayTgl,
                    user_name: 'System (Cek Rak)',
                    sub_rak: selectedMoveItem.sub_rak || selectedMoveItem.rak,
                    created_at: createdAtOut
                },
                {
                    tgl: todayTgl,
                    waktu: nowWaktu,
                    sku: selectedMoveItem.nama_produk,
                    jumlah: moveData.jumlah_pindah,
                    type: 'IN',
                    gudang: 'TRANSFER',
                    rak: rakTujuanUpper,
                    tgl_scan: todayTgl,
                    user_name: 'System (Cek Rak)',
                    sub_rak: rakTujuanUpper,
                    created_at: createdAtIn
                }
            ];

            const { error: logError } = await DatabaseService.insertLogs(logEntries, writeMode);
            if (logError) throw logError;

            // Check existing target stock item and update stock numbers
            const moveQty = Number(moveData.jumlah_pindah);
            const { data: existingStocks, error: checkError } = await supabase
                .from('stock_items')
                .select('id, stok_awal, masuk, keluar, tersedia')
                .eq('nama_produk', selectedMoveItem.nama_produk)
                .eq('rak', rakTujuanUpper)
                .limit(1);
            
            const existingStock = existingStocks?.[0];
            
            if (checkError) console.error(checkError);

            if (!existingStock) {
                const { error: insertError } = await DatabaseService.insertStockItems([{
                    nama_produk: selectedMoveItem.nama_produk,
                    packing: selectedMoveItem.packing || '',
                    rak: rakTujuanUpper,
                    sub_rak: rakTujuanUpper,
                    satuan: selectedMoveItem.satuan,
                    stok_awal: 0,
                    masuk: moveQty,
                    keluar: 0,
                    tersedia: moveQty,
                    status: 'Aktif'
                }], writeMode);
                if (insertError) throw insertError;
            } else {
                const newMasuk = (existingStock.masuk || 0) + moveQty;
                const newTersedia = (existingStock.stok_awal || 0) + newMasuk - (existingStock.keluar || 0);
                await DatabaseService.updateStockItem(existingStock.id, {
                    masuk: newMasuk,
                    tersedia: Math.max(0, newTersedia)
                }, writeMode);
            }

            // Also update source stock item in stock_items
            const newSourceKeluar = (selectedMoveItem.keluar || 0) + moveQty;
            const newSourceTersedia = Math.max(0, (selectedMoveItem.stok_awal || 0) + (selectedMoveItem.masuk || 0) - newSourceKeluar);
            await DatabaseService.updateStockItem(selectedMoveItem.id, {
                keluar: newSourceKeluar,
                tersedia: newSourceTersedia
            }, writeMode);

            // Automatically mark moved item as verified (terkonfirmasi) in destination rack UNLESS it's a TEMP rack
            if (rakTujuanUpper && !rakTujuanUpper.startsWith('TEMP')) {
                const prodName = selectedMoveItem.nama_produk?.trim().toLowerCase();
                
                // Update Local Storage
                const storageKey = `verified_rak_${rakTujuanUpper}`;
                const unverifiedKey = `unverified_rak_${rakTujuanUpper}`;
                const existing: string[] = JSON.parse(localStorage.getItem(storageKey) || '[]');
                if (!existing.includes(prodName)) {
                    existing.push(prodName);
                    localStorage.setItem(storageKey, JSON.stringify(existing));
                }
                const existingUnverified: string[] = JSON.parse(localStorage.getItem(unverifiedKey) || '[]');
                const filteredUnverified = existingUnverified.filter((name: string) => name.trim().toLowerCase() !== prodName);
                localStorage.setItem(unverifiedKey, JSON.stringify(filteredUnverified));
                
                // Insert VERIFY log inheriting original tgl & tgl_scan
                const vNow = new Date();
                await DatabaseService.insertLogs([{
                    tgl: tglAsli,
                    waktu: vNow.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    sku: selectedMoveItem.nama_produk,
                    jumlah: moveQty,
                    type: 'MOVE',
                    gudang: 'VERIFY',
                    rak: rakTujuanUpper,
                    tgl_scan: tglScanAsli,
                    user_name: user?.email || 'System (Pindah Fisik)',
                    sub_rak: rakTujuanUpper
                }], writeMode);
            }

            showToast(`Berhasil memindahkan ${moveData.jumlah_pindah} ${selectedMoveItem.satuan} ke ${rakTujuanUpper}`, 'success');
            setShowMoveModal(false);
            if (lastScanned) fetchItems(lastScanned, true);

        } catch (error: any) {
            console.error('Error moving item:', error);
            showToast(`Gagal memindahkan barang: ${error.message || 'Unknown error'}`, 'error');
        } finally {
            setIsMoving(false);
        }
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        const clean = (rackId || '').trim();
        if (clean.toLowerCase() === 'devmode') {
            setShowBulkUnverifyModal(true);
            showToast('DevMode: Membuka Batal Konfirmasi Massal', 'info');
            return;
        }
        fetchItems(clean);
    };

    const handleScanResult = (decodedText: string) => {
        const clean = decodedText.trim();
        setRackId(clean);
        setShowScanner(false);
        if (clean.toLowerCase() === 'devmode') {
            setShowBulkUnverifyModal(true);
            showToast('DevMode: Membuka Batal Konfirmasi Massal', 'info');
            return;
        }
        fetchItems(clean);
    };

    const handlePrintBarcode = () => {
        if (!lastScanned) return;
        const url = `https://dazzling-halva-7e617b.netlify.app/api/qr?data=${encodeURIComponent(lastScanned)}&size=300&label=${encodeURIComponent(lastScanned)}`;
        const win = window.open('', '_blank');
        if (win) {
            win.document.write(`
            <html>
                <head>
                    <title>Print Rak ${lastScanned}</title>
                    <style>
                        body { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                        img { max-width: 100%; height: auto; }
                        h1 { font-family: sans-serif; font-size: 48px; margin-bottom: 20px; }
                        @media print {
                            button { display: none; }
                        }
                    </style>
                </head>
                <body>
                    <h1>Rak: ${lastScanned}</h1>
                    <img src="${url}" onload="window.print();" />
                    <button onclick="window.print()" style="margin-top: 20px; padding: 10px 20px; font-size: 20px;">Print Lagi</button>
                </body>
            </html>
          `);
            win.document.close();
        }
    };

    const isDevModeTyped = (rackId || '').trim().toLowerCase() === 'devmode';

    const hasModuleAccess = isDeveloper || userRole === 'developer' || userPermissions.includes('*') || userPermissions.includes('/stock-opname') || userPermissions.includes('/cek-rak-2');

    if (!hasModuleAccess) {
        return (
            <div className="flex flex-col min-h-screen items-center justify-center bg-slate-50 p-6 text-center">
                <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl border border-slate-100 flex flex-col items-center">
                    <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mb-4 shadow-inner">
                        <Lock className="w-8 h-8" />
                    </div>
                    <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-2">Akses Dibatasi</h2>
                    <p className="text-sm text-slate-500 font-medium mb-6 leading-relaxed">
                        Akun Anda tidak memiliki hak akses untuk membuka menu <strong>Stock Opname</strong>. Silakan hubungi Administrator atau Developer.
                    </p>
                    <a
                        href="/"
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95"
                    >
                        Kembali ke Dashboard
                    </a>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen relative overflow-hidden bg-slate-50/70 font-sans">
            {/* MAIN CONTENT AREA */}
            <main className="flex-1 flex flex-col relative min-w-0 w-full pb-16">
                {/* ======================================================== */}
                {/* PREMIUM RESPONSIVE HEADER & ACTIONS (Mobile & Desktop) */}
                {/* ======================================================== */}
                <div className="flex flex-col mb-4 sm:mb-6">
                    {/* Full Immersive Background Banner with Floating Shapes */}
                    <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 pt-[88px] sm:pt-[96px] lg:pt-[100px] pb-6 sm:pb-8 lg:pb-10 px-4 sm:px-8 lg:px-12 rounded-b-[32px] lg:rounded-b-[44px] shadow-2xl shadow-blue-950/30 relative overflow-hidden transition-all duration-500 flex flex-col justify-center border-b border-blue-900/30">

                        {/* Decorative Background Icon & Ambient Glows */}
                        <div className="absolute -top-10 -right-10 text-blue-500 opacity-5 pointer-events-none">
                            <MapPin className="w-72 h-72 lg:w-96 lg:h-96" />
                        </div>
                        <div className="absolute top-0 right-1/4 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl pointer-events-none animate-pulse"></div>
                        <div className="absolute bottom-0 left-1/3 w-56 h-56 bg-indigo-500/15 rounded-full blur-2xl pointer-events-none"></div>

                        {/* Text Content */}
                        <div className="relative z-10 w-full flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 lg:gap-6">
                            <div className="max-w-2xl">
                                <div className="flex flex-wrap items-center gap-2 mb-1.5 opacity-90">
                                    <span className="px-2.5 py-0.5 rounded-md bg-blue-500/20 border border-blue-400/30 text-[10px] lg:text-[11px] font-black tracking-[0.2em] text-blue-200 uppercase flex items-center gap-1.5">
                                        <Sparkles className="w-3 h-3 text-cyan-400" />
                                        Inventory Tool V5 • Stock Opname
                                    </span>
                                    {isDeveloper && (
                                        <span className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/30 text-[10px] font-black tracking-wider text-amber-200 uppercase">
                                            DevMode
                                        </span>
                                    )}
                                </div>
                                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight leading-tight uppercase flex items-center gap-2.5">
                                    Stock <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-300 via-indigo-200 to-cyan-300">Opname</span>
                                </h1>
                                <p className="text-blue-100/80 font-medium text-xs sm:text-sm leading-relaxed mt-1 flex items-center gap-2">
                                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                                    </span>
                                    <span><strong className="text-white font-bold">Real-Time Monitoring</strong> — Cek stok fisik, konfirmasi barang, scan barcode, dan cari lokasi produk</span>
                                </p>
                            </div>

                            {/* Top Stats Overview */}
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                <div className="px-4 py-2.5 bg-white/10 backdrop-blur-md rounded-2xl border border-white/15 flex items-center gap-3 shadow-inner">
                                    <div className="p-2 bg-blue-500/30 rounded-xl">
                                        <MapPin className="w-4 h-4 text-blue-200" />
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-wider text-blue-200">Total Rak</p>
                                        <p className="text-base sm:text-lg font-black leading-none text-white">{rackOptions.length} <span className="text-[10px] font-normal text-blue-200">Lokasi</span></p>
                                    </div>
                                </div>
                                {lastScanned && (
                                    <div className="px-4 py-2.5 bg-emerald-500/20 backdrop-blur-md rounded-2xl border border-emerald-400/30 flex items-center gap-3 shadow-inner animate-in fade-in">
                                        <div className="p-2 bg-emerald-500/30 rounded-xl">
                                            <Package className="w-4 h-4 text-emerald-200" />
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-black uppercase tracking-wider text-emerald-200">Rak Aktif</p>
                                            <p className="text-base sm:text-lg font-black leading-none text-white">{lastScanned} <span className="text-[10px] font-normal text-emerald-200">({items.length} item)</span></p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* MAIN CONTENT CONTAINER */}
                <div className="max-w-7xl mx-auto w-full px-3.5 sm:px-6 lg:px-8 mt-4 sm:mt-6 lg:mt-8 relative z-20 space-y-5 sm:space-y-6">

                    {/* UNIVERSAL ACTIVE OPNAME ZONES REAL-TIME BANNER */}
                    {Object.entries(activeOpnameZones).filter(([_, s]) => s && s.active).length > 0 && (
                        <div className="bg-gradient-to-r from-amber-950/90 via-slate-900 to-indigo-950 border-2 border-amber-500/40 rounded-3xl p-4 sm:p-5 text-white shadow-2xl shadow-amber-950/30 relative overflow-hidden animate-in fade-in slide-in-from-top-3 duration-300">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
                            <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                                <div className="space-y-1.5 max-w-3xl">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-[11px] font-black tracking-widest text-amber-300 uppercase flex items-center gap-1.5 shadow-sm">
                                            <span className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                            </span>
                                            ⚡ Sesi Opname Zona Aktif (Auto-Bridge Real-Time)
                                        </span>
                                        <span className="text-[11px] font-bold text-amber-200/80">
                                            {Object.entries(activeOpnameZones).filter(([_, s]) => s && s.active).length} Zona Sedang Berjalan
                                        </span>
                                    </div>
                                    <p className="text-xs sm:text-sm text-slate-200 font-medium leading-relaxed">
                                        Operasional pemotongan stok keluar tetap berjalan lancar. Barcode lama pada box fisik rak yang sedang di-opname <strong className="text-amber-300">otomatis dialihkan ke rak transit TEMP</strong> tanpa error stok / minus.
                                    </p>
                                </div>

                                {/* Active Zone Badges & Quick End Buttons */}
                                <div className="flex flex-wrap items-center gap-2">
                                    {Object.entries(activeOpnameZones)
                                        .filter(([_, s]) => s && s.active)
                                        .map(([prefix, session]) => (
                                            <div 
                                                key={prefix} 
                                                className="px-3.5 py-2 rounded-2xl bg-white/10 backdrop-blur-md border border-amber-400/30 flex items-center gap-2.5 shadow-inner"
                                            >
                                                <div className="text-left">
                                                    <p className="text-xs font-black uppercase text-amber-300">
                                                        Zona {prefix} ({session.racks_range || `${prefix}1-${prefix}999`}) ➔ {session.temp_rack || `TEMP-${prefix}`}
                                                    </p>
                                                    <p className="text-[10px] text-slate-300 font-medium">
                                                        Mulai: {session.started_at ? new Date(session.started_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'} • Oleh: {session.started_by?.split('@')[0] || 'admin'}
                                                    </p>
                                                </div>
                                                {isDeveloper && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleZoneSession(prefix, false)}
                                                        disabled={isTogglingZone === prefix}
                                                        className="px-2.5 py-1 bg-rose-600/90 hover:bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 cursor-pointer flex items-center gap-1 shadow-sm"
                                                        title={`Selesaikan sesi opname Zona ${prefix} dan kembalikan validasi normal`}
                                                    >
                                                        <XCircle className="w-3 h-3" />
                                                        <span>Selesai</span>
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* DEDICATED DEVMODE STOCK OPNAME ZONE CONTROLLER CARD (COLLAPSIBLE / ACCORDION) */}
                    {isDeveloper && (
                        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xl shadow-slate-900/5 transition-all duration-300 overflow-hidden">
                            {/* Accordion Toggle Header */}
                            <button
                                type="button"
                                onClick={() => setIsZonePanelExpanded(!isZonePanelExpanded)}
                                className="w-full p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-md shadow-amber-500/20 shrink-0">
                                        <Sparkles className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="text-sm sm:text-base font-black text-slate-900 uppercase tracking-tight">
                                                Panel Kontrol Sesi Opname Zona (Khusus Developer)
                                            </h3>
                                            <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-black border border-amber-300">
                                                DEVMODE ONLY
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-500 font-medium mt-0.5">
                                            {isZonePanelExpanded 
                                                ? "Aktifkan sesi per zona untuk memindahkan stok ke rak transit TEMP dan mengarahkan auto-bridge pemotongan stok barang keluar."
                                                : "Klik untuk membuka & mengatur sesi opname zona aktif (Auto-Bridge ke TEMP)"}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                                    <span className={cn(
                                        "text-xs px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5",
                                        Object.values(activeOpnameZones).filter(s => s && s.active).length > 0
                                            ? "bg-amber-500 text-white font-black shadow-sm"
                                            : "text-slate-600 bg-slate-100"
                                    )}>
                                        {Object.values(activeOpnameZones).filter(s => s && s.active).length > 0 && (
                                            <span className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                                            </span>
                                        )}
                                        {Object.values(activeOpnameZones).filter(s => s && s.active).length} Zona Aktif
                                    </span>
                                    <div className="p-1.5 bg-slate-100 rounded-xl text-slate-600">
                                        <ChevronDown className={cn(
                                            "w-5 h-5 transition-transform duration-300",
                                            isZonePanelExpanded && "rotate-180 text-amber-600"
                                        )} />
                                    </div>
                                </div>
                            </button>

                            {/* Collapsible Content (Opens Downwards / Closes Upwards) */}
                            {isZonePanelExpanded && (
                                <div className="p-4 sm:p-5 pt-0 sm:pt-0 border-t border-slate-100 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                    {/* Zone Grid Cards */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pt-4">
                                        {availablePrefixes.map(prefix => {
                                            const isRunning = !!activeOpnameZones[prefix]?.active;
                                            const session = activeOpnameZones[prefix];
                                            const rackCount = rackOptions.filter(r => r.toUpperCase().startsWith(prefix)).length;
                                            return (
                                                <div
                                                    key={prefix}
                                                    className={cn(
                                                        "p-3.5 rounded-2xl border transition-all flex flex-col justify-between gap-3",
                                                        isRunning
                                                            ? "bg-gradient-to-br from-amber-50 to-orange-50/70 border-amber-300 shadow-sm ring-1 ring-amber-200"
                                                            : "bg-slate-50 hover:bg-slate-100/80 border-slate-200"
                                                    )}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <span className={cn(
                                                                "w-8 h-8 rounded-xl font-black text-xs flex items-center justify-center shadow-sm",
                                                                isRunning ? "bg-amber-500 text-white animate-pulse" : "bg-white text-slate-800 border border-slate-200"
                                                            )}>
                                                                {prefix}
                                                            </span>
                                                            <div>
                                                                <h4 className="text-xs font-black text-slate-900 uppercase">Blok {prefix}</h4>
                                                                <p className="text-[10px] text-slate-500 font-medium">{rackCount} sub-rak</p>
                                                            </div>
                                                        </div>
                                                        <span className={cn(
                                                            "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider",
                                                            isRunning ? "bg-amber-500 text-white shadow-xs" : "bg-slate-200 text-slate-600"
                                                        )}>
                                                            {isRunning ? "⚡ AKTIF" : "NORMAL"}
                                                        </span>
                                                    </div>

                                                    {isRunning && (
                                                        <div className="text-[11px] text-amber-900 font-bold bg-amber-100/60 p-2 rounded-xl border border-amber-200">
                                                            ➔ Transit: <strong className="text-amber-800">{session?.temp_rack || `TEMP-${prefix}`}</strong>
                                                        </div>
                                                    )}

                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleZoneSession(prefix, !isRunning)}
                                                        disabled={isTogglingZone === prefix}
                                                        className={cn(
                                                            "w-full py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95 cursor-pointer",
                                                            isRunning
                                                                ? "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-500/20"
                                                                : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-blue-500/20"
                                                        )}
                                                    >
                                                        {isTogglingZone === prefix ? (
                                                            <span className="animate-spin text-[11px]">⏳ Memproses...</span>
                                                        ) : isRunning ? (
                                                            <>
                                                                <XCircle className="w-3.5 h-3.5" />
                                                                <span>Selesaikan Sesi</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Sparkles className="w-3.5 h-3.5" />
                                                                <span>Mulai Opname Zona</span>
                                                            </>
                                                        )}
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* MAIN NAVIGATION TABS (OPNAME RAK vs DATA SELESAI PROSES) */}
                    <div className="flex items-center justify-between flex-wrap gap-2.5 bg-white p-2 sm:p-2.5 rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-xl shadow-slate-900/5">
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <button
                                type="button"
                                onClick={() => setActiveMainTab('opname_rak')}
                                className={cn(
                                    "h-11 px-4 sm:px-5 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-95",
                                    activeMainTab === 'opname_rak'
                                        ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/25"
                                        : "bg-slate-100 hover:bg-slate-200 text-slate-600"
                                )}
                            >
                                <MapPin className="w-4 h-4 flex-shrink-0" />
                                <span>Cek & Scan Rak</span>
                                <span className={cn(
                                    "px-2 py-0.5 rounded-full text-[10px] font-bold",
                                    activeMainTab === 'opname_rak' ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                                )}>
                                    {rackOptions.length}
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setActiveMainTab('selesai_proses');
                                    fetchAllFinishedItems();
                                }}
                                className={cn(
                                    "h-11 px-4 sm:px-5 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm relative active:scale-95",
                                    activeMainTab === 'selesai_proses'
                                        ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/25"
                                        : "bg-slate-100 hover:bg-slate-200 text-slate-600"
                                )}
                            >
                                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                                <span>Data Selesai Diproses</span>
                                <span className={cn(
                                    "px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1",
                                    activeMainTab === 'selesai_proses' ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-800"
                                )}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                    {finishedLogs.length}
                                </span>
                            </button>
                        </div>

                        {activeMainTab === 'selesai_proses' && (
                            <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap sm:flex-nowrap">
                                {isAdminOrDev && finishedLogs.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={handleClearAllFinishedPrompt}
                                        className="h-11 px-3.5 sm:px-4 bg-rose-50 hover:bg-rose-100 text-rose-700 font-black rounded-xl sm:rounded-2xl text-xs uppercase tracking-wider border border-rose-200/80 transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer active:scale-95 flex-1 sm:flex-none"
                                        title="Batal dan reset seluruh data selesai di semua rak (Khusus Dev/Admin)"
                                    >
                                        <XCircle className="h-4 w-4 text-rose-600 flex-shrink-0" />
                                        <span className="whitespace-nowrap">Batal Semua Selesai</span>
                                    </button>
                                )}
                                {finishedLogs.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={handlePrintBatchThermalLabels}
                                        className="h-11 px-4 sm:px-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black rounded-xl sm:rounded-2xl text-xs uppercase tracking-wider shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all hover:shadow-md hover:shadow-blue-500/20 active:scale-95 flex-1 sm:flex-none"
                                        title="Print QR seluruh data selesai (3 label per halaman thermal)"
                                    >
                                        <Printer className="h-4 w-4 flex-shrink-0" />
                                        <span className="whitespace-nowrap">Print Semua QR</span>
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={fetchAllFinishedItems}
                                    className="h-11 px-3.5 sm:px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl sm:rounded-2xl text-xs uppercase tracking-wider border border-slate-200 transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer active:scale-95 flex-1 sm:flex-none"
                                    title="Segarkan Data Selesai"
                                >
                                    <RefreshCw className={cn("h-4 w-4 text-slate-600 flex-shrink-0", isLoadingFinished && "animate-spin")} />
                                    <span className="whitespace-nowrap">Refresh Data</span>
                                </button>
                            </div>
                        )}
                    </div>

                    {activeMainTab === 'opname_rak' ? (
                        <>

                    {/* DUAL SEARCH & CONTROL HUB (2 Columns on Desktop) */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
                        
                        {/* LEFT COLUMN: RAK SELECTOR (7 Cols on LG) */}
                        <div className="lg:col-span-7 relative z-40">
                            <Card className="rounded-3xl shadow-xl shadow-slate-900/5 border border-slate-200/90 bg-white overflow-visible transition-all duration-300 hover:shadow-2xl hover:border-blue-300 relative">
                                <CardContent className="p-4 sm:p-6 overflow-visible">
                                    <div className="space-y-3.5 sm:space-y-4">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-black text-slate-800 uppercase tracking-[0.15em] flex items-center gap-2">
                                                <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                                                    <MapPin className="w-4 h-4" />
                                                </div>
                                                <span>Filter & Scan Lokasi Rak</span>
                                            </label>
                                            <span className="text-[10px] font-extrabold text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full uppercase tracking-wider">
                                                {rackOptions.length} Rak Terdaftar
                                            </span>
                                        </div>

                                        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2.5 items-stretch">
                                            <div className="relative flex-1">
                                                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none z-10">
                                                    <Search className="h-5 w-5 text-blue-600" />
                                                </div>
                                                <CustomDropdown
                                                    value={rackId}
                                                    onChange={(e) => setRackId(e.target.value)}
                                                    options={rackOptions}
                                                    placeholder="PILIH ATAU KETIK LOKASI RAK..."
                                                    className="pl-11 h-12 sm:h-13 text-sm sm:text-base font-black shadow-none w-full border-2 border-slate-200 bg-slate-50/50 hover:bg-white focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-100 rounded-2xl transition-all"
                                                    showClearButton={true}
                                                    forceUppercase={true}
                                                    onOptionSelect={() => {
                                                        setTimeout(() => {
                                                            submitButtonRef.current?.click();
                                                        }, 100);
                                                    }}
                                                />
                                            </div>
                                            <div className="flex gap-2 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => setShowScanner(true)}
                                                    className="flex-1 sm:flex-none px-4 sm:px-5 py-2 text-blue-600 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 border-2 border-blue-200/80 rounded-2xl active:scale-95 transition-all h-12 sm:h-13 flex items-center justify-center gap-2 shadow-sm font-black text-xs uppercase tracking-wider cursor-pointer"
                                                    title="Scan QR / Barcode Kamera"
                                                >
                                                    <Camera className="h-5 w-5 text-blue-600" />
                                                    <span>Scan</span>
                                                </button>
                                                <button
                                                    ref={submitButtonRef}
                                                    type="submit"
                                                    className="flex-1 sm:flex-none px-6 py-2 text-xs sm:text-sm font-black text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-2xl shadow-lg shadow-blue-500/25 active:scale-95 transition-all h-12 sm:h-13 uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer"
                                                >
                                                    <span>Cari</span>
                                                    <ChevronRight className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </form>

                                        {/* SECRET DEVMODE TRIGGER: Hanya muncul ketika user mengetik 'devmode' di input rak */}
                                        {isDevModeTyped && (
                                            <div className="pt-3.5 border-t border-rose-100 flex justify-center animate-in fade-in slide-in-from-top-2 duration-300">
                                                <button
                                                    type="button"
                                                    onClick={() => setShowBulkUnverifyModal(true)}
                                                    className="w-full px-4 py-3 bg-gradient-to-r from-rose-500 via-red-600 to-rose-700 hover:from-rose-600 hover:to-rose-800 text-white font-black rounded-2xl text-xs sm:text-sm uppercase tracking-wider transition-all border border-rose-400/50 shadow-lg shadow-rose-500/25 active:scale-98 flex items-center justify-center gap-2 group cursor-pointer"
                                                    title="DevMode Terbuka: Klik untuk Batal Konfirmasi Massal"
                                                >
                                                    <XCircle className="w-4 h-4 text-rose-200 group-hover:rotate-90 transition-transform duration-200" />
                                                    <span>⚡ Batal Konfirmasi Massal (DevMode Unlocked)</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* RIGHT COLUMN: GLOBAL PRODUCT SEARCH (5 Cols on LG) */}
                        <div className="lg:col-span-5 relative z-30">
                            <Card className="rounded-3xl shadow-xl shadow-slate-900/5 border border-slate-200/90 bg-white overflow-visible transition-all duration-300 hover:shadow-2xl hover:border-emerald-300 relative">
                                <CardContent className="p-4 sm:p-6">
                                    <div className="space-y-3.5 sm:space-y-4">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-black text-slate-800 uppercase tracking-[0.15em] flex items-center gap-2">
                                                <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
                                                    <SearchCode className="w-4 h-4" />
                                                </div>
                                                <span>Cari Posisi Barang / SKU</span>
                                            </label>
                                            <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full uppercase tracking-wider">
                                                Semua Rak
                                            </span>
                                        </div>

                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                                {isGlobalSearching ? (
                                                    <Loader className="h-5 w-5 text-emerald-600 animate-spin" />
                                                ) : (
                                                    <Search className="h-5 w-5 text-emerald-600" />
                                                )}
                                            </div>
                                            <input
                                                type="text"
                                                value={globalSearchTerm}
                                                onChange={(e) => handleGlobalSearch(e.target.value)}
                                                onFocus={() => { if (globalSearchResults.length > 0 || globalSearchTerm.trim().length >= 1) setShowGlobalResults(true); }}
                                                placeholder="Ketik SKU / Nama Barang di sini..."
                                                className="w-full pl-11 pr-10 h-12 sm:h-13 text-sm font-bold text-slate-900 placeholder:text-slate-400 border-2 border-slate-200 hover:border-emerald-300 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100 rounded-2xl bg-slate-50/50 hover:bg-white transition-all shadow-sm"
                                            />
                                            {globalSearchTerm && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleGlobalSearch('')}
                                                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-700 cursor-pointer"
                                                >
                                                    <div className="p-1 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors">
                                                        <X className="h-3.5 w-3.5" />
                                                    </div>
                                                </button>
                                            )}
                                        </div>

                                        {/* Global Search Results List Overlay */}
                                        {showGlobalResults && globalSearchTerm.trim().length >= 1 && (
                                            <div className="absolute top-[105%] left-0 right-0 z-[100] bg-white rounded-2xl border-2 border-emerald-300 shadow-2xl overflow-hidden max-h-96 overflow-y-auto divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-150 ring-8 ring-black/5">
                                                <div className="p-3 bg-emerald-50/90 border-b border-emerald-100 flex justify-between items-center sticky top-0 backdrop-blur-sm z-10">
                                                    <span className="text-xs font-black text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                                                        <Package className="w-3.5 h-3.5 text-emerald-600" />
                                                        Ditemukan {globalSearchResults.length} Lokasi Produk
                                                    </span>
                                                    <button
                                                        onClick={() => setShowGlobalResults(false)}
                                                        className="text-xs font-black text-emerald-700 hover:text-emerald-900 bg-emerald-100/70 px-2 py-0.5 rounded-lg cursor-pointer"
                                                    >
                                                        Tutup ✕
                                                    </button>
                                                </div>

                                                {globalSearchResults.length === 0 ? (
                                                    <div className="p-6 text-center text-sm font-bold text-slate-500">
                                                        {isGlobalSearching ? 'Mencari di seluruh rak...' : `Tidak ditemukan produk "${globalSearchTerm}" di rak manapun.`}
                                                    </div>
                                                ) : (
                                                    globalSearchResults.map((gItem) => (
                                                        <div
                                                            key={`${gItem.id}-${gItem.rak}`}
                                                            className="p-3.5 hover:bg-emerald-50/50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                                                        >
                                                            <div className="space-y-1">
                                                                <h4 className="font-black text-xs sm:text-sm text-slate-900 uppercase tracking-tight group-hover:text-emerald-700 transition-colors">
                                                                    {gItem.nama_produk}
                                                                </h4>
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <span className="px-2 py-0.5 rounded-md text-[11px] font-black bg-blue-600 text-white uppercase tracking-wider flex items-center gap-1">
                                                                        <Package className="w-3 h-3" />
                                                                        Rak: {gItem.rak}
                                                                    </span>
                                                                    {gItem.sub_rak && gItem.sub_rak !== gItem.rak && (
                                                                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 uppercase">
                                                                            Sub: {gItem.sub_rak}
                                                                        </span>
                                                                    )}
                                                                    <span className="text-xs font-bold text-slate-500">
                                                                        Stok: <strong className="text-emerald-600 font-black">{gItem.tersedia.toLocaleString()}</strong> {gItem.satuan}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            <button
                                                                onClick={() => handleSelectRackFromSearch(gItem.rak)}
                                                                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider shadow-sm hover:shadow transition-all flex items-center justify-center gap-1 shrink-0 cursor-pointer"
                                                            >
                                                                <span>Buka Rak</span>
                                                                <ChevronRight className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>

                    {/* ======================================================== */}
                    {/* STATE 1: INTERACTIVE RACK EXPLORER & DASHBOARD (WHEN NO RAK IS OPENED) */}
                    {/* ======================================================== */}
                    {!lastScanned && (
                        <div className="space-y-5 sm:space-y-6 animate-in fade-in duration-300">
                            {/* QUICK STATS CARDS ROW (4 Clean Informational Cards) */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
                                <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all flex items-center gap-3.5">
                                    <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                                        <Layers className="w-5 h-5 sm:w-6 sm:h-6" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Lokasi</p>
                                        <p className="text-lg sm:text-xl font-black text-slate-900">{rackOptions.length} <span className="text-xs font-bold text-slate-500">Rak</span></p>
                                    </div>
                                </div>

                                <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all flex items-center gap-3.5">
                                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                                        <Compass className="w-5 h-5 sm:w-6 sm:h-6" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Zona / Blok</p>
                                        <p className="text-lg sm:text-xl font-black text-slate-900">{availablePrefixes.length} <span className="text-xs font-bold text-slate-500">Blok</span></p>
                                    </div>
                                </div>

                                <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all flex items-center gap-3.5">
                                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                                        <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Status Sistem</p>
                                        <p className="text-sm sm:text-base font-black text-emerald-600 flex items-center gap-1.5">
                                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                            Sinkron Aktif
                                        </p>
                                    </div>
                                </div>

                                <div 
                                    onClick={() => setShowKarantinaModal(true)}
                                    className="bg-gradient-to-br from-amber-50 to-orange-50 hover:from-amber-100 hover:to-orange-100 p-4 sm:p-5 rounded-3xl border border-amber-200/90 shadow-sm hover:shadow-md transition-all flex items-center gap-3.5 cursor-pointer group"
                                >
                                    <div className="p-3 bg-amber-500 text-white rounded-2xl shadow-sm shadow-amber-500/20 group-hover:scale-105 transition-transform relative">
                                        <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6" />
                                        {pendingKarantinaCount > 0 && (
                                            <span className="w-2.5 h-2.5 bg-rose-500 rounded-full absolute -top-0.5 -right-0.5 ring-2 ring-white animate-pulse" />
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">Wadah Karantina</p>
                                        <p className="text-lg sm:text-xl font-black text-amber-900 flex items-center gap-1.5">
                                            <span>{pendingKarantinaCount}</span>
                                            <span className="text-xs font-bold text-amber-700">Menunggu</span>
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* RECENTLY ACCESSED RACKS (RIWAYAT TERAKHIR) */}
                            {recentRacks.length > 0 && (
                                <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-sm space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
                                            <History className="w-4 h-4 text-blue-600" />
                                            Rak Terakhir Diakses:
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setRecentRacks([]);
                                                localStorage.removeItem('cek_rak_2_recent_racks');
                                            }}
                                            className="text-[11px] font-bold text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                                        >
                                            Bersihkan Riwayat
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {recentRacks.map(r => (
                                            <button
                                                key={r}
                                                type="button"
                                                onClick={() => handleSelectRackFromSearch(r)}
                                                className="px-3.5 py-1.5 rounded-xl bg-blue-50/80 hover:bg-blue-600 hover:text-white text-blue-700 border border-blue-200 text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 group cursor-pointer shadow-xs active:scale-95"
                                            >
                                                <MapPin className="w-3.5 h-3.5 text-blue-500 group-hover:text-white" />
                                                <span>Rak {r}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* VISUAL INTERACTIVE RACK EXPLORER */}
                            <Card className="rounded-3xl shadow-xl shadow-slate-900/5 border border-slate-200/90 bg-white overflow-hidden">
                                <CardContent className="p-4 sm:p-6 lg:p-7 space-y-5">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                                        <div>
                                            <h3 className="text-base sm:text-lg font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                                                <Grid3X3 className="w-5 h-5 text-blue-600" />
                                                Jelajahi Lokasi Rak Gudang
                                            </h3>
                                            <p className="text-xs font-medium text-slate-500 mt-0.5">
                                                Klik langsung salah satu kotak rak di bawah untuk memeriksa fisik barang & konfirmasi stok
                                            </p>
                                        </div>

                                        {/* Quick Search inside explorer */}
                                        <div className="relative w-full sm:w-64">
                                            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                            <input
                                                type="text"
                                                value={explorerSearch}
                                                onChange={(e) => setExplorerSearch(e.target.value)}
                                                placeholder="Filter rak (misal: A1)..."
                                                className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white transition-all uppercase"
                                            />
                                            {explorerSearch && (
                                                <button
                                                    type="button"
                                                    onClick={() => setExplorerSearch('')}
                                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* ZONE / PREFIX TABS */}
                                    <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedPrefixTab('ALL')}
                                            className={cn(
                                                "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0 cursor-pointer",
                                                selectedPrefixTab === 'ALL'
                                                    ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                                                    : "bg-slate-100 hover:bg-slate-200 text-slate-600"
                                            )}
                                        >
                                            Semua ({rackOptions.length})
                                        </button>
                                        {availablePrefixes.map(prefix => {
                                            const count = rackOptions.filter(r => r.toUpperCase().startsWith(prefix)).length;
                                            const isActive = selectedPrefixTab === prefix;
                                            const isZoneRunning = !!activeOpnameZones[prefix]?.active;
                                            return (
                                                <button
                                                    key={prefix}
                                                    type="button"
                                                    onClick={() => setSelectedPrefixTab(prefix)}
                                                    className={cn(
                                                        "px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0 cursor-pointer flex items-center gap-1.5 relative",
                                                        isActive
                                                            ? (isZoneRunning ? "bg-amber-600 text-white shadow-md shadow-amber-500/30 ring-2 ring-amber-300" : "bg-blue-600 text-white shadow-md shadow-blue-500/20")
                                                            : (isZoneRunning ? "bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100" : "bg-slate-100 hover:bg-slate-200 text-slate-600")
                                                    )}
                                                >
                                                    {isZoneRunning && (
                                                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                                                    )}
                                                    <span>Blok {prefix}</span>
                                                    <span className={cn(
                                                        "px-1.5 py-0.2 rounded-md text-[10px]",
                                                        isActive ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                                                    )}>
                                                        {count}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* DEDICATED ZONE OPNAME SESSION ACTION PANEL (WHEN A SPECIFIC BLOCK IS SELECTED) */}
                                    {selectedPrefixTab !== 'ALL' && (
                                        <div className={cn(
                                            "p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all",
                                            activeOpnameZones[selectedPrefixTab]?.active
                                                ? "bg-gradient-to-r from-amber-50 via-orange-50 to-amber-100/60 border-amber-300 shadow-sm"
                                                : "bg-slate-50 border-slate-200/80"
                                        )}>
                                            <div className="flex items-center gap-3">
                                                <div className={cn(
                                                    "p-2.5 rounded-xl flex items-center justify-center text-xs font-black shrink-0",
                                                    activeOpnameZones[selectedPrefixTab]?.active
                                                        ? "bg-amber-500 text-white shadow-sm shadow-amber-500/30 animate-pulse"
                                                        : "bg-blue-100 text-blue-700"
                                                )}>
                                                    {activeOpnameZones[selectedPrefixTab]?.active ? '⚡ AKTIF' : `ZONA ${selectedPrefixTab}`}
                                                </div>
                                                <div>
                                                    <h4 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                                                        <span>Status Sesi Stock Opname: Zona {selectedPrefixTab}</span>
                                                        {activeOpnameZones[selectedPrefixTab]?.active && (
                                                            <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-800 text-[10px] font-black border border-amber-300">
                                                                AUTO-BRIDGE AKTIF
                                                            </span>
                                                        )}
                                                    </h4>
                                                    <p className="text-[11px] text-slate-600 font-medium mt-0.5">
                                                        {activeOpnameZones[selectedPrefixTab]?.active
                                                            ? `Pemotongan barang keluar dari rak ${selectedPrefixTab}1-${selectedPrefixTab}999 otomatis diarahkan ke ${activeOpnameZones[selectedPrefixTab]?.temp_rack || `TEMP-${selectedPrefixTab}`}.`
                                                            : `Sesi belum dimulai. Pemotongan barang keluar memvalidasi stok di sub-rak ${selectedPrefixTab}1-${selectedPrefixTab}999 secara normal.`}
                                                    </p>
                                                </div>
                                            </div>

                                            {isDeveloper && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleZoneSession(selectedPrefixTab, !activeOpnameZones[selectedPrefixTab]?.active)}
                                                    disabled={isTogglingZone === selectedPrefixTab}
                                                    className={cn(
                                                        "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95 cursor-pointer shrink-0",
                                                        activeOpnameZones[selectedPrefixTab]?.active
                                                            ? "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-500/20"
                                                            : "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-amber-500/20"
                                                    )}
                                                >
                                                    {activeOpnameZones[selectedPrefixTab]?.active ? (
                                                        <>
                                                            <XCircle className="w-4 h-4" />
                                                            <span>Selesaikan Sesi Zona {selectedPrefixTab}</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Sparkles className="w-4 h-4" />
                                                            <span>Mulai Sesi Opname Zona {selectedPrefixTab}</span>
                                                        </>
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {/* INTERACTIVE RACK CHIPS GRID */}
                                    <div className="max-h-96 overflow-y-auto pr-1">
                                        {explorerFilteredRacks.length === 0 ? (
                                            <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                                <p className="text-xs font-bold text-slate-500 uppercase">Tidak ada rak yang sesuai dengan filter.</p>
                                                <button
                                                    onClick={() => {
                                                        setSelectedPrefixTab('ALL');
                                                        setExplorerSearch('');
                                                    }}
                                                    className="mt-2 text-xs font-black text-blue-600 hover:underline cursor-pointer"
                                                >
                                                    Reset Filter
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2.5">
                                                {explorerFilteredRacks.map((rackName) => (
                                                    <button
                                                        key={rackName}
                                                        type="button"
                                                        onClick={() => handleSelectRackFromSearch(rackName)}
                                                        className="p-3 bg-slate-50 hover:bg-gradient-to-br hover:from-blue-600 hover:to-indigo-700 hover:text-white rounded-2xl border border-slate-200 hover:border-blue-500 hover:shadow-md hover:shadow-blue-500/20 active:scale-95 transition-all text-left group flex flex-col justify-between h-20 cursor-pointer"
                                                    >
                                                        <div className="flex items-center justify-between w-full">
                                                            <span className="text-[10px] font-black uppercase text-slate-400 group-hover:text-blue-200">
                                                                Lokasi
                                                            </span>
                                                            <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-white transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                                                        </div>
                                                        <div className="font-black text-sm text-slate-900 group-hover:text-white tracking-tight uppercase truncate">
                                                            {rackName}
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* QUICK WORKFLOW GUIDE CARDS */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm flex items-start gap-3.5">
                                    <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shrink-0 font-black text-base">
                                        1
                                    </div>
                                    <div>
                                        <h4 className="font-black text-xs sm:text-sm text-slate-900 uppercase tracking-tight">Pilih / Scan Rak</h4>
                                        <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                                            Gunakan dropdown, ketik nama rak, scan barcode kamera, atau klik chip rak di atas.
                                        </p>
                                    </div>
                                </div>

                                <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm flex items-start gap-3.5">
                                    <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0 font-black text-base">
                                        2
                                    </div>
                                    <div>
                                        <h4 className="font-black text-xs sm:text-sm text-slate-900 uppercase tracking-tight">Cek Fisik & Konfirmasi</h4>
                                        <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                                            Cocokkan kuantitas fisik di rak. Klik konfirmasi untuk menandai data akurat secara universal.
                                        </p>
                                    </div>
                                </div>

                                <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm flex items-start gap-3.5">
                                    <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shrink-0 font-black text-base">
                                        3
                                    </div>
                                    <div>
                                        <h4 className="font-black text-xs sm:text-sm text-slate-900 uppercase tracking-tight">Pindah Rak & Audit</h4>
                                        <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                                            Pindahkan stok yang salah rak atau gunakan mode audit untuk menyusun ulang isi rak dengan mudah.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ======================================================== */}
                    {/* STATE 2: ACTIVE RAK DETAIL & ACTION CENTER */}
                    {/* ======================================================== */}
                    {lastScanned && (
                        <div className="space-y-4 sm:space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-400">
                            {/* BANNER RAK PENAMPUNG SEMENTARA (REORGANISASI) */}
                            {lastScanned?.toUpperCase().trim().startsWith('TEMP') && (
                                <div className="bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border-2 border-amber-400/80 rounded-3xl p-4 sm:p-5 shadow-md flex items-start sm:items-center gap-3.5 animate-in fade-in">
                                    <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-amber-500/30">
                                        <AlertTriangle className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-black text-sm text-amber-900 uppercase tracking-tight flex items-center gap-2">
                                            <span>🔶 Rak Penampung Sementara (Reorganisasi Gudang)</span>
                                            <span className="px-2 py-0.5 rounded-full bg-amber-200/70 text-amber-900 text-[10px] font-black uppercase">
                                                Stok Menunggu Ditarik
                                            </span>
                                        </h4>
                                        <p className="text-xs text-amber-800 font-semibold mt-0.5 leading-relaxed">
                                            Barang di rak ini adalah stok sementara hasil Pindah Real-Time. Buka sub-rak tujuan final Anda (misal: <strong>A1, A2, B1</strong>), lalu gunakan tombol <strong>+ Tarik Barang</strong> di sub-rak tersebut untuk memindahkan barang ke tempat aslinya.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* RAK HERO BAR */}
                            <div className="bg-white rounded-3xl p-4 sm:p-6 shadow-xl shadow-slate-900/5 border border-slate-200/90 flex flex-col xl:flex-row xl:items-center justify-between gap-4 sm:gap-5">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-3.5 sm:gap-4">
                                    <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0">
                                        <Package className="h-6 w-6 sm:h-7 sm:w-7" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <div className="flex items-center gap-2.5">
                                            <h2 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 tracking-tight uppercase">
                                                Rak {lastScanned}
                                            </h2>
                                            <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-50 text-blue-700 border border-blue-200 uppercase">
                                                {items.length} Item
                                            </span>
                                            {isOpnameZoneActive(lastScanned) && (
                                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-500/15 text-amber-800 border border-amber-300 uppercase flex items-center gap-1 shadow-xs">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                                    Sesi Opname Aktif (Bridge: {getTempRackForPrefix(lastScanned)})
                                                </span>
                                            )}
                                        </div>
                                        {/* Status Progress Bar */}
                                        <div className="flex items-center gap-3">
                                            <div className="w-32 sm:w-48 h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                                <div 
                                                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500"
                                                    style={{ width: `${items.length > 0 ? (confirmedCount / items.length) * 100 : 0}%` }}
                                                />
                                            </div>
                                            <span className="text-xs font-bold text-slate-500">
                                                <strong className="text-emerald-600">{confirmedCount}</strong> / {items.length} Terkonfirmasi ({items.length > 0 ? Math.round((confirmedCount / items.length) * 100) : 0}%)
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* ACTION BUTTONS TOOLBAR */}
                                <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 w-full xl:w-auto">
                                    {/* Tombol Tarik Barang Permanen */}
                                    <Button
                                        onClick={openPullModal}
                                        className="h-11 px-3.5 sm:px-4 rounded-xl font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 active:scale-95 transition-all flex items-center justify-center text-xs uppercase tracking-wider cursor-pointer"
                                        title="Tarik stok fisik barang dari rak lain/TEMP ke sub-rak ini"
                                    >
                                        <SearchCode size={16} className="mr-1.5" />
                                        <span>Tarik Barang</span>
                                    </Button>

                                    {/* Tombol Wadah Karantina Revisi */}
                                    <Button
                                        variant="outline"
                                        onClick={() => setShowKarantinaModal(true)}
                                        className="h-11 px-3.5 sm:px-4 rounded-xl font-black bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 shadow-sm flex items-center justify-center text-xs uppercase tracking-wider cursor-pointer relative"
                                        title="Buka Wadah Karantina Revisi OUT"
                                    >
                                        <ShieldCheck size={16} className="mr-1.5 text-amber-600" />
                                        <span>Karantina</span>
                                        {pendingKarantinaCount > 0 && (
                                            <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-rose-500 text-white font-black text-[10px] animate-pulse">
                                                {pendingKarantinaCount}
                                            </span>
                                        )}
                                    </Button>

                                    <Button
                                        onClick={() => fetchItems(lastScanned, true)}
                                        className="h-11 px-3.5 sm:px-4 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 active:scale-95 transition-all flex items-center justify-center text-xs uppercase tracking-wider"
                                    >
                                        <RefreshCw className={cn("h-4 w-4 mr-1.5", loading && "animate-spin")} />
                                        <span>Refresh</span>
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={handleCloseActiveRack}
                                        className="h-11 px-3.5 sm:px-4 rounded-xl font-bold border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center text-xs uppercase tracking-wider"
                                        title="Tutup rak ini dan kembali ke daftar rak"
                                    >
                                        <X className="h-4 w-4 mr-1.5" />
                                        <span>Tutup Rak</span>
                                    </Button>
                                </div>
                            </div>

                            {/* ITEM FILTER, SEARCH BAR & VIEW SWITCHER INSIDE RAK */}
                            {items.length > 0 && (
                                <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-lg shadow-slate-900/5 space-y-3.5">
                                    <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
                                        <div className="relative flex-1">
                                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none z-10">
                                                <Search className="h-5 w-5 text-blue-600" />
                                            </div>
                                            <input
                                                type="text"
                                                value={itemSearchTerm}
                                                onChange={(e) => setItemSearchTerm(e.target.value)}
                                                placeholder={`Cari Barang / SKU di Rak ${lastScanned}... (${filteredItems.length} dari ${items.length} item)`}
                                                className="w-full pl-11 pr-11 py-3 bg-slate-50 border-2 border-slate-200 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 focus:bg-white rounded-2xl text-sm font-bold text-slate-900 placeholder:text-slate-400 shadow-sm transition-all"
                                            />
                                            {itemSearchTerm && (
                                                <button
                                                    type="button"
                                                    onClick={() => setItemSearchTerm('')}
                                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                                                >
                                                    <div className="bg-slate-200/70 hover:bg-rose-100 p-1 rounded-full">
                                                        <X className="h-3.5 w-3.5" />
                                                    </div>
                                                </button>
                                            )}
                                        </div>

                                        {/* VIEW MODE TOGGLE (Grid vs Table) */}
                                        <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200 shrink-0 self-start md:self-auto">
                                            <button
                                                type="button"
                                                onClick={() => setViewMode('grid')}
                                                className={cn(
                                                    "px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer",
                                                    viewMode === 'grid'
                                                        ? "bg-white text-blue-700 shadow-sm"
                                                        : "text-slate-500 hover:text-slate-800"
                                                )}
                                            >
                                                <LayoutGrid className="w-3.5 h-3.5" />
                                                <span>Grid</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setViewMode('table')}
                                                className={cn(
                                                    "px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer",
                                                    viewMode === 'table'
                                                        ? "bg-white text-blue-700 shadow-sm"
                                                        : "text-slate-500 hover:text-slate-800"
                                                )}
                                            >
                                                <List className="w-3.5 h-3.5" />
                                                <span>Tabel</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* STATUS FILTER PILLS */}
                                    <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 scrollbar-none w-full border-t border-slate-100">
                                        <button
                                            type="button"
                                            onClick={() => setStatusFilter('all')}
                                            className={cn(
                                                "shrink-0 px-3.5 py-2 rounded-xl text-xs font-black transition-all duration-200 flex items-center gap-2 whitespace-nowrap cursor-pointer uppercase tracking-wider",
                                                statusFilter === 'all'
                                                    ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                            )}
                                        >
                                            <Package className="w-3.5 h-3.5" />
                                            <span>Semua</span>
                                            <span className={cn(
                                                "px-2 py-0.5 rounded-full text-[10px] font-black",
                                                statusFilter === 'all' ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                                            )}>
                                                {items.length}
                                            </span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setStatusFilter('terkonfirmasi')}
                                            className={cn(
                                                "shrink-0 px-3.5 py-2 rounded-xl text-xs font-black transition-all duration-200 flex items-center gap-2 whitespace-nowrap cursor-pointer uppercase tracking-wider",
                                                statusFilter === 'terkonfirmasi'
                                                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
                                                    : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100"
                                            )}
                                        >
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 group-hover:text-emerald-600" />
                                            <span>Terkonfirmasi</span>
                                            <span className={cn(
                                                "px-2 py-0.5 rounded-full text-[10px] font-black",
                                                statusFilter === 'terkonfirmasi' ? "bg-white/20 text-white" : "bg-emerald-200 text-emerald-900"
                                            )}>
                                                {confirmedCount}
                                            </span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setStatusFilter('belum_terkonfirmasi')}
                                            className={cn(
                                                "shrink-0 px-3.5 py-2 rounded-xl text-xs font-black transition-all duration-200 flex items-center gap-2 whitespace-nowrap cursor-pointer uppercase tracking-wider",
                                                statusFilter === 'belum_terkonfirmasi'
                                                    ? "bg-amber-500 text-white shadow-md shadow-amber-500/20"
                                                    : "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-100"
                                            )}
                                        >
                                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                                            <span>Belum Konfirmasi</span>
                                            <span className={cn(
                                                "px-2 py-0.5 rounded-full text-[10px] font-black",
                                                statusFilter === 'belum_terkonfirmasi' ? "bg-white/20 text-white" : "bg-amber-200 text-amber-900"
                                            )}>
                                                {unconfirmedCount}
                                            </span>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* ITEM CARDS / TABLE / EMPTY STATES */}
                            {items.length === 0 ? (
                                <Card className="border-dashed border-2 border-slate-300 bg-white rounded-3xl shadow-sm">
                                    <CardContent className="flex flex-col items-center justify-center py-16 text-center px-4">
                                        <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-3xl flex items-center justify-center mb-4 shadow-inner">
                                            <AlertTriangle className="h-8 w-8" />
                                        </div>
                                        <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Rak Ini Kosong</h3>
                                        <p className="text-slate-500 text-sm max-w-sm mt-1 font-medium">
                                            Tidak ada barang yang terdaftar di lokasi rak <strong className="text-blue-600 uppercase">{lastScanned}</strong>.
                                        </p>
                                    </CardContent>
                                </Card>
                            ) : filteredItems.length === 0 ? (
                                <Card className="border-dashed border-2 border-slate-300 bg-white rounded-3xl shadow-sm">
                                    <CardContent className="flex flex-col items-center justify-center py-12 text-center px-4">
                                        <h3 className="text-base font-bold text-slate-700">Barang Tidak Ditemukan</h3>
                                        <p className="text-slate-500 text-xs mt-1">
                                            Tidak ada barang yang cocok {itemSearchTerm ? `dengan pencarian "${itemSearchTerm}"` : ''} 
                                            {statusFilter !== 'all' ? ` (Filter: ${statusFilter === 'terkonfirmasi' ? 'Terkonfirmasi' : 'Belum Terkonfirmasi'})` : ''} di Rak {lastScanned}.
                                        </p>
                                    </CardContent>
                                </Card>
                            ) : viewMode === 'grid' ? (
                                /* GRID CARDS VIEW */
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                                    {filteredItems.map((item) => {
                                        const isVerified = verifiedIds.has(item.id);
                                        return (
                                            <Card 
                                                key={item.id} 
                                                className={cn(
                                                    "transition-all duration-300 rounded-3xl overflow-hidden group bg-white border hover:shadow-xl hover:-translate-y-1 relative flex flex-col justify-between",
                                                    isVerified 
                                                        ? "border-emerald-200/90 shadow-md shadow-emerald-900/5" 
                                                        : "border-slate-200/90 shadow-md shadow-slate-900/5"
                                                )}
                                            >
                                                {/* Top Status Accent Bar */}
                                                <div className={cn(
                                                    "h-1.5 w-full transition-all",
                                                    isVerified ? "bg-emerald-500 group-hover:h-2" : "bg-amber-400 group-hover:h-2"
                                                )} />

                                                <CardContent className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-3.5">
                                                    <div className="space-y-3">
                                                        <div className="flex justify-between items-start gap-2">
                                                            <h3 className="font-black text-sm sm:text-base text-slate-900 leading-snug uppercase tracking-tight line-clamp-2">
                                                                {item.nama_produk}
                                                            </h3>
                                                            {isVerified ? (
                                                                <span className="shrink-0 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200 text-[10px] font-black uppercase flex items-center gap-1">
                                                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                                                    <span>Terkonfirmasi</span>
                                                                </span>
                                                            ) : (
                                                                <span className="shrink-0 px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full border border-amber-200 text-[10px] font-black uppercase flex items-center gap-1">
                                                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                                                    <span>Belum Cek</span>
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Metadata Badges */}
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Packing</p>
                                                                <p className="font-bold text-xs text-slate-800 truncate">{item.packing || '-'}</p>
                                                            </div>
                                                            <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Satuan</p>
                                                                <p className="font-bold text-xs text-slate-800 uppercase truncate">{item.satuan || '-'}</p>
                                                            </div>
                                                        </div>

                                                        {/* Stok Tersedia Box */}
                                                        <div className={cn(
                                                            "p-3 rounded-2xl border flex items-center justify-between",
                                                            isVerified ? "bg-emerald-50/50 border-emerald-100" : "bg-blue-50/50 border-blue-100"
                                                        )}>
                                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Stok Fisik</span>
                                                            <div className="flex items-baseline gap-1">
                                                                <span className={cn(
                                                                    "text-2xl font-black tracking-tight",
                                                                    isVerified ? "text-emerald-700" : "text-blue-700"
                                                                )}>
                                                                    {item.tersedia.toLocaleString()}
                                                                </span>
                                                                <span className="text-[10px] font-extrabold text-slate-500 uppercase">{item.satuan}</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Action Controls */}
                                                    <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                                                        {isVerified ? (
                                                            isDeveloper ? (
                                                                <button
                                                                    onClick={() => handleMarkAsUnverified(item)}
                                                                    title="Klik untuk Batal Konfirmasi (Khusus Developer)"
                                                                    className="w-full h-10 px-3 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-rose-50 hover:text-rose-700 transition-all flex items-center justify-center font-black text-xs uppercase tracking-wider group/btn cursor-pointer border border-emerald-200 hover:border-rose-200 shadow-sm"
                                                                >
                                                                    <span className="group-hover/btn:hidden flex items-center gap-1.5">
                                                                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                                                        Terkonfirmasi (Klik Batal)
                                                                    </span>
                                                                    <span className="hidden group-hover/btn:flex items-center gap-1.5 text-rose-600 font-black">
                                                                        <XCircle className="h-4 w-4" />
                                                                        Batal Konfirmasi
                                                                    </span>
                                                                </button>
                                                            ) : (
                                                                <div className="w-full h-10 px-3 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-black text-xs uppercase tracking-wider border border-emerald-200 shadow-sm gap-1.5">
                                                                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                                                    <span>Terkonfirmasi (Final)</span>
                                                                </div>
                                                            )
                                                        ) : (
                                                            isDeveloper ? (
                                                                <div className="flex items-center gap-2 w-full">
                                                                    <button
                                                                        onClick={() => handleMarkAsVerified(item)}
                                                                        className="flex-1 h-10 px-3 rounded-xl text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 flex items-center justify-center font-black text-xs uppercase tracking-wider shadow-sm hover:shadow active:scale-95 transition-all gap-1.5 cursor-pointer"
                                                                        title="Konfirmasi langsung barang di rak ini (Khusus Developer)"
                                                                    >
                                                                        <CheckCircle2 className="h-4 w-4" />
                                                                        <span>Konfirmasi</span>
                                                                    </button>
                                                                    <button
                                                                        onClick={() => {
                                                                            setSelectedMoveItem(item);
                                                                            setMoveData({ rak_tujuan: '', jumlah_pindah: '' });
                                                                            setShowMoveModal(true);
                                                                        }}
                                                                        className="h-10 px-3.5 rounded-xl text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 flex items-center justify-center font-black text-xs uppercase tracking-wider active:scale-95 transition-all gap-1 cursor-pointer"
                                                                        title="Pindahkan stok ke rak lain (Khusus Developer)"
                                                                    >
                                                                        <ArrowRightLeft className="h-4 w-4" />
                                                                        <span>Pindah</span>
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <div className="w-full h-10 px-3 rounded-xl bg-slate-50 text-slate-500 flex items-center justify-center font-bold text-xs uppercase tracking-wider border border-slate-200 gap-1.5 shadow-sm">
                                                                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                                                                    <span>Belum Dikonfirmasi</span>
                                                                </div>
                                                            )
                                                        )}
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        );
                                    })}
                                </div>
                            ) : (
                                /* COMPACT TABLE VIEW */
                                <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xl shadow-slate-900/5 overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                                                    <th className="py-3.5 px-4 w-12 text-center">#</th>
                                                    <th className="py-3.5 px-4">Status</th>
                                                    <th className="py-3.5 px-4">Nama Produk / SKU</th>
                                                    <th className="py-3.5 px-4">Packing</th>
                                                    <th className="py-3.5 px-4">Satuan</th>
                                                    <th className="py-3.5 px-4 text-right">Stok Fisik</th>
                                                    <th className="py-3.5 px-4 text-center">Aksi Cepat</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 text-xs">
                                                {filteredItems.map((item, index) => {
                                                    const isVerified = verifiedIds.has(item.id);
                                                    return (
                                                        <tr 
                                                            key={item.id} 
                                                            className={cn(
                                                                "hover:bg-slate-50/80 transition-colors",
                                                                isVerified ? "bg-emerald-50/20" : ""
                                                            )}
                                                        >
                                                            <td className="py-3 px-4 text-center font-bold text-slate-400">
                                                                {index + 1}
                                                            </td>
                                                            <td className="py-3 px-4 whitespace-nowrap">
                                                                {isVerified ? (
                                                                    <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200 text-[10px] font-black uppercase inline-flex items-center gap-1">
                                                                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                                                        <span>Terkonfirmasi</span>
                                                                    </span>
                                                                ) : (
                                                                    <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full border border-amber-200 text-[10px] font-black uppercase inline-flex items-center gap-1">
                                                                        <AlertTriangle className="w-3 h-3 text-amber-600" />
                                                                        <span>Belum Cek</span>
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="py-3 px-4">
                                                                <p className="font-black text-slate-900 uppercase">{item.nama_produk}</p>
                                                            </td>
                                                            <td className="py-3 px-4 font-bold text-slate-600">
                                                                {item.packing || '-'}
                                                            </td>
                                                            <td className="py-3 px-4 font-bold text-slate-600 uppercase">
                                                                {item.satuan || '-'}
                                                            </td>
                                                            <td className="py-3 px-4 text-right whitespace-nowrap">
                                                                <span className={cn(
                                                                    "font-black text-sm",
                                                                    isVerified ? "text-emerald-700" : "text-blue-700"
                                                                )}>
                                                                    {item.tersedia.toLocaleString()}
                                                                </span>
                                                                <span className="text-[10px] text-slate-400 font-bold ml-1 uppercase">{item.satuan}</span>
                                                            </td>
                                                            <td className="py-3 px-4 text-center whitespace-nowrap">
                                                                <div className="flex items-center justify-center gap-2">
                                                                    {isVerified ? (
                                                                        isDeveloper ? (
                                                                            <button
                                                                                onClick={() => handleMarkAsUnverified(item)}
                                                                                className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-rose-50 hover:text-rose-700 border border-emerald-200 hover:border-rose-200 font-black text-[11px] uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer"
                                                                                title="Batal Konfirmasi (Khusus Developer)"
                                                                            >
                                                                                <XCircle className="w-3.5 h-3.5 text-rose-500" />
                                                                                <span>Batal</span>
                                                                            </button>
                                                                        ) : (
                                                                            <span className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-black text-[11px] uppercase tracking-wider flex items-center gap-1 shadow-sm">
                                                                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                                                                <span>Terkonfirmasi (Final)</span>
                                                                            </span>
                                                                        )
                                                                    ) : (
                                                                        isDeveloper ? (
                                                                            <div className="flex items-center gap-1.5 justify-center">
                                                                                <button
                                                                                    onClick={() => handleMarkAsVerified(item)}
                                                                                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] uppercase tracking-wider shadow-sm transition-all flex items-center gap-1 cursor-pointer"
                                                                                    title="Konfirmasi Barang (Khusus Developer)"
                                                                                >
                                                                                    <Check className="w-3.5 h-3.5" />
                                                                                    <span>Konfirmasi</span>
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => {
                                                                                        setSelectedMoveItem(item);
                                                                                        setMoveData({ rak_tujuan: '', jumlah_pindah: '' });
                                                                                        setShowMoveModal(true);
                                                                                    }}
                                                                                    className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-black text-[11px] uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer"
                                                                                    title="Pindah Rak (Khusus Developer)"
                                                                                >
                                                                                    <ArrowRightLeft className="w-3.5 h-3.5" />
                                                                                    <span>Pindah</span>
                                                                                </button>
                                                                            </div>
                                                                        ) : (
                                                                            <span className="px-2.5 py-1.5 rounded-lg bg-slate-50 text-slate-500 border border-slate-200 font-bold text-[11px] uppercase tracking-wider flex items-center gap-1">
                                                                                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                                                                                <span>Belum Cek</span>
                                                                            </span>
                                                                        )
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    </>
                ) : (
                        /* ======================================================== */
                        /* TAB 2: DATA SELESAI DIPROSES (REAL-TIME LIVE TABLE) */
                        /* ======================================================== */
                        <div className="space-y-5 sm:space-y-6 animate-in fade-in duration-300">
                            {/* Summary Metric Cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm flex items-center gap-4">
                                    <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-2xl">
                                        <CheckCheck className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Transaksi Selesai</p>
                                        <p className="text-2xl font-black text-slate-900">{finishedLogs.length} <span className="text-xs font-bold text-slate-500">Baris</span></p>
                                    </div>
                                </div>

                                <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm flex items-center gap-4">
                                    <div className="p-3.5 bg-blue-50 text-blue-600 rounded-2xl">
                                        <Box className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Fisik Terverifikasi</p>
                                        <p className="text-2xl font-black text-blue-600">
                                            {finishedLogs.reduce((sum, item) => sum + (Number(item.jumlah) || 0), 0).toLocaleString()} <span className="text-xs font-bold text-slate-500">PCS</span>
                                        </p>
                                    </div>
                                </div>

                                <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm flex items-center gap-4">
                                    <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-2xl">
                                        <MapPin className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Lokasi Rak Tercakup</p>
                                        <p className="text-2xl font-black text-indigo-600">
                                            {new Set(finishedLogs.map(l => l.sub_rak || l.rak).filter(Boolean)).size} <span className="text-xs font-bold text-slate-500">Rak</span>
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Table Container */}
                            <Card className="rounded-3xl shadow-xl shadow-slate-900/5 border border-slate-200/90 bg-white overflow-hidden">
                                <CardContent className="p-4 sm:p-6 space-y-4">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                                        <div>
                                            <h3 className="text-base sm:text-lg font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                                                <Table className="w-5 h-5 text-emerald-600" />
                                                Daftar Riwayat Data Selesai Diproses (Real-Time Live)
                                            </h3>
                                            <p className="text-xs font-medium text-slate-500 mt-0.5">
                                                Menampilkan seluruh item barang dan rak yang telah selesai dikonfirmasi / diverifikasi stok fisiknya.
                                            </p>
                                        </div>

                                        {/* Filter / Search inside finished table */}
                                        <div className="relative w-full sm:w-72">
                                            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                                            <input
                                                type="text"
                                                value={finishedSearchTerm}
                                                onChange={(e) => setFinishedSearchTerm(e.target.value)}
                                                placeholder="Cari SKU, Rak, Petugas..."
                                                className="w-full pl-10 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all uppercase"
                                            />
                                            {finishedSearchTerm && (
                                                <button
                                                    type="button"
                                                    onClick={() => setFinishedSearchTerm('')}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Table */}
                                    {isLoadingFinished ? (
                                        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                                            <RefreshCw className="w-8 h-8 animate-spin text-emerald-500 mb-3" />
                                            <p className="text-xs font-bold">Memuat data verifikasi real-time...</p>
                                        </div>
                                    ) : filteredFinishedLogs.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-16 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 p-6">
                                            <CheckCircle2 className="w-12 h-12 text-slate-300 mb-3" />
                                            <h4 className="font-black text-sm text-slate-700 uppercase">Belum Ada Data Terkonfirmasi</h4>
                                            <p className="text-xs text-slate-500 mt-1 max-w-sm">
                                                {finishedSearchTerm ? 'Tidak ditemukan data yang cocok dengan pencarian.' : 'Barang yang telah dikonfirmasi di menu Cek & Scan Rak akan langsung otomatis muncul di sini secara real-time.'}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto rounded-2xl border border-slate-100">
                                            <table className="w-full text-left border-collapse">
                                                <thead>
                                                    <tr className="bg-slate-100/80 text-[11px] font-black uppercase tracking-wider text-slate-600 border-b border-slate-200">
                                                        <th className="py-3 px-4 text-center w-12">No</th>
                                                        <th className="py-3 px-4">Waktu / Tgl Selesai</th>
                                                        <th className="py-3 px-4">Lokasi Rak</th>
                                                        <th className="py-3 px-4">SKU / Nama Produk</th>
                                                        <th className="py-3 px-4 text-right">Qty Fisik</th>
                                                        <th className="py-3 px-4 text-center">Jml Barcode</th>
                                                        <th className="py-3 px-4">Petugas / PIC</th>
                                                        <th className="py-3 px-4 text-center">Status</th>
                                                        <th className="py-3 px-4 text-center">Aksi</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 text-xs">
                                                    {filteredFinishedLogs.map((log, idx) => (
                                                        <tr key={log.id || idx} className="hover:bg-slate-50/80 transition-colors">
                                                            <td className="py-3 px-4 text-center font-bold text-slate-400">
                                                                {idx + 1}
                                                            </td>
                                                            <td className="py-3 px-4 font-bold text-slate-700 whitespace-nowrap">
                                                                <div>{log.tgl_scan || log.tgl || '-'}</div>
                                                                <div className="text-[10px] text-slate-400 font-normal">{log.waktu || ''}</div>
                                                            </td>
                                                            <td className="py-3 px-4 font-black text-blue-700 whitespace-nowrap">
                                                                <span className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-xs">
                                                                    {log.sub_rak || log.rak || '-'}
                                                                </span>
                                                            </td>
                                                            <td className="py-3 px-4 font-black text-slate-900 uppercase">
                                                                <div>{log.sku || log.nama_barang || log.nama_produk || '-'}</div>
                                                                {log.packing && (
                                                                    <span className="text-[10px] font-bold text-slate-400 uppercase">
                                                                        Packing: {log.packing}
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="py-3 px-4 text-right font-black text-emerald-600 text-sm whitespace-nowrap">
                                                                {(Number(log.jumlah) || 0).toLocaleString()} <span className="text-[10px] text-slate-500 font-bold">PCS</span>
                                                            </td>
                                                            <td className="py-3 px-4 text-center whitespace-nowrap">
                                                                {(() => {
                                                                    let count = 1;
                                                                    if (typeof log.boxCount === 'number' && log.boxCount > 0) count = log.boxCount;
                                                                    else if (typeof log.box_count === 'number' && log.box_count > 0) count = log.box_count;
                                                                    else {
                                                                        const raw = String(log.log_update_user || log.status || log.keterangan || '');
                                                                        const m = raw.match(/BOX_COUNT:(\d+)/i);
                                                                        if (m && m[1]) {
                                                                            const parsed = parseInt(m[1], 10);
                                                                            if (!isNaN(parsed) && parsed > 0) count = parsed;
                                                                        } else if (typeof window !== 'undefined') {
                                                                            const cleanR = (log.sub_rak || log.rak || '').trim().toUpperCase();
                                                                            const cleanS = (log.sku || log.nama_barang || log.nama_produk || '').trim().toLowerCase();
                                                                            const cached = localStorage.getItem(`box_count_${cleanR}_${cleanS}`);
                                                                            if (cached) {
                                                                                const parsed = parseInt(cached, 10);
                                                                                if (!isNaN(parsed) && parsed > 0) count = parsed;
                                                                            }
                                                                        }
                                                                    }

                                                                    return (
                                                                        <span className={cn(
                                                                            "px-2.5 py-1 rounded-xl text-[11px] font-black uppercase inline-flex items-center gap-1.5 shadow-sm transition-all",
                                                                            count > 1 
                                                                                ? "bg-indigo-50 text-indigo-700 border border-indigo-200" 
                                                                                : "bg-slate-100 text-slate-700 border border-slate-200"
                                                                        )}>
                                                                            <QrCode className="w-3.5 h-3.5" />
                                                                            <span>{count} Barcode</span>
                                                                        </span>
                                                                    );
                                                                })()}
                                                            </td>
                                                            <td className="py-3 px-4 font-bold text-slate-600 whitespace-nowrap">
                                                                {log.user_name || log.user || '-'}
                                                            </td>
                                                            <td className="py-3 px-4 text-center whitespace-nowrap">
                                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                                                                    ✓ Selesai
                                                                </span>
                                                            </td>
                                                            <td className="py-3 px-4 text-center whitespace-nowrap">
                                                                <div className="flex items-center justify-center gap-2 mx-auto">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handlePrintThermalLabel(log)}
                                                                        className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-[11px] uppercase tracking-wider rounded-xl shadow-sm hover:shadow active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                                                                        title="Print QR Label Thermal (58mm/80mm)"
                                                                    >
                                                                        <Printer className="w-3.5 h-3.5" />
                                                                        <span>Print QR</span>
                                                                    </button>

                                                                    {isAdminOrDev && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleUnverifyFromFinishedLog(log)}
                                                                            className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-black text-[11px] uppercase tracking-wider rounded-xl border border-rose-200 shadow-sm active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
                                                                            title="Batalkan konfirmasi barang ini (Khusus Dev/Admin)"
                                                                        >
                                                                            <XCircle className="w-3.5 h-3.5 text-rose-600" />
                                                                            <span>Batal</span>
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </div>
            </main>

            {/* MODALS & TOASTS */}
            
            

            
            {showPullModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col overflow-visible">
                        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-indigo-50/50 rounded-t-3xl">
                            <div className="flex items-center space-x-3">
                                <div className="p-2 bg-indigo-100 rounded-xl text-indigo-600">
                                    <SearchCode size={20} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900 leading-tight">Tarik Barang ke {lastScanned}</h3>
                                    <p className="text-xs text-gray-500 font-medium">
                                        Sumber: <strong className="text-indigo-600 font-black">Wadah Penampung TEMP</strong>
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => setShowPullModal(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-visible flex-1">
                            {isFetchingPullData ? (
                                <div className="flex flex-col items-center justify-center py-10">
                                    <Loader className="animate-spin text-indigo-500 mb-4" size={32} />
                                    <p className="text-gray-500 font-medium">Memuat data gudang...</p>
                                </div>
                            ) : (
                                <div className="relative z-50 flex flex-col h-full min-h-[350px] max-h-[60vh]">
                                    <label className="block text-xs font-black text-gray-700 uppercase tracking-widest mb-2">Cari Barang (SKU / Nama)</label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={pullSearchTerm}
                                            onChange={(e) => handleSearchPull(e.target.value)}
                                            placeholder="Ketik SKU atau Nama Barang..."
                                            className="w-full px-4 h-12 rounded-xl border-2 border-indigo-100 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all font-medium text-gray-900 bg-white shadow-sm"
                                        />
                                        {pullSearchTerm && (
                                            <button
                                                onClick={() => {
                                                    setPullSearchTerm('');
                                                    setPullSearchResults(allPullableItems);
                                                }}
                                                className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-lg transition-colors"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>

                                    <div className="flex-1 overflow-y-auto pr-2 pb-4 mt-4 relative">
                                        {pullSearchTerm && pullSearchResults.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center p-6 text-center bg-amber-50/70 rounded-2xl border-2 border-dashed border-amber-200">
                                                <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mb-2 shadow-sm">
                                                    <AlertTriangle className="w-6 h-6" />
                                                </div>
                                                <p className="text-slate-900 text-sm font-black uppercase tracking-tight">
                                                    Data Stok 0 / Tidak Ditemukan
                                                </p>
                                                <p className="text-xs text-slate-600 font-medium max-w-xs mt-1 mb-4">
                                                    Jika fisik barang sebenarnya <strong>ada di rak</strong>, kemungkinan barang sudah terpotong OUT di sistem namun batal turun.
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenOutTrace(pullSearchTerm)}
                                                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-black text-xs uppercase tracking-wider shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                                                >
                                                    <Search className="w-4 h-4" />
                                                    <span>Telusuri Data OUT Terakhir (Fisik Ada)</span>
                                                </button>
                                            </div>
                                        ) : (
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-[11px] font-bold text-slate-400">
                                                        Hasil pencarian stok aktif:
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenOutTrace(pullSearchTerm)}
                                                        className="text-[11px] font-black text-amber-700 hover:text-amber-800 flex items-center gap-1 hover:underline cursor-pointer"
                                                    >
                                                        <Search className="w-3 h-3" />
                                                        <span>Fisik ada tapi stok 0? Telusuri OUT</span>
                                                    </button>
                                                </div>
                                                <div className="bg-white border border-gray-100 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                                                    {pullSearchResults.map((item, index) => (
                                                        <div 
                                                            key={index}
                                                            onClick={() => selectPullItem(item)}
                                                            className="px-4 py-3 hover:bg-indigo-50 cursor-pointer border-b border-gray-50 last:border-0 transition-colors group"
                                                        >
                                                            <div className="flex justify-between items-start mb-1">
                                                                <p className="font-bold text-gray-900 uppercase text-sm group-hover:text-indigo-700">{item.nama_produk}</p>
                                                                <span className="text-[10px] font-black bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded uppercase tracking-wider">
                                                                    Rak {item.rak}
                                                                </span>
                                                            </div>
                                                            <div className="text-xs text-gray-500">
                                                                Tersedia: <span className="font-bold text-indigo-600">{item.tersedia} {item.satuan}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {showPullQuantityModal && pullItem && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-3 sm:p-4 animate-in fade-in overflow-y-auto">
                    <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh] overflow-hidden my-auto border border-gray-100">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 p-4 sm:p-5 flex justify-between items-center text-white shrink-0 shadow-md">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20 shrink-0">
                                    <SearchCode className="w-5 h-5 text-white" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-base sm:text-lg font-black uppercase tracking-tight truncate">
                                        Tarik Qty
                                    </h3>
                                    <p className="text-[11px] text-indigo-100 font-medium truncate">
                                        Pilih jumlah barang yang ditarik ke rak tujuan
                                    </p>
                                </div>
                            </div>
                            <button 
                                onClick={() => {
                                    setShowPullQuantityModal(false);
                                    setPullItem(null);
                                    setPullQuantity('');
                                    setPullBoxCount('');
                                }}
                                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors shrink-0 ml-2 cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar text-left">
                            {/* Product Info Card */}
                            <div className="bg-gradient-to-br from-indigo-50/80 via-purple-50/40 to-slate-50 border border-indigo-100/80 rounded-2xl p-3.5 shadow-sm">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-100/70 px-2 py-0.5 rounded-full">
                                        Barang Terpilih
                                    </span>
                                    <span className="text-[11px] font-bold text-gray-500">
                                        Asal: <span className="font-black text-indigo-700">Rak {pullItem.rak}</span>
                                    </span>
                                </div>
                                <p className="font-black text-gray-900 leading-snug uppercase text-sm sm:text-base mb-2">
                                    {pullItem.nama_produk}
                                </p>
                                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-indigo-100/60 text-xs">
                                    <div>
                                        <p className="text-[10px] text-gray-500 font-semibold uppercase">Tujuan Tarik</p>
                                        <p className="font-black text-slate-800 flex items-center gap-1 mt-0.5">
                                            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
                                            Rak {lastScanned || '-'}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] text-gray-500 font-semibold uppercase">Stok Asal</p>
                                        <p className="font-black text-indigo-700 text-sm mt-0.5">
                                            {pullItem.tersedia} <span className="text-xs font-semibold text-gray-600">{pullItem.satuan || 'PCS'}</span>
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* 1. Jumlah Tarik */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-black text-gray-700 uppercase tracking-wider">
                                        1. Jumlah Tarik <span className="text-red-500">*</span>
                                    </label>
                                    <span className="text-[11px] font-bold text-indigo-600">
                                        Maks: {pullItem.tersedia} {pullItem.satuan || 'PCS'}
                                    </span>
                                </div>
                                <div className="relative">
                                    <input
                                        type="number"
                                        min="1"
                                        max={pullItem.tersedia}
                                        value={pullQuantity}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (val === '') {
                                                setPullQuantity('');
                                                return;
                                            }
                                            const num = parseInt(val, 10);
                                            if (isNaN(num)) {
                                                setPullQuantity('');
                                                return;
                                            }
                                            if (num > pullItem.tersedia) {
                                                setToast({ isOpen: true, message: `⚠️ Jumlah tarik melebihi stok maksimal (${pullItem.tersedia})`, type: 'error' });
                                                setPullQuantity(pullItem.tersedia);
                                            } else {
                                                setPullQuantity(num);
                                            }
                                        }}
                                        className="w-full px-4 h-12 rounded-xl border-2 border-indigo-100 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100 transition-all font-black text-gray-900 text-lg bg-white"
                                        placeholder={`Ketik jumlah tarik (Maks: ${pullItem.tersedia})`}
                                    />
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-gray-400 uppercase pointer-events-none">
                                        {pullItem.satuan || 'PCS'}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setPullQuantity(pullItem.tersedia)}
                                    className="w-full py-2.5 rounded-xl border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-700 text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                                >
                                    Isi Otomatis Maksimal ({pullItem.tersedia} {pullItem.satuan || 'PCS'})
                                </button>
                            </div>

                            {/* 2. Jumlah Barcode */}
                            <div className="space-y-2 pt-1 border-t border-slate-100">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-black text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                                        <Printer className="w-3.5 h-3.5 text-indigo-600" />
                                        <span>2. Jumlah Barcode</span>
                                    </label>
                                    <span className="text-[11px] font-bold text-slate-500">
                                        {typeof pullBoxCount === 'number' && pullBoxCount > 0 ? (
                                            <span className="text-indigo-600 font-black">
                                                {pullBoxCount} Barcode Label
                                            </span>
                                        ) : (
                                            <span className="text-slate-400">Default 1 Barcode</span>
                                        )}
                                    </span>
                                </div>
                                <input
                                    type="number"
                                    min="1"
                                    max="50"
                                    value={pullBoxCount}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === '') {
                                            setPullBoxCount('');
                                            return;
                                        }
                                        const num = parseInt(val, 10);
                                        setPullBoxCount(isNaN(num) || num <= 0 ? '' : num);
                                    }}
                                    className="w-full px-4 h-11 rounded-xl border-2 border-slate-200 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100 font-black text-gray-900 text-base bg-white"
                                    placeholder="Default: 1 Barcode (Ketik jumlah jika ingin lebih)..."
                                />
                                {/* Quick Presets for Barcode Count */}
                                <div className="flex items-center gap-1.5">
                                    {[1, 2, 3, 4, 5, 6].map(cnt => (
                                        <button
                                            key={cnt}
                                            type="button"
                                            onClick={() => setPullBoxCount(cnt)}
                                            className={cn(
                                                "flex-1 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer",
                                                pullBoxCount === cnt 
                                                    ? "bg-indigo-600 text-white shadow-sm" 
                                                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                            )}
                                        >
                                            {cnt}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-100 flex gap-3 shrink-0">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowPullQuantityModal(false);
                                    setPullItem(null);
                                    setPullQuantity('');
                                    setPullBoxCount('');
                                }}
                                className="px-4 py-3 rounded-xl border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 font-bold text-sm transition-colors cursor-pointer"
                            >
                                Batal
                            </button>
                            <Button
                                onClick={handleConfirmPull}
                                disabled={isPulling || !pullQuantity || pullQuantity <= 0}
                                className="flex-1 h-12 rounded-xl font-black text-sm sm:text-base bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg shadow-indigo-200 flex items-center justify-center transition-all cursor-pointer disabled:opacity-50"
                            >
                                {isPulling ? (
                                    <>
                                        <Loader className="animate-spin w-5 h-5 mr-2" />
                                        Menarik...
                                    </>
                                ) : (
                                    <>
                                        <ArrowDownToLine className="w-5 h-5 mr-2 shrink-0" />
                                        <span>TARIK BARANG</span>
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
            {showMoveModal && selectedMoveItem && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col">
                        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 flex justify-between items-center rounded-t-3xl">
                            <h3 className="text-xl font-black text-white uppercase tracking-tight flex items-center">
                                <ArrowRightLeft className="w-5 h-5 mr-2" />
                                Pindah Rak
                            </h3>
                            <button 
                                onClick={() => setShowMoveModal(false)}
                                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-6">
                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                                <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-1">Barang Terpilih</p>
                                <p className="font-black text-gray-900 leading-tight mb-2 uppercase">{selectedMoveItem.nama_produk}</p>
                                <div className="flex justify-between items-end">
                                    <div>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase">Stok Tersedia</p>
                                        <p className="font-bold text-blue-600">{selectedMoveItem.tersedia} {selectedMoveItem.satuan}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase">Rak Saat Ini</p>
                                        <p className="font-bold text-gray-700 uppercase">{selectedMoveItem.rak}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-black text-gray-700 uppercase tracking-widest mb-2">Rak Tujuan</label>
                                    <div className="relative">
                                        <CustomDropdown
                                            value={moveData.rak_tujuan}
                                            onChange={(e) => setMoveData({ ...moveData, rak_tujuan: e.target.value.toUpperCase() })}
                                            options={rackOptions.filter(r => r !== selectedMoveItem.rak)}
                                            placeholder="Ketik atau pilih rak..."
                                            className="w-full px-4 h-12 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all font-bold text-gray-900 uppercase bg-white shadow-none"
                                            showClearButton={true}
                                            forceUppercase={true}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between mb-2">
                                        <label className="block text-xs font-black text-gray-700 uppercase tracking-widest">Jumlah Pindah</label>
                                        <span className="text-[10px] font-bold text-blue-600 uppercase">Maks: {selectedMoveItem.tersedia}</span>
                                    </div>
                                    <input
                                        type="number"
                                        min="1"
                                        max={selectedMoveItem.tersedia}
                                        value={moveData.jumlah_pindah === '' ? '' : moveData.jumlah_pindah}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (val === '') {
                                                setMoveData({ ...moveData, jumlah_pindah: '' });
                                                return;
                                            }
                                            const num = parseInt(val);
                                            if (num > selectedMoveItem.tersedia) {
                                                showToast(`Maksimal pindah hanya ${selectedMoveItem.tersedia} ${selectedMoveItem.satuan}`, 'error');
                                                setMoveData({ ...moveData, jumlah_pindah: selectedMoveItem.tersedia });
                                            } else {
                                                setMoveData({ ...moveData, jumlah_pindah: num });
                                            }
                                        }}
                                        placeholder={`Maksimal ${selectedMoveItem.tersedia}`}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all font-bold text-gray-900"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="p-4 bg-gray-50 flex gap-3 rounded-b-3xl">
                            <Button 
                                onClick={() => setShowMoveModal(false)}
                                variant="secondary"
                                className="flex-1 py-3 h-auto rounded-xl font-bold uppercase tracking-wider text-xs"
                                disabled={isMoving}
                            >
                                Batal
                            </Button>
                            <Button 
                                onClick={handleMoveSubmit}
                                className="flex-1 py-3 h-auto rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-wider text-xs shadow-md"
                                disabled={isMoving || !moveData.rak_tujuan || moveData.jumlah_pindah === '' || moveData.jumlah_pindah <= 0}
                            >
                                {isMoving ? (
                                    <>
                                        <Loader className="w-4 h-4 mr-2 animate-spin" /> Memproses...
                                    </>
                                ) : (
                                    'Pindah Sekarang'
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {showBulkUnverifyModal && (
                <Modal
                    isOpen={showBulkUnverifyModal}
                    onClose={() => !isBulkUnverifying && setShowBulkUnverifyModal(false)}
                    title="Batal Konfirmasi Massal (Dev Mode)"
                    size="xl"
                >
                    <div className="space-y-5 p-2">
                        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3">
                            <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
                            <div className="text-xs text-rose-900 leading-relaxed">
                                <strong className="text-sm font-bold block mb-0.5">Fitur DevMode: Batal Konfirmasi Universal</strong>
                                Pilih prefiks atau rentang rak untuk membatalkan status terkonfirmasi seluruh barang di rak-rak tersebut secara serentak di semua HP/perangkat.
                            </div>
                        </div>

                        {/* QUICK PREFIX SELECTION */}
                        <div>
                            <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-2">
                                Pilih Prefiks Rak Cepat (A, B, C...)
                            </label>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleSelectPrefixRacks('ALL')}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${bulkPrefixFilter === 'ALL'
                                        ? 'bg-rose-600 text-white border-rose-600 shadow-md'
                                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-200'
                                        }`}
                                >
                                    Semua Rak
                                </button>
                                {availablePrefixes.map(prefix => (
                                    <button
                                        key={prefix}
                                        type="button"
                                        onClick={() => handleSelectPrefixRacks(prefix)}
                                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${bulkPrefixFilter === prefix
                                            ? 'bg-rose-600 text-white border-rose-600 shadow-md'
                                            : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-200'
                                            }`}
                                    >
                                        Prefiks {prefix} ({rackOptions.filter(r => r.toUpperCase().startsWith(prefix)).length})
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* RENTANG RAK (A1 s/d A20) */}
                        <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-3">
                            <label className="block text-xs font-black text-gray-700 uppercase tracking-wider">
                                Pilih Berdasarkan Rentang (Dari Rak - Sampai Rak)
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                <div>
                                    <span className="text-[10px] font-bold text-gray-500 block mb-1">Dari Rak</span>
                                    <CustomDropdown
                                        value={bulkStartRack}
                                        onChange={(e) => setBulkStartRack(e.target.value)}
                                        options={bulkFilteredRacks}
                                        placeholder="Rak awal (misal A1)..."
                                        className="bg-white"
                                        showClearButton={true}
                                        forceUppercase={true}
                                    />
                                </div>
                                <div>
                                    <span className="text-[10px] font-bold text-gray-500 block mb-1">Sampai Rak</span>
                                    <CustomDropdown
                                        value={bulkEndRack}
                                        onChange={(e) => setBulkEndRack(e.target.value)}
                                        options={bulkFilteredRacks}
                                        placeholder="Rak akhir (misal A50)..."
                                        className="bg-white"
                                        showClearButton={true}
                                        forceUppercase={true}
                                    />
                                </div>
                                <div className="flex items-end">
                                    <Button
                                        type="button"
                                        onClick={handleSelectRangeRacks}
                                        className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider"
                                    >
                                        + Pilih Rentang Ini
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* SEARCH & CHECKBOX LIST */}
                        <div className="space-y-3">
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                                <div className="relative flex-1 w-full">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input
                                        type="text"
                                        value={bulkRackSearch}
                                        onChange={(e) => setBulkRackSearch(e.target.value)}
                                        placeholder="Cari nama rak..."
                                        className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold uppercase"
                                    />
                                </div>
                                <div className="flex gap-2 w-full sm:w-auto">
                                    <button
                                        type="button"
                                        onClick={handleSelectAllFilteredRacks}
                                        className="flex-1 sm:flex-none px-3 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-bold border border-blue-200"
                                    >
                                        Centang Semua ({bulkFilteredRacks.length})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleClearRackSelection}
                                        className="flex-1 sm:flex-none px-3 py-2 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-xl text-xs font-bold border border-gray-200"
                                    >
                                        Kosongkan Pilihan
                                    </button>
                                </div>
                            </div>

                            {/* SELECTED BADGE */}
                            <div className="flex items-center justify-between bg-rose-50 px-4 py-2.5 rounded-xl border border-rose-200">
                                <span className="text-xs font-bold text-rose-800">
                                    {selectedRacksToUnverify.size} Rak Terpilih
                                </span>
                                {selectedRacksToUnverify.size > 0 && (
                                    <button
                                        type="button"
                                        onClick={handleClearRackSelection}
                                        className="text-[11px] font-bold text-rose-600 hover:underline"
                                    >
                                        Batal Pilih Semua
                                    </button>
                                )}
                            </div>

                            {/* CHECKBOX GRID */}
                            <div className="max-h-60 overflow-y-auto p-3 bg-gray-50 rounded-2xl border border-gray-200 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                                {bulkFilteredRacks.map(rack => {
                                    const isChecked = selectedRacksToUnverify.has(rack);
                                    return (
                                        <label
                                            key={rack}
                                            className={`flex items-center gap-2 p-2 rounded-xl text-xs font-bold cursor-pointer transition-all border ${isChecked
                                                ? 'bg-rose-100 border-rose-300 text-rose-900 shadow-sm'
                                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'
                                                }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={() => handleToggleRackSelection(rack)}
                                                className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                                            />
                                            <span className="truncate">Rak {rack}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        {/* ACTION BUTTONS */}
                        <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setShowBulkUnverifyModal(false)}
                                disabled={isBulkUnverifying}
                                className="h-11 px-5 rounded-xl font-bold"
                            >
                                Batal
                            </Button>
                            <Button
                                type="button"
                                onClick={handleExecuteBulkUnverify}
                                disabled={isBulkUnverifying || selectedRacksToUnverify.size === 0}
                                className="h-11 px-6 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl shadow-lg flex items-center gap-2 disabled:opacity-50"
                            >
                                {isBulkUnverifying ? (
                                    <>
                                        <Loader className="animate-spin w-4 h-4" />
                                        <span>Memproses ({selectedRacksToUnverify.size} Rak)...</span>
                                    </>
                                ) : (
                                    <>
                                        <XCircle className="w-4 h-4" />
                                        <span>Batalkan Konfirmasi ({selectedRacksToUnverify.size} Rak)</span>
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}

            {showPinModal && (
                <Modal
                    isOpen={showPinModal}
                    onClose={() => {
                        setShowPinModal(false);
                        setPendingConfirmAction(null);
                        setPinInput('');
                    }}
                    title={pendingConfirmAction?.type === 'unverify' ? "Verifikasi PIN Batal Konfirmasi" : "Verifikasi PIN Konfirmasi"}
                    size="sm"
                >
                    <form onSubmit={handleVerifyPinSubmit} className="space-y-5 p-2">
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                            <Lock className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                            <div className="text-xs text-amber-900 leading-relaxed">
                                <strong className="text-sm font-bold block mb-0.5">
                                    {pendingConfirmAction?.type === 'unverify' ? "Keamanan Batal Konfirmasi Stok" : "Keamanan Konfirmasi Stok"}
                                </strong>
                                {pendingConfirmAction?.type === 'unverify'
                                    ? "Masukkan PIN 1234 untuk membatalkan status terkonfirmasi barang di rak ini agar tidak terjadi kesalahan klik."
                                    : "Masukkan PIN 1234 untuk mengonfirmasi status barang di rak ini agar tidak terjadi kesalahan klik."
                                }
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-black text-gray-700 uppercase tracking-widest mb-2 text-center">
                                {pendingConfirmAction?.type === 'unverify' ? "PIN Batal Konfirmasi (1234)" : "PIN Konfirmasi (1234)"}
                            </label>
                            <input
                                type="password"
                                maxLength={4}
                                value={pinInput}
                                onChange={(e) => setPinInput(e.target.value)}
                                autoFocus
                                placeholder="****"
                                className="w-full h-14 text-center tracking-[0.5em] text-2xl font-black rounded-2xl border-2 border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all bg-gray-50/50"
                            />
                        </div>

                        <div className="flex gap-3 pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    setShowPinModal(false);
                                    setPendingConfirmAction(null);
                                    setPinInput('');
                                }}
                                className="flex-1 h-12 rounded-xl font-bold"
                            >
                                Batal
                            </Button>
                            <Button
                                type="submit"
                                disabled={pinInput.length < 4}
                                className="flex-1 h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-wider shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                <CheckCircle className="w-4 h-4" />
                                <span>Verifikasi</span>
                            </Button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* MODAL TELUSURI DATA OUT TERAKHIR (FISIK ADA TAPI DATA 0 - OPSI 2) */}
            {showOutTraceModal && (
                <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[115] flex items-center justify-center p-3 sm:p-5 animate-in fade-in">
                    <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh] overflow-hidden border border-amber-200">
                        {/* Modal Header */}
                        <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 p-5 text-white flex justify-between items-center shadow-md">
                            <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center backdrop-blur-sm border border-white/20">
                                    <Search className="w-6 h-6 text-amber-100" />
                                </div>
                                <div>
                                    <h3 className="text-lg sm:text-xl font-black uppercase tracking-tight">
                                        Telusuri Riwayat OUT
                                    </h3>
                                    <p className="text-xs text-amber-100/90 font-medium">
                                        Fisik ada di sub-rak <strong>{lastScanned}</strong> tapi data 0 (Opsi 2: Tarik sesuai OUT)
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    setShowOutTraceModal(false);
                                    setSelectedOutLog(null);
                                }}
                                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Search & Inputs */}
                        <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1">
                                        SKU / Nama Barang
                                    </label>
                                    <div className="relative flex items-center">
                                        <input
                                            type="text"
                                            value={outTraceSku}
                                            onChange={(e) => setOutTraceSku(e.target.value)}
                                            placeholder="Ketik SKU untuk dicari..."
                                            className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none uppercase"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => fetchOutLogsForSku(outTraceSku)}
                                            className="ml-2 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black uppercase tracking-wider shrink-0 cursor-pointer shadow-sm"
                                        >
                                            Cari OUT
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1">
                                        Jumlah Fisik Ditemukan (pcs) <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={outTracePhysicalQty}
                                        onChange={(e) => setOutTracePhysicalQty(e.target.value === '' ? '' : Math.max(1, Number(e.target.value)))}
                                        placeholder="Misal: 52"
                                        className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none text-slate-900"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Logs List Area */}
                        <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-slate-100/60 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                                    Pilih Transaksi OUT yang Batal Keluar:
                                </span>
                                <span className="text-xs font-bold text-slate-400">
                                    {outTraceLogs.length} Transaksi Ditemukan
                                </span>
                            </div>

                            {isLoadingOutLogs ? (
                                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                                    <RefreshCw className="w-7 h-7 animate-spin text-amber-500 mb-2" />
                                    <p className="text-xs font-bold">Mencari riwayat transaksi OUT di database log...</p>
                                </div>
                            ) : outTraceLogs.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-10 text-center bg-white rounded-2xl border border-dashed border-slate-300 p-6">
                                    <AlertTriangle className="w-8 h-8 text-amber-500 mb-2" />
                                    <p className="font-black text-sm text-slate-800 uppercase">
                                        Tidak Ditemukan Riwayat OUT
                                    </p>
                                    <p className="text-xs text-slate-500 mt-1 max-w-xs">
                                        Pastikan SKU yang diketik sudah benar. Tidak ada catatan transaksi keluar untuk SKU ini.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {outTraceLogs.map((log) => {
                                        const isSelected = selectedOutLog?.id === log.id;
                                        return (
                                            <div
                                                key={log.id}
                                                onClick={() => setSelectedOutLog(log)}
                                                className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                                                    isSelected
                                                        ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-300 shadow-sm'
                                                        : 'bg-white border-slate-200 hover:border-amber-300 hover:bg-slate-50/80 shadow-xs'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                                                        isSelected ? 'border-amber-600 bg-amber-600 text-white' : 'border-slate-300 bg-white'
                                                    }`}>
                                                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-black text-xs text-slate-900 uppercase">
                                                                {log.sku}
                                                            </span>
                                                            <span className="text-[10px] font-bold text-slate-400">
                                                                ID #{log.id}
                                                            </span>
                                                        </div>
                                                        <p className="text-[11px] text-slate-500 mt-0.5">
                                                            Tgl: <strong>{log.tgl_scan || log.tgl || '-'}</strong> • User: <strong>{log.user_name || '-'}</strong> • Rak: {log.rak || '-'}
                                                        </p>
                                                        {log.keterangan && (
                                                            <p className="text-[10px] text-slate-400 italic truncate max-w-sm mt-0.5">
                                                                Ket: {log.keterangan}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="text-right shrink-0">
                                                    <span className="text-base font-black text-rose-600 block">
                                                        -{Number(log.jumlah).toLocaleString()} <span className="text-[10px] uppercase text-slate-400">pcs</span>
                                                    </span>
                                                    <span className="text-[10px] font-black uppercase text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                                                        Pilih Data Ini
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Calculation Summary Box (Opsi 2) */}
                            {selectedOutLog && outTracePhysicalQty !== '' && Number(outTracePhysicalQty) > 0 && (
                                <div className="bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-amber-500/10 border-2 border-amber-300 rounded-2xl p-4 animate-in fade-in space-y-2.5">
                                    <div className="flex items-center justify-between border-b border-amber-200 pb-2">
                                        <span className="text-xs font-black uppercase text-amber-900">
                                            Ringkasan Pemulihan Karantina:
                                        </span>
                                        <span className="text-[10px] font-black text-amber-800 bg-amber-200 px-2 py-0.5 rounded uppercase">
                                            Wadah Transit: {getTempRackForPrefix(lastScanned) || 'TEMP-A'}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                        <div className="bg-white/80 p-2 rounded-xl">
                                            <span className="text-[10px] font-bold text-slate-500 uppercase block">Fisik di {lastScanned}</span>
                                            <strong className="text-sm font-black text-slate-800">{Number(outTracePhysicalQty)} pcs</strong>
                                        </div>
                                        <div className="bg-emerald-50 p-2 rounded-xl border border-emerald-200">
                                            <span className="text-[10px] font-bold text-emerald-700 uppercase block">Pulihkan ke {getTempRackForPrefix(lastScanned) || 'TEMP-A'}</span>
                                            <strong className="text-sm font-black text-emerald-700">{Number(selectedOutLog.jumlah)} pcs</strong>
                                        </div>
                                        <div className="bg-rose-50 p-2 rounded-xl border border-rose-200">
                                            <span className="text-[10px] font-bold text-rose-700 uppercase block">Sisa Belum Ada Data</span>
                                            <strong className="text-sm font-black text-rose-700">
                                                {Math.max(0, Number(outTracePhysicalQty) - Number(selectedOutLog.jumlah))} pcs
                                            </strong>
                                        </div>
                                    </div>
                                    <p className="text-[11px] text-amber-900 leading-relaxed font-medium">
                                        💡 Sebanyak <strong>{Number(selectedOutLog.jumlah)} pcs</strong> akan dipulihkan ke wadah karantina/rak transit <strong>{getTempRackForPrefix(lastScanned) || 'TEMP-A'}</strong> (akumulasi sub-total jika SKU sama). Setelah itu, Anda dapat menarik stok ini ke sub-rak <strong>{lastScanned}</strong> melalui tombol <strong>&quot;TARIK BARANG&quot;</strong>.
                                        {Number(outTracePhysicalQty) > Number(selectedOutLog.jumlah) && (
                                            <span> Sisa <strong>{Number(outTracePhysicalQty) - Number(selectedOutLog.jumlah)} pcs</strong> akan dicatat dan dibuatkan format pesan laporan WhatsApp untuk tim crosscheck/Accurate.</span>
                                        )}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowOutTraceModal(false);
                                    setSelectedOutLog(null);
                                }}
                                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-200 font-bold text-xs uppercase cursor-pointer"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmOutTrace}
                                disabled={isExecutingOutTrace || !selectedOutLog || outTracePhysicalQty === '' || Number(outTracePhysicalQty) <= 0}
                                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs uppercase tracking-wider shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95"
                            >
                                {isExecutingOutTrace ? (
                                    <>
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                        <span>Memproses Pemulihan...</span>
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 className="w-4 h-4" />
                                        <span>Konfirmasi Pulihkan ke {getTempRackForPrefix(lastScanned) || 'TEMP-A'}</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL SUKSES & SALIN FORMAT WHATSAPP */}
            {showWaSuccessModal && waReportData && (
                <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-[130] flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl p-6 border border-slate-200 animate-in zoom-in-95 flex flex-col">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 shadow-sm">
                                <CheckCircle2 className="w-7 h-7" />
                            </div>
                            <div>
                                <h4 className="text-lg font-black uppercase text-slate-900 tracking-tight">
                                    Penarikan Berhasil &amp; Masuk Karantina!
                                </h4>
                                <p className="text-xs text-slate-500 font-medium">
                                    Stok berhasil ditarik ke <strong>{waReportData.sub_rak_tujuan}</strong> dan langsung terkonfirmasi.
                                </p>
                            </div>
                        </div>

                        {/* WhatsApp Message Preview Card */}
                        <div className="bg-slate-900 text-slate-100 rounded-2xl p-4 font-mono text-xs leading-relaxed max-h-60 overflow-y-auto shadow-inner border border-slate-800 mb-4 whitespace-pre-wrap select-all">
                            {generateWaTextFromPayload(waReportData)}
                        </div>

                        <div className="space-y-2">
                            <button
                                type="button"
                                onClick={() => {
                                    const text = generateWaTextFromPayload(waReportData);
                                    navigator.clipboard.writeText(text).then(() => {
                                        setIsWaCopied(true);
                                        setToast({
                                            isOpen: true,
                                            message: '📋 Format WhatsApp berhasil disalin!',
                                            type: 'success'
                                        });
                                        setTimeout(() => setIsWaCopied(false), 2500);
                                    });
                                }}
                                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs uppercase tracking-wider shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                            >
                                {isWaCopied ? (
                                    <>
                                        <Check className="w-4 h-4" />
                                        <span>Tersalin ke Clipboard!</span>
                                    </>
                                ) : (
                                    <>
                                        <Copy className="w-4 h-4" />
                                        <span>Salin Laporan WhatsApp</span>
                                    </>
                                )}
                            </button>

                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowWaSuccessModal(false);
                                        setShowKarantinaModal(true);
                                    }}
                                    className="flex-1 py-2.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-black text-xs uppercase tracking-wider transition-colors cursor-pointer"
                                >
                                    Lihat Wadah Karantina
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowWaSuccessModal(false);
                                        setWaReportData(null);
                                    }}
                                    className="flex-1 py-2.5 px-3 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-black text-xs uppercase tracking-wider transition-colors cursor-pointer"
                                >
                                    Selesai / Tutup
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* WADAH KARANTINA REVISI OUT MODAL */}
            {showKarantinaModal && (
                <KarantinaRevisiOutModal
                    isOpen={showKarantinaModal}
                    onClose={() => setShowKarantinaModal(false)}
                    onDataChanged={() => {
                        fetchPendingKarantinaCount();
                        if (lastScanned) fetchItems(lastScanned, true);
                    }}
                />
            )}

            {/* Batch Migration Progress Modal */}
            {showBatchProgressModal && (
                <div className="fixed inset-0 z-[700] flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-gray-900/70 backdrop-blur-sm" />
                    <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md mx-auto overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-6 space-y-5">
                            {/* Header */}
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    "w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-black shrink-0 shadow-md",
                                    isBatchMigrating
                                        ? "bg-gradient-to-br from-amber-500 to-orange-600 text-white animate-pulse"
                                        : batchProgress && batchProgress.errors.length === 0
                                            ? "bg-gradient-to-br from-emerald-500 to-green-600 text-white"
                                            : "bg-gradient-to-br from-amber-500 to-yellow-600 text-white"
                                )}>
                                    {isBatchMigrating ? '⚡' : batchMigrationDone ? '✅' : '📦'}
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-gray-900 tracking-tight">
                                        {isBatchMigrating ? 'Memindahkan Data...' : 'Migrasi Selesai'}
                                    </h3>
                                    <p className="text-xs text-gray-500 font-medium">
                                        Batch Stock Opname
                                    </p>
                                </div>
                            </div>

                            {/* Progress Bar */}
                            {batchProgress && (
                                <div className="space-y-3">
                                    <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden border border-gray-200">
                                        <div
                                            className={cn(
                                                "h-full rounded-full transition-all duration-500 ease-out",
                                                isBatchMigrating
                                                    ? "bg-gradient-to-r from-amber-500 to-orange-500"
                                                    : batchProgress.errors.length === 0
                                                        ? "bg-gradient-to-r from-emerald-500 to-green-500"
                                                        : "bg-gradient-to-r from-amber-500 to-yellow-500"
                                            )}
                                            style={{
                                                width: `${batchProgress.total > 0 ? Math.round((batchProgress.moved / batchProgress.total) * 100) : 0}%`
                                            }}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="font-black text-gray-800">
                                            {batchProgress.moved}/{batchProgress.total} item
                                        </span>
                                        <span className="font-bold text-gray-500">
                                            {batchProgress.total > 0 ? Math.round((batchProgress.moved / batchProgress.total) * 100) : 0}%
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Affected Racks */}
                            {batchProgress && batchProgress.originRacks.length > 0 && (
                                <div className="bg-blue-50 rounded-2xl p-3 border border-blue-200">
                                    <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1.5">Rak Terpengaruh</p>
                                    <div className="flex flex-wrap gap-1">
                                        {batchProgress.originRacks.slice(0, 20).map(rak => (
                                            <span key={rak} className="px-2 py-0.5 bg-white rounded-lg text-[10px] font-bold text-blue-800 border border-blue-200">
                                                {rak}
                                            </span>
                                        ))}
                                        {batchProgress.originRacks.length > 20 && (
                                            <span className="px-2 py-0.5 bg-blue-100 rounded-lg text-[10px] font-bold text-blue-600">
                                                +{batchProgress.originRacks.length - 20} lainnya
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Errors */}
                            {batchProgress && batchProgress.errors.length > 0 && (
                                <div className="bg-red-50 rounded-2xl p-3 border border-red-200 max-h-32 overflow-y-auto">
                                    <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider mb-1.5">
                                        ⚠️ {batchProgress.errors.length} Error
                                    </p>
                                    {batchProgress.errors.slice(0, 5).map((err, idx) => (
                                        <p key={idx} className="text-[11px] text-red-700 font-medium truncate">{err}</p>
                                    ))}
                                </div>
                            )}

                            {/* Close button (only when done) */}
                            {batchMigrationDone && (
                                <button
                                    onClick={() => {
                                        setShowBatchProgressModal(false);
                                        setBatchProgress(null);
                                        setBatchMigrationDone(false);
                                    }}
                                    className="w-full h-12 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold rounded-2xl shadow-lg shadow-blue-200 active:scale-[0.97] transition-all"
                                >
                                    Tutup
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {toast.isOpen && (
                <Toast isOpen={toast.isOpen} message={toast.message} type={toast.type} onClose={() => setToast(prev => ({ ...prev, isOpen: false }))} />
            )}

            {showScanner && (
                <BarcodeScanner onScan={handleScanResult} onClose={() => setShowScanner(false)} />
            )}
        </div>
    );
}
