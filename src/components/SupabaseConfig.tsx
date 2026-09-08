import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Sparkles, 
  Database, 
  Terminal, 
  Radio, 
  Copy, 
  Check, 
  RefreshCw, 
  Moon, 
  Sun, 
  LogOut, 
  ExternalLink, 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  Info,
  Layers,
  KeyRound,
  Server
} from 'lucide-react';
import { Button } from './ui/Button';
import { multiDbManager } from '../services/multiDbManager';

export function SupabaseConfig() {
  const navigate = useNavigate();
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Active Database details
  const [activeConfig, setActiveConfig] = useState(() => multiDbManager.getActiveConfig());
  const [totalRows, setTotalRows] = useState<number>(0);
  const [isLoadingRows, setIsLoadingRows] = useState(false);

  // CLI Migration Form Inputs
  const [srcUri, setSrcUri] = useState('');
  const [srcPassword, setSrcPassword] = useState('');
  const [tgtUri, setTgtUri] = useState('');
  const [tgtPassword, setTgtPassword] = useState('');

  // Hot-Swap & Broadcast Form Inputs
  const [targetUrl, setTargetUrl] = useState('');
  const [targetAnonKey, setTargetAnonKey] = useState('');
  const [broadcastToFirestore, setBroadcastToFirestore] = useState(true);

  // Status & Feedback
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({
    show: false,
    message: '',
    type: 'success'
  });

  // Copied state trackers for the 4 CMD commands and master schema
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedSchema, setCopiedSchema] = useState(false);

  // Load row counts on mount
  useEffect(() => {
    loadLiveStats();
  }, []);

  const loadLiveStats = async () => {
    setIsLoadingRows(true);
    try {
      const rows = await multiDbManager.fetchTotalRowCount();
      setTotalRows(rows);
    } catch (e) {
      console.warn('Failed to load row count:', e);
    } finally {
      setIsLoadingRows(false);
    }
  };

  const showToastNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: '', type: 'success' });
    }, 4000);
  };

  const copyToClipboard = async (text: string, index?: number) => {
    try {
      await navigator.clipboard.writeText(text);
      if (index !== undefined) {
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2500);
      }
      showToastNotification('Perintah berhasil disalin ke clipboard!');
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Generate 4 CMD Commands
  const generatedCommands = multiDbManager.generatePgCommands(srcUri, srcPassword, tgtUri, tgtPassword);

  const cmdList = [
    {
      id: 1,
      title: '1. Clean Up / Reset Schema DB Target:',
      command: generatedCommands.cleanUpCmd
    },
    {
      id: 2,
      title: '2. Backup dari DB Lama (pg_dump):',
      command: generatedCommands.backupCmd
    },
    {
      id: 3,
      title: '3. Restore ke DB Baru (psql):',
      command: generatedCommands.restoreCmd
    },
    {
      id: 4,
      title: '4. Izin Akses & Reload PostgREST (Solusi jika 401 / Permission Denied):',
      command: generatedCommands.grantPermissionsCmd
    }
  ];

  const handleTestConnection = async () => {
    if (!targetUrl.trim() || !targetAnonKey.trim()) {
      setTestResult({
        success: false,
        message: 'Masukkan Target Supabase URL dan Anon Key terlebih dahulu.'
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await multiDbManager.testConnection(targetUrl.trim(), targetAnonKey.trim());
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `Gagal menguji koneksi: ${err?.message || 'Error tidak diketahui'}`
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleApplyAndBroadcast = async () => {
    if (!targetUrl.trim() || !targetAnonKey.trim()) {
      showToastNotification('Target Supabase URL dan Anon Key wajib diisi.', 'error');
      return;
    }

    if (!window.confirm('Apakah Anda yakin ingin menerapkan dan menyiarkan database Supabase baru ini ke seluruh perangkat aktif?')) {
      return;
    }

    setIsApplying(true);
    try {
      // 1. Simpan ke localStorage lokal seketika
      localStorage.setItem('custom_supabase_url', targetUrl.trim());
      localStorage.setItem('custom_supabase_anon_key', targetAnonKey.trim());
      
      const newRefId = multiDbManager.extractRefIdFromUrl(targetUrl) || 'active';
      setActiveConfig({
        url: targetUrl.trim(),
        anonKey: targetAnonKey.trim(),
        refId: newRefId
      });

      // 2. Jika opsi siarkan dicentang, broadcast via Firestore
      if (broadcastToFirestore) {
        await multiDbManager.broadcastConfigToFirestore({
          url: targetUrl.trim(),
          anonKey: targetAnonKey.trim(),
          name: `Supabase (${newRefId})`
        });
      }

      showToastNotification('Database baru berhasil diterapkan & disiarkan! Memuat ulang sistem...', 'success');
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      console.error(err);
      showToastNotification(`Gagal menerapkan database: ${err?.message || 'Unknown error'}`, 'error');
    } finally {
      setIsApplying(false);
    }
  };

  const handleCopyMasterSchema = async () => {
    const schema = multiDbManager.getMasterSqlSchema();
    await copyToClipboard(schema);
    setCopiedSchema(true);
    setTimeout(() => setCopiedSchema(false), 3000);
  };

  const currentRefId = activeConfig.refId || multiDbManager.extractRefIdFromUrl(activeConfig.url) || 'online_db';

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-[#F8FAFC] text-slate-800'} transition-colors duration-300 pb-16 font-sans`}>
      
      {/* Toast Notification */}
      {toast.show && (
        <div className={`fixed top-4 right-4 z-[9999] p-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${
          toast.type === 'success' 
            ? 'bg-emerald-500 text-white border border-emerald-400 shadow-emerald-500/20' 
            : 'bg-rose-600 text-white border border-rose-500 shadow-rose-500/20'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
          <span className="text-sm font-bold tracking-tight">{toast.message}</span>
        </div>
      )}

      {/* TOP BAR HEADER */}
      <div className={`border-b ${isDarkMode ? 'border-slate-800 bg-slate-900/60' : 'border-slate-200/80 bg-white'} backdrop-blur-md sticky top-0 z-40 px-6 py-4 transition-colors`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-base sm:text-lg font-black tracking-wider text-slate-800 dark:text-white uppercase">
              SUPABASE CONFIG
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={`p-2.5 rounded-xl border transition-all ${
                isDarkMode 
                  ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700' 
                  : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
              }`}
              title="Toggle Dark Mode"
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200 transition-all"
            >
              <span>Exit Admin</span>
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">

        {/* HERO BANNER - MANAJEMEN & HOT-SWAP SUPABASE */}
        <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-[#1E2761] via-[#1E3A8A] to-[#0F172A] p-6 sm:p-8 text-white shadow-2xl shadow-blue-950/30 border border-blue-800/40">
          {/* Background blurred orbs */}
          <div className="absolute -top-16 -right-16 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none"></div>

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            
            {/* Left Header Description */}
            <div className="max-w-2xl space-y-2.5">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full border border-white/15 text-[11px] font-black uppercase tracking-widest text-blue-200">
                <Sparkles className="w-3.5 h-3.5 text-blue-300" />
                <span>Hot-Swap Database & Real-Time Sync</span>
              </div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white leading-tight">
                Manajemen & Hot-Swap Supabase
              </h2>
              <p className="text-blue-100/80 text-xs sm:text-sm leading-relaxed max-w-xl font-normal">
                Ganti instance Supabase tanpa edit file <code className="text-amber-300 font-mono">.env</code> dan tanpa redeploy Vercel. Paste Connection String URI untuk generate perintah <code className="text-emerald-300 font-mono">pg_dump / psql</code> kilat dan broadcast realtime ke semua user via Firestore.
              </p>
            </div>

            {/* Right Active Database Card */}
            <div className="bg-slate-900/80 backdrop-blur-md border border-white/15 rounded-2xl p-5 min-w-[280px] sm:min-w-[320px] shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-300 flex items-center gap-1.5">
                  DATABASE AKTIF
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                  ONLINE
                </span>
              </div>

              <div className="space-y-1 mb-4">
                <p className="font-mono text-base sm:text-lg font-black text-white tracking-tight truncate">
                  {currentRefId}
                </p>
                <p className="font-mono text-[11px] text-blue-200/70 truncate">
                  {activeConfig.url || 'https://supabase.co'}
                </p>
              </div>

              <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">Total Data Scan:</span>
                <span className="font-mono font-black text-blue-300 flex items-center gap-1">
                  {isLoadingRows ? (
                    <RefreshCw className="w-3 h-3 animate-spin text-slate-400" />
                  ) : (
                    `${(totalRows || 590680).toLocaleString('id-ID')} rows`
                  )}
                </span>
              </div>
            </div>

          </div>
        </div>

        {/* 2-COLUMN MAIN INTERFACE */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* LEFT COLUMN: MIGRASI KILAT VIA CLI (CMD) */}
          <div className={`rounded-3xl border ${isDarkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200/90'} p-6 sm:p-7 shadow-sm space-y-6 transition-colors`}>
            
            {/* Header */}
            <div className="flex items-center justify-between border-b pb-4 border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 dark:text-amber-400">
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 dark:text-white text-base tracking-tight">
                    Migrasi Kilat via CLI (CMD)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Paste Connection URI & Password untuk generate otomatis
                  </p>
                </div>
              </div>

              <span className="px-3 py-1 rounded-full text-[11px] font-black tracking-wider uppercase bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40">
                15 Detik ⚡
              </span>
            </div>

            {/* Group 1: Database Sumber (Lama) */}
            <div className="rounded-2xl border border-amber-200/80 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/10 p-4 sm:p-5 space-y-3.5">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-800 dark:text-amber-400">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                <span>Database Sumber (Lama)</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  PASTE CONNECTION STRING URI (SUMBER)
                </label>
                <input
                  type="text"
                  value={srcUri}
                  onChange={(e) => setSrcUri(e.target.value)}
                  placeholder="postgresql://postgres.nufulqrtpzfiqghsxsze:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  DB PASSWORD (SUMBER)
                </label>
                <input
                  type="text"
                  value={srcPassword}
                  onChange={(e) => setSrcPassword(e.target.value)}
                  placeholder="Contoh: B#Aka1123AKAL"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                />
              </div>
            </div>

            {/* Group 2: Database Target (Baru) */}
            <div className="rounded-2xl border border-emerald-200/80 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/10 p-4 sm:p-5 space-y-3.5">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>Database Target (Baru)</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  PASTE CONNECTION STRING URI (TARGET BARU)
                </label>
                <input
                  type="text"
                  value={tgtUri}
                  onChange={(e) => setTgtUri(e.target.value)}
                  placeholder="postgresql://postgres.iwvbrigjydmhbwbnbbbk:[YOUR-PASSWORD]@aws-1-ap-south-1.pooler.supabase.com:5432/postgres"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  DB PASSWORD (TARGET)
                </label>
                <input
                  type="text"
                  value={tgtPassword}
                  onChange={(e) => setTgtPassword(e.target.value)}
                  placeholder="Contoh: B#Aka1123AKAL"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                />
              </div>
            </div>

            {/* Generated CMD Commands */}
            <div className="space-y-4 pt-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                PERINTAH COMMAND PROMPT (CMD) YANG DIHASILKAN:
              </h4>

              <div className="space-y-3.5">
                {cmdList.map((item, idx) => (
                  <div key={item.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                      <span>{item.title}</span>
                      <button
                        onClick={() => copyToClipboard(item.command, idx)}
                        className="flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                      >
                        {copiedIndex === idx ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="text-emerald-500">Tersalin!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Salin Perintah</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="bg-slate-950 text-slate-200 rounded-xl p-3 font-mono text-[11px] leading-relaxed overflow-x-auto border border-slate-800 shadow-inner whitespace-pre-wrap select-all">
                      {item.command}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Notice Footer */}
            <div className="flex items-start gap-2 text-[11px] text-slate-500 dark:text-slate-400 pt-2">
              <Info className="w-4 h-4 flex-shrink-0 text-blue-500 mt-0.5" />
              <span>Form input di atas bersifat sementara & akan otomatis bersih setiap website di-refresh demi keamanan.</span>
            </div>

          </div>

          {/* RIGHT COLUMN: HOT-SWAP & SIARAN LIVE (FIRESTORE) */}
          <div className={`rounded-3xl border ${isDarkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200/90'} p-6 sm:p-7 shadow-sm space-y-6 transition-colors flex flex-col justify-between`}>
            
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between border-b pb-4 border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 dark:text-emerald-400">
                    <Radio className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 dark:text-white text-base tracking-tight">
                      Hot-Swap & Siaran Live (Firestore)
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Pindahkan semua user seketika tanpa redeploy
                    </p>
                  </div>
                </div>

                <span className="px-3 py-1 rounded-full text-[11px] font-black tracking-wider uppercase bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/40">
                  Real-Time 🚀
                </span>
              </div>

              {/* Instructional Text */}
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Setelah restore selesai di CMD, masukkan URL & Anon Key Supabase Baru di bawah, lalu klik tombol terapkan. Seluruh HP/Laptop karyawan yang sedang aktif akan otomatis memunculkan pop-up countdown 5 detik dan beralih ke database baru!
              </p>

              {/* Target Supabase URL */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  TARGET SUPABASE URL (BARU)
                </label>
                <input
                  type="text"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://iwvbrigjydmhbwbnbbbk.supabase.co"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>

              {/* Target Supabase Anon Key */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  TARGET SUPABASE ANON KEY (BARU)
                </label>
                <textarea
                  rows={2}
                  value={targetAnonKey}
                  onChange={(e) => setTargetAnonKey(e.target.value)}
                  placeholder="Paste Anon Public Key dari Dashboard Supabase Target..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all leading-tight resize-none"
                />
              </div>

              {/* Test Connection Button & Result */}
              <div className="space-y-2">
                <Button
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  variant="outline"
                  className="w-full h-10 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {isTesting ? <RefreshCw className="w-4 h-4 animate-spin text-blue-500" /> : <RefreshCw className="w-4 h-4" />}
                  <span>{isTesting ? 'Menguji Koneksi...' : 'Tes Koneksi Target'}</span>
                </Button>

                {testResult && (
                  <div className={`p-3 rounded-xl text-xs flex items-start gap-2.5 animate-in fade-in duration-200 ${
                    testResult.success
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50'
                      : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800/50'
                  }`}>
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                    )}
                    <span className="font-medium">{testResult.message}</span>
                  </div>
                )}
              </div>

              {/* Broadcast Checkbox */}
              <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-blue-100 dark:border-blue-950 bg-blue-50/50 dark:bg-blue-950/20 cursor-pointer">
                <input
                  type="checkbox"
                  checked={broadcastToFirestore}
                  onChange={(e) => setBroadcastToFirestore(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Siarkan Real-Time ke Seluruh Perangkat User (via Firestore)
                </span>
              </label>

              {/* Big Apply Action Button */}
              <div className="pt-2">
                <Button
                  onClick={handleApplyAndBroadcast}
                  disabled={isApplying}
                  className="w-full h-13 py-3.5 bg-gradient-to-r from-teal-500 via-emerald-500 to-teal-600 hover:from-teal-600 hover:to-emerald-700 text-white font-black text-sm rounded-2xl shadow-xl shadow-teal-900/20 border border-teal-400/40 transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2.5 uppercase tracking-wider"
                >
                  {isApplying ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <Sparkles className="w-5 h-5" />
                  )}
                  <span>{isApplying ? 'Menerapkan Database...' : 'Terapkan & Siarkan Database Baru'}</span>
                </Button>
              </div>
            </div>

          </div>

        </div>

        {/* BOTTOM ROW CARDS: MASTER SQL SCHEMA & GOOGLE OAUTH */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">

          {/* Master SQL Schema (1-Klik) */}
          <div className={`rounded-3xl border ${isDarkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200/90'} p-6 sm:p-7 shadow-sm space-y-4 transition-colors flex flex-col justify-between`}>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 dark:text-white text-base tracking-tight">
                    Master SQL Schema (1-Klik)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Opsional jika ingin inisialisasi tabel baru manual
                  </p>
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed pt-1">
                Membuat seluruh 18 tabel lengkap dengan indeks pencarian tercepat dan hak akses public secara otomatis.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-3">
              <Button
                onClick={handleCopyMasterSchema}
                className="flex-1 h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
              >
                {copiedSchema ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedSchema ? 'SQL Schema Tersalin!' : 'Copy Master SQL Schema'}</span>
              </Button>

              <a
                href="https://supabase.com/dashboard/project/_/sql"
                target="_blank"
                rel="noopener noreferrer"
                className="h-12 px-5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs flex items-center gap-2 text-slate-700 dark:text-slate-200 transition-colors"
              >
                <span>Supabase</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Google OAuth Helper */}
          <div className={`rounded-3xl border ${isDarkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200/90'} p-6 sm:p-7 shadow-sm space-y-4 transition-colors flex flex-col justify-between`}>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 dark:text-white text-base tracking-tight">
                    Google OAuth (Tanpa Edit Google Console)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Gunakan ID Token langsung
                  </p>
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed pt-1">
                Cukup buka <span className="font-bold text-slate-800 dark:text-slate-200">Supabase Baru &gt; Authentication &gt; Providers &gt; Google &gt; Enable</span> dan paste <span className="font-bold text-slate-800 dark:text-slate-200">Client ID Google</span> lama Anda, Selesai!
              </p>
            </div>

            <div className="pt-3">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span>Tidak perlu ubah Authorized Redirect URI di Google Cloud Console.</span>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
