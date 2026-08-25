import React, { useState, useEffect } from 'react';
import { Button } from './ui/Button';
import { RefreshCw, Eye, Search, X, Trash2, Send } from 'lucide-react';
import { Toast } from './ui/Toast';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';

interface MinusStockRow {
    id: string;
    tanggal: string;
    waktu: string;
    nama_produk: string;
    jumlah: number;
    gudang: string;
    rak: string;
    sub_rak: string;
    tgl_scan: string;
    user_name: string;
    stok_tersedia: number;
    total_stok: number;
    packing?: string;
    moved_at: string;
}

interface ToastState {
    show: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
}

export const StokMinus: React.FC = () => {
    const [rows, setRows] = useState<MinusStockRow[]>([]);
    const [filteredRows, setFilteredRows] = useState<MinusStockRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'info' });
    const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; rowId: string | null }>({
        isOpen: false,
        rowId: null
    });
    const [sendingRows, setSendingRows] = useState<Set<string>>(new Set());

    const showToast = (message: string, type: 'success' | 'error' | 'info') => {
        setToast({ show: true, message, type });
    };

    const loadMinusStockData = async () => {
        setLoading(true);
        try {
            const { data: minusData, error: minusError } = await supabase
                .from('minus_stock')
                .select('*')
                .order('moved_at', { ascending: false });

            if (minusError) {
                console.error('Error loading minus stock:', minusError);
                showToast('Gagal memuat data stok minus', 'error');
                return;
            }

            if (!minusData || minusData.length === 0) {
                setRows([]);
                setFilteredRows([]);
                return;
            }

            const productNames = Array.from(new Set(minusData.map(item => item.nama_produk)));

            const { data: stockData, error: stockError } = await supabase
                .from('stock_items')
                .select('nama_produk, rak, tersedia')
                .in('nama_produk', productNames);

            if (stockError) {
                console.error('Error fetching current stock:', stockError);
            }

            const stockMap = new Map<string, number>();
            if (stockData) {
                stockData.forEach(item => {
                    const key = `${item.nama_produk?.toLowerCase().trim()}|${item.rak?.toLowerCase().trim()}`;
                    stockMap.set(key, item.tersedia || 0);
                });
            }

            const updatedRows = minusData.map((row) => {
                const key = `${row.nama_produk?.toLowerCase().trim()}|${row.rak?.toLowerCase().trim()}`;
                const currentStock = stockMap.get(key) || 0;

                return {
                    ...row,
                    stok_tersedia: currentStock,
                    total_stok: currentStock - row.jumlah
                };
            });

            setRows(updatedRows);
            setFilteredRows(updatedRows);

        } catch (error) {
            console.error('Error:', error);
            showToast('Terjadi kesalahan saat memuat data', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSendToDatabase = async (row: MinusStockRow) => {
        if (row.total_stok < 0) {
            showToast('Tidak dapat mengirim data dengan total stok minus', 'error');
            return;
        }

        setSendingRows(prev => new Set(prev).add(row.id));

        try {
            const logData = {
                tgl: format(new Date(row.tanggal), 'dd/MM/yyyy'),
                waktu: row.waktu,
                sku: row.nama_produk,
                jumlah: row.jumlah,
                type: 'OUT',
                gudang: row.gudang,
                rak: row.rak,
                sub_rak: row.sub_rak,
                tgl_scan: row.tgl_scan || null,
                user_name: row.user_name || null
            };

            const { error: insertError } = await supabase
                .from('database_log')
                .insert([logData]);

            if (insertError) {
                console.error('Error inserting to database_log:', insertError);
                showToast('Gagal mengirim data ke database', 'error');
                return;
            }

            const { error: deleteError } = await supabase
                .from('minus_stock')
                .delete()
                .eq('id', row.id);

            if (deleteError) {
                console.error('Error deleting from minus_stock:', deleteError);
                showToast('Data terkirim tapi gagal dihapus dari stok minus', 'error');
                return;
            }

            showToast('Data berhasil dikirim ke database', 'success');
            loadMinusStockData();
        } catch (error) {
            console.error('Error:', error);
            showToast('Terjadi kesalahan saat mengirim data', 'error');
        } finally {
            setSendingRows(prev => {
                const newSet = new Set(prev);
                newSet.delete(row.id);
                return newSet;
            });
        }
    };

    const handleDelete = async () => {
        if (!deleteConfirm.rowId) return;

        try {
            const { error } = await supabase
                .from('minus_stock')
                .delete()
                .eq('id', deleteConfirm.rowId);

            if (error) {
                console.error('Error deleting:', error);
                showToast('Gagal menghapus data', 'error');
                return;
            }

            showToast('Data berhasil dihapus', 'success');
            loadMinusStockData();
        } catch (error) {
            console.error('Error:', error);
            showToast('Terjadi kesalahan saat menghapus data', 'error');
        } finally {
            setDeleteConfirm({ isOpen: false, rowId: null });
        }
    };

    const handleSearch = (value: string) => {
        setSearchTerm(value);
        if (value.trim() === '') {
            setFilteredRows(rows);
        } else {
            const filtered = rows.filter(row =>
                row.nama_produk.toLowerCase().includes(value.toLowerCase()) ||
                row.rak.toLowerCase().includes(value.toLowerCase()) ||
                row.gudang.toLowerCase().includes(value.toLowerCase())
            );
            setFilteredRows(filtered);
        }
    };

    useEffect(() => {
        loadMinusStockData();

        const channel = supabase
            .channel('minus_stock_changes')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'minus_stock' },
                () => {
                    loadMinusStockData();
                }
            )
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'data_gudang' },
                () => {
                    loadMinusStockData();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    useEffect(() => {
        handleSearch(searchTerm);
    }, [rows]);

    return (
        <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-800 relative overflow-hidden">
            {/* Background Decorative Elements */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-red-100/30 blur-[120px] rounded-full z-0 animate-pulse"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-100/20 blur-[120px] rounded-full z-0"></div>

            <div className="max-w-[1920px] mx-auto relative z-10">
                {/* PREMIUM IMMERSIVE HEADER (310px) - RED */}
                <div className="flex flex-col mb-8 lg:mb-12 uppercase">
                    <div className="bg-gradient-to-br from-red-700 via-rose-800 to-slate-900 pt-[90px] lg:pt-0 lg:h-[310px] pb-[75px] lg:pb-0 px-6 lg:px-12 rounded-b-[40px] lg:rounded-b-[55px] shadow-2xl shadow-red-900/40 relative overflow-hidden transition-all duration-500 flex flex-col justify-center">
                        <div className="absolute -top-12 -right-12 text-white opacity-5">
                            <RefreshCw className="w-72 h-72 lg:w-[480px] lg:h-[480px]" />
                        </div>
                        <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-red-500/10 rounded-full blur-3xl animate-pulse"></div>
                        <div className="absolute bottom-1/4 right-1/4 w-24 h-24 bg-rose-500/10 rounded-3xl rotate-45 blur-2xl"></div>
                        <div className="relative z-10 w-full flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 uppercase text-left">
                            <div className="max-w-2xl">
                                <div className="flex items-center gap-2 mb-3 lg:mb-4 opacity-90">
                                    <div className="w-10 h-[2px] bg-red-400 rounded-full"></div>
                                    <span className="text-[10px] lg:text-[12px] font-black tracking-[0.4em] text-red-100">Monitoring Stok</span>
                                </div>
                                <h1 className="text-[34px] lg:text-[54px] font-black text-white tracking-tighter leading-[0.9] mb-3 uppercase">
                                    Stok <span className="text-red-400">Minus</span>
                                </h1>
                                <div className="text-red-100/80 font-medium text-[14px] lg:text-[18px] leading-relaxed max-w-[90%] normal-case flex items-center gap-3">
                                    <div className="px-3 py-1 bg-white/10 rounded-full backdrop-blur-sm border border-white/10 flex items-center gap-2">
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                        </span>
                                        <span className="text-[11px] font-bold tracking-widest uppercase">{filteredRows.length} Temuan</span>
                                    </div>
                                    <span className="text-[13px] lg:text-[16px]">Barang keluar yang melampaui stok tersedia</span>
                                </div>
                            </div>
                            <div className="relative z-10 flex flex-wrap gap-2 lg:gap-3 lg:mb-2 items-center">
                                <Button
                                    onClick={loadMinusStockData}
                                    className="h-12 px-6 bg-white hover:bg-red-50 text-red-700 font-black rounded-2xl shadow-[0_8px_25px_rgba(255,255,255,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2.5 border-none"
                                    disabled={loading}
                                >
                                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                                    <span className="uppercase text-xs font-black">{loading ? 'Loading...' : 'Refresh'}</span>
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="p-4 md:p-6 lg:p-10 space-y-6">
                    {/* Search Bar */}
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="relative flex-1 group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <Search className="h-5 w-5 text-slate-400 group-focus-within:text-red-500 transition-colors" />
                            </div>
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => handleSearch(e.target.value)}
                                placeholder="Cari SKU, Lokasi, atau Gudang..."
                                className="block w-full pl-12 pr-12 py-4 bg-white/70 backdrop-blur-xl border border-white/50 rounded-2xl text-[15px] font-medium shadow-sm transition-all duration-300 focus:ring-4 focus:ring-red-500/5 focus:border-red-500/50 focus:bg-white placeholder:text-slate-400 outline-none"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => handleSearch('')}
                                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-red-500 transition-colors"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Table Container */}
                    <div className="bg-white/40 backdrop-blur-3xl rounded-[2.5rem] border border-white/50 shadow-2xl shadow-slate-200/40 overflow-hidden">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-32 text-slate-400">
                                <RefreshCw className="h-16 w-16 animate-spin mb-6 text-red-500" />
                                <p className="text-slate-600 font-black text-xs uppercase tracking-[0.3em] animate-pulse">Memuat Data...</p>
                            </div>
                        ) : filteredRows.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-32 text-slate-400">
                                <div className="bg-white/80 p-10 rounded-[2.5rem] mb-6 shadow-sm border border-white">
                                    <Eye className="h-16 w-16 text-slate-200" />
                                </div>
                                <h3 className="text-xl font-black text-slate-800 mb-2">Data Bersih</h3>
                                <p className="text-slate-500 text-sm max-w-xs text-center font-medium leading-relaxed">
                                    {searchTerm ? 'Kami tidak menemukan data dengan kata kunci tersebut.' : 'Tidak ada temuan stok minus terdeteksi saat ini.'}
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
                                            <th className="px-4 py-4 font-black text-slate-400 uppercase tracking-widest text-[10px]">Stok Tersedia</th>
                                            <th className="px-4 py-4 font-black text-slate-400 uppercase tracking-widest text-[10px]">Sisa</th>
                                            <th className="px-4 py-4 font-black text-slate-400 uppercase tracking-widest text-[10px]">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {filteredRows.map((row, index) => (
                                            <tr key={row.id} className="hover:bg-white/80 transition-colors group">
                                                <td className="px-4 py-3 text-slate-400 font-mono font-bold">{index + 1}</td>
                                                <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap">{format(new Date(row.tanggal), 'dd/MM/yyyy')}</td>
                                                <td className="px-4 py-3 font-medium text-slate-500 font-mono whitespace-nowrap">{row.waktu}</td>
                                                <td className="px-4 py-3 font-bold text-slate-900 text-left">{row.nama_produk}</td>
                                                <td className="px-4 py-3">
                                                    <span className="inline-flex px-2 py-1 rounded bg-red-100 font-bold text-red-700">{row.jumlah}</span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="inline-flex px-2 py-1 rounded text-xs font-bold bg-blue-100 text-blue-700">
                                                        OUT
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 font-medium text-slate-600">{row.gudang}</td>
                                                <td className="px-4 py-3 font-bold text-yellow-600 bg-yellow-50 rounded">{row.rak}</td>
                                                <td className="px-4 py-3 font-medium text-blue-600 whitespace-nowrap">{row.tgl_scan || '-'}</td>
                                                <td className="px-4 py-3 font-medium text-slate-500">{row.user_name || '-'}</td>
                                                <td className="px-4 py-3 font-bold text-slate-700">{row.stok_tersedia}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex px-2 py-1 rounded text-xs font-bold ${row.total_stok < 0 ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'}`}>
                                                        {row.total_stok}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex gap-2 justify-center">
                                                        {row.total_stok >= 0 && (
                                                            <Button
                                                                onClick={() => handleSendToDatabase(row)}
                                                                className="h-8 w-8 p-0 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg border border-emerald-200 flex items-center justify-center"
                                                                title="Kirim ke Database Log"
                                                                disabled={sendingRows.has(row.id)}
                                                            >
                                                                <Send className={`h-4 w-4 ${sendingRows.has(row.id) ? 'animate-pulse' : ''}`} />
                                                            </Button>
                                                        )}
                                                        <Button
                                                            onClick={() => setDeleteConfirm({ isOpen: true, rowId: row.id })}
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

                {/* Mobile Card View */}
                <div className="lg:hidden p-6 space-y-6">
                    {filteredRows.map((row) => (
                        <div key={row.id} className="bg-white/80 rounded-3xl border border-white shadow-xl shadow-slate-200/50 overflow-hidden overflow-hidden transition-all active:scale-[0.98]">
                            <div className="p-6 pb-4 flex justify-between items-start gap-4">
                                <div className="flex-1">
                                    <h3 className="font-black text-slate-900 text-lg leading-tight mb-2">{row.nama_produk}</h3>
                                    <div className="flex flex-wrap gap-2">
                                        <span className="px-2 py-1 rounded-md bg-slate-800 text-white text-[9px] font-black uppercase tracking-widest">{row.gudang}</span>
                                        <span className="px-2 py-1 rounded-md bg-yellow-400 text-yellow-900 text-[9px] font-black uppercase tracking-widest">{row.rak}</span>
                                        {row.packing && (
                                            <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-500 text-[9px] font-black uppercase tracking-widest border border-slate-200">📦 {row.packing}</span>
                                        )}
                                    </div>
                                </div>
                                <div className="bg-red-50 px-4 py-2 rounded-2xl border border-red-100/50 text-center min-w-[60px]">
                                    <span className="block text-[9px] font-black text-red-500 uppercase tracking-tighter">Minus</span>
                                    <span className="block font-black text-red-600 text-xl">-{row.jumlah}</span>
                                </div>
                            </div>

                            <div className="px-6 py-4 bg-slate-50/50 grid grid-cols-2 gap-4 border-y border-slate-100">
                                <div className="space-y-3">
                                    <div>
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Transaksi</span>
                                        <div className="text-slate-800 font-bold text-[13px]">
                                            {format(new Date(row.tanggal), 'dd/MM/yy')} <span className="opacity-30 mx-1">|</span> {row.waktu}
                                        </div>
                                    </div>
                                    <div>
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1 text-blue-500">Tgl Scan</span>
                                        <div className="text-blue-600 font-black text-[14px]">
                                            {row.tgl_scan || '-'}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end justify-between">
                                    <div className={`p-3 rounded-2xl border w-full text-center ${row.total_stok < 0
                                        ? 'bg-red-500 border-red-400 text-white shadow-lg shadow-red-500/20'
                                        : 'bg-emerald-500 border-emerald-400 text-white shadow-lg shadow-emerald-500/20'
                                        }`}>
                                        <span className="block text-[9px] font-black uppercase tracking-widest opacity-80 decoration-white/30 mb-0.5">Sisa Akhir</span>
                                        <span className="block font-black text-xl leading-none">{row.total_stok}</span>
                                    </div>
                                    <div className="text-[10px] font-bold text-slate-400 mt-2 truncate max-w-full italic">
                                        User: {row.user_name || '-'}
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 flex gap-3">
                                {row.total_stok >= 0 && (
                                    <Button
                                        onClick={() => handleSendToDatabase(row)}
                                        className="flex-1 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-black rounded-2xl shadow-lg shadow-blue-500/20 border border-white/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                                        disabled={sendingRows.has(row.id)}
                                    >
                                        <Send className="h-4 w-4" />
                                        <span className="tracking-widest uppercase text-[10px]">Kirim Log</span>
                                    </Button>
                                )}
                                <Button
                                    onClick={() => setDeleteConfirm({ isOpen: true, rowId: row.id })}
                                    className="flex-1 h-12 bg-white text-rose-600 font-black rounded-2xl border border-rose-100 shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2"
                                >
                                    <Trash2 className="h-4 w-4" />
                                    <span className="tracking-widest uppercase text-[10px]">Hapus</span>
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <Toast
                isOpen={toast.show}
                message={toast.message}
                type={toast.type}
                onClose={() => setToast({ ...toast, show: false })}
            />

            <ConfirmDialog
                isOpen={deleteConfirm.isOpen}
                onClose={() => setDeleteConfirm({ isOpen: false, rowId: null })}
                onConfirm={handleDelete}
                title="Hapus Data Stok Minus"
                message="Apakah Anda yakin ingin menghapus data ini? Tindakan ini tidak dapat dibatalkan."
                confirmText="Ya, Hapus Data"
                cancelText="Batal"
            />
            <style p-0>{`
                @keyframes bounce-subtle {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-3px); }
                }
                .animate-bounce-subtle {
                    animation: bounce-subtle 4s ease-in-out infinite;
                }
            `}</style>
        </div>
    );
};
