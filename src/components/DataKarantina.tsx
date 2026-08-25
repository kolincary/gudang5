import React, { useState, useEffect } from 'react';
import { Button } from './ui/Button';
import { RefreshCw, Search, X, Trash2, AlertTriangle, Send } from 'lucide-react';
import { Toast } from './ui/Toast';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { supabase } from '../lib/supabase';

interface QuarantineItem {
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

interface ToastState {
    show: boolean;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
}

export const DataKarantina: React.FC = () => {
    const [rows, setRows] = useState<QuarantineItem[]>([]);
    const [filteredRows, setFilteredRows] = useState<QuarantineItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'info' });
    const [actionConfirm, setActionConfirm] = useState<{ isOpen: boolean; rowId: string | null; action: 'delete' | 'resend' | null }>({
        isOpen: false,
        rowId: null,
        action: null
    });
    const [clearConfirm, setClearConfirm] = useState(false);

    const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning') => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
    };

    const fetchQuarantineItems = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('quarantined_items')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            const formattedData = (data || []).map(item => ({
                ...item,
                validation_errors: item.validation_errors || []
            }));

            setRows(formattedData);
            setFilteredRows(formattedData);
        } catch (error) {
            console.error('Error fetching quarantine items:', error);
            showToast('Gagal memuat data karantina dari database', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchQuarantineItems();

        const channel = supabase
            .channel('public:quarantined_items')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'quarantined_items' }, () => {
                fetchQuarantineItems();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const handleDelete = async () => {
        if (!actionConfirm.rowId || actionConfirm.action !== 'delete') return;

        try {
            const { error } = await supabase
                .from('quarantined_items')
                .delete()
                .eq('id', actionConfirm.rowId);

            if (error) throw error;

            showToast('Data berhasil dihapus dari karantina', 'success');
        } catch (error) {
            console.error('Error deleting item:', error);
            showToast('Gagal menghapus data', 'error');
        } finally {
            setActionConfirm({ isOpen: false, rowId: null, action: null });
        }
    };

    // --- Helper Functions from InputBarangKeluar (Replicated for Stability) ---
    // calculateAvailableStock removed as it was unused and checkBatchStock is used for "Logika Validasi"


    const checkBatchStock = async (sku: string, rak: string, tglScan: string): Promise<{ sisa: number; hasIn: boolean }> => {
        if (!sku || !rak || !tglScan) return { sisa: 0, hasIn: false };

        try {
            const variations = [tglScan.trim()];
            if (tglScan.includes('-')) {
                const parts = tglScan.split('-');
                if (parts[0].length === 2 && parts[2].length === 4) {
                    variations.push(`${parts[2]}-${parts[1]}-${parts[0]}`); // dd-mm-yyyy -> yyyy-mm-dd
                } else if (parts[0].length === 4 && parts[2].length === 2) {
                    variations.push(`${parts[2]}-${parts[1]}-${parts[0]}`); // yyyy-mm-dd -> dd-mm-yyyy
                }
            }
            if (tglScan.includes('/')) {
                const parts = tglScan.split('/');
                if (parts[0].length === 2 && parts[2].length === 4) {
                    variations.push(`${parts[0]}-${parts[1]}-${parts[2]}`);
                    variations.push(`${parts[2]}-${parts[1]}-${parts[0]}`);
                }
            }
            const uniqueVariations = [...new Set(variations)];

            const { data: logs, error } = await supabase
                .from('database_log')
                .select('jumlah, type, tgl_scan')
                .ilike('sku', sku.trim())
                .ilike('rak', rak.trim())
                .in('tgl_scan', uniqueVariations);

            if (error || !logs) return { sisa: 0, hasIn: false };

            const totalIn = logs.filter(l => l.type === 'IN').reduce((sum, l) => sum + (l.jumlah || 0), 0);
            const totalOut = logs.filter(l => l.type === 'OUT').reduce((sum, l) => sum + (l.jumlah || 0), 0);

            return { sisa: totalIn - totalOut, hasIn: totalIn > 0 };
        } catch (err) {
            console.error('Error checking batch stock:', err);
            return { sisa: 0, hasIn: false };
        }
    };

    const handleResend = async () => {
        if (!actionConfirm.rowId || actionConfirm.action !== 'resend') return;

        const itemToResend = rows.find(r => r.id === actionConfirm.rowId);
        if (!itemToResend) return;

        try {
            setLoading(true); // Show loading state

            // 1. Validasi Data Dasar
            if (!itemToResend.nama_produk || !itemToResend.rak || !itemToResend.gudang || !itemToResend.jumlah) {
                showToast('Data tidak lengkap (SKU, Rak, Gudang, atau Jumlah kosong)', 'error');
                return;
            }

            // 2. Validasi Batch Stock (Khusus untuk Barang Keluar / OUT)
            if (itemToResend.type === 'OUT') {
                const batchStatus = await checkBatchStock(itemToResend.nama_produk, itemToResend.rak, itemToResend.tgl_scan);

                // Jika tidak ada stok masuk sama sekali untuk batch ini
                if (!batchStatus.hasIn) {
                    showToast(`Validasi Gagal: Tidak ada stok masuk (IN) untuk item ini di rak ${itemToResend.rak} pada tgl scan ${itemToResend.tgl_scan}`, 'error');
                    return;
                }

                // Jika stok tidak cukup (Sisa < Jumlah yang mau dikeluarkan)
                if (batchStatus.sisa < itemToResend.jumlah) {
                    showToast(`Validasi Gagal: Stok tidak cukup! Tersedia: ${batchStatus.sisa}, Diminta: ${itemToResend.jumlah}`, 'error');
                    return;
                }
            }

            // 3. Prepare Log Entry
            const logEntry = {
                tanggal: itemToResend.tanggal,
                waktu: itemToResend.waktu,
                sku: itemToResend.nama_produk, // Perbaiki mapping field (nama_produk -> sku)
                jumlah: itemToResend.jumlah,
                type: itemToResend.type,
                gudang: itemToResend.gudang,
                rak: itemToResend.rak,
                tgl_scan: itemToResend.tgl_scan,
                user_name: itemToResend.user_name,
                // status: 'OK', // Removed as per database_log schema usually doesn't have status or it's different
                // keterangan: 'Resent from Quarantine' // Adding remarks if col exists, else omit. Safe to omit for now or check schema.
            };

            // 4. Insert to database_log
            const { error: insertError } = await supabase
                .from('database_log')
                .insert([logEntry]);

            if (insertError) throw insertError;

            // 5. Delete from quarantine
            const { error: deleteError } = await supabase
                .from('quarantined_items')
                .delete()
                .eq('id', itemToResend.id);

            if (deleteError) {
                // Should practically not happen if insert worked, but handle gracefully
                showToast('Data terkirim tapi gagal dihapus dari karantina', 'warning');
            } else {
                showToast('Data berhasil dikirim ulang ke Database Log dan dihapus dari Karantina', 'success');
                // Refresh list
                const newRows = rows.filter(r => r.id !== itemToResend.id);
                setRows(newRows);
                setFilteredRows(prev => prev.filter(r => r.id !== itemToResend.id));
            }

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
            const { error } = await supabase
                .from('quarantined_items')
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows

            if (error) throw error;
            showToast('Semua data karantina berhasil dihapus', 'success');
        } catch (error) {
            console.error('Error clearing data:', error);
            showToast('Gagal menghapus data', 'error');
        } finally {
            setClearConfirm(false);
        }
    };

    const handleSearch = (value: string) => {
        setSearchTerm(value);
        if (value.trim() === '') {
            setFilteredRows(rows);
        } else {
            const lowerVal = value.toLowerCase();
            const filtered = rows.filter(row =>
                row.nama_produk?.toLowerCase().includes(lowerVal) ||
                row.rak?.toLowerCase().includes(lowerVal) ||
                row.gudang?.toLowerCase().includes(lowerVal) ||
                row.user_name?.toLowerCase().includes(lowerVal) ||
                row.validation_errors?.join(' ').toLowerCase().includes(lowerVal)
            );
            setFilteredRows(filtered);
        }
    };

    const getErrorMessage = (errors: string[]) => {
        if (!errors || errors.length === 0) return 'Tidak diketahui';
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

    return (
        <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-800 relative overflow-hidden">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-100/30 blur-[120px] rounded-full z-0 animate-pulse"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-100/20 blur-[120px] rounded-full z-0"></div>

            <div className="max-w-[1920px] mx-auto relative z-10">
                {/* PREMIUM IMMERSIVE HEADER (310px) - ORANGE */}
                <div className="flex flex-col mb-8 lg:mb-12 uppercase">
                    <div className="bg-gradient-to-br from-orange-700 via-amber-800 to-slate-900 pt-[90px] lg:pt-0 lg:h-[310px] pb-[75px] lg:pb-0 px-6 lg:px-12 rounded-b-[40px] lg:rounded-b-[55px] shadow-2xl shadow-orange-900/40 relative overflow-hidden transition-all duration-500 flex flex-col justify-center">
                        <div className="absolute -top-12 -right-12 text-white opacity-5">
                            <AlertTriangle className="w-72 h-72 lg:w-[480px] lg:h-[480px]" />
                        </div>
                        <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-orange-500/10 rounded-full blur-3xl animate-pulse"></div>
                        <div className="absolute bottom-1/4 right-1/4 w-24 h-24 bg-amber-500/10 rounded-3xl rotate-45 blur-2xl"></div>
                        <div className="relative z-10 w-full flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 uppercase text-left">
                            <div className="max-w-2xl">
                                <div className="flex items-center gap-2 mb-3 lg:mb-4 opacity-90">
                                    <div className="w-10 h-[2px] bg-orange-400 rounded-full"></div>
                                    <span className="text-[10px] lg:text-[12px] font-black tracking-[0.4em] text-orange-100">Monitoring Stok</span>
                                </div>
                                <h1 className="text-[34px] lg:text-[54px] font-black text-white tracking-tighter leading-[0.9] mb-3 uppercase">
                                    Data <span className="text-orange-400">Karantina</span>
                                </h1>
                                <div className="text-orange-100/80 font-medium text-[14px] lg:text-[18px] leading-relaxed max-w-[90%] normal-case flex items-center gap-3">
                                    <div className="px-3 py-1 bg-white/10 rounded-full backdrop-blur-sm border border-white/10 flex items-center gap-2">
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                                        </span>
                                        <span className="text-[11px] font-bold tracking-widest uppercase">{filteredRows.length} Item</span>
                                    </div>
                                    <span className="text-[13px] lg:text-[16px]">Data scan yang gagal validasi</span>
                                </div>
                            </div>
                            <div className="relative z-10 flex flex-wrap gap-2 lg:gap-3 lg:mb-2 items-center">
                                <Button
                                    onClick={fetchQuarantineItems}
                                    className="h-12 px-5 bg-white/10 hover:bg-white/20 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 border border-white/30 backdrop-blur-xl"
                                >
                                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                                    <span className="uppercase text-[10px] font-black">Refresh</span>
                                </Button>
                                <Button
                                    onClick={() => setClearConfirm(true)}
                                    className="h-12 px-6 bg-white hover:bg-orange-50 text-orange-700 font-black rounded-2xl shadow-[0_8px_25px_rgba(255,255,255,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2.5 border-none"
                                    disabled={rows.length === 0}
                                >
                                    <Trash2 className="h-4 w-4" />
                                    <span className="uppercase text-xs font-black">Hapus Semua</span>
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="p-4 md:p-6 lg:p-10 space-y-6">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="relative flex-1 group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <Search className="h-5 w-5 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
                            </div>
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => handleSearch(e.target.value)}
                                placeholder="Cari SKU, Lokasi, Error, atau User..."
                                className="block w-full pl-12 pr-12 py-4 bg-white/70 backdrop-blur-xl border border-white/50 rounded-2xl text-[15px] font-medium shadow-sm transition-all duration-300 focus:ring-4 focus:ring-orange-500/5 focus:border-orange-500/50 focus:bg-white placeholder:text-slate-400 outline-none"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => handleSearch('')}
                                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-orange-500 transition-colors"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="bg-white/40 backdrop-blur-3xl rounded-[2.5rem] border border-white/50 shadow-2xl shadow-slate-200/40 overflow-hidden">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-32 text-slate-400">
                                <RefreshCw className="h-16 w-16 animate-spin mb-6 text-orange-400" />
                                <p className="text-slate-600 font-black text-xs uppercase tracking-[0.3em] animate-pulse">Memuat Data...</p>
                            </div>
                        ) : filteredRows.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-32 text-slate-400">
                                <div className="bg-white/80 p-10 rounded-[2.5rem] mb-6 shadow-sm border border-white">
                                    <AlertTriangle className="h-16 w-16 text-slate-200" />
                                </div>
                                <h3 className="text-xl font-black text-slate-800 mb-2">Karantina Kosong</h3>
                                <p className="text-slate-500 text-sm max-w-xs text-center font-medium leading-relaxed">
                                    {searchTerm ? 'Tidak ada data yang cocok dengan pencarian.' : 'Tidak ada data yang dikarantina saat ini.'}
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-center border-collapse">
                                    <thead>
                                        <tr className="bg-white/50 border-b border-slate-100">
                                            <th className="px-4 py-4 font-black text-slate-400 uppercase tracking-widest text-[10px]">No</th>
                                            <th className="px-4 py-4 font-black text-slate-400 uppercase tracking-widest text-[10px]">Tanggal</th>
                                            <th className="px-4 py-4 font-black text-slate-400 uppercase tracking-widest text-[10px]">Waktu</th>
                                            <th className="px-4 py-4 font-black text-slate-400 uppercase tracking-widest text-[10px]">Nama Produk</th>
                                            <th className="px-4 py-4 font-black text-slate-400 uppercase tracking-widest text-[10px]">Jumlah</th>
                                            <th className="px-4 py-4 font-black text-slate-400 uppercase tracking-widest text-[10px]">Type</th>
                                            <th className="px-4 py-4 font-black text-slate-400 uppercase tracking-widest text-[10px]">Gudang</th>
                                            <th className="px-4 py-4 font-black text-slate-400 uppercase tracking-widest text-[10px]">Rak</th>
                                            <th className="px-4 py-4 font-black text-slate-400 uppercase tracking-widest text-[10px]">Tgl Scan</th>
                                            <th className="px-4 py-4 font-black text-slate-400 uppercase tracking-widest text-[10px]">User</th>
                                            <th className="px-4 py-4 font-black text-slate-400 uppercase tracking-widest text-[10px]">Validation Errors</th>
                                            <th className="px-4 py-4 font-black text-slate-400 uppercase tracking-widest text-[10px]">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {filteredRows.map((row, index) => (
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
                                                            onClick={() => setActionConfirm({ isOpen: true, rowId: row.id, action: 'resend' })}
                                                            className="h-8 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg text-xs font-bold flex items-center gap-1 border border-emerald-200"
                                                            title="Kirim Ulang ke Database Log"
                                                        >
                                                            <Send className="h-3 w-3" />
                                                            Resend
                                                        </Button>
                                                        <Button
                                                            onClick={() => setActionConfirm({ isOpen: true, rowId: row.id, action: 'delete' })}
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
                </div>
            </div>

            {/* Modals */}
            <Toast
                isOpen={toast.show}
                message={toast.message}
                type={toast.type}
                onClose={() => setToast({ ...toast, show: false })}
            />

            <ConfirmDialog
                isOpen={actionConfirm.isOpen && actionConfirm.action === 'delete'}
                onClose={() => setActionConfirm({ isOpen: false, rowId: null, action: null })}
                onConfirm={handleDelete}
                title="Hapus Data Karantina"
                message="Apakah Anda yakin ingin menghapus data ini secara permanen?"
                confirmText="Hapus"
                cancelText="Batal"
            />

            <ConfirmDialog
                isOpen={actionConfirm.isOpen && actionConfirm.action === 'resend'}
                onClose={() => setActionConfirm({ isOpen: false, rowId: null, action: null })}
                onConfirm={handleResend}
                title="Kirim Ulang Data"
                message="Apakah Anda yakin ingin mengirim ulang data ini ke Database Log? Pastikan data sudah valid."
                confirmText="Kirim"
                cancelText="Batal"
            />

            <ConfirmDialog
                isOpen={clearConfirm}
                onClose={() => setClearConfirm(false)}
                onConfirm={handleClearAll}
                title="Hapus Semua Data"
                message="Apakah Anda yakin ingin mengosongkan seluruh data karantina? Tindakan ini tidak dapat dibatalkan."
                confirmText="Hapus Semua"
                cancelText="Batal"
            />
        </div>
    );
};
