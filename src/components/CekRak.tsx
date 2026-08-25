import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Search, Package, CheckCircle, CheckCircle2, CheckCheck, XCircle, SearchCode, ArrowDownToLine, Archive, AlertTriangle, RefreshCw, QrCode, Camera, Menu, X, ChevronRight, ArrowRightLeft, Loader, MoveRight, Lock, MapPin } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Toast } from './ui/Toast';
import { Modal } from './ui/Modal';
import { CustomDropdown } from './ui/CustomDropdown';
import { BarcodeScanner } from './ui/BarcodeScanner';
import { cn } from '../lib/utils';
import { DatabaseService } from '../lib/DatabaseService';
import { useDatabaseConfig } from '../lib/DatabaseContext';
import { useAuth } from '../lib/AuthContext';

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

export function CekRak() {
    const { userRole, user } = useAuth();
    const isDeveloper = userRole === 'developer' || user?.email === 'devmode' || localStorage.getItem('devmode') === 'true';

    const [rackId, setRackId] = useState('');
    const [items, setItems] = useState<StockItem[]>([]);
    const [verifiedIds, setVerifiedIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const [itemSearchTerm, setItemSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'terkonfirmasi' | 'belum_terkonfirmasi'>('all');

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

    // Audit / Susun Ulang State (New Flow)
    const [isAuditMode, setIsAuditMode] = useState(false);

    // Global Product Search across all racks
    const [globalSearchTerm, setGlobalSearchTerm] = useState('');
    const [globalSearchResults, setGlobalSearchResults] = useState<StockItem[]>([]);
    const [isGlobalSearching, setIsGlobalSearching] = useState(false);
    const [showGlobalResults, setShowGlobalResults] = useState(false);

    const handleGlobalSearch = async (term: string) => {
        setGlobalSearchTerm(term);
        if (!term.trim() || term.trim().length < 2) {
            setGlobalSearchResults([]);
            setShowGlobalResults(false);
            return;
        }

        setIsGlobalSearching(true);
        setShowGlobalResults(true);
        try {
            const cleanTerm = term.trim();
            const { data, error } = await supabase
                .from('stock_items')
                .select('*')
                .ilike('nama_produk', `%${cleanTerm}%`)
                .eq('status', 'Aktif')
                .gt('tersedia', 0)
                .order('nama_produk', { ascending: true })
                .limit(40);

            if (!error && data) {
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

    const handleSelectRackFromSearch = (targetRak: string) => {
        if (!targetRak) return;
        const cleanRak = targetRak.trim().toUpperCase();
        setRackId(cleanRak);
        fetchItems(cleanRak);
        setShowGlobalResults(false);
        setGlobalSearchTerm('');
    };
    const [showPullModal, setShowPullModal] = useState(false);

    const [allPullableItems, setAllPullableItems] = useState<any[]>([]);
    const [pullDropdownOptions, setPullDropdownOptions] = useState<string[]>([]);
    const [isFetchingPullData, setIsFetchingPullData] = useState(false);

    const [pullSearchTerm, setPullSearchTerm] = useState('');
    const [pullSearchResults, setPullSearchResults] = useState<any[]>([]);
    const [isSearchingPull, setIsSearchingPull] = useState(false);
    const [isCompletingAudit, setIsCompletingAudit] = useState(false);

    // Pull Quantity Modal State
    const [showPullQuantityModal, setShowPullQuantityModal] = useState(false);
    const [pullItem, setPullItem] = useState<any>(null);
    const [pullQuantity, setPullQuantity] = useState<number | ''>('');
    const [isPulling, setIsPulling] = useState(false);

    const [rackOptions, setRackOptions] = useState<string[]>([]);
    const [lastScanned, setLastScanned] = useState<string | null>(null);
    const [showScanner, setShowScanner] = useState(false);
    const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
    const [toast, setToast] = useState<{ isOpen: boolean; message: string; type: 'success' | 'info' | 'error' | 'warning' }>({
        isOpen: false,
        message: '',
        type: 'info'
    });

    // Modal Pindah Data State
    const { writeMode, dbMode } = useDatabaseConfig();
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
    const [pendingConfirmAction, setPendingConfirmAction] = useState<{ type: 'single' | 'all' | 'unverify'; item?: any } | null>(null);

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

    // Racks filtered by prefix & search
    const bulkFilteredRacks = useMemo(() => {
        return rackOptions.filter(r => {
            const upper = r.trim().toUpperCase();
            const matchesSearch = !bulkRackSearch || upper.includes(bulkRackSearch.trim().toUpperCase());
            const matchesPrefix = bulkPrefixFilter === 'ALL' || upper.startsWith(bulkPrefixFilter);
            return matchesSearch && matchesPrefix;
        });
    }, [rackOptions, bulkPrefixFilter, bulkRackSearch]);

    // Fetch rack options on mount
    useEffect(() => {
        fetchRackOptions();
    }, []);

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
                .limit(100);

            if (error) throw error;

            // Filter out items already confirmed in the current rack OR confirmed in their source rack
            const filteredData = data?.filter((item: any) => {
                const prodName = item.nama_produk?.trim().toLowerCase();
                const itemRak = item.rak?.trim().toLowerCase();
                if (confirmedProductNames.has(prodName)) return false;
                if (confirmedPairs.has(`${prodName}|||${itemRak}`)) return false;
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

            // Filter out items already confirmed in the current rack OR confirmed in their source rack
            const filteredData = data?.filter((item: any) => {
                const prodName = item.nama_produk?.trim().toLowerCase();
                const itemRak = item.rak?.trim().toLowerCase();
                if (confirmedProductNames.has(prodName)) return false;
                if (confirmedPairs.has(`${prodName}|||${itemRak}`)) return false;
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
                .select('tersedia, keluar')
                .eq('nama_produk', item.nama_produk)
                .eq('rak', item.rak)
                .eq('status', 'Aktif');

            const freshTersedia = data?.reduce((sum, r) => sum + (r.tersedia || 0), 0) ?? item.tersedia;
            const freshKeluar = data?.reduce((sum, r) => sum + (r.keluar || 0), 0) ?? item.keluar;

            const updatedItem = {
                ...item,
                tersedia: freshTersedia,
                keluar: freshKeluar
            };

            // Update allPullableItems & search results in state real-time
            setAllPullableItems(prev => prev.map(x => {
                if (x.nama_produk === item.nama_produk && x.rak === item.rak) {
                    return { ...x, tersedia: freshTersedia };
                }
                return x;
            }));

            setPullItem(updatedItem);
            setPullQuantity(''); // Default kosong agar pengguna bisa input manual
            setShowPullQuantityModal(true);
            setPullSearchTerm('');
        } catch (error) {
            console.error('Error fetching fresh pull item:', error);
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

            // Fetch original IN log for this item to inherit its tgl, tgl_scan and waktu (prioritizing matching rack and newest active IN log)
            const { data: logData, error: originalLogError } = await supabase
                .from('database_log')
                .select('tgl, tgl_scan, created_at, waktu, rak')
                .ilike('sku', `%${pullItem.nama_produk.trim()}%`)
                .or('type.ilike.%IN%,type.ilike.%MOVE%,type.ilike.%TRANSFER%');
            
            let originalLog = null;
            if (logData && logData.length > 0) {
                // Prioritize matching rack, then sort descending by created_at (newest active batch first)
                const rackMatched = logData.filter(l => l.rak && l.rak.trim().toLowerCase() === pullItem.rak.trim().toLowerCase());
                const targetList = rackMatched.length > 0 ? rackMatched : logData;
                originalLog = targetList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
            }

            if (originalLogError) {
                console.error('Error fetching original log:', originalLogError);
                setToast({ isOpen: true, message: `Gagal mengambil data tgl masuk asli: ${originalLogError.message || 'unknown error'}`, type: 'error' });
            }

            const now = new Date();
            const tglHariIni = now.toISOString().split('T')[0];
            const waktuSekarang = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
            
            const tglAsli = originalLog?.tgl || tglHariIni;
            const tglScanAsli = originalLog?.tgl_scan || originalLog?.tgl || tglHariIni;
            const waktuAsli = originalLog?.waktu || waktuSekarang;

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
                    sku: pullItem.nama_produk,
                    jumlah: pullQuantity,
                    type: 'OUT',
                    gudang: 'TRANSFER',
                    rak: pullItem.rak,
                    tgl_scan: tglScanAsli,
                    user_name: 'System (Tarik Fisik)',
                    sub_rak: pullItem.sub_rak || pullItem.rak,
                    created_at: createdAtOut
                },
                {
                    tgl: tglAsli,
                    waktu: waktuIn,
                    sku: pullItem.nama_produk,
                    jumlah: pullQuantity,
                    type: 'IN',
                    gudang: 'TRANSFER',
                    rak: lastScanned,
                    tgl_scan: tglScanAsli,
                    user_name: 'System (Tarik Fisik)',
                    sub_rak: lastScanned,
                    created_at: createdAtIn
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
            const { data: insertedData, error: logError } = await DatabaseService.insertLogs(logEntries, writeMode);
            if (insertedData) {
                const inLog = insertedData.find((l: any) => l.type === 'IN');
                if (inLog && inLog.id) {
                    await DatabaseService.updateLog(inLog.id, { tgl_scan: tglScanAsli, tgl: tglAsli }, writeMode);
                }
            }
            if (logError) throw logError;

            setToast({ isOpen: true, message: `Berhasil menarik ${pullQuantity} ${pullItem.satuan} ${pullItem.nama_produk} dari Rak ${pullItem.rak}`, type: 'success' });
            
            setShowPullQuantityModal(false);
            setPullItem(null);
            setPullQuantity('');
            
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
                
                // Insert VERIFY log inheriting original tgl & tgl_scan
                const vNow = new Date();
                await DatabaseService.insertLogs([{
                    tgl: tglAsli,
                    waktu: vNow.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    sku: pullItem.nama_produk,
                    jumlah: pullQty,
                    type: 'MOVE',
                    gudang: 'VERIFY',
                    rak: cleanRak,
                    tgl_scan: tglScanAsli,
                    user_name: user?.email || 'System (Tarik Fisik)',
                    sub_rak: cleanRak
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

            // Refresh data rak ini
            fetchItems(lastScanned, false);
            
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

    // Direct confirmation trigger (opens PIN 1234 Modal with PIN prefilled)
    const handleMarkAsVerified = (item: any) => {
        setPendingConfirmAction({ type: 'single', item });
        setPinInput('1234');
        setShowPinModal(true);
    };

    const executeMarkAsVerified = async (item: any) => {
        try {
            setVerifiedIds(prev => new Set(prev).add(item.id));
            const cleanRak = (lastScanned || item.rak || '').trim();

            if (cleanRak) {
                const storageKey = `verified_rak_${cleanRak.toUpperCase()}`;
                const unverifiedKey = `unverified_rak_${cleanRak.toUpperCase()}`;
                const prodName = item.nama_produk?.trim().toLowerCase();
                if (prodName) {
                    const existing: string[] = JSON.parse(localStorage.getItem(storageKey) || '[]');
                    if (!existing.includes(prodName)) {
                        existing.push(prodName);
                        localStorage.setItem(storageKey, JSON.stringify(existing));
                    }
                    const existingUnverified: string[] = JSON.parse(localStorage.getItem(unverifiedKey) || '[]');
                    const filteredUnverified = existingUnverified.filter(name => name.trim().toLowerCase() !== prodName);
                    localStorage.setItem(unverifiedKey, JSON.stringify(filteredUnverified));
                }

                // Insert Universal VERIFY log into Supabase database_log
                const now = new Date();
                const tglHariIni = now.toISOString().split('T')[0];
                const waktuSekarang = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                await DatabaseService.insertLogs([{
                    tgl: tglHariIni,
                    waktu: waktuSekarang,
                    sku: item.nama_produk,
                    jumlah: item.tersedia || 0,
                    type: 'MOVE',
                    gudang: 'VERIFY',
                    rak: cleanRak,
                    tgl_scan: item.tgl_scan || tglHariIni,
                    user_name: user?.email || 'User',
                    sub_rak: item.sub_rak || cleanRak
                }], writeMode);
            }
            setToast({ isOpen: true, message: 'Barang ditandai AKURAT (Terkonfirmasi Universal)!', type: 'success' });
        } catch (error: any) {
            console.error('Error marking as verified:', error);
            setToast({ isOpen: true, message: 'Gagal menandai barang', type: 'error' });
        }
    };

    const handleMarkAsUnverified = (item: any) => {
        setPendingConfirmAction({ type: 'unverify', item });
        setPinInput('1234');
        setShowPinModal(true);
    };

    const executeUnverifyItem = async (item: any) => {
        const cleanRak = (lastScanned || item.rak || '').trim();

        try {
            setVerifiedIds(prev => {
                const next = new Set(prev);
                next.delete(item.id);
                return next;
            });

            if (cleanRak) {
                const storageKey = `verified_rak_${cleanRak.toUpperCase()}`;
                const unverifiedKey = `unverified_rak_${cleanRak.toUpperCase()}`;
                const prodName = item.nama_produk?.trim().toLowerCase();
                if (prodName) {
                    const existingVerified: string[] = JSON.parse(localStorage.getItem(storageKey) || '[]');
                    const filtered = existingVerified.filter(name => name.trim().toLowerCase() !== prodName);
                    localStorage.setItem(storageKey, JSON.stringify(filtered));

                    const existingUnverified: string[] = JSON.parse(localStorage.getItem(unverifiedKey) || '[]');
                    if (!existingUnverified.includes(prodName)) {
                        existingUnverified.push(prodName);
                        localStorage.setItem(unverifiedKey, JSON.stringify(existingUnverified));
                    }
                }

                // Insert Universal UNVERIFY log into Supabase database_log
                const now = new Date();
                const tglHariIni = now.toISOString().split('T')[0];
                const waktuSekarang = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                await DatabaseService.insertLogs([{
                    tgl: tglHariIni,
                    waktu: waktuSekarang,
                    sku: item.nama_produk,
                    jumlah: item.tersedia || 0,
                    type: 'MOVE',
                    gudang: 'UNVERIFY',
                    rak: cleanRak,
                    tgl_scan: item.tgl_scan || tglHariIni,
                    user_name: user?.email || 'User (Batal Konfirmasi)',
                    sub_rak: item.sub_rak || cleanRak
                }], writeMode);
            }

            setToast({ isOpen: true, message: `Status terkonfirmasi "${item.nama_produk}" berhasil dibatalkan secara Universal!`, type: 'info' });
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

                const logsToInsert = items.map(i => ({
                    tgl: tglHariIni,
                    waktu: waktuSekarang,
                    sku: i.nama_produk,
                    jumlah: i.tersedia || 0,
                    type: 'MOVE',
                    gudang: 'VERIFY',
                    rak: cleanRak,
                    tgl_scan: i.tgl_scan || tglHariIni,
                    user_name: user?.email || 'User',
                    sub_rak: i.sub_rak || cleanRak
                }));

                await DatabaseService.insertLogs(logsToInsert, writeMode);
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
        }
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
                user_name: user?.email || 'Dev (Batal Konfirmasi Massal)',
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

            // Fetch original IN log for this item to inherit its tgl, tgl_scan & waktu (prioritizing matching rack and newest active IN log)
            const { data: logData, error: originalLogError } = await supabase
                .from('database_log')
                .select('tgl, tgl_scan, created_at, waktu, rak')
                .ilike('sku', `%${selectedMoveItem.nama_produk.trim()}%`)
                .or('type.ilike.%IN%,type.ilike.%MOVE%,type.ilike.%TRANSFER%');
            
            let originalLog = null;
            if (logData && logData.length > 0) {
                const rackMatched = logData.filter(l => l.rak && l.rak.trim().toLowerCase() === selectedMoveItem.rak.trim().toLowerCase());
                const targetList = rackMatched.length > 0 ? rackMatched : logData;
                originalLog = targetList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
            }

            if (originalLogError) {
                console.error('Error fetching original log:', originalLogError);
                showToast(`Gagal mengambil data tgl masuk asli: ${originalLogError.message || 'unknown error'}`, 'error');
            }

            const tglAsli = originalLog?.tgl || tglHariIni;
            const tglScanAsli = originalLog?.tgl_scan || originalLog?.tgl || tglHariIni;
            const waktuAsli = originalLog?.waktu || waktu;
            
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

            // Use current timestamp for created_at so transaction logs sort properly to the top of active transactions
            const createdAtOut = new Date(now.getTime() + 1000).toISOString();
            const createdAtIn = new Date(now.getTime() + 2000).toISOString();
            const waktuOut = addOneMinuteToWaktu(waktuAsli);
            const waktuIn = addOneMinuteToWaktu(waktuAsli);

            // Memecah riwayat secara halus dengan memundurkan tanggal log ke tglAsli
            // sehingga riwayat barang tidak terlihat baru masuk hari ini.
            const logEntries = [
                {
                    tgl: tglAsli,
                    waktu: waktuOut,
                    sku: selectedMoveItem.nama_produk,
                    jumlah: moveData.jumlah_pindah,
                    type: 'OUT',
                    gudang: 'TRANSFER',
                    rak: selectedMoveItem.rak,
                    tgl_scan: tglScanAsli,
                    user_name: 'System (Cek Rak)',
                    sub_rak: selectedMoveItem.sub_rak || selectedMoveItem.rak,
                    created_at: createdAtOut
                },
                {
                    tgl: tglAsli,
                    waktu: waktuIn,
                    sku: selectedMoveItem.nama_produk,
                    jumlah: moveData.jumlah_pindah,
                    type: 'IN',
                    gudang: 'TRANSFER',
                    rak: rakTujuanUpper,
                    tgl_scan: tglScanAsli,
                    user_name: 'System (Cek Rak)',
                    sub_rak: rakTujuanUpper,
                    created_at: createdAtIn
                }
            ];

            const { data: insertedData, error: logError } = await DatabaseService.insertLogs(logEntries, writeMode);
            if (insertedData) {
                const inLog = insertedData.find((l: any) => l.type === 'IN');
                if (inLog && inLog.id) {
                    await DatabaseService.updateLog(inLog.id, { tgl_scan: tglScanAsli, tgl: tglAsli }, writeMode);
                }
            }
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
        fetchItems(rackId);
    };

    const handleScanResult = (decodedText: string) => {
        setRackId(decodedText);
        setShowScanner(false);
        fetchItems(decodedText);
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

    return (
        <div className="flex flex-col min-h-screen relative overflow-hidden bg-gray-50/30">
            {/* MAIN CONTENT AREA */}
            <main className="flex-1 flex flex-col relative min-w-0 w-full">
                {/* PREMIUM IMMERSIVE HEADER */}
                <div className="flex flex-col mb-8 lg:mb-12">
                    <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 pt-[80px] lg:pt-0 lg:h-[310px] pb-[40px] lg:pb-0 px-6 lg:px-12 rounded-b-[40px] lg:rounded-b-[55px] shadow-2xl shadow-blue-900/20 relative overflow-hidden transition-all duration-500 flex flex-col justify-center">
                        <div className="absolute -top-6 -right-6 text-white opacity-5">
                            <Search className="w-64 h-64 lg:w-96 lg:h-96" />
                        </div>
                        {/* Decorative Floating Shapes */}
                        <div className="absolute top-10 right-10 w-32 h-32 bg-white/10 rounded-full blur-3xl animate-pulse"></div>
                        <div className="absolute top-24 left-1/4 w-16 h-16 bg-white/5 border border-white/10 rounded-2xl rotate-[35deg] backdrop-blur-sm hidden lg:block"></div>
                        <div className="absolute bottom-10 right-1/3 w-12 h-12 bg-white/10 rounded-full border border-white/20 hidden lg:block"></div>
                        <div className="absolute top-1/2 right-20 w-16 h-16 bg-blue-400/20 rounded-3xl -rotate-12 blur-xl hidden lg:block"></div>

                        {/* Text Content */}
                        <div className="relative z-10 w-full flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 lg:gap-6 uppercase text-left">
                            <div className="max-w-2xl">
                                <div className="flex items-center gap-2 mb-2 lg:mb-3 opacity-90">
                                    <div className="w-8 h-[2px] bg-white rounded-full"></div>
                                    <span className="text-[10px] lg:text-[12px] font-black tracking-[0.3em] text-white">Inventory Tool</span>
                                </div>
                                <h1 className="text-[34px] lg:text-[54px] font-black text-white tracking-tight leading-[1.1] mb-2 uppercase">
                                    Cek <span className="text-blue-200">Rak</span>
                                </h1>
                                <div className="text-blue-100/90 font-medium text-[14px] lg:text-[18px] leading-relaxed max-w-[90%] normal-case flex items-center gap-3">
                                    <div className="px-3 py-1 bg-white/10 rounded-full backdrop-blur-sm border border-white/10 flex items-center gap-2">
                                        <span className="relative flex h-2.5 w-2.5">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                                        </span>
                                        <span className="text-[11px] font-bold tracking-widest uppercase text-white">{items.length} Item</span>
                                    </div>
                                    <span className="text-[13px] lg:text-[16px] text-white">Cek isi rak secara real-time</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-4 lg:p-8 space-y-6 w-full max-w-7xl mx-auto -mt-[30px] lg:-mt-[50px] relative z-20">

                    {/* Header Controls: Lokasi Rak & Global Product Search */}
                    <div className="max-w-3xl mx-auto w-full space-y-4">
                        {/* Lokasi Rak Selector Card */}
                        <Card className="rounded-3xl shadow-xl shadow-blue-500/5 border-2 border-blue-100/80 bg-white overflow-hidden">
                            <CardContent className="p-5 md:p-6">
                                <div className="flex flex-col gap-4">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-black text-blue-900 uppercase tracking-[0.25em] flex items-center gap-2">
                                            <MapPin className="w-4 h-4 text-blue-600" />
                                            <span>Filter Lokasi Rak</span>
                                        </label>
                                        <span className="text-[10px] font-extrabold text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                                            {rackOptions.length} Rak Terdaftar
                                        </span>
                                    </div>
                                    
                                    <form onSubmit={handleSearch} className="flex gap-2.5 items-center">
                                        <div className="relative flex-1">
                                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none z-10">
                                                <Search className="h-5 w-5 text-blue-600" />
                                            </div>
                                            <CustomDropdown
                                                value={rackId}
                                                onChange={(e) => setRackId(e.target.value)}
                                                options={rackOptions}
                                                placeholder="PILIH ATAU KETIK LOKASI RAK..."
                                                className="pl-11 h-13 text-base md:text-lg font-black shadow-none w-full border-2 border-blue-100 bg-blue-50/30 focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-100 rounded-2xl transition-all"
                                                showClearButton={true}
                                                forceUppercase={true}
                                                onOptionSelect={() => {
                                                    setTimeout(() => {
                                                        submitButtonRef.current?.click();
                                                    }, 100);
                                                }}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setShowScanner(true)}
                                            className="px-4 py-2 text-blue-600 bg-blue-50 border-2 border-blue-200 rounded-2xl hover:bg-blue-100 active:scale-95 transition-all h-13 flex items-center justify-center shadow-sm shrink-0"
                                            title="Scan QR / Barcode Kamera"
                                        >
                                            <Camera className="h-5 w-5" />
                                        </button>
                                        <button
                                            ref={submitButtonRef}
                                            type="submit"
                                            className="px-7 py-2 text-sm font-black text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-2xl shadow-lg shadow-blue-500/25 active:scale-95 transition-all h-13 uppercase tracking-widest shrink-0 flex items-center gap-2"
                                        >
                                            <span>CARI</span>
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </form>

                                    {isDeveloper && (
                                        <div className="w-full pt-3 border-t border-gray-100 flex justify-center">
                                            <button
                                                type="button"
                                                onClick={() => setShowBulkUnverifyModal(true)}
                                                className="w-full sm:w-auto px-5 py-2.5 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 font-black rounded-xl text-xs uppercase tracking-wider transition-all border border-rose-200 shadow-sm flex items-center justify-center gap-2"
                                                title="DevMode: Batalkan konfirmasi secara serentak untuk banyak rak terpilih"
                                            >
                                                <XCircle className="w-4 h-4 text-rose-600" />
                                                <span>Batal Konfirmasi Massal (DevMode)</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Global Product Search Card (Cari Barang / SKU di Seluruh Rak) */}
                        <Card className="rounded-3xl shadow-xl shadow-emerald-500/5 border-2 border-emerald-200/80 bg-white overflow-hidden relative">
                            <CardContent className="p-5 md:p-6">
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-black text-emerald-900 uppercase tracking-[0.25em] flex items-center gap-2">
                                            <SearchCode className="w-4 h-4 text-emerald-600" />
                                            <span>Cari Barang / SKU (Seluruh Rak)</span>
                                        </label>
                                        <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                                            Cek Lokasi Rak Produk
                                        </span>
                                    </div>

                                    <div className="relative w-full">
                                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none z-10">
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
                                            onFocus={() => { if (globalSearchResults.length > 0) setShowGlobalResults(true); }}
                                            placeholder="Ketik SKU / Nama Barang di sini untuk cek posisi raknya..."
                                            className="w-full pl-11 pr-10 h-13 text-sm md:text-base font-extrabold text-gray-900 placeholder:text-gray-400 border-2 border-emerald-200 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100 rounded-2xl bg-emerald-50/20 transition-all shadow-sm"
                                        />
                                        {globalSearchTerm && (
                                            <button
                                                type="button"
                                                onClick={() => handleGlobalSearch('')}
                                                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600"
                                            >
                                                <X className="h-5 w-5" />
                                            </button>
                                        )}
                                    </div>

                                    {/* Global Search Results List */}
                                    {showGlobalResults && globalSearchTerm.trim().length >= 2 && (
                                        <div className="mt-3 bg-white rounded-2xl border-2 border-emerald-200 shadow-2xl overflow-hidden max-h-96 overflow-y-auto divide-y divide-gray-100 animate-in fade-in zoom-in-95 duration-200">
                                            <div className="p-3 bg-emerald-50/80 border-b border-emerald-100 flex justify-between items-center">
                                                <span className="text-xs font-black text-emerald-900 uppercase tracking-wider">
                                                    Ditemukan {globalSearchResults.length} Lokasi Produk
                                                </span>
                                                <button
                                                    onClick={() => setShowGlobalResults(false)}
                                                    className="text-xs font-bold text-emerald-700 hover:text-emerald-900"
                                                >
                                                    Tutup ✕
                                                </button>
                                            </div>

                                            {globalSearchResults.length === 0 ? (
                                                <div className="p-6 text-center text-sm font-bold text-gray-500">
                                                    {isGlobalSearching ? 'Mencari di seluruh rak...' : `Tidak ditemukan produk "${globalSearchTerm}" di rak manapun.`}
                                                </div>
                                            ) : (
                                                globalSearchResults.map((gItem) => (
                                                    <div
                                                        key={`${gItem.id}-${gItem.rak}`}
                                                        className="p-4 hover:bg-emerald-50/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                                                    >
                                                        <div className="space-y-1">
                                                            <h4 className="font-black text-sm text-gray-900 uppercase tracking-tight group-hover:text-emerald-700 transition-colors">
                                                                {gItem.nama_produk}
                                                            </h4>
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-blue-600 text-white shadow-sm uppercase tracking-wider flex items-center gap-1">
                                                                    <Package className="w-3.5 h-3.5" />
                                                                    Rak: {gItem.rak}
                                                                </span>
                                                                {gItem.sub_rak && gItem.sub_rak !== gItem.rak && (
                                                                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 uppercase">
                                                                        Sub: {gItem.sub_rak}
                                                                    </span>
                                                                )}
                                                                <span className="text-xs font-bold text-gray-500">
                                                                    Stok: <strong className="text-emerald-600 font-black">{gItem.tersedia.toLocaleString()}</strong> {gItem.satuan}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <button
                                                            onClick={() => handleSelectRackFromSearch(gItem.rak)}
                                                            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                                                        >
                                                            <span>Buka Rak {gItem.rak}</span>
                                                            <ChevronRight className="w-4 h-4" />
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

                    {/* Content Display */}
                    {lastScanned && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-100">
                                        <Package className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black text-gray-900 tracking-tight leading-none mb-1 uppercase">Rak {lastScanned}</h2>
                                        <div className="flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{items.length} Item terdaftar</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-wrap sm:flex-nowrap gap-3 w-full sm:w-auto mt-2 sm:mt-0">
                                    {isAuditMode ? (
                                        <>
                                            <Button
                                                onClick={openPullModal}
                                                className="w-full sm:w-auto h-12 px-4 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg flex items-center justify-center animate-in fade-in zoom-in"
                                            >
                                                <SearchCode size={18} className="mr-2" />
                                                <span>Tarik Barang Fisik</span>
                                            </Button>
                                            <Button
                                                onClick={handleClearRack}
                                                disabled={isCompletingAudit}
                                                className="w-full sm:w-auto h-12 px-4 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg flex items-center justify-center animate-in fade-in zoom-in"
                                            >
                                                {isCompletingAudit ? <Loader className="animate-spin h-5 w-5" /> : <Archive size={18} className="mr-2" />}
                                                <span className="ml-2">Bersihkan Rak</span>
                                            </Button>
                                            <Button
                                                variant="outline"
                                                onClick={() => setIsAuditMode(false)}
                                                className="w-full sm:w-auto h-12 px-4 rounded-xl font-bold border-red-200 text-red-600 hover:bg-red-50 flex items-center justify-center whitespace-nowrap animate-in fade-in zoom-in"
                                            >
                                                <CheckCircle size={18} className="mr-2 shrink-0" />
                                                <span>Selesai Audit</span>
                                            </Button>
                                        </>
                                    ) : (
                                        <Button
                                            variant="outline"
                                            onClick={() => setIsAuditMode(true)}
                                            className="w-full sm:w-auto h-12 px-4 rounded-xl font-bold bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 shadow-sm flex items-center justify-center"
                                        >
                                            <AlertTriangle size={18} className="mr-2" />
                                            <span>Mulai Susun / Audit</span>
                                        </Button>
                                    )}
                                    <Button
                                        onClick={handleConfirmAll}
                                        className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white h-12 px-4 rounded-xl font-bold transition-all shadow-md hover:shadow-lg active:scale-95 flex items-center justify-center order-1 sm:order-none"
                                        title="Konfirmasi seluruh barang di rak ini sekaligus (Memerlukan PIN 1234)"
                                    >
                                        <CheckCheck className="h-4 w-4 mr-2" />
                                        Konfirmasi Semua
                                    </Button>
                                    <Button
                                        onClick={() => fetchItems(lastScanned, true)}
                                        className="flex-1 sm:flex-none bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100 h-12 px-4 rounded-xl font-bold transition-all shadow-sm hover:shadow active:scale-95 flex items-center justify-center order-2 sm:order-none"
                                    >
                                        <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                                        Refresh
                                    </Button>
                                    <Button
                                        onClick={handlePrintBarcode}
                                        className="flex-1 sm:flex-none bg-blue-600 text-white hover:bg-blue-700 h-12 px-4 rounded-xl font-bold shadow-lg shadow-blue-200 transition-all hover:shadow-xl active:scale-95 flex items-center justify-center order-3 sm:order-none"
                                    >
                                        <QrCode className="h-4 w-4 mr-2" />
                                        Print QR
                                    </Button>
                                </div>
                            </div>

                            {/* ITEM FILTER / SEARCH BAR INSIDE RAK */}
                            {items.length > 0 && (
                                <div className="space-y-3.5 bg-white p-4 md:p-5 rounded-2xl border-2 border-blue-100 shadow-md">
                                    {/* SEARCH INPUT */}
                                    <div className="relative w-full">
                                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none z-10">
                                            <Search className="h-5 w-5 text-blue-600" />
                                        </div>
                                        <input
                                            type="text"
                                            value={itemSearchTerm}
                                            onChange={(e) => setItemSearchTerm(e.target.value)}
                                            placeholder={`Cari Barang / SKU di Rak ${lastScanned}... (${filteredItems.length} dari ${items.length} item)`}
                                            className="w-full pl-11 pr-11 py-3 bg-white border-2 border-gray-300 rounded-xl text-sm font-bold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/15 shadow-sm transition-all"
                                        />
                                        {itemSearchTerm && (
                                            <button
                                                type="button"
                                                onClick={() => setItemSearchTerm('')}
                                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-red-600 transition-colors"
                                            >
                                                <div className="bg-gray-100 hover:bg-red-50 p-1 rounded-full border border-gray-200">
                                                    <X className="h-4 w-4" />
                                                </div>
                                            </button>
                                        )}
                                    </div>

                                    {/* RESPONSIVE STATUS FILTER PILLS */}
                                    <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 scrollbar-none w-full border-t border-gray-100 pt-3">
                                        <button
                                            type="button"
                                            onClick={() => setStatusFilter('all')}
                                            className={cn(
                                                "shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-2 whitespace-nowrap cursor-pointer",
                                                statusFilter === 'all'
                                                    ? "bg-blue-600 text-white shadow-md shadow-blue-500/20 ring-2 ring-blue-600/30"
                                                    : "bg-gray-100 text-gray-600 hover:bg-gray-200/80 hover:text-gray-900"
                                            )}
                                        >
                                            <Package className="w-3.5 h-3.5" />
                                            <span>Semua</span>
                                            <span className={cn(
                                                "px-2 py-0.5 rounded-full text-[10px] font-black",
                                                statusFilter === 'all' ? "bg-white/20 text-white" : "bg-gray-200 text-gray-700"
                                            )}>
                                                {items.length}
                                            </span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setStatusFilter('terkonfirmasi')}
                                            className={cn(
                                                "shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-2 whitespace-nowrap cursor-pointer",
                                                statusFilter === 'terkonfirmasi'
                                                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20 ring-2 ring-emerald-600/30"
                                                    : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100"
                                            )}
                                        >
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 group-hover:text-emerald-600" />
                                            <span>Terkonfirmasi</span>
                                            <span className={cn(
                                                "px-2 py-0.5 rounded-full text-[10px] font-black",
                                                statusFilter === 'terkonfirmasi' ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-800"
                                            )}>
                                                {confirmedCount}
                                            </span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setStatusFilter('belum_terkonfirmasi')}
                                            className={cn(
                                                "shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-2 whitespace-nowrap cursor-pointer",
                                                statusFilter === 'belum_terkonfirmasi'
                                                    ? "bg-amber-500 text-white shadow-md shadow-amber-500/20 ring-2 ring-amber-500/30"
                                                    : "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-100"
                                            )}
                                        >
                                            <XCircle className="w-3.5 h-3.5 text-amber-500" />
                                            <span>Belum Terkonfirmasi</span>
                                            <span className={cn(
                                                "px-2 py-0.5 rounded-full text-[10px] font-black",
                                                statusFilter === 'belum_terkonfirmasi' ? "bg-white/20 text-white" : "bg-amber-100 text-amber-800"
                                            )}>
                                                {unconfirmedCount}
                                            </span>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {items.length === 0 ? (
                                <Card className="border-dashed border-2 border-gray-200 bg-gray-50/30 rounded-[30px]">
                                    <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                                        <div className="w-20 h-20 bg-white border border-gray-100 rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-gray-100 rotate-3">
                                            <AlertTriangle className="h-10 w-10 text-gray-300" />
                                        </div>
                                        <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Rak Kosong</h3>
                                        <p className="text-gray-500 max-w-sm mt-2 font-medium">
                                            Tidak ada barang yang terdaftar di lokasi rak <strong className="text-blue-600 tracking-widest uppercase">{lastScanned}</strong>.
                                        </p>
                                    </CardContent>
                                </Card>
                            ) : filteredItems.length === 0 ? (
                                <Card className="border-dashed border-2 border-gray-200 bg-gray-50/30 rounded-[30px]">
                                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                                        <h3 className="text-lg font-bold text-gray-700">Barang Tidak Ditemukan</h3>
                                        <p className="text-gray-500 text-xs mt-1">
                                            Tidak ada barang yang cocok {itemSearchTerm ? `dengan pencarian "${itemSearchTerm}"` : ''} 
                                            {statusFilter !== 'all' ? ` (Filter: ${statusFilter === 'terkonfirmasi' ? 'Terkonfirmasi' : 'Belum Terkonfirmasi'})` : ''} di Rak {lastScanned}.
                                        </p>
                                    </CardContent>
                                </Card>
                            ) : (
                                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 pb-20">
                                    {filteredItems.map((item) => (
                                        <Card key={item.id} className="hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-gray-100 rounded-3xl overflow-hidden group bg-white">
                                            <div className="h-1.5 bg-blue-600 w-full group-hover:h-2 transition-all" />
                                            <CardContent className="p-6">
                                                <div className="flex justify-between items-start mb-4">
                                                    <h3 className="font-black text-lg text-gray-900 line-clamp-2 leading-tight min-h-[3rem] uppercase tracking-tight">
                                                        {item.nama_produk}
                                                    </h3>
                                                </div>

                                                <div className="space-y-4">
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="bg-gray-50/50 p-3 rounded-2xl border border-gray-100">
                                                            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Packing</p>
                                                            <p className="font-bold text-gray-900 truncate">{item.packing || '-'}</p>
                                                        </div>
                                                        <div className="bg-gray-50/50 p-3 rounded-2xl border border-gray-100">
                                                            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Satuan</p>
                                                            <p className="font-bold text-gray-900 uppercase">{item.satuan}</p>
                                                        </div>
                                                    </div>

                                                    <div className="bg-blue-50/30 p-4 rounded-2xl border border-blue-50 flex items-center justify-between">
                                                        <div className="flex flex-col">
                                                            <span className="text-[9px] font-black text-blue-400 uppercase tracking-[0.2em]">Sisa Stok</span>
                                                            <div className="flex items-baseline gap-1">
                                                                <span className="text-3xl font-black text-blue-600 tracking-tighter">
                                                                    {item.tersedia.toLocaleString()}
                                                                </span>
                                                                <span className="text-[10px] font-bold text-blue-400 uppercase">{item.satuan}</span>
                                                            </div>
                                                        </div>
                                                        {verifiedIds.has(item.id) ? (
                                                            <button
                                                                onClick={() => handleMarkAsUnverified(item)}
                                                                title="Klik untuk Batal Konfirmasi (Memerlukan PIN)"
                                                                className="h-10 px-4 rounded-xl bg-emerald-100 text-emerald-700 hover:bg-red-100 hover:text-red-700 transition-all flex items-center justify-center font-bold text-xs uppercase tracking-wider group cursor-pointer border border-emerald-200 hover:border-red-200 shadow-sm"
                                                            >
                                                                <span className="group-hover:hidden flex items-center">
                                                                    <CheckCircle2 className="h-4 w-4 mr-1.5 text-emerald-600" />
                                                                    Terkonfirmasi
                                                                </span>
                                                                <span className="hidden group-hover:flex items-center text-red-600">
                                                                    <XCircle className="h-4 w-4 mr-1.5" />
                                                                    Batal Konfirmasi
                                                                </span>
                                                            </button>
                                                        ) : (
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    onClick={() => handleMarkAsVerified(item)}
                                                                    className="h-10 px-4 rounded-xl text-white bg-emerald-600 hover:bg-emerald-700 flex items-center justify-center font-bold text-xs uppercase tracking-wider shadow-md hover:shadow-lg transition-all"
                                                                    title="Konfirmasi langsung barang di rak ini (Memerlukan PIN 1234)"
                                                                >
                                                                    <CheckCircle2 className="h-4 w-4 mr-1.5" />
                                                                    Konfirmasi
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        setSelectedMoveItem(item);
                                                                        setMoveData({ rak_tujuan: '', jumlah_pindah: '' });
                                                                        setShowMoveModal(true);
                                                                    }}
                                                                    className="h-10 px-4 rounded-xl text-white bg-blue-600 hover:bg-blue-700 flex items-center justify-center font-bold text-xs uppercase tracking-wider shadow-md hover:shadow-lg transition-all"
                                                                >
                                                                    <ArrowRightLeft className="h-4 w-4 mr-1.5" />
                                                                    Pindah
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            )}
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
                                    <p className="text-xs text-gray-500 font-medium">Cari barang yang fisiknya ada di sini</p>
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
                                            <div className="flex flex-col items-center justify-center h-48 text-center bg-red-50/50 rounded-2xl border border-dashed border-red-100">
                                                <p className="text-red-500 text-sm font-bold">
                                                    Barang tidak ditemukan di rak manapun.
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="absolute top-0 left-0 right-0 z-50 bg-white border border-gray-100 rounded-xl shadow-lg max-h-64 overflow-y-auto">
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
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {showPullQuantityModal && pullItem && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col">
                        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 flex justify-between items-center rounded-t-3xl">
                            <h3 className="text-xl font-black text-white uppercase tracking-tight flex items-center">
                                <SearchCode className="w-5 h-5 mr-2" />
                                Tarik Qty
                            </h3>
                            <button 
                                onClick={() => {
                                    setShowPullQuantityModal(false);
                                    setPullItem(null);
                                    setPullQuantity('');
                                }}
                                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-6">
                            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                                <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">Barang Terpilih</p>
                                <p className="font-black text-gray-900 leading-tight mb-2 uppercase">{pullItem.nama_produk}</p>
                                <div className="flex justify-between items-end">
                                    <div>
                                        <p className="text-xs text-gray-500 font-medium">Dari Rak</p>
                                        <p className="font-bold text-indigo-700">{pullItem.rak}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-gray-500 font-medium">Stok Asal</p>
                                        <p className="font-bold text-indigo-700">{pullItem.tersedia} {pullItem.satuan}</p>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between mb-2">
                                    <label className="block text-xs font-black text-gray-700 uppercase tracking-widest">Jumlah Tarik</label>
                                    <span className="text-[10px] font-bold text-indigo-600 uppercase">Maks: {pullItem.tersedia}</span>
                                </div>
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
                                            setToast({ isOpen: true, message: `⚠️ Jumlah tarik melebihi stok maksimal! (Maksimal: ${pullItem.tersedia} ${pullItem.satuan})`, type: 'error' });
                                            setPullQuantity(pullItem.tersedia);
                                        } else {
                                            setPullQuantity(num);
                                        }
                                    }}
                                    className="w-full px-4 h-12 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all font-bold text-gray-900 text-lg"
                                    placeholder={`Ketik jumlah tarik (Maks: ${pullItem.tersedia})`}
                                />
                                <button
                                    type="button"
                                    onClick={() => setPullQuantity(pullItem.tersedia)}
                                    className="w-full mt-3 py-2.5 rounded-xl border-2 border-indigo-100 bg-indigo-50/50 hover:bg-indigo-100 text-indigo-700 text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
                                >
                                    Isi Otomatis Maksimal ({pullItem.tersedia})
                                </button>
                            </div>

                            <Button
                                onClick={handleConfirmPull}
                                disabled={isPulling || !pullQuantity || pullQuantity <= 0}
                                className="w-full h-14 rounded-xl font-bold text-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-xl shadow-indigo-200 flex items-center justify-center transition-all"
                            >
                                {isPulling ? (
                                    <>
                                        <Loader className="animate-spin w-5 h-5 mr-2" />
                                        Menarik...
                                    </>
                                ) : (
                                    <>
                                        <SearchCode className="w-5 h-5 mr-2" />
                                        KONFIRMASI TARIK
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

            {toast.isOpen && (
                <Toast isOpen={toast.isOpen} message={toast.message} type={toast.type} onClose={() => setToast(prev => ({ ...prev, isOpen: false }))} />
            )}

            {showScanner && (
                <BarcodeScanner onScan={handleScanResult} onClose={() => setShowScanner(false)} />
            )}
        </div>
    );
}
