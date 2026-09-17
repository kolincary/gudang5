import React, { useState, useMemo } from 'react';
import {
    X,
    Search,
    RefreshCw,
    CheckCircle2,
    AlertTriangle,
    Scale,
    Layers,
    ArrowRight,
    Loader2,
    CheckSquare,
    Square,
    ArrowRightLeft,
    Check
} from 'lucide-react';
import { DatabaseService } from '../lib/DatabaseService';
import { useDatabaseConfig } from '../lib/DatabaseContext';
import { useAuth } from '../lib/AuthContext';
import { getRealtimeDateTime } from '../lib/transferDateHelper';

export interface MinusLocation {
    rak: string;
    sub_rak: string;
    tersedia: number; // negative number, e.g. -96
    id?: string;
}

export interface PlusLocation {
    rak: string;
    sub_rak: string;
    tersedia: number; // positive number, e.g. 96
    id?: string;
}

export interface ReconcilePairPlan {
    sourceRak: string;
    sourceSubRak: string;
    targetRak: string;
    targetSubRak: string;
    qty: number;
}

export interface SkuReconcileItem {
    sku: string;
    packing: string;
    satuan: string;
    minusLocations: MinusLocation[];
    plusLocations: PlusLocation[];
    totalMinus: number; // absolute value, e.g. 96
    totalPlus: number;  // e.g. 96
    reconcilableQty: number; // min(totalMinus, totalPlus)
    netSurplus: number; // totalPlus - totalMinus
    pairPlans: ReconcilePairPlan[];
    batches: string[];
    status: 'READY' | 'PROCESSING' | 'DONE' | 'ERROR';
    errorMessage?: string;
}

interface AutoKlopMinusModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    stockItems: any[];
}

export const getRackBatchKey = (rakName: string): string => {
    if (!rakName) return 'LAINNYA';
    const clean = rakName.trim().toUpperCase();
    if (clean.startsWith('TEMP')) return 'TEMP';
    if (clean.startsWith('LANTAI 4') || clean.startsWith('LT4') || clean.startsWith('LANTAI4')) return 'LANTAI 4';
    if (clean.startsWith('LANTAI 2') || clean.startsWith('LT2') || clean.startsWith('LANTAI2')) return 'LANTAI 2';
    if (clean.startsWith('ECER')) return 'ECER';
    if (clean.startsWith('BLOK-I') || clean.startsWith('BLOK I')) return 'BLOK-I';
    
    // Check for single letter prefixes (e.g. A1, A2, B1, C12, D05, etc.)
    const match = clean.match(/^([A-Z])/);
    if (match) {
        return match[1]; // e.g. 'A', 'B', 'C', 'D', etc.
    }
    return 'LAINNYA';
};

export const getRackBatchLabel = (batchKey: string): string => {
    if (batchKey.length === 1 && batchKey >= 'A' && batchKey <= 'Z') {
        return `Batch Rak ${batchKey} (${batchKey}1 - ${batchKey}999)`;
    }
    if (batchKey === 'TEMP') return 'Batch Rak TEMP';
    if (batchKey === 'LANTAI 4') return 'Batch Rak Lantai 4';
    if (batchKey === 'LANTAI 2') return 'Batch Rak Lantai 2';
    if (batchKey === 'ECER') return 'Batch Rak Eceran (ECER)';
    if (batchKey === 'BLOK-I') return 'Batch Rak Blok-I';
    return `Batch Rak ${batchKey}`;
};

export const AutoKlopMinusModal: React.FC<AutoKlopMinusModalProps> = ({
    isOpen,
    onClose,
    onSuccess,
    stockItems
}) => {
    const { writeMode } = useDatabaseConfig();
    const { user, userRole } = useAuth();

    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState<'ALL' | 'NET_ZERO' | 'NET_SURPLUS'>('ALL');
    const [selectedBatch, setSelectedBatch] = useState<string>('ALL');
    const [selectedSkuSet, setSelectedSkuSet] = useState<Set<string>>(new Set());

    // Single item execution state
    const [processingSku, setProcessingSku] = useState<string | null>(null);

    // Batch execution state
    const [batchRunning, setBatchRunning] = useState(false);
    const [batchProgress, setBatchProgress] = useState<{
        total: number;
        current: number;
        currentSku: string;
        successCount: number;
        failCount: number;
    }>({
        total: 0,
        current: 0,
        currentSku: '',
        successCount: 0,
        failCount: 0
    });

    const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

    const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
        setToastMessage({ text, type });
        setTimeout(() => setToastMessage(null), 3500);
    };

    // Calculate reconcilable SKUs from stockItems
    const reconcilableItems = useMemo<SkuReconcileItem[]>(() => {
        if (!stockItems || stockItems.length === 0) return [];

        // Group by SKU
        const skuMap = new Map<string, {
            sku: string;
            packing: string;
            satuan: string;
            minusLocations: MinusLocation[];
            plusLocations: PlusLocation[];
        }>();

        stockItems.forEach(item => {
            const sku = (item.nama_produk || '').trim();
            if (!sku) return;

            if (!skuMap.has(sku)) {
                skuMap.set(sku, {
                    sku,
                    packing: item.packing || '',
                    satuan: item.satuan || 'PCS',
                    minusLocations: [],
                    plusLocations: []
                });
            }

            const record = skuMap.get(sku)!;
            const qty = Number(item.tersedia) || 0;

            if (qty < 0) {
                record.minusLocations.push({
                    rak: item.rak || '',
                    sub_rak: item.sub_rak || item.rak || '',
                    tersedia: qty,
                    id: item.id
                });
            } else if (qty > 0) {
                record.plusLocations.push({
                    rak: item.rak || '',
                    sub_rak: item.sub_rak || item.rak || '',
                    tersedia: qty,
                    id: item.id
                });
            }
        });

        const list: SkuReconcileItem[] = [];

        skuMap.forEach(record => {
            // Only consider items that have AT LEAST one minus rack AND at least one plus rack
            if (record.minusLocations.length > 0 && record.plusLocations.length > 0) {
                const totalMinus = record.minusLocations.reduce((sum, loc) => sum + Math.abs(loc.tersedia), 0);
                const totalPlus = record.plusLocations.reduce((sum, loc) => sum + loc.tersedia, 0);
                const reconcilableQty = Math.min(totalMinus, totalPlus);
                const netSurplus = totalPlus - totalMinus;

                // Build pairing plan (Greedy matching)
                const minusList = record.minusLocations.map(m => ({
                    rak: m.rak,
                    sub_rak: m.sub_rak,
                    needed: Math.abs(m.tersedia)
                }));

                const plusList = [...record.plusLocations]
                    .sort((a, b) => b.tersedia - a.tersedia)
                    .map(p => ({
                        rak: p.rak,
                        sub_rak: p.sub_rak,
                        available: p.tersedia
                    }));

                const pairPlans: ReconcilePairPlan[] = [];

                for (const m of minusList) {
                    if (m.needed <= 0) continue;

                    for (const p of plusList) {
                        if (p.available <= 0) continue;

                        const transferQty = Math.min(m.needed, p.available);
                        if (transferQty > 0) {
                            pairPlans.push({
                                sourceRak: p.rak,
                                sourceSubRak: p.sub_rak || p.rak,
                                targetRak: m.rak,
                                targetSubRak: m.sub_rak || m.rak,
                                qty: transferQty
                            });

                            m.needed -= transferQty;
                            p.available -= transferQty;
                        }

                        if (m.needed <= 0) break;
                    }
                }

                // Extract all associated batches for this SKU
                const batchSet = new Set<string>();
                record.minusLocations.forEach(m => batchSet.add(getRackBatchKey(m.rak)));
                record.plusLocations.forEach(p => batchSet.add(getRackBatchKey(p.rak)));

                list.push({
                    sku: record.sku,
                    packing: record.packing,
                    satuan: record.satuan,
                    minusLocations: record.minusLocations,
                    plusLocations: record.plusLocations,
                    totalMinus,
                    totalPlus,
                    reconcilableQty,
                    netSurplus,
                    pairPlans,
                    batches: Array.from(batchSet),
                    status: 'READY'
                });
            }
        });

        return list.sort((a, b) => b.reconcilableQty - a.reconcilableQty);
    }, [stockItems]);

    // Extract all distinct batches present in the reconcilable data
    const detectedBatches = useMemo(() => {
        const batchMap = new Map<string, { count: number; totalMinusUnits: number }>();

        reconcilableItems.forEach(item => {
            item.batches.forEach(b => {
                if (!batchMap.has(b)) {
                    batchMap.set(b, { count: 0, totalMinusUnits: 0 });
                }
                const bStat = batchMap.get(b)!;
                bStat.count += 1;
                bStat.totalMinusUnits += item.totalMinus;
            });
        });

        const list = Array.from(batchMap.entries()).map(([key, stat]) => ({
            key,
            label: getRackBatchLabel(key),
            count: stat.count,
            totalMinusUnits: stat.totalMinusUnits
        }));

        // Sort: single letters A-Z first, then others
        return list.sort((a, b) => {
            const isSingleA = a.key.length === 1 && a.key >= 'A' && a.key <= 'Z';
            const isSingleB = b.key.length === 1 && b.key >= 'A' && b.key <= 'Z';
            if (isSingleA && isSingleB) return a.key.localeCompare(b.key);
            if (isSingleA) return -1;
            if (isSingleB) return 1;
            return a.key.localeCompare(b.key);
        });
    }, [reconcilableItems]);

    // Filter items based on search, category, and selected batch
    const filteredItems = useMemo(() => {
        return reconcilableItems.filter(item => {
            const matchesSearch = item.sku.toLowerCase().includes(searchTerm.toLowerCase().trim()) ||
                item.minusLocations.some(m => m.rak.toLowerCase().includes(searchTerm.toLowerCase().trim())) ||
                item.plusLocations.some(p => p.rak.toLowerCase().includes(searchTerm.toLowerCase().trim()));

            if (!matchesSearch) return false;

            if (selectedBatch !== 'ALL' && !item.batches.includes(selectedBatch)) {
                return false;
            }

            if (filterCategory === 'NET_ZERO') return item.netSurplus === 0;
            if (filterCategory === 'NET_SURPLUS') return item.netSurplus > 0;
            return true;
        });
    }, [reconcilableItems, searchTerm, filterCategory, selectedBatch]);

    // Aggregate statistics
    const stats = useMemo(() => {
        const totalSkus = reconcilableItems.length;
        const totalUnitsKlop = reconcilableItems.reduce((sum, item) => sum + item.reconcilableQty, 0);
        const totalMinusRacks = reconcilableItems.reduce((sum, item) => sum + item.minusLocations.length, 0);
        const netZeroSkus = reconcilableItems.filter(i => i.netSurplus === 0).length;

        return {
            totalSkus,
            totalUnitsKlop,
            totalMinusRacks,
            netZeroSkus
        };
    }, [reconcilableItems]);

    // Select all toggle for current filtered view
    const isAllSelected = filteredItems.length > 0 && filteredItems.every(i => selectedSkuSet.has(i.sku));

    const toggleSelectAll = () => {
        if (isAllSelected) {
            setSelectedSkuSet(prev => {
                const next = new Set(prev);
                filteredItems.forEach(i => next.delete(i.sku));
                return next;
            });
        } else {
            setSelectedSkuSet(prev => {
                const next = new Set(prev);
                filteredItems.forEach(i => next.add(i.sku));
                return next;
            });
        }
    };

    const toggleSelectSku = (sku: string) => {
        const newSet = new Set(selectedSkuSet);
        if (newSet.has(sku)) {
            newSet.delete(sku);
        } else {
            newSet.add(sku);
        }
        setSelectedSkuSet(newSet);
    };

    // Helper: Execute reconciliation for one SKU
    const executeReconcileForSku = async (item: SkuReconcileItem): Promise<boolean> => {
        if (!item.pairPlans || item.pairPlans.length === 0) return false;

        const now = new Date();
        const { todayTgl, nowWaktu } = getRealtimeDateTime(now);

        const userName = user?.user_metadata?.full_name || user?.email || userRole || 'Auto-Klop Admin';
        let baseTime = now.getTime();

        const logEntries: any[] = [];

        for (const plan of item.pairPlans) {
            // OUT log from donor rack
            baseTime += 300;
            logEntries.push({
                tgl: todayTgl,
                waktu: nowWaktu,
                sku: item.sku,
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

            // IN log to minus rack
            baseTime += 300;
            logEntries.push({
                tgl: todayTgl,
                waktu: nowWaktu,
                sku: item.sku,
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
            console.error(`Error reconciling SKU ${item.sku}:`, logError);
            return false;
        }

        if (insertedData && insertedData.length > 0) {
            for (const l of insertedData) {
                if (l.id && (l.tgl_scan !== todayTgl || l.tgl !== todayTgl)) {
                    await DatabaseService.updateLog(l.id, { tgl_scan: todayTgl, tgl: todayTgl }, writeMode);
                }
            }
        }

        return true;
    };

    // Execute single SKU
    const handleReconcileSingle = async (item: SkuReconcileItem) => {
        if (processingSku || batchRunning) return;

        setProcessingSku(item.sku);
        try {
            const success = await executeReconcileForSku(item);
            if (success) {
                showToast(`Berhasil meng-klop ${item.reconcilableQty} ${item.satuan} untuk SKU: ${item.sku}`, 'success');
                // Remove from selected set
                setSelectedSkuSet(prev => {
                    const next = new Set(prev);
                    next.delete(item.sku);
                    return next;
                });
                onSuccess();
            } else {
                showToast(`Gagal meng-klop SKU: ${item.sku}`, 'error');
            }
        } catch (err: any) {
            console.error('Reconcile single error:', err);
            showToast(`Terjadi kesalahan: ${err.message || 'Error'}`, 'error');
        } finally {
            setProcessingSku(null);
        }
    };

    // Execute batch (selected items)
    const handleReconcileBatch = async () => {
        const targetSkus = reconcilableItems.filter(i => selectedSkuSet.has(i.sku));
        if (targetSkus.length === 0) {
            showToast('Silakan pilih setidaknya satu SKU untuk di-klop', 'warning');
            return;
        }

        const batchDesc = selectedBatch === 'ALL' ? 'Semua Batch' : getRackBatchLabel(selectedBatch);
        if (!confirm(`Apakah Anda yakin ingin mengeksekusi Auto-Klop untuk ${targetSkus.length} SKU terpilih (${batchDesc})?\n\nSistem akan membuat log transfer penyeimbang untuk menetralkan rak-rak minus secara otomatis.`)) {
            return;
        }

        setBatchRunning(true);
        setBatchProgress({
            total: targetSkus.length,
            current: 0,
            currentSku: '',
            successCount: 0,
            failCount: 0
        });

        let success = 0;
        let fail = 0;

        for (let idx = 0; idx < targetSkus.length; idx++) {
            const item = targetSkus[idx];
            setBatchProgress(prev => ({
                ...prev,
                current: idx + 1,
                currentSku: item.sku
            }));

            try {
                const res = await executeReconcileForSku(item);
                if (res) {
                    success++;
                } else {
                    fail++;
                }
            } catch (err) {
                console.error(`Batch error on ${item.sku}:`, err);
                fail++;
            }

            setBatchProgress(prev => ({
                ...prev,
                successCount: success,
                failCount: fail
            }));

            // Small delay to prevent network throttling
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        setBatchRunning(false);
        showToast(`Selesai! Berhasil meng-klop ${success} SKU (${fail} gagal). Data gudang telah diperbarui.`, 'success');
        setSelectedSkuSet(new Set());
        onSuccess();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fade-in overflow-y-auto">
            {/* Modal Container */}
            <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden transform transition-all animate-scale-up">

                {/* Header */}
                <div className="px-6 py-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white flex items-center justify-between relative overflow-hidden flex-shrink-0">
                    <div className="absolute top-0 right-0 -mt-8 -mr-8 w-40 h-40 bg-blue-500/20 rounded-full blur-3xl pointer-events-none"></div>
                    <div className="flex items-center gap-3 relative z-10">
                        <div className="p-2.5 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10 shadow-inner text-amber-400">
                            <Scale className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="font-extrabold text-lg tracking-tight text-white">
                                    Rekonsiliasi &amp; Auto-Klop Rak Minus
                                </h3>
                                <span className="bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full">
                                    Dev &amp; Admin
                                </span>
                            </div>
                            <p className="text-xs text-slate-300 mt-0.5">
                                Menyeimbangkan stok rak minus dengan rak donor pada SKU yang sama per batch rak (Self-Balancing Transfer)
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        disabled={batchRunning}
                        className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors disabled:opacity-50 cursor-pointer"
                        title="Tutup Modal"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Toast Message */}
                {toastMessage && (
                    <div className={`mx-6 mt-4 p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2 animate-fade-in border shadow-sm ${
                        toastMessage.type === 'success'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : toastMessage.type === 'error'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                    }`}>
                        {toastMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
                        {toastMessage.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />}
                        {toastMessage.type === 'info' && <ArrowRightLeft className="w-4 h-4 text-blue-600 flex-shrink-0" />}
                        <span>{toastMessage.text}</span>
                    </div>
                )}

                {/* Top Stat Cards */}
                <div className="px-6 pt-5 pb-3 grid grid-cols-2 md:grid-cols-4 gap-3.5 flex-shrink-0">
                    <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 flex items-center gap-3">
                        <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                            <Layers className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">SKU Terdeteksi</p>
                            <p className="text-lg font-black text-slate-800">{stats.totalSkus.toLocaleString()}</p>
                        </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 flex items-center gap-3">
                        <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl">
                            <AlertTriangle className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Rak Minus</p>
                            <p className="text-lg font-black text-rose-600">{stats.totalMinusRacks.toLocaleString()}</p>
                        </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 flex items-center gap-3">
                        <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                            <ArrowRightLeft className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Unit Di-Klop</p>
                            <p className="text-lg font-black text-emerald-700">{stats.totalUnitsKlop.toLocaleString()} <span className="text-xs font-normal text-slate-500">PCS</span></p>
                        </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 flex items-center gap-3">
                        <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
                            <CheckCircle2 className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Net 0 (Habis Bersih)</p>
                            <p className="text-lg font-black text-amber-700">{stats.netZeroSkus.toLocaleString()} <span className="text-xs font-normal text-slate-500">SKU</span></p>
                        </div>
                    </div>
                </div>

                {/* Batch Rak Selector Bar (Per Batch Rak & Sub Rak A1-A999, B1-B999, dll) */}
                <div className="px-6 py-2 bg-indigo-50/50 border-y border-indigo-100/80 flex items-center gap-2 overflow-x-auto no-scrollbar flex-shrink-0">
                    <span className="text-[11px] font-black text-indigo-900 uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-indigo-600" />
                        Pilih Batch Rak:
                    </span>
                    <button
                        type="button"
                        onClick={() => setSelectedBatch('ALL')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                            selectedBatch === 'ALL'
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : 'bg-white hover:bg-indigo-100/70 text-slate-700 border border-indigo-200/60'
                        }`}
                    >
                        Semua Batch ({reconcilableItems.length} SKU)
                    </button>
                    {detectedBatches.map(b => (
                        <button
                            key={b.key}
                            type="button"
                            onClick={() => setSelectedBatch(b.key)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                                selectedBatch === b.key
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'bg-white hover:bg-indigo-100/70 text-slate-700 border border-indigo-200/60'
                            }`}
                        >
                            <span>{b.label}</span>
                            <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-extrabold ${
                                selectedBatch === b.key ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-800'
                            }`}>
                                {b.count} SKU
                            </span>
                        </button>
                    ))}
                </div>

                {/* Filter and Controls Bar */}
                <div className="px-6 py-3 border-b border-slate-100 flex flex-col md:flex-row items-center justify-between gap-3 flex-shrink-0 bg-slate-50/50">
                    <div className="flex items-center gap-2 w-full md:w-auto flex-1">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Cari SKU atau nama rak (misal A2, B21)..."
                                className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        {/* Category filter pills */}
                        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-[11px] font-bold">
                            <button
                                onClick={() => setFilterCategory('ALL')}
                                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${filterCategory === 'ALL' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
                            >
                                Semua ({filteredItems.length})
                            </button>
                            <button
                                onClick={() => setFilterCategory('NET_ZERO')}
                                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${filterCategory === 'NET_ZERO' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
                            >
                                Net 0 ({filteredItems.filter(i => i.netSurplus === 0).length})
                            </button>
                            <button
                                onClick={() => setFilterCategory('NET_SURPLUS')}
                                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${filterCategory === 'NET_SURPLUS' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
                            >
                                Sisa Fisik ({filteredItems.filter(i => i.netSurplus > 0).length})
                            </button>
                        </div>
                    </div>

                    {/* Batch Actions */}
                    <div className="flex items-center gap-2 w-full md:w-auto justify-end flex-wrap">
                        <button
                            onClick={toggleSelectAll}
                            disabled={filteredItems.length === 0 || batchRunning}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                        >
                            {isAllSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-slate-400" />}
                            <span>{isAllSelected ? 'Batal Pilih' : 'Pilih Semua'} ({filteredItems.length})</span>
                        </button>

                        <button
                            onClick={handleReconcileBatch}
                            disabled={selectedSkuSet.size === 0 || batchRunning}
                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black shadow-md transition-all cursor-pointer ${
                                selectedSkuSet.size > 0 && !batchRunning
                                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white hover:shadow-lg active:scale-95'
                                    : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                            }`}
                        >
                            {batchRunning ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Memproses ({batchProgress.current}/{batchProgress.total})...</span>
                                </>
                            ) : (
                                <>
                                    <Check className="w-4 h-4" />
                                    <span>
                                        Eksekusi Klop {selectedBatch !== 'ALL' ? `Batch ${selectedBatch}` : 'Terpilih'} ({selectedSkuSet.size} SKU)
                                    </span>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Batch Progress Bar Overlay (when running) */}
                {batchRunning && (
                    <div className="px-6 py-3 bg-indigo-50/90 border-b border-indigo-100 flex flex-col gap-1.5 animate-fade-in flex-shrink-0">
                        <div className="flex items-center justify-between text-xs font-bold text-indigo-900">
                            <span className="flex items-center gap-2">
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                                Sedang mengeksekusi rekonsiliasi: <code className="bg-white px-2 py-0.5 rounded border border-indigo-200 text-indigo-700">{batchProgress.currentSku}</code>
                            </span>
                            <span>{Math.round((batchProgress.current / batchProgress.total) * 100)}% ({batchProgress.current}/{batchProgress.total})</span>
                        </div>
                        <div className="w-full bg-indigo-200/80 rounded-full h-2 overflow-hidden">
                            <div
                                className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full rounded-full transition-all duration-300"
                                style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* Main Table Area */}
                <div className="flex-1 overflow-y-auto px-6 py-4">
                    {filteredItems.length === 0 ? (
                        <div className="py-16 flex flex-col items-center justify-center text-center">
                            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-3 border border-emerald-100 shadow-sm">
                                <CheckCircle2 className="w-8 h-8" />
                            </div>
                            <h4 className="text-base font-extrabold text-slate-800">
                                {searchTerm ? 'Tidak Ada Hasil yang Cocok' : 'Semua Rak Bersih &amp; Sudah Seimbang!'}
                            </h4>
                            <p className="text-xs text-slate-500 max-w-sm mt-1">
                                {searchTerm
                                    ? `Tidak ditemukan SKU dengan kata kunci "${searchTerm}". Silakan periksa ejaan SKU atau rak.`
                                    : 'Luar biasa! Tidak ditemukan SKU yang memiliki selisih rak minus dan plus yang belum di-reconcile pada batch ini.'}
                            </p>
                        </div>
                    ) : (
                        <div className="border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider">
                                        <th className="p-3 w-10 text-center">
                                            <button
                                                onClick={toggleSelectAll}
                                                className="hover:text-blue-600 transition-colors cursor-pointer"
                                            >
                                                {isAllSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
                                            </button>
                                        </th>
                                        <th className="p-3 w-56">SKU Produk</th>
                                        <th className="p-3">Rak Minus (Dibutuhkan)</th>
                                        <th className="p-3">Rak Donor (Tersedia)</th>
                                        <th className="p-3 text-center">Qty Di-Klop</th>
                                        <th className="p-3 text-center">Sisa Murni</th>
                                        <th className="p-3 text-right">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                    {filteredItems.map((item) => {
                                        const isSelected = selectedSkuSet.has(item.sku);
                                        const isProcessingThis = processingSku === item.sku;

                                        return (
                                            <tr
                                                key={item.sku}
                                                className={`hover:bg-blue-50/40 transition-colors ${isSelected ? 'bg-blue-50/20' : ''}`}
                                            >
                                                {/* Checkbox */}
                                                <td className="p-3 text-center">
                                                    <button
                                                        onClick={() => toggleSelectSku(item.sku)}
                                                        disabled={batchRunning || isProcessingThis}
                                                        className="text-slate-400 hover:text-blue-600 transition-colors disabled:opacity-40 cursor-pointer"
                                                    >
                                                        {isSelected ? (
                                                             <CheckSquare className="w-4 h-4 text-blue-600" />
                                                        ) : (
                                                            <Square className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                </td>

                                                {/* SKU */}
                                                <td className="p-3">
                                                    <div className="font-black text-slate-800 tracking-tight leading-tight">
                                                        {item.sku}
                                                    </div>
                                                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                                        {item.packing && (
                                                            <span className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-100 px-1.5 py-0.2 rounded">
                                                                {item.packing}
                                                            </span>
                                                        )}
                                                        {item.batches.map(b => (
                                                            <span key={b} className="text-[9px] font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded uppercase">
                                                                Rak {b}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>

                                                {/* Rak Minus */}
                                                <td className="p-3">
                                                    <div className="flex flex-wrap gap-1">
                                                        {item.minusLocations.map((m, mIdx) => (
                                                            <span
                                                                key={mIdx}
                                                                className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 text-rose-700 px-2 py-0.5 rounded-lg font-bold text-[11px]"
                                                                title={`Rak ${m.rak}: ${m.tersedia} ${item.satuan}`}
                                                            >
                                                                <span className="font-extrabold">{m.rak}</span>
                                                                <span className="text-rose-900 bg-rose-200/80 px-1 py-0.2 rounded text-[10px]">{m.tersedia}</span>
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>

                                                {/* Rak Donor */}
                                                <td className="p-3">
                                                    <div className="flex flex-wrap gap-1">
                                                        {item.plusLocations.map((p, pIdx) => (
                                                            <span
                                                                key={pIdx}
                                                                className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-lg font-bold text-[11px]"
                                                                title={`Rak ${p.rak}: +${p.tersedia} ${item.satuan}`}
                                                            >
                                                                <span className="font-extrabold">{p.rak}</span>
                                                                <span className="text-emerald-900 bg-emerald-200/80 px-1 py-0.2 rounded text-[10px]">+{p.tersedia}</span>
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>

                                                {/* Qty Klop */}
                                                <td className="p-3 text-center">
                                                    <span className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-700 px-2.5 py-1 rounded-xl font-black text-xs">
                                                        <ArrowRightLeft className="w-3 h-3 text-blue-500" />
                                                        {item.reconcilableQty.toLocaleString()} {item.satuan}
                                                    </span>
                                                </td>

                                                {/* Sisa Murni */}
                                                <td className="p-3 text-center">
                                                    {item.netSurplus === 0 ? (
                                                        <span className="inline-block bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg font-extrabold text-[11px]">
                                                            0 PCS (Habis)
                                                        </span>
                                                    ) : (
                                                        <span className="inline-block bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-lg font-extrabold text-[11px]">
                                                            +{item.netSurplus.toLocaleString()} PCS
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Action per Row */}
                                                <td className="p-3 text-right">
                                                    <button
                                                        onClick={() => handleReconcileSingle(item)}
                                                        disabled={isProcessingThis || batchRunning}
                                                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-[11px] font-black shadow-sm hover:shadow transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                                                        title="Klopkan SKU ini saja satu per satu"
                                                    >
                                                        {isProcessingThis ? (
                                                            <>
                                                                <Loader2 className="w-3 h-3 animate-spin" />
                                                                <span>Meng-klop...</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Check className="w-3 h-3" />
                                                                <span>Klopkan SKU Ini</span>
                                                            </>
                                                        )}
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Footer Notes */}
                <div className="px-6 py-3 bg-slate-50 border-t border-slate-200/80 flex flex-col md:flex-row items-center justify-between text-xs text-slate-500 gap-2 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span>Mode Penyeimbang: <strong>Double-Entry Transfer</strong> (Log lama tetap aman untuk audit).</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            disabled={batchRunning}
                            className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold rounded-xl transition-all disabled:opacity-50 cursor-pointer"
                        >
                            Tutup
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
};
