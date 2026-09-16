import React, { useState, useEffect, useMemo } from 'react';
import { 
    X, 
    Search, 
    RefreshCw, 
    CheckCircle2, 
    XCircle, 
    Clock, 
    Copy, 
    Check, 
    FileText, 
    ArrowRight, 
    User, 
    Calendar, 
    AlertTriangle,
    ShieldCheck,
    MessageSquare
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { DatabaseService } from '../lib/DatabaseService';

export interface KarantinaRevisiItem {
    id: number;
    original_log_id: number | null;
    sku: string;
    nama_barang: string | null;
    packing: string | null;
    jumlah: number;
    rak_asal: string | null;
    sub_rak_tujuan: string | null;
    tgl_out_asli: string | null;
    tgl_out?: string | null;
    gudang?: string | null;
    user_pemotong_out: string | null;
    user_penarik: string | null;
    keterangan_out_asli: string | null;
    status: 'MENUNGGU_REVISI' | 'SUDAH_REVISI' | 'DITOLAK' | string;
    sisa_fisik_belum_cocok: number;
    catatan_crosscheck: string | null;
    revisi_by: string | null;
    revisi_at: string | null;
    created_at: string;
}

interface KarantinaRevisiOutModalProps {
    isOpen: boolean;
    onClose: () => void;
    onDataChanged?: () => void;
}

export const KarantinaRevisiOutModal: React.FC<KarantinaRevisiOutModalProps> = ({
    isOpen,
    onClose,
    onDataChanged
}) => {
    const { userRole, user, userName } = useAuth();
    const isDeveloper = userRole === 'developer' || user?.email === 'devmode' || localStorage.getItem('devmode') === 'true';
    const isAdmin = userRole === 'admin' || userRole?.includes('admin');
    const canManageRevisi = isDeveloper || isAdmin;

    const [items, setItems] = useState<KarantinaRevisiItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'MENUNGGU_REVISI' | 'SUDAH_REVISI' | 'DITOLAK'>('ALL');
    const [copiedId, setCopiedId] = useState<number | null>(null);

    // Modal Konfirmasi Revisi State
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        item: KarantinaRevisiItem | null;
        action: 'approve' | 'reject';
        note: string;
        isSubmitting: boolean;
    }>({
        isOpen: false,
        item: null,
        action: 'approve',
        note: '',
        isSubmitting: false
    });

    const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

    const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
        setToastMessage({ text, type });
        setTimeout(() => setToastMessage(null), 3500);
    };

    const fetchItems = async () => {
        setLoading(true);
        try {
            const { data } = await DatabaseService.fetchKarantina();
            setItems((data as KarantinaRevisiItem[]) || []);
        } catch (err) {
            console.error('Error fetching karantina_revisi_out:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchItems();

            const channel = supabase
                .channel('realtime:karantina_revisi_out')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'karantina_revisi_out' }, () => {
                    fetchItems();
                    if (onDataChanged) onDataChanged();
                })
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        }
    }, [isOpen]);

    const filteredItems = useMemo(() => {
        return items.filter(item => {
            const matchStatus = statusFilter === 'ALL' || item.status === statusFilter;
            const searchLower = searchTerm.trim().toLowerCase();
            const matchSearch = !searchLower || 
                item.sku?.toLowerCase().includes(searchLower) ||
                item.nama_barang?.toLowerCase().includes(searchLower) ||
                item.sub_rak_tujuan?.toLowerCase().includes(searchLower) ||
                item.user_penarik?.toLowerCase().includes(searchLower) ||
                item.user_pemotong_out?.toLowerCase().includes(searchLower);

            return matchStatus && matchSearch;
        });
    }, [items, statusFilter, searchTerm]);

    const counts = useMemo(() => {
        return {
            all: items.length,
            menunggu: items.filter(i => i.status === 'MENUNGGU_REVISI').length,
            sudah: items.filter(i => i.status === 'SUDAH_REVISI').length,
            ditolak: items.filter(i => i.status === 'DITOLAK').length,
        };
    }, [items]);

    const formatSubRakTujuan = (rawRak?: string): string => {
        if (!rawRak) return 'UTAMA';
        const clean = rawRak.trim().toUpperCase();
        const preservedRacks = ['LANTAI 4', 'LANTAI 2', 'ECER-M', 'ECER-O', 'ECER-N', 'BLOK-I', 'LANTAI4', 'LANTAI2'];
        if (preservedRacks.includes(clean)) {
            return clean;
        }
        return 'UTAMA';
    };

    const generateWaReport = (item: KarantinaRevisiItem): string => {
        const cleanRakTujuan = formatSubRakTujuan(item.sub_rak_tujuan);
        const tglOutVal = item.tgl_out || item.tgl_out_asli || '-';
        const gudangVal = item.gudang || '-';

        let sisaText = '';
        if (item.sisa_fisik_belum_cocok > 0) {
            sisaText = `\nSisa Fisik Belum Ada Data: ${item.sisa_fisik_belum_cocok} pcs (Perlu Pengecekan Admin/Accurate)`;
        }

        return `*LAPORAN FISIK TIDAK TURUN (STOCK OPNAME)*
━━━━━━━━━━━━━━━━━━
*SKU:* ${item.sku}
*Sub-Rak Tujuan:* ${cleanRakTujuan}
*QTY:* ${item.jumlah} pcs
*Tgl OUT:* ${tglOutVal}
*Gudang:* ${gudangVal}${sisaText}
━━━━━━━━━━━━━━━━━━
_Mohon Tim Crosscheck memeriksa dan merevisi/membatalkan potong stok nota terkait di Accurate._`;
    };

    const handleCopyWa = (item: KarantinaRevisiItem) => {
        const text = generateWaReport(item);
        navigator.clipboard.writeText(text).then(() => {
            setCopiedId(item.id);
            showToast('📋 Format Laporan WhatsApp berhasil disalin!', 'success');
            setTimeout(() => setCopiedId(null), 2500);
        }).catch(err => {
            console.error('Failed to copy text:', err);
            showToast('Gagal menyalin ke clipboard', 'error');
        });
    };

    const handleExecuteStatusUpdate = async () => {
        if (!confirmModal.item) return;
        setConfirmModal(prev => ({ ...prev, isSubmitting: true }));

        const newStatus = confirmModal.action === 'approve' ? 'SUDAH_REVISI' : 'DITOLAK';
        const actor = userName || user?.email || (isDeveloper ? 'Developer' : 'Admin');

        try {
            await DatabaseService.updateKarantina(confirmModal.item.id, {
                status: newStatus,
                catatan_crosscheck: confirmModal.note.trim() || (newStatus === 'SUDAH_REVISI' ? 'Sudah disesuaikan di Accurate' : 'Dibatalkan/Ditolak'),
                revisi_by: actor,
                revisi_at: new Date().toISOString()
            });

            showToast(
                newStatus === 'SUDAH_REVISI' 
                    ? '✅ Berhasil ditandai SUDAH DIREVISI!' 
                    : '❌ Data ditandai DITOLAK', 
                'success'
            );

            setConfirmModal({
                isOpen: false,
                item: null,
                action: 'approve',
                note: '',
                isSubmitting: false
            });

            fetchItems();
            if (onDataChanged) onDataChanged();
        } catch (err: any) {
            console.error('Error updating status:', err);
            showToast(`Gagal update status: ${err.message}`, 'error');
            setConfirmModal(prev => ({ ...prev, isSubmitting: false }));
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-md z-[120] flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden border border-slate-200">
                {/* Modal Header */}
                <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 p-5 sm:p-6 text-white flex justify-between items-center shadow-md">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center backdrop-blur-sm border border-white/20 shadow-inner">
                            <ShieldCheck className="w-6 h-6 text-amber-100" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-xl sm:text-2xl font-black tracking-tight uppercase">
                                    Wadah Karantina Revisi OUT
                                </h3>
                                {counts.menunggu > 0 && (
                                    <span className="px-2.5 py-0.5 rounded-full bg-rose-500 text-white font-black text-xs animate-pulse">
                                        {counts.menunggu} Menunggu
                                    </span>
                                )}
                            </div>
                            <p className="text-xs sm:text-sm text-amber-100/90 font-medium">
                                Data OUT yang batal turun &amp; ditarik di Stock Opname (Dilaporkan ke Tim Crosscheck &amp; Accurate)
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={fetchItems}
                            disabled={loading}
                            title="Segarkan Data"
                            className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                        <button 
                            onClick={onClose}
                            className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Filter & Search Bar */}
                <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row gap-3 items-center justify-between">
                    {/* Status Tabs */}
                    <div className="flex items-center gap-1.5 bg-slate-200/80 p-1 rounded-xl w-full sm:w-auto overflow-x-auto">
                        <button
                            onClick={() => setStatusFilter('ALL')}
                            className={`px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                                statusFilter === 'ALL'
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            Semua ({counts.all})
                        </button>
                        <button
                            onClick={() => setStatusFilter('MENUNGGU_REVISI')}
                            className={`px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                                statusFilter === 'MENUNGGU_REVISI'
                                    ? 'bg-amber-500 text-white shadow-sm'
                                    : 'text-amber-800 hover:bg-amber-100/60'
                            }`}
                        >
                            <Clock className="w-3.5 h-3.5" />
                            Menunggu Revisi ({counts.menunggu})
                        </button>
                        <button
                            onClick={() => setStatusFilter('SUDAH_REVISI')}
                            className={`px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                                statusFilter === 'SUDAH_REVISI'
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : 'text-emerald-800 hover:bg-emerald-100/60'
                            }`}
                        >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Sudah Revisi ({counts.sudah})
                        </button>
                        <button
                            onClick={() => setStatusFilter('DITOLAK')}
                            className={`px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                                statusFilter === 'DITOLAK'
                                    ? 'bg-rose-600 text-white shadow-sm'
                                    : 'text-rose-800 hover:bg-rose-100/60'
                            }`}
                        >
                            <XCircle className="w-3.5 h-3.5" />
                            Ditolak ({counts.ditolak})
                        </button>
                    </div>

                    {/* Search Input */}
                    <div className="relative w-full sm:w-72">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Cari SKU, Sub-Rak, Staf..."
                            className="w-full pl-9 pr-8 py-2 text-xs font-bold rounded-xl border border-slate-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none bg-white text-slate-800 shadow-sm"
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100/50">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                            <RefreshCw className="w-8 h-8 animate-spin text-amber-500 mb-3" />
                            <p className="font-bold text-sm">Memuat data karantina revisi...</p>
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border border-dashed border-slate-300 p-8 shadow-sm">
                            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-3 text-slate-400">
                                <FileText className="w-8 h-8" />
                            </div>
                            <h4 className="text-base font-black text-slate-800 uppercase tracking-wide">
                                Tidak Ada Data Karantina
                            </h4>
                            <p className="text-xs text-slate-500 max-w-sm mt-1">
                                {searchTerm 
                                    ? `Tidak ditemukan hasil yang cocok dengan kata kunci "${searchTerm}"`
                                    : statusFilter !== 'ALL'
                                        ? `Belum ada data dengan status ${statusFilter}`
                                        : 'Belum ada data OUT yang dipindahkan ke wadah karantina revisi.'}
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {filteredItems.map((item) => {
                                const isPending = item.status === 'MENUNGGU_REVISI';
                                const isApproved = item.status === 'SUDAH_REVISI';
                                const isRejected = item.status === 'DITOLAK';

                                return (
                                    <div 
                                        key={item.id}
                                        className={`bg-white rounded-2xl border p-4 sm:p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between ${
                                            isPending 
                                                ? 'border-amber-200 ring-1 ring-amber-100' 
                                                : isApproved 
                                                    ? 'border-emerald-200' 
                                                    : 'border-slate-200 opacity-80'
                                        }`}
                                    >
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                                            {/* SKU & Destination */}
                                            <div className="flex items-start gap-3">
                                                <div className="pt-0.5">
                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider ${
                                                        isPending 
                                                            ? 'bg-amber-100 text-amber-800' 
                                                            : isApproved 
                                                                ? 'bg-emerald-100 text-emerald-800' 
                                                                : 'bg-rose-100 text-rose-800'
                                                    }`}>
                                                        {isPending && <Clock className="w-3 h-3" />}
                                                        {isApproved && <CheckCircle2 className="w-3 h-3" />}
                                                        {isRejected && <XCircle className="w-3 h-3" />}
                                                        {item.status.replace('_', ' ')}
                                                    </span>
                                                </div>
                                                <div>
                                                    <h4 className="text-base font-black text-slate-900 uppercase tracking-tight">
                                                        {item.sku}
                                                    </h4>
                                                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
                                                        <span className="font-semibold text-slate-700">
                                                            {item.nama_barang || item.sku}
                                                        </span>
                                                        <span>•</span>
                                                        <span className="inline-flex items-center gap-1 font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                                                            Tujuan: Sub-Rak {item.sub_rak_tujuan || '-'}
                                                        </span>
                                                        {item.rak_asal && (
                                                            <span className="text-slate-400">
                                                                (Asal: {item.rak_asal})
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Quantities */}
                                            <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200/60 self-start md:self-auto">
                                                <div>
                                                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                                                        Qty Pulih (Tarik)
                                                    </span>
                                                    <span className="text-lg font-black text-emerald-700">
                                                        {item.jumlah.toLocaleString()} <span className="text-xs font-bold text-slate-500">pcs</span>
                                                    </span>
                                                </div>
                                                {item.sisa_fisik_belum_cocok > 0 && (
                                                    <div className="border-l border-slate-200 pl-3">
                                                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-500 block">
                                                            Sisa Belum Ada Data
                                                        </span>
                                                        <span className="text-lg font-black text-rose-600">
                                                            +{item.sisa_fisik_belum_cocok.toLocaleString()} <span className="text-xs font-bold text-slate-500">pcs</span>
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Transaction Details Grid */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 my-3 text-xs">
                                            <div className="bg-slate-50 p-2.5 rounded-xl">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                                                    Log OUT Terdampak
                                                </span>
                                                <p className="font-extrabold text-slate-800">
                                                    ID #{item.original_log_id || 'N/A'}
                                                </p>
                                                <p className="text-[11px] text-slate-500">
                                                    Tgl: {item.tgl_out_asli || '-'}
                                                </p>
                                            </div>

                                            <div className="bg-slate-50 p-2.5 rounded-xl">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                                                    Pemotong OUT Asli
                                                </span>
                                                <p className="font-extrabold text-slate-800">
                                                    {item.user_pemotong_out || '-'}
                                                </p>
                                                <p className="text-[11px] text-slate-500 truncate" title={item.keterangan_out_asli || '-'}>
                                                    Ket: {item.keterangan_out_asli || '-'}
                                                </p>
                                            </div>

                                            <div className="bg-slate-50 p-2.5 rounded-xl">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                                                    Penarik di Stock Opname
                                                </span>
                                                <p className="font-extrabold text-slate-800">
                                                    {item.user_penarik || 'Staf'}
                                                </p>
                                                <p className="text-[11px] text-slate-500">
                                                    {new Date(item.created_at).toLocaleDateString('id-ID', {
                                                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                                                    })}
                                                </p>
                                            </div>

                                            <div className="bg-slate-50 p-2.5 rounded-xl">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                                                    Revisi Accurate
                                                </span>
                                                <p className="font-extrabold text-slate-800">
                                                    {item.revisi_by ? `${item.revisi_by}` : 'Belum dicek'}
                                                </p>
                                                <p className="text-[11px] text-slate-500 truncate" title={item.catatan_crosscheck || '-'}>
                                                    {item.catatan_crosscheck || 'Menunggu revisi tim crosscheck'}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                                            {/* WhatsApp Copy Button */}
                                            <button
                                                onClick={() => handleCopyWa(item)}
                                                className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-black text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
                                            >
                                                {copiedId === item.id ? (
                                                    <>
                                                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                                                        <span>Format WA Tersalin!</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                                                        <span>Salin Laporan WA</span>
                                                    </>
                                                )}
                                            </button>

                                            {/* Admin / Dev Controls */}
                                            {canManageRevisi && (
                                                <div className="flex items-center gap-2">
                                                    {isPending ? (
                                                        <>
                                                            <button
                                                                onClick={() => setConfirmModal({
                                                                    isOpen: true,
                                                                    item,
                                                                    action: 'reject',
                                                                    note: '',
                                                                    isSubmitting: false
                                                                })}
                                                                className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-black text-xs uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer"
                                                            >
                                                                <X className="w-3.5 h-3.5 text-rose-600" />
                                                                <span>Tolak</span>
                                                            </button>
                                                            <button
                                                                onClick={() => setConfirmModal({
                                                                    isOpen: true,
                                                                    item,
                                                                    action: 'approve',
                                                                    note: '',
                                                                    isSubmitting: false
                                                                })}
                                                                className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm cursor-pointer active:scale-95"
                                                            >
                                                                <CheckCircle2 className="w-4 h-4" />
                                                                <span>Tandai Sudah Revisi</span>
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button
                                                            onClick={() => setConfirmModal({
                                                                isOpen: true,
                                                                item,
                                                                action: isApproved ? 'reject' : 'approve',
                                                                note: '',
                                                                isSubmitting: false
                                                            })}
                                                            className="px-3 py-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 font-bold text-xs transition-all"
                                                        >
                                                            Ubah Status
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs text-slate-500">
                    <p>
                        💡 <strong>Catatan:</strong> Data di wadah ini adalah transaksi OUT yang batal turun &amp; ditarik ke sub-rak di menu Stock Opname.
                    </p>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-black text-xs uppercase tracking-wider transition-colors cursor-pointer"
                    >
                        Tutup
                    </button>
                </div>
            </div>

            {/* Confirmation Sub-Modal */}
            {confirmModal.isOpen && confirmModal.item && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[130] flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-6 border border-slate-200 animate-in zoom-in-95">
                        <div className="flex items-center gap-3 mb-4">
                            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                                confirmModal.action === 'approve' 
                                    ? 'bg-emerald-100 text-emerald-700' 
                                    : 'bg-rose-100 text-rose-700'
                            }`}>
                                {confirmModal.action === 'approve' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                            </div>
                            <div>
                                <h4 className="text-lg font-black uppercase text-slate-900">
                                    {confirmModal.action === 'approve' ? 'Konfirmasi Sudah Revisi' : 'Tolak / Batalkan'}
                                </h4>
                                <p className="text-xs text-slate-500">
                                    SKU: <strong className="text-slate-800">{confirmModal.item.sku}</strong> ({confirmModal.item.jumlah} pcs)
                                </p>
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">
                                {confirmModal.action === 'approve' 
                                    ? 'Nomor Nota Revisi / Catatan Accurate (Opsional):' 
                                    : 'Alasan Penolakan:'}
                            </label>
                            <input
                                type="text"
                                value={confirmModal.note}
                                onChange={(e) => setConfirmModal(prev => ({ ...prev, note: e.target.value }))}
                                placeholder={confirmModal.action === 'approve' ? 'Contoh: Sudah batal nota #INV-8891 di Accurate' : 'Contoh: Fisik barang ternyata milik toko lain'}
                                className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                            />
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                            <button
                                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                                disabled={confirmModal.isSubmitting}
                                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-xs uppercase cursor-pointer"
                            >
                                Batal
                            </button>
                            <button
                                onClick={handleExecuteStatusUpdate}
                                disabled={confirmModal.isSubmitting}
                                className={`px-4 py-2 rounded-xl text-white font-black text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-md ${
                                    confirmModal.action === 'approve' 
                                        ? 'bg-emerald-600 hover:bg-emerald-700' 
                                        : 'bg-rose-600 hover:bg-rose-700'
                                }`}
                            >
                                {confirmModal.isSubmitting ? (
                                    <>
                                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                        <span>Menyimpan...</span>
                                    </>
                                ) : (
                                    <>
                                        {confirmModal.action === 'approve' ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                                        <span>{confirmModal.action === 'approve' ? 'Tandai Sudah Revisi' : 'Konfirmasi Tolak'}</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Custom Toast inside Modal */}
            {toastMessage && (
                <div className={`fixed bottom-6 right-6 z-[140] px-4 py-3 rounded-2xl shadow-xl border text-xs font-black uppercase tracking-wider flex items-center gap-2 animate-in slide-in-from-bottom-5 ${
                    toastMessage.type === 'success' 
                        ? 'bg-emerald-600 text-white border-emerald-500' 
                        : toastMessage.type === 'error'
                            ? 'bg-rose-600 text-white border-rose-500'
                            : 'bg-slate-900 text-white border-slate-800'
                }`}>
                    {toastMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    <span>{toastMessage.text}</span>
                </div>
            )}
        </div>
    );
};
