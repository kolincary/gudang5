import React, { useState, useEffect, useRef } from 'react';
import { Settings, ShieldAlert, Save, RefreshCw, Lock, Users, AlertTriangle, Database } from 'lucide-react';
import { Modal } from './ui/Modal';
import { useAuth } from '../lib/AuthContext';
import { Navigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { DatabaseLog } from './DatabaseLog';

export function DevModeSettings() {
    const { userEmail } = useAuth();
    
    // Safety check: Make sure this is only accessible by dev
    const isDevMode = userEmail === 'rianambong@gmail.com' || userEmail === 'kepin@gmail.com' || userEmail === 'admin@gmail.com' || localStorage.getItem('devmode') === 'true';

    const [activeTab, setActiveTab] = useState<'settings' | 'transfer_log'>('settings');
    const [isHalfMode, setIsHalfMode] = useState(false);
    const [isPlusOneMode, setIsPlusOneMode] = useState(false);
    const [showRiwayatStats, setShowRiwayatStats] = useState(true);
    const [targetUserEmail, setTargetUserEmail] = useState('');
    const [toast, setToast] = useState({ isOpen: false, message: '', type: 'success' });
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Logs State
    const [logs, setLogs] = useState<any[]>([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMoreLogs, setHasMoreLogs] = useState(true);
    const ITEMS_PER_PAGE = 50;

    // PIN State
    const [isPinModalOpen, setIsPinModalOpen] = useState(true);
    const [isAccessGranted, setIsAccessGranted] = useState(false);
    const [pin, setPin] = useState('');
    const [pinMessage, setPinMessage] = useState({ text: '', type: '' });
    const pinInputRef = useRef<HTMLInputElement>(null);
    const correctPin = '2501';

    useEffect(() => {
        if (isPinModalOpen && pinInputRef.current) {
            pinInputRef.current.focus();
        }
    }, [isPinModalOpen]);

    const handlePinSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (pin.trim() === correctPin) {
            setPinMessage({ text: 'PIN Benar! Memuat data...', type: 'success' });
            setIsAccessGranted(true);
            setTimeout(() => {
                setIsPinModalOpen(false);
                setPinMessage({ text: '', type: '' });
            }, 500);
        } else {
            setPinMessage({ text: 'PIN Salah. Coba lagi.', type: 'error' });
            if (pinInputRef.current) {
                pinInputRef.current.focus();
            }
        }
        setPin('');
    };

    const handleClosePinModal = () => {
        setIsPinModalOpen(false);
    };

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const { data, error } = await supabase.from('dev_settings').select('*').eq('id', 1).single();
                if (error) throw error;
                if (data) {
                    setIsHalfMode(data.is_half_mode);
                    setIsPlusOneMode(data.is_plus_one_mode);
                    setTargetUserEmail(data.target_user_email || '');
                }

                // Fetch universal riwayat stats setting from app_settings
                const { data: appData } = await supabase
                    .from('app_settings')
                    .select('value')
                    .eq('key', 'hide_riwayat_stats')
                    .maybeSingle();

                if (appData) {
                    setShowRiwayatStats(appData.value !== 'true');
                }
            } catch (err) {
                console.error("Error fetching dev settings", err);
            } finally {
                setIsLoading(false);
            }
        };

        const fetchLogs = async (pageNumber: number) => {
            setLogsLoading(true);
            try {
                const start = (pageNumber - 1) * ITEMS_PER_PAGE;
                const end = start + ITEMS_PER_PAGE - 1;
                
                const { data, error } = await supabase
                    .from('dev_action_logs')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .range(start, end);
                    
                if (error) throw error;
                
                if (data) {
                    if (pageNumber === 1) {
                        setLogs(data);
                    } else {
                        setLogs(prev => [...prev, ...data]);
                    }
                    setHasMoreLogs(data.length === ITEMS_PER_PAGE);
                }
            } catch (err) {
                console.error("Error fetching dev logs", err);
            } finally {
                setLogsLoading(false);
            }
        };

        if (isDevMode && isAccessGranted) {
            fetchSettings();
            fetchLogs(1);
        }
    }, [isDevMode, isAccessGranted]);

    if (!isDevMode) {
        return <Navigate to="/" replace />;
    }

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ isOpen: true, message, type });
        setTimeout(() => setToast({ isOpen: false, message: '', type: 'success' }), 3000);
    };

    const handleToggleRiwayatStats = async (checked: boolean) => {
        setShowRiwayatStats(checked);
        try {
            const { error } = await supabase.from('app_settings').upsert({
                key: 'hide_riwayat_stats',
                value: checked ? 'false' : 'true',
                updated_at: new Date().toISOString()
            }, { onConflict: 'key' });

            if (error) {
                console.error("Error updating app_settings:", error);
                setShowRiwayatStats(!checked);
                showToast('Gagal mengubah status tampilan!', 'error');
            } else {
                showToast(checked ? 'Summary Stats DITAMPILKAN di Riwayat Barang (Realtime)' : 'Summary Stats DISEMBUNYIKAN di Riwayat Barang (Realtime)');
            }
        } catch (err) {
            console.error("Error toggling stats setting:", err);
            setShowRiwayatStats(!checked);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const { error } = await supabase.from('dev_settings').update({
                is_half_mode: isHalfMode,
                is_plus_one_mode: isPlusOneMode,
                target_user_email: targetUserEmail,
                updated_at: new Date().toISOString()
            }).eq('id', 1);

            if (error) throw error;

            // Save universal riwayat stats setting to app_settings
            const { error: appErr } = await supabase.from('app_settings').upsert({
                key: 'hide_riwayat_stats',
                value: showRiwayatStats ? 'false' : 'true',
                updated_at: new Date().toISOString()
            }, { onConflict: 'key' });

            if (appErr) throw appErr;

            showToast('Pengaturan DevMode & Universal Stats berhasil disimpan!');
        } catch (err) {
            console.error("Error saving dev settings", err);
            showToast('Gagal menyimpan pengaturan!', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleLoadMore = () => {
        const nextPage = page + 1;
        setPage(nextPage);
        // Panggil fetchLogs langsung dengan next page (tapi kita definisikan ulang manual atau ekstrak fungsi fetchLogs).
        // Lebih baik taruh fetchLogs di luar useEffect atau buat fungsi fetch terpisah, tapi karena di useEffect, 
        // kita bisa define fungsi fetch baru disini.
        const fetchMore = async () => {
            setLogsLoading(true);
            try {
                const start = (nextPage - 1) * ITEMS_PER_PAGE;
                const end = start + ITEMS_PER_PAGE - 1;
                const { data, error } = await supabase
                    .from('dev_action_logs')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .range(start, end);
                if (error) throw error;
                if (data) {
                    setLogs(prev => [...prev, ...data]);
                    setHasMoreLogs(data.length === ITEMS_PER_PAGE);
                }
            } catch (err) {
                console.error("Error fetching dev logs", err);
            } finally {
                setLogsLoading(false);
            }
        };
        fetchMore();
    };

    return (
        <div className="min-h-screen bg-slate-900 text-slate-200 p-4 lg:p-8 font-sans">
            {isPinModalOpen && (
                <Modal isOpen={isPinModalOpen} onClose={handleClosePinModal} title="Akses DevMode Settings" size="sm">
                    <div className="flex flex-col items-center p-4">
                        <Lock className="h-12 w-12 text-blue-600 mb-4" />
                        <h2 className="text-xl font-bold mb-2">Masukkan PIN</h2>
                        <p className="text-sm text-center mb-4 text-red-600 font-bold">
                            PIN sama dengan web Label QR dan Tanggal
                        </p>
                        <form onSubmit={handlePinSubmit} className="w-full max-w-xs">
                            <input
                                ref={pinInputRef}
                                type="password"
                                value={pin}
                                onChange={(e) => setPin(e.target.value)}
                                maxLength={4}
                                className="w-full px-4 py-2 text-center text-lg font-mono border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                                placeholder="****"
                            />
                            {pinMessage.text && (
                                <p className={`mt-2 text-sm text-center font-bold ${pinMessage.type === 'error' ? 'text-red-500' : 'text-green-500'}`}>
                                    {pinMessage.text}
                                </p>
                            )}
                            <button
                                type="submit"
                                className="mt-4 w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 font-bold"
                            >
                                Submit
                            </button>
                        </form>
                    </div>
                </Modal>
            )}

            {isAccessGranted && (
                <>
            {toast.isOpen && (
                <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg font-bold transition-all ${
                    toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
                }`}>
                    {toast.message}
                </div>
            )}

            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header & Navigation Tabs */}
                <div className="bg-slate-800/80 backdrop-blur-md rounded-2xl p-6 border border-slate-700 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 bg-amber-500/20 rounded-xl flex items-center justify-center border border-amber-500/30 shrink-0">
                            <ShieldAlert className="h-6 w-6 text-amber-500" />
                        </div>
                        <div>
                            <h1 className="text-xl font-black text-white">DevMode Settings & Tools</h1>
                            <p className="text-sm text-slate-400">Pengaturan rahasia developer & Fitur Cek Data Gudang Transfer.</p>
                        </div>
                    </div>

                    <div className="flex items-center bg-slate-900/80 p-1.5 rounded-xl border border-slate-700/80 shrink-0">
                        <button
                            onClick={() => setActiveTab('settings')}
                            className={`px-4 py-2 rounded-lg font-bold text-xs transition-all flex items-center gap-2 ${
                                activeTab === 'settings'
                                    ? 'bg-indigo-600 text-white shadow-md'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                            }`}
                        >
                            <Settings className="w-4 h-4" />
                            Pengaturan DevMode
                        </button>
                        <button
                            onClick={() => setActiveTab('transfer_log')}
                            className={`px-4 py-2 rounded-lg font-bold text-xs transition-all flex items-center gap-2 ${
                                activeTab === 'transfer_log'
                                    ? 'bg-blue-600 text-white shadow-md'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                            }`}
                        >
                            <Database className="w-4 h-4 text-emerald-400" />
                            Cek Data (GUDANG: TRANSFER)
                        </button>
                    </div>
                </div>

                {activeTab === 'transfer_log' ? (
                    <div className="bg-white rounded-2xl shadow-2xl overflow-hidden p-2 text-gray-900 border border-slate-700">
                        <div className="p-4 bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-xl mb-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-500/20 rounded-lg border border-blue-400/30">
                                    <Database className="w-5 h-5 text-blue-300" />
                                </div>
                                <div>
                                    <h2 className="font-bold text-base">Tabel Data Log (GUDANG: TRANSFER)</h2>
                                    <p className="text-xs text-blue-200">Menampilkansemua data tabel log transaksi untuk Gudang TRANSFER (Sama persis 100% dengan Database Log)</p>
                                </div>
                            </div>
                            <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-mono font-bold rounded-full uppercase">
                                GUDANG: TRANSFER
                            </span>
                        </div>
                        <DatabaseLog initialGudangFilter="TRANSFER" bypassPin={true} />
                    </div>
                ) : (
                    <div className="max-w-2xl mx-auto space-y-6">
                        {/* Additional Settings / Links */}
                        <div className="bg-slate-800/80 backdrop-blur-md rounded-2xl p-6 border border-slate-700 shadow-xl space-y-6">
                             <h2 className="text-lg font-bold flex items-center gap-2 text-white border-b border-slate-700 pb-4">
                                <Users className="w-5 h-5 text-indigo-400" />
                                Fitur Global
                            </h2>
                            <div className="flex justify-between items-center bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
                                <div>
                                    <h3 className="font-bold text-white mb-1">Kelola Notifikasi Wajib (Blocking)</h3>
                                    <p className="text-xs text-slate-400">Peringatan paksa yang menutup layar target user (harus dipatuhi).</p>
                                </div>
                                <Link to="/manage-role-notifications" className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors shrink-0 shadow-lg shadow-red-500/20">
                                    <AlertTriangle className="w-4 h-4" /> Buka Menu
                                </Link>
                            </div>
                            <div className="flex justify-between items-center bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
                                <div>
                                    <h3 className="font-bold text-white mb-1">Pengaturan Auto-Fill Rak (Scanner)</h3>
                                    <p className="text-xs text-slate-400">Atur rak mana saja yang boleh otomatis terisi saat menggunakan scanner barcode.</p>
                                </div>
                                <Link to="/dev-rack-autofill" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors shrink-0 shadow-lg shadow-emerald-500/20">
                                    <Settings className="w-4 h-4" /> Buka Menu
                                </Link>
                            </div>
                            
                            {/* Toggle Summary Stats Riwayat Barang */}
                            <div className={`flex items-center justify-between p-4 bg-slate-900/50 rounded-xl border border-slate-700/50 transition-all ${isLoading ? 'opacity-50' : 'hover:border-slate-600'}`}>
                                <div>
                                    <h3 className="font-bold text-white mb-1">Tampilan Summary Stats Riwayat Barang</h3>
                                    <p className="text-xs text-slate-400">
                                        Status: <span className={showRiwayatStats ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                                            {showRiwayatStats ? '● ON (DITAMPILKAN)' : '○ OFF (DISEMBUNYIKAN)'}
                                        </span> — Total Data, Data Ditampilkan, Total Qty, dan Halaman di menu Riwayat Barang (Universal Semua User).
                                    </p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer ml-4">
                                    <input 
                                        type="checkbox" 
                                        className="sr-only peer" 
                                        checked={showRiwayatStats} 
                                        onChange={(e) => handleToggleRiwayatStats(e.target.checked)} 
                                        disabled={isLoading || isSaving} 
                                    />
                                    <div className="w-11 h-6 bg-slate-700 rounded-full peer peer-focus:ring-4 peer-focus:ring-indigo-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                                </label>
                            </div>
                        </div>

                        {/* Settings Panel */}
                        <div className="bg-slate-800/80 backdrop-blur-md rounded-2xl p-6 border border-slate-700 shadow-xl space-y-6">
                            <h2 className="text-lg font-bold flex items-center gap-2 text-white border-b border-slate-700 pb-4">
                                <Settings className="w-5 h-5 text-indigo-400" />
                                Manipulasi Data Transaksi (OUT)
                            </h2>

                            {/* Target User */}
                            <div className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
                                <div className="mb-3 md:mb-0">
                                    <h3 className="font-bold text-white mb-1">Target User (Email)</h3>
                                    <p className="text-xs text-slate-400">Kosongkan jika ingin mode ini berlaku untuk SEMUA user. Jika diisi, mode ini HANYA aktif untuk email ini.</p>
                                </div>
                                <input
                                    type="email"
                                    value={targetUserEmail}
                                    onChange={(e) => setTargetUserEmail(e.target.value)}
                                    disabled={isLoading || isSaving}
                                    placeholder="Contoh: rianambong@gmail.com"
                                    className="w-full md:w-64 px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                />
                            </div>

                            {/* Mode 1/2 */}
                            <div className={`flex items-center justify-between p-4 bg-slate-900/50 rounded-xl border border-slate-700/50 transition-all ${isLoading ? 'opacity-50' : 'hover:border-slate-600'}`}>
                                <div>
                                    <h3 className="font-bold text-white mb-1">Mode Setengah (1/2)</h3>
                                    <p className="text-xs text-slate-400">Jika aktif, data qty OUT yang terinput otomatis dibagi dua di background sebelum masuk ke database log.</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer ml-4">
                                    <input type="checkbox" className="sr-only peer" checked={isHalfMode} onChange={(e) => setIsHalfMode(e.target.checked)} disabled={isLoading || isSaving} />
                                    <div className="w-11 h-6 bg-slate-700 rounded-full peer peer-focus:ring-4 peer-focus:ring-emerald-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                                </label>
                            </div>

                            {/* Mode +1 Depan */}
                            <div className={`flex items-center justify-between p-4 bg-slate-900/50 rounded-xl border border-slate-700/50 transition-all ${isLoading ? 'opacity-50' : 'hover:border-slate-600'}`}>
                                <div>
                                    <h3 className="font-bold text-white mb-1">Mode +1 Depan</h3>
                                    <p className="text-xs text-slate-400">Jika aktif, digit pertama qty OUT akan ditambah 1 (contoh: 120 jadi 220). Jika angka 9, menjadi 8.</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer ml-4">
                                    <input type="checkbox" className="sr-only peer" checked={isPlusOneMode} onChange={(e) => setIsPlusOneMode(e.target.checked)} disabled={isLoading || isSaving} />
                                    <div className="w-11 h-6 bg-slate-700 rounded-full peer peer-focus:ring-4 peer-focus:ring-amber-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                                </label>
                            </div>

                            {/* Save Button */}
                            <div className="pt-4 border-t border-slate-700 flex justify-end">
                                <button
                                    onClick={handleSave}
                                    disabled={isLoading || isSaving}
                                    className={`bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-indigo-500/20 ${(isLoading || isSaving) ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    {isSaving ? 'Menyimpan...' : 'Simpan Pengaturan'}
                                </button>
                            </div>
                        </div>

                        {/* History Logs */}
                        <div className="bg-slate-800/80 backdrop-blur-md rounded-2xl p-6 border border-slate-700 shadow-xl space-y-4">
                            <h2 className="text-lg font-bold text-white border-b border-slate-700 pb-4">
                                Riwayat Aksi DevMode
                            </h2>
                            
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left text-slate-300">
                                    <thead className="text-xs uppercase bg-slate-900/50 text-slate-400">
                                        <tr>
                                            <th className="px-4 py-3 rounded-tl-lg">Waktu</th>
                                            <th className="px-4 py-3">Mode</th>
                                            <th className="px-4 py-3">Target User</th>
                                            <th className="px-4 py-3">SKU</th>
                                            <th className="px-4 py-3 text-right">Qty Asli</th>
                                            <th className="px-4 py-3 text-right rounded-tr-lg">Qty Hasil</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map((log) => (
                                            <tr key={log.id} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                                                <td className="px-4 py-3 whitespace-nowrap">{new Date(log.created_at).toLocaleString('id-ID')}</td>
                                                <td className="px-4 py-3 font-semibold text-indigo-400">{log.mode_used}</td>
                                                <td className="px-4 py-3">{log.target_user}</td>
                                                <td className="px-4 py-3">{log.sku}</td>
                                                <td className="px-4 py-3 text-right text-rose-400 font-bold">{log.qty_original}</td>
                                                <td className="px-4 py-3 text-right text-emerald-400 font-bold">{log.qty_modified}</td>
                                            </tr>
                                        ))}
                                        {logs.length === 0 && !logsLoading && (
                                            <tr>
                                                <td colSpan={6} className="px-4 py-8 text-center text-slate-500 italic">
                                                    Belum ada riwayat aksi terekam.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {hasMoreLogs && logs.length > 0 && (
                                <div className="flex justify-center pt-4">
                                    <button
                                        onClick={handleLoadMore}
                                        disabled={logsLoading}
                                        className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors font-semibold flex items-center gap-2"
                                    >
                                        {logsLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                                        {logsLoading ? 'Memuat...' : 'Muat Lebih Banyak'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
            </>
            )}
        </div>
    );
}
