import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { ClipboardCheck, AlertTriangle, ShieldAlert } from 'lucide-react';

export function DailyQuestOverlay() {
    const { userEmail } = useAuth();
    const [pendingQuest, setPendingQuest] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [physicalStock, setPhysicalStock] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [agreed, setAgreed] = useState(false);

    useEffect(() => {
        if (!userEmail) {
            setLoading(false);
            return;
        }

        const fetchQuest = async () => {
            try {
                // Cari quest harian yang berstatus PENDING untuk user ini
                const { data, error } = await supabase
                    .from('daily_quests')
                    .select('*')
                    .eq('user_email', userEmail)
                    .eq('status', 'PENDING')
                    .limit(1)
                    .maybeSingle();

                if (error && error.code !== '42P01') {
                    console.error('Error fetching daily quest:', error);
                }

                if (data) {
                    setPendingQuest(data);
                    // Prevent scrolling
                    document.body.style.overflow = 'hidden';
                } else {
                    document.body.style.overflow = '';
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchQuest();

        // Subscribe to changes in daily_quests
        const subscription = supabase
            .channel('public:daily_quests')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_quests' }, fetchQuest)
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
            document.body.style.overflow = '';
        };
    }, [userEmail]);

    // Anti-inspect/DevTools measures (basic)
    useEffect(() => {
        if (!pendingQuest) return;

        const disableRightClick = (e: MouseEvent) => e.preventDefault();
        const disableKeys = (e: KeyboardEvent) => {
            if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I') || (e.ctrlKey && e.key === 'u')) {
                e.preventDefault();
            }
        };

        document.addEventListener('contextmenu', disableRightClick);
        document.addEventListener('keydown', disableKeys);

        return () => {
            document.removeEventListener('contextmenu', disableRightClick);
            document.removeEventListener('keydown', disableKeys);
        };
    }, [pendingQuest]);

    if (loading || !pendingQuest) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!agreed) {
            alert('Anda harus mencentang persetujuan tanggung jawab!');
            return;
        }

        if (physicalStock === '' || isNaN(Number(physicalStock))) {
            alert('Masukkan jumlah fisik yang valid!');
            return;
        }

        setIsSubmitting(true);
        try {
            const { error } = await supabase
                .from('daily_quests')
                .update({
                    physical_stock: Number(physicalStock),
                    status: 'COMPLETED',
                    completed_at: new Date().toISOString()
                })
                .eq('id', pendingQuest.id);

            if (error) throw error;
            
            alert('Quest Harian Berhasil Diselesaikan! Terima Kasih.');
            setPendingQuest(null);
            document.body.style.overflow = '';
        } catch (err: any) {
            alert('Gagal menyimpan hasil: ' + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4">
            <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-300 relative flex flex-col max-h-[95vh]">
                
                {/* Warning Banner */}
                <div className="bg-rose-500 text-white p-4 flex items-center gap-3">
                    <ShieldAlert className="h-8 w-8 shrink-0 animate-pulse" />
                    <div>
                        <h2 className="text-lg font-black uppercase tracking-tight">System Locked</h2>
                        <p className="text-xs font-medium text-rose-100">Anda harus menyelesaikan Stock Opname Harian sebelum dapat menggunakan aplikasi.</p>
                    </div>
                </div>

                <div className="p-5 md:p-8 overflow-y-auto custom-scrollbar flex-1">
                    <div className="text-center mb-5">
                        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
                            <ClipboardCheck className="h-8 w-8" />
                        </div>
                        <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tight mb-1">Quest Harian</h3>
                        <p className="text-gray-500 text-sm font-medium">Tugas Pengecekan Fisik Stok</p>
                    </div>

                    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 mb-6 text-center">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Target Barang (SKU)</p>
                        <p className="text-xl font-black text-blue-600 bg-white border border-blue-100 py-3 rounded-xl shadow-sm">{pendingQuest.target_sku}</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Stok Fisik Saat Ini <span className="text-red-500">*</span></label>
                            <input
                                type="number"
                                required
                                min="0"
                                value={physicalStock}
                                onChange={(e) => setPhysicalStock(e.target.value)}
                                placeholder="Masukkan jumlah aktual di gudang..."
                                className="w-full px-5 py-4 bg-white border-2 border-gray-300 rounded-xl text-lg font-bold focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all text-center"
                            />
                        </div>

                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
                            <AlertTriangle className="h-6 w-6 text-amber-500 shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <p className="text-xs font-bold text-amber-800 uppercase mb-1">Peringatan Integritas</p>
                                <p className="text-xs text-amber-700 font-medium leading-relaxed mb-3">
                                    Segala hasil inputan stok opname ini adalah <b>TANGGUNG JAWAB MUTLAK</b> Anda. Jika di kemudian hari ditemukan ketidaksesuaian atau manipulasi stok, Anda akan mempertanggungjawabkannya kepada manajemen.
                                </p>
                                <label className="flex items-start gap-2 cursor-pointer group">
                                    <input 
                                        type="checkbox" 
                                        checked={agreed}
                                        onChange={(e) => setAgreed(e.target.checked)}
                                        className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                    />
                                    <span className="text-xs font-bold text-amber-900 group-hover:text-amber-700 transition-colors">
                                        Saya bersedia mempertanggungjawabkan input ini.
                                    </span>
                                </label>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting || !agreed || !physicalStock}
                            className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-black rounded-xl shadow-lg shadow-blue-600/30 transition-all active:scale-[0.98] uppercase tracking-wider text-sm flex items-center justify-center gap-2"
                        >
                            {isSubmitting ? 'Memproses...' : 'Kirim & Buka Sistem'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
