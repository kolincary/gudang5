import React, { useState, useEffect } from 'react';
import { Button } from './ui/Button';
import { RefreshCw, Search, X, Trash2, AlertTriangle, Send, ShieldAlert, CheckCircle2, MessageSquare, Copy, Check, Filter } from 'lucide-react';
import { Toast } from './ui/Toast';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { supabase } from '../lib/supabase';
import { DatabaseService } from '../lib/DatabaseService';

export interface QuarantineItem {
    id: string;
    tanggal: string;
    waktu: string;
    nama_produk: string;
    jumlah: number;
    gudang: string;
    rak: string;
    tgl_scan: string;
    user_name: string;
    validation_errors: string[];
    quarantined_at: string;
    original_row_id: string;
    type: string;
    status: string;
}

export interface KarantinaRevisiItem {
    id: string | number;
    original_log_id: string;
    sku: string;
    nama_barang?: string;
    packing?: string;
    jumlah: number;
    rak_asal?: string;
    sub_rak_tujuan?: string;
    tgl_out_asli?: string;
    user_pemotong_out?: string;
    user_penarik?: string;
    keterangan_out_asli?: string;
    status: 'MENUNGGU_REVISI' | 'REVISI_SELESAI' | 'REVISI_DITOLAK' | string;
    sisa_fisik_belum_cocok?: number;
    catatan_crosscheck?: string;
    revisi_by?: string;
    revisi_at?: string;
    created_at?: string;
}

interface ToastState {
    show: boolean;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
}

export const DataKarantina: React.FC = () => {
    // Tabs state: 'revisi_out' (Wadah Karantina Revisi OUT) vs 'validation_error' (Karantina Validasi Error)
    const [activeTab, setActiveTab] = useState<'revisi_out' | 'validation_error'>('revisi_out');

    // State for Tab 1: Revisi OUT
    const [revisiItems, setRevisiItems] = useState<KarantinaRevisiItem[]>([]);
    const [revisiStatusFilter, setRevisiStatusFilter] = useState<string>('ALL');

    // State for Tab 2: Validation Errors
    const [validationRows, setValidationRows] = useState<QuarantineItem[]>([]);

    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [copiedId, setCopiedId] = useState<string | number | null>(null);

    const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'info' });
    const [actionConfirm, setActionConfirm] = useState<{
        isOpen: boolean;
        rowId: string | number | null;
        action: 'delete_validation' | 'resend_validation' | 'delete_revisi' | 'complete_revisi' | null;
    }>({
        isOpen: false,
        rowId: null,
        action: null
    });
    const [clearConfirm, setClearConfirm] = useState(false);

    const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning') => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
    };

    // Load Data for both sources
    const loadAllData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Wadah Karantina Revisi OUT
            const { data: revData } = await DatabaseService.fetchKarantina();
            setRevisiItems((revData as KarantinaRevisiItem[]) || []);

            // 2. Fetch Validation Error Quarantined Items (filter out OUT_REVISI items)
            const { data: valData } = await supabase
                .from('quarantined_items')
                .select('*')
                .neq('type', 'OUT_REVISI')
                .order('created_at', { ascending: false });

            const formattedValData = (valData || []).map(item => ({
                ...item,
                validation_errors: item.validation_errors || []
            }));
            setValidationRows(formattedValData);
        } catch (error) {
            console.error('Error fetching all quarantine data:', error);
            showToast('Gagal memuat sebagian data karantina', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAllData();

        const channelVal = supabase
            .channel('public:quarantined_items_sync')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'quarantined_items' }, () => {
                loadAllData();
            })
            .subscribe();

        const channelRev = supabase
            .channel('public:karantina_revisi_sync')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'karantina_revisi_out' }, () => {
                loadAllData();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channelVal);
            supabase.removeChannel(channelRev);
        };
    }, []);

    // Generate WhatsApp text for Wadah Karantina Revisi OUT
    const generateWaReport = (item: KarantinaRevisiItem): string => {
        const waktuStr = item.created_at ? new Date(item.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
        return `🚨 *LAPORAN KARANTINA REVISI OUT (CEK RAK)*
------------------------------------------------
📦 *SKU / Barang:* ${item.sku} ${item.nama_barang ? `(${item.nama_barang})` : ''}
🔢 *Qty Bermasalah:* ${item.jumlah} pcs
📍 *Rak Asal Pemotongan:* ${item.rak_asal || '-'}
🎯 *Sub Rak Fisik Aktual:* ${item.sub_rak_tujuan || '-'}
📅 *Tgl OUT Asli:* ${item.tgl_out_asli || '-'}
👤 *Pemotong OUT Asli:* ${item.user_pemotong_out || '-'}
🕵️ *Penarik ke Karantina:* ${item.user_penarik || '-'}
⏱️ *Waktu Penarikan:* ${waktuStr}
📝 *Keterangan OUT:* ${item.keterangan_out_asli || '-'}
------------------------------------------------
_Mohon Tim Crosscheck memeriksa dan merevisi/membatalkan potong stok nota terkait di Accurate._`;
    };

    const handleCopyWa = (item: KarantinaRevisiItem) => {
        const text = generateWaReport(item);
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(() => {
                setCopiedId(item.id);
                showToast('Format laporan WA berhasil disalin ke clipboard!', 'success');
                setTimeout(() => setCopiedId(null), 3000);
            });
        } else {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            setCopiedId(item.id);
            showToast('Format laporan WA berhasil disalin!', 'success');
            setTimeout(() => setCopiedId(null), 3000);
        }
    };

    // Actions for Revisi OUT
    const handleCompleteRevisi = async () => {
        if (!actionConfirm.rowId || actionConfirm.action !== 'complete_revisi') return;
        try {
            await DatabaseService.updateKarantina(actionConfirm.rowId, {
                status: 'REVISI_SELESAI',
                revisi_at: new Date().toISOString()
            });
            showToast('Status karantina berhasil diperbarui menjadi SELESAI', 'success');
            loadAllData();
        } catch (error) {
            console.error('Error completing revisi item:', error);
            showToast('Gagal memperbarui status karantina', 'error');
        } finally {
            setActionConfirm({ isOpen: false, rowId: null, action: null });
        }
    };

    const handleDeleteRevisi = async () => {
        if (!actionConfirm.rowId || actionConfirm.action !== 'delete_revisi') return;
        try {
            await DatabaseService.deleteKarantina(actionConfirm.rowId);
            showToast('Data berhasil dihapus dari Wadah Karantina Revisi OUT', 'success');
            loadAllData();
        } catch (error) {
            console.error('Error deleting revisi item:', error);
            showToast('Gagal menghapus data', 'error');
        } finally {
            setActionConfirm({ isOpen: false, rowId: null, action: null });
        }
    };

    // Actions for Validation Errors
    const handleDeleteValidation = async () => {
        if (!actionConfirm.rowId || actionConfirm.action !== 'delete_validation') return;
        try {
            const { error } = await supabase
                .from('quarantined_items')
                .delete()
                .eq('id', actionConfirm.rowId);

            if (error) throw error;
            showToast('Data berhasil dihapus dari karantina validasi', 'success');
            loadAllData();
        } catch (error) {
            console.error('Error deleting item:', error);
            showToast('Gagal menghapus data', 'error');
        } finally {
            setActionConfirm({ isOpen: false, rowId: null, action: null });
        }
    };

    const checkBatchStock = async (sku: string, rak: string, tglScan: string): Promise<{ sisa: number; hasIn: boolean }> => {
        if (!sku || !rak || !tglScan) return { sisa: 0, hasIn: false };

        try {
            const cleanDate = tglScan.trim();
            const variations = new Set<string>([cleanDate]);

            const parts = cleanDate.split(/[-/]/);
            if (parts.length === 3) {
                let y = '', m = '', d = '';
                if (parts[0].length === 4) {
                    y = parts[0];
                    m = parts[1].padStart(2, '0');
                    d = parts[2].padStart(2, '0');
                } else if (parts[2].length === 4) {
                    d = parts[0].padStart(2, '0');
                    m = parts[1].padStart(2, '0');
                    y = parts[2];
                }
                if (y && m && d) {
                    variations.add(`${y}-${m}-${d}`);
                    variations.add(`${d}-${m}-${y}`);
                    variations.add(`${d}/${m}/${y}`);
                    variations.add(`${y}/${m}/${d}`);
                    const dn = parseInt(d, 10).toString();
                    const mn = parseInt(m, 10).toString();
                    variations.add(`${y}-${mn}-${dn}`);
                    variations.add(`${dn}-${mn}-${y}`);
                    variations.add(`${dn}/${mn}/${y}`);
                }
            }
            const uniqueVariations = Array.from(variations);

            const { data: logs, error } = await supabase
                .from('database_log')
                .select('jumlah, type, tgl_scan')
                .ilike('sku', sku.trim())
                .ilike('rak', rak.trim())
                .in('tgl_scan', uniqueVariations);

            if (logs && logs.length > 0) {
                const totalIn = logs.filter(l => l.type === 'IN').reduce((sum, l) => sum + (l.jumlah || 0), 0);
                const totalOut = logs.filter(l => l.type === 'OUT').reduce((sum, l) => sum + (l.jumlah || 0), 0);
                if (totalIn > 0) {
                    return { sisa: Math.max(0, totalIn - totalOut), hasIn: true };
                }
            }

            // Fallback to stock_items available stock for this rack
            const { data: currentStock } = await supabase
                .from('stock_items')
                .select('tersedia')
                .ilike('nama_produk', sku.trim())
                .ilike('rak', rak.trim())
                .limit(1);

            if (currentStock && currentStock.length > 0 && (currentStock[0].tersedia || 0) > 0) {
                return { sisa: currentStock[0].tersedia, hasIn: true };
            }

            return { sisa: 0, hasIn: false };
        } catch (err) {
            console.error('Error checking batch stock:', err);
            return { sisa: 0, hasIn: false };
        }
    };

    const handleResendValidation = async () => {
        if (!actionConfirm.rowId || actionConfirm.action !== 'resend_validation') return;
        const itemToResend = validationRows.find(r => r.id === actionConfirm.rowId);
        if (!itemToResend) return;

        try {
            setLoading(true);

            if (!itemToResend.nama_produk || !itemToResend.rak || !itemToResend.gudang || !itemToResend.jumlah) {
                showToast('Data tidak lengkap (SKU, Rak, Gudang, atau Jumlah kosong)', 'error');
                return;
            }

            if (itemToResend.type === 'OUT') {
                const batchStatus = await checkBatchStock(itemToResend.nama_produk, itemToResend.rak, itemToResend.tgl_scan);
                if (!batchStatus.hasIn) {
                    showToast(`Validasi Gagal: Tidak ada stok masuk (IN) untuk item ini di rak ${itemToResend.rak} pada tgl scan ${itemToResend.tgl_scan}`, 'error');
                    return;
                }
                if (batchStatus.sisa < itemToResend.jumlah) {
                    showToast(`Validasi Gagal: Stok tidak cukup! Tersedia: ${batchStatus.sisa}, Diminta: ${itemToResend.jumlah}`, 'error');
                    return;
                }
            }

            const logEntry = {
                tanggal: itemToResend.tanggal,
                waktu: itemToResend.waktu,
                sku: itemToResend.nama_produk,
                jumlah: itemToResend.jumlah,
                type: itemToResend.type,
                gudang: itemToResend.gudang,
                rak: itemToResend.rak,
                tgl_scan: itemToResend.tgl_scan,
                user_name: itemToResend.user_name
            };

            const { error: insertError } = await supabase
                .from('database_log')
                .insert([logEntry]);

            if (insertError) throw insertError;

            await supabase
                .from('quarantined_items')
                .delete()
                .eq('id', itemToResend.id);

            showToast('Data berhasil dikirim ulang ke Database Log dan dihapus dari Karantina', 'success');
            loadAllData();
        } catch (error) {
            console.error('Error resending item:', error);
            showToast(`Gagal mengirim ulang data: ${(error as Error).message}`, 'error');
        } finally {
            setActionConfirm({ isOpen: false, rowId: null, action: null });
            setLoading(false);
        }
    };

    const handleClearAll = async () => {
        try {
            if (activeTab === 'validation_error') {
                await supabase
                    .from('quarantined_items')
                    .delete()
                    .neq('id', '00000000-0000-0000-0000-000000000000');
                showToast('Semua data karantina validasi berhasil dibersihkan', 'success');
            } else {
                for (const item of revisiItems) {
                    await DatabaseService.deleteKarantina(item.id);
                }
                showToast('Semua data karantina revisi OUT berhasil dibersihkan', 'success');
            }
            loadAllData();
        } catch (error) {
            console.error('Error clearing data:', error);
            showToast('Gagal membersihkan data', 'error');
        } finally {
            setClearConfirm(false);
        }
    };

    const getErrorMessage = (errors: string[]) => {
        if (!errors || errors.length === 0) return 'Error tidak diketahui';
        const map: Record<string, string> = {
            'nama_produk': 'Nama Produk Kosong',
            'nama_produk_invalid': 'Produk Tidak Valid',
            'jumlah': 'Jumlah Invalid',
            'rak': 'Rak Kosong',
            'rak_invalid': 'Rak Tidak Valid',
            'gudang': 'Gudang Kosong',
            'gudang_invalid': 'Gudang Tidak Valid',
            'batch_mismatch': 'Tgl Scan Tidak Sesuai Rak',
            'tgl_scan': 'Validasi Tgl Scan Gagal',
        };
        return errors.map(e => map[e] || e).join(', ');
    };

    // Filter logic
    const lowerSearch = searchTerm.toLowerCase().trim();

    const filteredRevisiItems = revisiItems.filter(item => {
        const matchesStatus = revisiStatusFilter === 'ALL' || item.status === revisiStatusFilter;
        if (!matchesStatus) return false;
        if (!lowerSearch) return true;
        return (
            (item.sku || '').toLowerCase().includes(lowerSearch) ||
            (item.nama_barang || '').toLowerCase().includes(lowerSearch) ||
            (item.rak_asal || '').toLowerCase().includes(lowerSearch) ||
            (item.sub_rak_tujuan || '').toLowerCase().includes(lowerSearch) ||
            (item.user_penarik || '').toLowerCase().includes(lowerSearch) ||
            (item.keterangan_out_asli || '').toLowerCase().includes(lowerSearch)
        );
    });

    const filteredValidationRows = validationRows.filter(row => {
        if (!lowerSearch) return true;
        return (
            (row.nama_produk || '').toLowerCase().includes(lowerSearch) ||
            (row.rak || '').toLowerCase().includes(lowerSearch) ||
            (row.gudang || '').toLowerCase().includes(lowerSearch) ||
            (row.user_name || '').toLowerCase().includes(lowerSearch) ||
            (row.validation_errors || []).some(e => e.toLowerCase().includes(lowerSearch))
        );
    });

    const pendingRevisiCount = revisiItems.filter(i => i.status === 'MENUNGGU_REVISI').length;

    return (
        <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-800 relative overflow-hidden">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-100/30 blur-[120px] rounded-full z-0 animate-pulse"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-100/20 blur-[120px] rounded-full z-0"></div>

            <div className="max-w-[1920px] mx-auto relative z-10">
                {/* PREMIUM IMMERSIVE HEADER */}
                <div className="flex flex-col mb-8 lg:mb-12 uppercase">
                    <div className="bg-gradient-to-br from-orange-700 via-amber-800 to-slate-900 pt-[90px] lg:pt-0 lg:h-[310px] pb-[75px] lg:pb-0 px-6 lg:px-12 rounded-b-[40px] lg:rounded-b-[55px] shadow-2xl shadow-orange-900/40 relative overflow-hidden transition-all duration-500 flex flex-col justify-center">
                        <div className="absolute -top-12 -right-12 text-white opacity-5">
                            <ShieldAlert className="w-72 h-72 lg:w-[480px] lg:h-[480px]" />
                        </div>
                        <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-orange-500/10 rounded-full blur-3xl animate-pulse"></div>
                        <div className="absolute bottom-1/4 right-1/4 w-24 h-24 bg-amber-500/10 rounded-3xl rotate-45 blur-2xl"></div>
                        <div className="relative z-10 w-full flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 uppercase text-left">
                            <div className="max-w-2xl">
                                <div className="flex items-center gap-2 mb-3 lg:mb-4 opacity-90">
                                    <div className="w-10 h-[2px] bg-orange-400 rounded-full"></div>
                                    <span className="text-[10px] lg:text-[12px] font-black tracking-[0.4em] text-orange-100">Wadah Pengawasan & Koreksi</span>
                                </div>
                                <h1 className="text-[34px] lg:text-[54px] font-black text-white tracking-tighter leading-[0.9] mb-3 uppercase">
                                    Data <span className="text-orange-400">Karantina</span>
                                </h1>
                                <div className="text-orange-100/80 font-medium text-[14px] lg:text-[18px] leading-relaxed max-w-[90%] normal-case flex flex-wrap items-center gap-3">
                                    <div className="px-3 py-1 bg-white/10 rounded-full backdrop-blur-sm border border-white/10 flex items-center gap-2">
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                                        </span>
                                        <span className="text-[11px] font-bold tracking-widest uppercase">
                                            {revisiItems.length} Revisi OUT ({pendingRevisiCount} Pending)
                                        </span>
                                    </div>
                                    <div className="px-3 py-1 bg-white/10 rounded-full backdrop-blur-sm border border-white/10 flex items-center gap-2">
                                        <span className="text-[11px] font-bold tracking-widest uppercase">
                                            {validationRows.length} Error Validasi
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="relative z-10 flex flex-wrap gap-2 lg:gap-3 lg:mb-2 items-center">
                                <Button
                                    onClick={loadAllData}
                                    className="h-12 px-5 bg-white/10 hover:bg-white/20 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 border border-white/30 backdrop-blur-xl"
                                >
                                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                                    <span className="uppercase text-[10px] font-black">Refresh Data</span>
                                </Button>
                                <Button
                                    onClick={() => setClearConfirm(true)}
                                    className="h-12 px-6 bg-white hover:bg-orange-50 text-orange-700 font-black rounded-2xl shadow-[0_8px_25px_rgba(255,255,255,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2.5 border-none"
                                    disabled={(activeTab === 'revisi_out' ? revisiItems.length : validationRows.length) === 0}
                                >
                                    <Trash2 className="h-4 w-4" />
                                    <span className="uppercase text-xs font-black">Kosongkan Tab Ini</span>
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* TAB SWITCHER */}
                <div className="px-4 md:px-6 lg:px-10 mb-6">
                    <div className="flex flex-wrap items-center gap-3 bg-white/70 backdrop-blur-xl p-2 rounded-2xl border border-slate-200/80 shadow-sm w-fit">
                        <button
                            onClick={() => setActiveTab('revisi_out')}
                            className={`px-5 py-3 rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-2.5 transition-all ${
                                activeTab === 'revisi_out'
                                    ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-md shadow-orange-600/30'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                            }`}
                        >
                            <ShieldAlert className="h-4 w-4" />
                            <span>1. Wadah Karantina Revisi OUT (Dari Cek Rak)</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${activeTab === 'revisi_out' ? 'bg-black/20 text-white' : 'bg-orange-100 text-orange-700'}`}>
                                {revisiItems.length}
                            </span>
                        </button>

                        <button
                            onClick={() => setActiveTab('validation_error')}
                            className={`px-5 py-3 rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-2.5 transition-all ${
                                activeTab === 'validation_error'
                                    ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-md shadow-orange-600/30'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                            }`}
                        >
                            <AlertTriangle className="h-4 w-4" />
                            <span>2. Karantina Validasi Error (Input Barang)</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${activeTab === 'validation_error' ? 'bg-black/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                                {validationRows.length}
                            </span>
                        </button>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="p-4 md:px-6 lg:px-10 space-y-6">
                    {/* Search and Filters */}
                    <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                        <div className="relative flex-1 w-full group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <Search className="h-5 w-5 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
                            </div>
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder={activeTab === 'revisi_out' ? "Cari SKU, Rak Asal, Sub Rak, User, atau Keterangan..." : "Cari SKU, Lokasi, Error, atau User..."}
                                className="block w-full pl-12 pr-12 py-3.5 bg-white/80 backdrop-blur-xl border border-slate-200 rounded-2xl text-[14px] font-medium shadow-sm transition-all focus:ring-4 focus:ring-orange-500/10 focus:border-orange-500 outline-none"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-orange-500 transition-colors"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            )}
                        </div>

                        {activeTab === 'revisi_out' && (
                            <div className="flex items-center gap-2 self-start md:self-auto">
                                <Filter className="h-4 w-4 text-slate-400" />
                                <span className="text-xs font-bold text-slate-500 uppercase">Status:</span>
                                <select
                                    value={revisiStatusFilter}
                                    onChange={(e) => setRevisiStatusFilter(e.target.value)}
                                    className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none shadow-sm focus:border-orange-500"
                                >
                                    <option value="ALL">Semua Status ({revisiItems.length})</option>
                                    <option value="MENUNGGU_REVISI">Menunggu Revisi ({pendingRevisiCount})</option>
                                    <option value="REVISI_SELESAI">Revisi Selesai</option>
                                    <option value="REVISI_DITOLAK">Revisi Ditolak</option>
                                </select>
                            </div>
                        )}
                    </div>

                    {/* TAB 1: WADAH KARANTINA REVISI OUT */}
                    {activeTab === 'revisi_out' && (
                        <div className="bg-white/70 backdrop-blur-3xl rounded-[2.5rem] border border-white/60 shadow-2xl shadow-slate-200/50 overflow-hidden">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center py-32 text-slate-400">
                                    <RefreshCw className="h-14 w-14 animate-spin mb-4 text-orange-500" />
                                    <p className="text-slate-600 font-black text-xs uppercase tracking-[0.3em] animate-pulse">Memuat Data Karantina Revisi...</p>
                                </div>
                            ) : filteredRevisiItems.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-28 text-slate-400">
                                    <div className="bg-white p-8 rounded-3xl mb-4 shadow-sm border border-slate-100">
                                        <ShieldAlert className="h-14 w-14 text-emerald-400" />
                                    </div>
                                    <h3 className="text-lg font-black text-slate-800 mb-1">Tidak Ada Data Karantina Revisi OUT</h3>
                                    <p className="text-slate-500 text-xs max-w-sm text-center font-medium leading-relaxed">
                                        {searchTerm ? 'Tidak ada data yang cocok dengan pencarian.' : 'Belum ada transaksi OUT yang ditarik ke wadah karantina dari menu Cek Rak.'}
                                    </p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-100/70 border-b border-slate-200">
                                                <th className="px-4 py-4 font-black text-slate-500 uppercase tracking-widest text-[10px] text-center">No</th>
                                                <th className="px-4 py-4 font-black text-slate-500 uppercase tracking-widest text-[10px]">Tgl OUT / Ditarik</th>
                                                <th className="px-4 py-4 font-black text-slate-500 uppercase tracking-widest text-[10px]">SKU & Barang</th>
                                                <th className="px-4 py-4 font-black text-slate-500 uppercase tracking-widest text-[10px] text-center">Qty</th>
                                                <th className="px-4 py-4 font-black text-slate-500 uppercase tracking-widest text-[10px]">Rak Asal ➔ Aktual</th>
                                                <th className="px-4 py-4 font-black text-slate-500 uppercase tracking-widest text-[10px]">User Terkait</th>
                                                <th className="px-4 py-4 font-black text-slate-500 uppercase tracking-widest text-[10px] text-center">Status</th>
                                                <th className="px-4 py-4 font-black text-slate-500 uppercase tracking-widest text-[10px]">Keterangan</th>
                                                <th className="px-4 py-4 font-black text-slate-500 uppercase tracking-widest text-[10px] text-center">Aksi</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {filteredRevisiItems.map((item, index) => (
                                                <tr key={item.id} className="hover:bg-orange-50/40 transition-colors group">
                                                    <td className="px-4 py-3.5 text-slate-400 font-mono font-bold text-center">{index + 1}</td>
                                                    <td className="px-4 py-3.5 whitespace-nowrap">
                                                        <div className="font-bold text-slate-800 text-xs">{item.tgl_out_asli || '-'}</div>
                                                        <div className="text-[10px] text-slate-400 font-medium">
                                                            {item.created_at ? new Date(item.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3.5">
                                                        <div className="font-black text-slate-900 text-xs">{item.sku}</div>
                                                        {item.nama_barang && (
                                                            <div className="text-[11px] text-slate-500 line-clamp-1">{item.nama_barang}</div>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-center">
                                                        <span className="inline-flex px-2.5 py-1 rounded-lg bg-rose-100 font-black text-rose-700 text-xs">
                                                            {item.jumlah} pcs
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3.5">
                                                        <div className="flex items-center gap-1.5 text-xs font-mono font-bold">
                                                            <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-200">{item.rak_asal || '-'}</span>
                                                            <span className="text-slate-400">➔</span>
                                                            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">{item.sub_rak_tujuan || '-'}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3.5 whitespace-nowrap">
                                                        <div className="text-[11px] font-bold text-slate-700">👤 {item.user_penarik || '-'}</div>
                                                        <div className="text-[10px] text-slate-400">Pemotong: {item.user_pemotong_out || '-'}</div>
                                                    </td>
                                                    <td className="px-4 py-3.5 text-center whitespace-nowrap">
                                                        {item.status === 'MENUNGGU_REVISI' ? (
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black border border-amber-300">
                                                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping"></span>
                                                                MENUNGGU REVISI
                                                            </span>
                                                        ) : item.status === 'REVISI_SELESAI' ? (
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black border border-emerald-300">
                                                                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                                                SELESAI
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[10px] font-black">
                                                                {item.status}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-xs text-slate-600 max-w-xs">
                                                        <div className="line-clamp-2">{item.keterangan_out_asli || '-'}</div>
                                                        {item.catatan_crosscheck && (
                                                            <div className="text-[10px] text-blue-600 font-bold mt-0.5">Catatan: {item.catatan_crosscheck}</div>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-center whitespace-nowrap">
                                                        <div className="flex items-center justify-center gap-1.5">
                                                            <button
                                                                onClick={() => handleCopyWa(item)}
                                                                className="h-8 px-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-lg text-xs flex items-center gap-1 border border-emerald-200 transition-all active:scale-95"
                                                                title="Salin Format Laporan WhatsApp"
                                                            >
                                                                {copiedId === item.id ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                                                                <span className="text-[10px]">WA</span>
                                                            </button>

                                                            {item.status !== 'REVISI_SELESAI' && (
                                                                <button
                                                                    onClick={() => setActionConfirm({ isOpen: true, rowId: item.id, action: 'complete_revisi' })}
                                                                    className="h-8 px-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-lg text-xs flex items-center gap-1 border border-blue-200 transition-all active:scale-95"
                                                                    title="Tandai Selesai Revisi"
                                                                >
                                                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                                                    <span className="text-[10px]">Selesai</span>
                                                                </button>
                                                            )}

                                                            <button
                                                                onClick={() => setActionConfirm({ isOpen: true, rowId: item.id, action: 'delete_revisi' })}
                                                                className="h-8 w-8 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold rounded-lg flex items-center justify-center border border-rose-200 transition-all active:scale-95"
                                                                title="Hapus dari Karantina"
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 2: KARANTINA VALIDASI ERROR (INPUT BARANG) */}
                    {activeTab === 'validation_error' && (
                        <div className="bg-white/70 backdrop-blur-3xl rounded-[2.5rem] border border-white/60 shadow-2xl shadow-slate-200/50 overflow-hidden">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center py-32 text-slate-400">
                                    <RefreshCw className="h-14 w-14 animate-spin mb-4 text-orange-500" />
                                    <p className="text-slate-600 font-black text-xs uppercase tracking-[0.3em] animate-pulse">Memuat Data...</p>
                                </div>
                            ) : filteredValidationRows.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-28 text-slate-400">
                                    <div className="bg-white p-8 rounded-3xl mb-4 shadow-sm border border-slate-100">
                                        <AlertTriangle className="h-14 w-14 text-slate-300" />
                                    </div>
                                    <h3 className="text-lg font-black text-slate-800 mb-1">Karantina Validasi Kosong</h3>
                                    <p className="text-slate-500 text-xs max-w-sm text-center font-medium leading-relaxed">
                                        {searchTerm ? 'Tidak ada data yang cocok dengan pencarian.' : 'Tidak ada data barang yang gagal validasi saat ini.'}
                                    </p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-center border-collapse">
                                        <thead>
                                            <tr className="bg-slate-100/70 border-b border-slate-200">
                                                <th className="px-4 py-4 font-black text-slate-500 uppercase tracking-widest text-[10px]">No</th>
                                                <th className="px-4 py-4 font-black text-slate-500 uppercase tracking-widest text-[10px]">Tanggal</th>
                                                <th className="px-4 py-4 font-black text-slate-500 uppercase tracking-widest text-[10px]">Waktu</th>
                                                <th className="px-4 py-4 font-black text-slate-500 uppercase tracking-widest text-[10px] text-left">Nama Produk</th>
                                                <th className="px-4 py-4 font-black text-slate-500 uppercase tracking-widest text-[10px]">Jumlah</th>
                                                <th className="px-4 py-4 font-black text-slate-500 uppercase tracking-widest text-[10px]">Type</th>
                                                <th className="px-4 py-4 font-black text-slate-500 uppercase tracking-widest text-[10px]">Gudang</th>
                                                <th className="px-4 py-4 font-black text-slate-500 uppercase tracking-widest text-[10px]">Rak</th>
                                                <th className="px-4 py-4 font-black text-slate-500 uppercase tracking-widest text-[10px]">Tgl Scan</th>
                                                <th className="px-4 py-4 font-black text-slate-500 uppercase tracking-widest text-[10px]">User</th>
                                                <th className="px-4 py-4 font-black text-slate-500 uppercase tracking-widest text-[10px] text-left">Validation Errors</th>
                                                <th className="px-4 py-4 font-black text-slate-500 uppercase tracking-widest text-[10px]">Aksi</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {filteredValidationRows.map((row, index) => (
                                                <tr key={row.id} className="hover:bg-white/80 transition-colors group">
                                                    <td className="px-4 py-3 text-slate-400 font-mono font-bold">{index + 1}</td>
                                                    <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap">{row.tanggal}</td>
                                                    <td className="px-4 py-3 font-medium text-slate-500 font-mono whitespace-nowrap">{row.waktu}</td>
                                                    <td className="px-4 py-3 font-bold text-slate-900 text-left">{row.nama_produk}</td>
                                                    <td className="px-4 py-3">
                                                        <span className="inline-flex px-2 py-1 rounded bg-slate-100 font-bold text-slate-700">{row.jumlah}</span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className={`inline-flex px-2 py-1 rounded text-xs font-bold ${row.type === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                                                            {row.type}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 font-medium text-slate-600">{row.gudang}</td>
                                                    <td className="px-4 py-3 font-bold text-yellow-600 bg-yellow-50 rounded">{row.rak}</td>
                                                    <td className="px-4 py-3 font-medium text-blue-600 whitespace-nowrap">{row.tgl_scan || '-'}</td>
                                                    <td className="px-4 py-3 font-medium text-slate-500">{row.user_name || '-'}</td>
                                                    <td className="px-4 py-3 text-left">
                                                        <div className="flex items-center gap-2 text-rose-600 font-bold bg-rose-50 px-3 py-2 rounded-xl border border-rose-100">
                                                            <AlertTriangle className="h-3 w-3 shrink-0" />
                                                            <span className="text-[10px] leading-snug uppercase tracking-wide">{getErrorMessage(row.validation_errors)}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex gap-2 justify-center">
                                                            <Button
                                                                onClick={() => setActionConfirm({ isOpen: true, rowId: row.id, action: 'resend_validation' })}
                                                                className="h-8 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg text-xs font-bold flex items-center gap-1 border border-emerald-200"
                                                                title="Kirim Ulang ke Database Log"
                                                            >
                                                                <Send className="h-3 w-3" />
                                                                Resend
                                                            </Button>
                                                            <Button
                                                                onClick={() => setActionConfirm({ isOpen: true, rowId: row.id, action: 'delete_validation' })}
                                                                className="h-8 w-8 p-0 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg border border-rose-200 flex items-center justify-center"
                                                                title="Hapus Permanen"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Modals */}
            <Toast
                isOpen={toast.show}
                message={toast.message}
                type={toast.type}
                onClose={() => setToast({ ...toast, show: false })}
            />

            {/* Dialog Hapus Validation */}
            <ConfirmDialog
                isOpen={actionConfirm.isOpen && actionConfirm.action === 'delete_validation'}
                onClose={() => setActionConfirm({ isOpen: false, rowId: null, action: null })}
                onConfirm={handleDeleteValidation}
                title="Hapus Data Karantina Validasi"
                message="Apakah Anda yakin ingin menghapus data ini secara permanen?"
                confirmText="Hapus"
                cancelText="Batal"
            />

            {/* Dialog Resend Validation */}
            <ConfirmDialog
                isOpen={actionConfirm.isOpen && actionConfirm.action === 'resend_validation'}
                onClose={() => setActionConfirm({ isOpen: false, rowId: null, action: null })}
                onConfirm={handleResendValidation}
                title="Kirim Ulang Data"
                message="Apakah Anda yakin ingin mengirim ulang data ini ke Database Log? Pastikan data sudah valid."
                confirmText="Kirim"
                cancelText="Batal"
            />

            {/* Dialog Hapus Revisi */}
            <ConfirmDialog
                isOpen={actionConfirm.isOpen && actionConfirm.action === 'delete_revisi'}
                onClose={() => setActionConfirm({ isOpen: false, rowId: null, action: null })}
                onConfirm={handleDeleteRevisi}
                title="Hapus Data Karantina Revisi OUT"
                message="Apakah Anda yakin ingin menghapus data ini dari wadah karantina revisi?"
                confirmText="Hapus"
                cancelText="Batal"
            />

            {/* Dialog Selesaikan Revisi */}
            <ConfirmDialog
                isOpen={actionConfirm.isOpen && actionConfirm.action === 'complete_revisi'}
                onClose={() => setActionConfirm({ isOpen: false, rowId: null, action: null })}
                onConfirm={handleCompleteRevisi}
                title="Tandai Selesai Revisi"
                message="Tandai data ini sebagai selesai revisi di Accurate?"
                confirmText="Selesai"
                cancelText="Batal"
            />

            {/* Dialog Hapus Semua */}
            <ConfirmDialog
                isOpen={clearConfirm}
                onClose={() => setClearConfirm(false)}
                onConfirm={handleClearAll}
                title="Hapus Semua Data pada Tab Ini"
                message="Apakah Anda yakin ingin mengosongkan seluruh data pada tab karantina yang sedang aktif? Tindakan ini tidak dapat dibatalkan."
                confirmText="Hapus Semua"
                cancelText="Batal"
            />
        </div>
    );
};
