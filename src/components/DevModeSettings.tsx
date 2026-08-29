import React, { useState, useEffect, useRef } from 'react';
import { 
    Settings, 
    ShieldAlert, 
    Save, 
    RefreshCw, 
    Lock, 
    Users, 
    AlertTriangle, 
    Database, 
    Sliders, 
    Layers, 
    Cpu, 
    Eye, 
    EyeOff, 
    CheckCircle2, 
    Activity, 
    KeyRound, 
    Zap, 
    ArrowRight, 
    Terminal, 
    FileText, 
    Check, 
    X,
    Sparkles,
    ShieldCheck,
    PackageCheck,
    Crown
} from 'lucide-react';
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
    const [targetUserEmail, setTargetUserEmail] = useState('');
    const [toast, setToast] = useState({ isOpen: false, message: '', type: 'success' });
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Summary Stats Configuration State
    const [showRiwayatStats, setShowRiwayatStats] = useState(true);
    const [statsTargetMode, setStatsTargetMode] = useState<'all' | 'roles'>('all');
    const [statsAllowedRoles, setStatsAllowedRoles] = useState<string[]>(['developer', 'staf_admin', 'staf_gudang']);

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
            setPinMessage({ text: 'PIN Benar! Membuka DevMode...', type: 'success' });
            setIsAccessGranted(true);
            setTimeout(() => {
                setIsPinModalOpen(false);
                setPinMessage({ text: '', type: '' });
            }, 400);
        } else {
            setPinMessage({ text: 'PIN Salah. Silakan coba lagi.', type: 'error' });
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

                // Fetch universal riwayat stats settings from app_settings
                const { data: appData } = await supabase
                    .from('app_settings')
                    .select('key, value')
                    .in('key', ['hide_riwayat_stats', 'riwayat_stats_target_mode', 'riwayat_stats_allowed_roles']);

                if (appData && appData.length > 0) {
                    const map = new Map(appData.map((s: any) => [s.key, s.value]));
                    setShowRiwayatStats(map.get('hide_riwayat_stats') !== 'true');
                    setStatsTargetMode((map.get('riwayat_stats_target_mode') as 'all' | 'roles') || 'all');
                    
                    const allowedRolesRaw = map.get('riwayat_stats_allowed_roles');
                    if (allowedRolesRaw) {
                        try {
                            const parsed = JSON.parse(allowedRolesRaw);
                            if (Array.isArray(parsed)) setStatsAllowedRoles(parsed);
                        } catch (e) {
                            console.warn('Error parsing riwayat_stats_allowed_roles:', e);
                        }
                    }
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
        setTimeout(() => setToast({ isOpen: false, message: '', type: 'success' }), 3500);
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

    const handleTargetModeChange = async (mode: 'all' | 'roles') => {
        setStatsTargetMode(mode);
        try {
            const { error } = await supabase.from('app_settings').upsert({
                key: 'riwayat_stats_target_mode',
                value: mode,
                updated_at: new Date().toISOString()
            }, { onConflict: 'key' });

            if (error) throw error;
            showToast(mode === 'all' ? 'Target: Berlaku untuk SEMUA Role' : 'Target: Dibatasi untuk ROLE tertentu saja');
        } catch (err) {
            console.error("Error saving target mode:", err);
            showToast('Gagal mengubah mode target role!', 'error');
        }
    };

    const handleToggleRolePermission = async (roleKey: string) => {
        const nextRoles = statsAllowedRoles.includes(roleKey)
            ? statsAllowedRoles.filter(r => r !== roleKey)
            : [...statsAllowedRoles, roleKey];

        setStatsAllowedRoles(nextRoles);
        try {
            const { error } = await supabase.from('app_settings').upsert({
                key: 'riwayat_stats_allowed_roles',
                value: JSON.stringify(nextRoles),
                updated_at: new Date().toISOString()
            }, { onConflict: 'key' });

            if (error) throw error;
            showToast(`Hak akses role diperbarui (${nextRoles.length} role aktif)`);
        } catch (err) {
            console.error("Error saving allowed roles:", err);
            showToast('Gagal memperbarui izin role!', 'error');
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

            // Save all universal riwayat stats settings to app_settings
            await Promise.all([
                supabase.from('app_settings').upsert({
                    key: 'hide_riwayat_stats',
                    value: showRiwayatStats ? 'false' : 'true',
                    updated_at: new Date().toISOString()
                }, { onConflict: 'key' }),
                supabase.from('app_settings').upsert({
                    key: 'riwayat_stats_target_mode',
                    value: statsTargetMode,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'key' }),
                supabase.from('app_settings').upsert({
                    key: 'riwayat_stats_allowed_roles',
                    value: JSON.stringify(statsAllowedRoles),
                    updated_at: new Date().toISOString()
                }, { onConflict: 'key' })
            ]);

            showToast('Semua pengaturan DevMode & Hak Akses berhasil disimpan!');
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

    const roleOptions = [
        {
            key: 'developer',
            label: 'Developer / Superadmin',
            desc: 'Akses penuh developer & DevMode Admin',
            icon: Crown,
            badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
        },
        {
            key: 'staf_admin',
            label: 'Staf Admin',
            desc: 'Pengguna dengan role staf admin',
            icon: ShieldCheck,
            badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30'
        },
        {
            key: 'staf_gudang',
            label: 'Staf Gudang',
            desc: 'Pengguna lapangan / staf gudang operasional',
            icon: PackageCheck,
            badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
        }
    ];

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-3 sm:p-6 lg:p-8 font-sans">
            {/* PIN SECURITY MODAL */}
            {isPinModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-slate-900 border border-slate-700/80 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl shadow-indigo-950/50 relative overflow-hidden">
                        {/* Glowing ambient background circle */}
                        <div className="absolute -top-16 -right-16 w-36 h-36 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none" />
                        <div className="absolute -bottom-16 -left-16 w-36 h-36 bg-purple-500/20 rounded-full blur-2xl pointer-events-none" />

                        <div className="flex flex-col items-center text-center relative z-10">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30 mb-5 ring-4 ring-indigo-500/20">
                                <KeyRound className="w-8 h-8" />
                            </div>
                            
                            <h2 className="text-xl font-black text-white tracking-tight">DevMode Security Check</h2>
                            <p className="text-xs text-slate-400 mt-1 max-w-xs">
                                Masukkan kode PIN developer untuk membuka panel kontrol dan konfigurasi rahasia.
                            </p>

                            <div className="mt-2.5 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-[11px] font-bold text-amber-400 flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>PIN sama dengan web Thermal Print & Label</span>
                            </div>

                            <form onSubmit={handlePinSubmit} className="w-full mt-6 space-y-4">
                                <div>
                                    <input
                                        ref={pinInputRef}
                                        type="password"
                                        value={pin}
                                        onChange={(e) => setPin(e.target.value)}
                                        maxLength={6}
                                        className="w-full px-4 py-3.5 text-center text-2xl font-mono tracking-[0.4em] bg-slate-950/80 border-2 border-slate-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 rounded-2xl text-white outline-none transition-all placeholder:text-slate-600"
                                        placeholder="••••"
                                        autoComplete="off"
                                    />
                                    {pinMessage.text && (
                                        <p className={`mt-2 text-xs font-bold ${pinMessage.type === 'error' ? 'text-rose-400' : 'text-emerald-400'}`}>
                                            {pinMessage.text}
                                        </p>
                                    )}
                                </div>

                                <button
                                    type="submit"
                                    className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm uppercase tracking-wider shadow-lg shadow-indigo-600/30 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
                                >
                                    <Lock className="w-4 h-4" />
                                    <span>Buka Akses Panel</span>
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {isAccessGranted && (
                <>
                    {/* Toast Notification */}
                    {toast.isOpen && (
                        <div className={`fixed top-6 right-6 z-50 px-5 py-3.5 rounded-2xl shadow-2xl font-bold text-sm flex items-center gap-2.5 transition-all animate-in slide-in-from-top duration-200 border ${
                            toast.type === 'success' 
                                ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/40 shadow-emerald-950/50' 
                                : 'bg-rose-950/90 text-rose-300 border-rose-500/40 shadow-rose-950/50'
                        } backdrop-blur-md`}>
                            {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <AlertTriangle className="w-5 h-5 text-rose-400" />}
                            <span>{toast.message}</span>
                        </div>
                    )}

                    <div className="max-w-7xl mx-auto space-y-6">
                        {/* COMMAND CENTER HEADER */}
                        <div className="relative bg-gradient-to-br from-slate-900 via-slate-900/90 to-indigo-950/60 backdrop-blur-xl rounded-3xl p-5 sm:p-7 border border-slate-800 shadow-2xl shadow-black/40 overflow-hidden">
                            {/* Decorative glow lines */}
                            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-500 to-transparent" />
                            <div className="absolute -top-20 -right-20 w-60 h-60 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
                                <div className="flex items-start sm:items-center gap-4">
                                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner shrink-0">
                                        <ShieldAlert className="w-7 h-7" />
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                                                DevMode Settings & Control Hub
                                            </h1>
                                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                                Developer Privileged
                                            </span>
                                        </div>
                                        <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
                                            Pusat kontrol konfigurasi sistem rahasia, pengaturan visibilitas role, dan audit log gudang transfer.
                                        </p>
                                    </div>
                                </div>

                                {/* Navigation Switch Tabs */}
                                <div className="flex items-center p-1.5 bg-slate-950/80 rounded-2xl border border-slate-800 shrink-0 self-start lg:self-center">
                                    <button
                                        onClick={() => setActiveTab('settings')}
                                        className={`px-4 sm:px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center gap-2 cursor-pointer ${
                                            activeTab === 'settings'
                                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                                        }`}
                                    >
                                        <Sliders className="w-4 h-4" />
                                        <span>Pengaturan DevMode</span>
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('transfer_log')}
                                        className={`px-4 sm:px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center gap-2 cursor-pointer ${
                                            activeTab === 'transfer_log'
                                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                                        }`}
                                    >
                                        <Database className="w-4 h-4 text-emerald-400" />
                                        <span>Cek Data (TRANSFER)</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* CONTENT VIEW SWITCH */}
                        {activeTab === 'transfer_log' ? (
                            <div className="bg-white rounded-3xl shadow-2xl overflow-hidden p-2 text-gray-900 border border-slate-800">
                                <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white rounded-2xl mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 bg-blue-500/20 rounded-xl border border-blue-400/30">
                                            <Database className="w-5 h-5 text-blue-300" />
                                        </div>
                                        <div>
                                            <h2 className="font-black text-base sm:text-lg">Tabel Data Log (GUDANG: TRANSFER)</h2>
                                            <p className="text-xs text-blue-200">
                                                Menampilkan semua data tabel log transaksi untuk Gudang TRANSFER (Sama persis 100% dengan Database Log).
                                            </p>
                                        </div>
                                    </div>
                                    <span className="px-3.5 py-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-mono font-black rounded-xl uppercase self-start sm:self-center">
                                        GUDANG: TRANSFER
                                    </span>
                                </div>
                                <DatabaseLog initialGudangFilter="TRANSFER" bypassPin={true} />
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {/* 2-COLUMN CONTROL GRID */}
                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                                    {/* LEFT COLUMN: FITUR GLOBAL & ROLE CONTROL (7 Cols) */}
                                    <div className="lg:col-span-7 space-y-5">
                                        
                                        {/* CARD 1: SUMMARY STATS & ROLE TARGETING CONFIG */}
                                        <div className="bg-slate-900/80 backdrop-blur-xl rounded-3xl p-5 sm:p-6 border border-slate-800/90 shadow-xl space-y-5 relative overflow-hidden">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg">
                                                            <Activity className="w-4 h-4" />
                                                        </div>
                                                        <h2 className="text-sm font-black text-white uppercase tracking-wider">
                                                            Tampilan Summary Stats Riwayat
                                                        </h2>
                                                    </div>
                                                    <p className="text-xs text-slate-400">
                                                        Atur kemunculan 4 box ringkasan (*Total Data, Ditampilkan, Qty, Halaman*) di Riwayat Barang.
                                                    </p>
                                                </div>

                                                {/* HIGH VISIBILITY CUSTOM SWITCH BUTTON */}
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleRiwayatStats(!showRiwayatStats)}
                                                    disabled={isLoading || isSaving}
                                                    className={`px-4 py-2 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center gap-2.5 transition-all shadow-lg cursor-pointer shrink-0 ${
                                                        showRiwayatStats
                                                            ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-emerald-500/25 ring-2 ring-emerald-400 hover:brightness-110 active:scale-95'
                                                            : 'bg-slate-800 text-rose-300 border-2 border-rose-500/50 shadow-rose-950/30 hover:bg-slate-750 active:scale-95'
                                                    }`}
                                                >
                                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-slate-950 shadow-sm transition-all ${
                                                        showRiwayatStats ? 'bg-white text-emerald-600' : 'bg-rose-500 text-white'
                                                    }`}>
                                                        {showRiwayatStats ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <X className="w-3.5 h-3.5 stroke-[3]" />}
                                                    </div>
                                                    <span>{showRiwayatStats ? '● ON (DITAMPILKAN)' : '○ OFF (DISEMBUNYIKAN)'}</span>
                                                </button>
                                            </div>

                                            {/* ROLE TARGETING CONFIGURATION (Expanded when Switch is ON) */}
                                            {showRiwayatStats && (
                                                <div className="space-y-4 pt-1 animate-in fade-in zoom-in-95 duration-200">
                                                    <div>
                                                        <label className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-2 mb-2">
                                                            <Users className="w-3.5 h-3.5 text-indigo-400" />
                                                            <span>Target Visibilitas Role:</span>
                                                        </label>
                                                        
                                                        {/* Target Mode Segmented Buttons */}
                                                        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950/80 rounded-2xl border border-slate-800">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleTargetModeChange('all')}
                                                                className={`py-2.5 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                                                    statsTargetMode === 'all'
                                                                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                                                                        : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
                                                                }`}
                                                            >
                                                                <span>🌐 Semua Role (Universal)</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleTargetModeChange('roles')}
                                                                className={`py-2.5 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                                                    statsTargetMode === 'roles'
                                                                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                                                                        : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
                                                                }`}
                                                            >
                                                                <span>👥 Pilih Role Tertentu</span>
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* ROLE CHECKBOX LIST (When 'roles' mode is active) */}
                                                    {statsTargetMode === 'roles' ? (
                                                        <div className="space-y-2 pt-1 animate-in fade-in duration-150">
                                                            <p className="text-[11px] text-indigo-300 font-semibold mb-2">
                                                                Centang role mana saja yang **BOLEH MELIHAT** box stats di Riwayat Barang:
                                                            </p>
                                                            <div className="space-y-2">
                                                                {roleOptions.map((r) => {
                                                                    const Icon = r.icon;
                                                                    const isChecked = statsAllowedRoles.includes(r.key);
                                                                    return (
                                                                        <div
                                                                            key={r.key}
                                                                            onClick={() => handleToggleRolePermission(r.key)}
                                                                            className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 cursor-pointer select-none ${
                                                                                isChecked
                                                                                    ? 'bg-indigo-950/40 border-indigo-500/50 hover:border-indigo-400'
                                                                                    : 'bg-slate-950/40 border-slate-800 hover:border-slate-700 opacity-60'
                                                                            }`}
                                                                        >
                                                                            <div className="flex items-center gap-3">
                                                                                <div className={`p-2 rounded-xl border ${r.badgeColor}`}>
                                                                                    <Icon className="w-4 h-4" />
                                                                                </div>
                                                                                <div>
                                                                                    <div className="flex items-center gap-2">
                                                                                        <h4 className="font-bold text-xs text-white">{r.label}</h4>
                                                                                        <span className="text-[10px] font-mono text-slate-400">({r.key})</span>
                                                                                    </div>
                                                                                    <p className="text-[10px] text-slate-400">{r.desc}</p>
                                                                                </div>
                                                                            </div>

                                                                            <div className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-all ${
                                                                                isChecked
                                                                                    ? 'bg-emerald-600 border-emerald-500 text-white shadow-md'
                                                                                    : 'border-slate-700 bg-slate-900'
                                                                            }`}>
                                                                                {isChecked && <Check className="w-4 h-4 stroke-[3]" />}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="p-3 bg-indigo-950/20 border border-indigo-500/20 rounded-2xl">
                                                            <p className="text-[11px] text-indigo-300">
                                                                ✓ Mode Universal aktif: Summary stats akan **ditampilkan ke seluruh pengguna** (Developer, Staf Admin, dan Staf Gudang).
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* CARD 2: OTHER GLOBAL TOOLS */}
                                        <div className="bg-slate-900/80 backdrop-blur-xl rounded-3xl p-5 sm:p-6 border border-slate-800/90 shadow-xl space-y-4">
                                            <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
                                                <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2.5">
                                                    <div className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg">
                                                        <Users className="w-4 h-4" />
                                                    </div>
                                                    <span>Fitur Global & Notifikasi</span>
                                                </h2>
                                                <span className="text-[11px] font-bold text-slate-400 bg-slate-800/80 px-2.5 py-0.5 rounded-full">
                                                    Master Tool
                                                </span>
                                            </div>

                                            {/* Item: Kelola Notifikasi Blocking */}
                                            <div className="p-4 bg-slate-950/60 hover:bg-slate-950/90 rounded-2xl border border-slate-800 hover:border-red-500/30 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="font-bold text-white text-sm group-hover:text-red-300 transition-colors">
                                                            Kelola Notifikasi Wajib (Blocking)
                                                        </h3>
                                                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-red-500/20 text-red-400 border border-red-500/30">
                                                            Penting
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-slate-400 max-w-md">
                                                        Peringatan paksa yang menutup layar target user sampai dipatuhi atau disetujui.
                                                    </p>
                                                </div>
                                                <Link 
                                                    to="/manage-role-notifications" 
                                                    className="px-4 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-red-600/20 hover:shadow-red-600/30 shrink-0 cursor-pointer"
                                                >
                                                    <AlertTriangle className="w-3.5 h-3.5" />
                                                    <span>Buka Menu</span>
                                                </Link>
                                            </div>

                                            {/* Item: Auto-Fill Rak Scanner */}
                                            <div className="p-4 bg-slate-950/60 hover:bg-slate-950/90 rounded-2xl border border-slate-800 hover:border-emerald-500/30 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="font-bold text-white text-sm group-hover:text-emerald-300 transition-colors">
                                                            Pengaturan Auto-Fill Rak (Scanner)
                                                        </h3>
                                                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                                            Scanner
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-slate-400 max-w-md">
                                                        Atur rak mana saja yang boleh otomatis terisi saat menggunakan scanner barcode fisik.
                                                    </p>
                                                </div>
                                                <Link 
                                                    to="/dev-rack-autofill" 
                                                    className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/20 hover:shadow-emerald-600/30 shrink-0 cursor-pointer"
                                                >
                                                    <Settings className="w-3.5 h-3.5" />
                                                    <span>Buka Menu</span>
                                                </Link>
                                            </div>
                                        </div>

                                        {/* DevMode Quick Tools Bar */}
                                        <div className="bg-slate-900/60 backdrop-blur-xl rounded-3xl p-5 border border-slate-800/80 shadow-lg">
                                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                                <Zap className="w-3.5 h-3.5 text-amber-400" />
                                                <span>Akses Cepat Menu Developer</span>
                                            </h3>
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                                <Link 
                                                    to="/import-closing" 
                                                    className="p-3 bg-slate-950/80 hover:bg-indigo-950/40 border border-slate-800 hover:border-indigo-500/40 rounded-xl text-center transition-all group"
                                                >
                                                    <p className="text-xs font-bold text-slate-300 group-hover:text-indigo-300">Import Closing</p>
                                                </Link>
                                                <Link 
                                                    to="/transfer-sync-manager" 
                                                    className="p-3 bg-slate-950/80 hover:bg-indigo-950/40 border border-slate-800 hover:border-indigo-500/40 rounded-xl text-center transition-all group"
                                                >
                                                    <p className="text-xs font-bold text-slate-300 group-hover:text-indigo-300">Transfer Sync</p>
                                                </Link>
                                                <Link 
                                                    to="/fix-stock-sync" 
                                                    className="p-3 bg-slate-950/80 hover:bg-indigo-950/40 border border-slate-800 hover:border-indigo-500/40 rounded-xl text-center transition-all group"
                                                >
                                                    <p className="text-xs font-bold text-slate-300 group-hover:text-indigo-300">Fix Stok Sync</p>
                                                </Link>
                                                <Link 
                                                    to="/user-management" 
                                                    className="p-3 bg-slate-950/80 hover:bg-indigo-950/40 border border-slate-800 hover:border-indigo-500/40 rounded-xl text-center transition-all group"
                                                >
                                                    <p className="text-xs font-bold text-slate-300 group-hover:text-indigo-300">User Manager</p>
                                                </Link>
                                            </div>
                                        </div>
                                    </div>

                                    {/* RIGHT COLUMN: MANIPULASI DATA TRANSAKSI OUT (5 Cols) */}
                                    <div className="lg:col-span-5">
                                        <div className="bg-slate-900/80 backdrop-blur-xl rounded-3xl p-5 sm:p-6 border border-slate-800/90 shadow-xl space-y-5 relative overflow-hidden">
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />

                                            <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
                                                <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2.5">
                                                    <div className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg">
                                                        <Cpu className="w-4 h-4" />
                                                    </div>
                                                    <span>Manipulasi Data Transaksi (OUT)</span>
                                                </h2>
                                                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-md">
                                                    Interseptor
                                                </span>
                                            </div>

                                            {/* Target User */}
                                            <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800 space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <label className="text-xs font-black text-slate-200 uppercase tracking-wider">
                                                        Target User (Email)
                                                    </label>
                                                    <span className="text-[10px] text-slate-500 font-bold">
                                                        {targetUserEmail ? 'Filter Aktif' : 'Semua User'}
                                                    </span>
                                                </div>
                                                <input
                                                    type="email"
                                                    value={targetUserEmail}
                                                    onChange={(e) => setTargetUserEmail(e.target.value)}
                                                    disabled={isLoading || isSaving}
                                                    placeholder="Kosongkan untuk SEMUA user atau ketik email..."
                                                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-xs font-mono transition-all"
                                                />
                                                <p className="text-[11px] text-slate-400 leading-relaxed">
                                                    Kosongkan jika ingin mode berlaku untuk <strong className="text-slate-300">SEMUA user</strong>. Jika diisi, mode ini <strong className="text-indigo-400">HANYA aktif</strong> untuk email target tersebut.
                                                </p>
                                            </div>

                                            {/* Mode 1/2 */}
                                            <div className={`p-4 bg-slate-950/60 rounded-2xl border border-slate-800 transition-all flex items-center justify-between gap-3 ${isLoading ? 'opacity-50' : 'hover:border-emerald-500/30'}`}>
                                                <div className="space-y-0.5">
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="font-bold text-white text-xs sm:text-sm">Mode Setengah (1/2)</h3>
                                                        {isHalfMode && (
                                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                                                Aktif
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-[11px] text-slate-400">
                                                        Data qty OUT terinput otomatis dibagi dua di background sebelum masuk database log.
                                                    </p>
                                                </div>
                                                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                                    <input 
                                                        type="checkbox" 
                                                        className="sr-only peer" 
                                                        checked={isHalfMode} 
                                                        onChange={(e) => setIsHalfMode(e.target.checked)} 
                                                        disabled={isLoading || isSaving} 
                                                    />
                                                    <div className="w-11 h-6 bg-slate-800 rounded-full peer peer-focus:ring-4 peer-focus:ring-emerald-800/40 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 shadow-inner"></div>
                                                </label>
                                            </div>

                                            {/* Mode +1 Depan */}
                                            <div className={`p-4 bg-slate-950/60 rounded-2xl border border-slate-800 transition-all flex items-center justify-between gap-3 ${isLoading ? 'opacity-50' : 'hover:border-amber-500/30'}`}>
                                                <div className="space-y-0.5">
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="font-bold text-white text-xs sm:text-sm">Mode +1 Depan</h3>
                                                        {isPlusOneMode && (
                                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                                                Aktif
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-[11px] text-slate-400">
                                                        Digit pertama qty OUT ditambah 1 (contoh: <span className="text-amber-300 font-mono">120 → 220</span>, jika 9 menjadi 8).
                                                    </p>
                                                </div>
                                                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                                    <input 
                                                        type="checkbox" 
                                                        className="sr-only peer" 
                                                        checked={isPlusOneMode} 
                                                        onChange={(e) => setIsPlusOneMode(e.target.checked)} 
                                                        disabled={isLoading || isSaving} 
                                                    />
                                                    <div className="w-11 h-6 bg-slate-800 rounded-full peer peer-focus:ring-4 peer-focus:ring-amber-800/40 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500 shadow-inner"></div>
                                                </label>
                                            </div>

                                            {/* Save Button */}
                                            <div className="pt-2">
                                                <button
                                                    onClick={handleSave}
                                                    disabled={isLoading || isSaving}
                                                    className={`w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 hover:from-indigo-500 hover:via-purple-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2.5 transition-all shadow-xl shadow-indigo-600/30 active:scale-[0.98] cursor-pointer ${
                                                        (isLoading || isSaving) ? 'opacity-50 cursor-not-allowed' : ''
                                                    }`}
                                                >
                                                    {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                                    <span>{isSaving ? 'Menyimpan Perubahan...' : 'Simpan Pengaturan DevMode'}</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* RIWAYAT AKSI DEVMODE (FULL WIDTH AUDIT TABLE) */}
                                <div className="bg-slate-900/80 backdrop-blur-xl rounded-3xl p-5 sm:p-6 border border-slate-800/90 shadow-xl space-y-4">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3.5">
                                        <div className="flex items-center gap-2.5">
                                            <div className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg">
                                                <Terminal className="w-4 h-4" />
                                            </div>
                                            <h2 className="text-sm font-black text-white uppercase tracking-wider">
                                                Riwayat Aksi DevMode (Audit Log)
                                            </h2>
                                        </div>
                                        <span className="text-xs font-bold text-slate-400">
                                            Total Record Dimuat: <strong className="text-indigo-400">{logs.length}</strong>
                                        </span>
                                    </div>
                                    
                                    <div className="overflow-x-auto rounded-2xl border border-slate-800">
                                        <table className="w-full text-xs text-left text-slate-300">
                                            <thead className="text-[11px] uppercase bg-slate-950 text-slate-400 tracking-wider">
                                                <tr>
                                                    <th className="px-4 py-3.5">Waktu</th>
                                                    <th className="px-4 py-3.5">Mode Aksi</th>
                                                    <th className="px-4 py-3.5">Target User</th>
                                                    <th className="px-4 py-3.5">Nama / SKU Produk</th>
                                                    <th className="px-4 py-3.5 text-right">Qty Asli</th>
                                                    <th className="px-4 py-3.5 text-right">Qty Hasil</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                                                {logs.map((log) => (
                                                    <tr key={log.id} className="hover:bg-slate-800/50 transition-colors">
                                                        <td className="px-4 py-3 whitespace-nowrap font-mono text-slate-400">
                                                            {new Date(log.created_at).toLocaleString('id-ID')}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                                                                log.mode_used?.includes('HALF') 
                                                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                                                                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                                            }`}>
                                                                {log.mode_used}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 font-mono text-slate-300">{log.target_user || '—'}</td>
                                                        <td className="px-4 py-3 font-semibold text-white">{log.sku}</td>
                                                        <td className="px-4 py-3 text-right text-rose-400 font-bold font-mono">{log.qty_original}</td>
                                                        <td className="px-4 py-3 text-right text-emerald-400 font-bold font-mono">{log.qty_modified}</td>
                                                    </tr>
                                                ))}
                                                {logs.length === 0 && !logsLoading && (
                                                    <tr>
                                                        <td colSpan={6} className="px-4 py-10 text-center text-slate-500 italic">
                                                            Belum ada riwayat aksi intercept terekam.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>

                                    {hasMoreLogs && logs.length > 0 && (
                                        <div className="flex justify-center pt-2">
                                            <button
                                                onClick={handleLoadMore}
                                                disabled={logsLoading}
                                                className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-all font-bold text-xs uppercase tracking-wider flex items-center gap-2 border border-slate-700 hover:border-slate-600 shadow-md cursor-pointer"
                                            >
                                                {logsLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" /> : null}
                                                <span>{logsLoading ? 'Memuat Log...' : 'Muat Lebih Banyak Log'}</span>
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
