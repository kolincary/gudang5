import React, { useEffect, useState } from 'react';
import { multiDbManager } from '../services/multiDbManager';
import type { SupabaseBroadcastConfig } from '../types/dbConfig';
import { Database, RefreshCw, Sparkles, CheckCircle2, Server } from 'lucide-react';
import { Button } from './ui/Button';

export const DatabaseHotSwapListener: React.FC = () => {
  const [broadcastData, setBroadcastData] = useState<SupabaseBroadcastConfig | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const unsubscribe = multiDbManager.listenToConfigChanges((config) => {
      const activeConfig = multiDbManager.getActiveConfig();
      const currentUrl = (activeConfig.url || '').trim().replace(/\/$/, '');
      const incomingUrl = (config.url || '').trim().replace(/\/$/, '');
      const currentKey = (activeConfig.anonKey || '').trim();
      const incomingKey = (config.anonKey || '').trim();

      // Check if URL or Key changed
      if (incomingUrl && incomingKey && (currentUrl !== incomingUrl || currentKey !== incomingKey)) {
        console.log('⚡ Received Supabase Hot-Swap signal from Firestore:', config);
        setBroadcastData(config);
        setShowModal(true);
        setCountdown(5);
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!showModal) return;

    if (countdown <= 0) {
      applyAndReload();
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [showModal, countdown]);

  const applyAndReload = () => {
    if (broadcastData) {
      localStorage.setItem('custom_supabase_url', broadcastData.url.trim());
      localStorage.setItem('custom_supabase_anon_key', broadcastData.anonKey.trim());
      
      const refId = multiDbManager.extractRefIdFromUrl(broadcastData.url);
      const currentCfg = multiDbManager.loadConfig();
      const updatedDbs = currentCfg.databases.map(d => ({
        ...d,
        isActiveForWrite: d.url.trim() === broadcastData.url.trim(),
        status: (d.url.trim() === broadcastData.url.trim() ? 'active' : (d.status === 'active' ? 'read_only_full' : d.status)) as any
      }));
      
      if (!updatedDbs.some(d => d.url.trim() === broadcastData.url.trim())) {
        updatedDbs.unshift({
          id: `supabase_${refId || Date.now()}`,
          name: broadcastData.name || `Supabase Target (${refId})`,
          url: broadcastData.url.trim(),
          anonKey: broadcastData.anonKey.trim(),
          status: 'active',
          isActiveForWrite: true,
          isReadOnly: false,
          priority: 1,
          createdAt: new Date().toISOString()
        });
      }

      multiDbManager.saveConfig({
        ...currentCfg,
        activeWriteDbId: updatedDbs[0].id,
        databases: updatedDbs
      });
    }

    window.location.reload();
  };

  if (!showModal || !broadcastData) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="bg-gradient-to-b from-slate-900 to-slate-950 text-white border border-blue-500/30 rounded-3xl shadow-[0_20px_70px_rgba(37,99,235,0.4)] max-w-lg w-full p-6 sm:p-8 text-center relative overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* Background glow effects */}
        <div className="absolute -top-20 -right-20 w-48 h-48 bg-blue-500/20 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none"></div>

        {/* Pulsing Icon */}
        <div className="relative mx-auto w-20 h-20 mb-6 flex items-center justify-center">
          <div className="absolute inset-0 bg-gradient-to-tr from-blue-600 to-emerald-500 rounded-2xl animate-pulse opacity-50 blur-sm"></div>
          <div className="relative w-16 h-16 bg-slate-900 border border-blue-400/40 rounded-2xl flex items-center justify-center shadow-lg">
            <Database className="w-8 h-8 text-emerald-400 animate-bounce" />
          </div>
          <div className="absolute -top-1 -right-1 bg-emerald-500 text-black text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest shadow-md">
            Hot-Swap
          </div>
        </div>

        {/* Title & Message */}
        <div className="space-y-2 mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-300 text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>Peralihan Database Supabase Baru</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Database Dialihkan!
          </h2>
          <p className="text-slate-300 text-sm leading-relaxed">
            Admin telah mengalihkan koneksi ke instance Supabase baru. Seluruh data transaksi akan terhubung ke server baru.
          </p>
        </div>

        {/* Target Info Box */}
        <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4 mb-6 text-left space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 flex items-center gap-1.5 font-bold uppercase tracking-wider">
              <Server className="w-3.5 h-3.5 text-blue-400" /> Target Database
            </span>
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Siap Digunakan
            </span>
          </div>
          <div className="bg-slate-950/80 rounded-xl p-2.5 font-mono text-xs text-blue-300 truncate border border-slate-800">
            {broadcastData.url}
          </div>
        </div>

        {/* Countdown Circular Badge */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-full border-2 border-emerald-500/60 bg-emerald-500/10 flex items-center justify-center font-black text-emerald-400 text-xl shadow-[0_0_15px_rgba(16,185,129,0.3)]">
            {countdown}
          </div>
          <div className="text-left text-xs text-slate-400">
            <p className="font-bold text-slate-200">Beralih otomatis dalam {countdown} detik</p>
            <p>Halaman akan dimuat ulang secara otomatis</p>
          </div>
        </div>

        {/* Immediate Switch Button */}
        <Button
          onClick={applyAndReload}
          className="w-full h-14 bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-600 hover:from-emerald-600 hover:to-blue-700 text-white font-black text-base rounded-2xl shadow-xl shadow-emerald-900/40 border border-emerald-400/30 transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Beralih Sekarang ({countdown}s)</span>
        </Button>
      </div>
    </div>
  );
};
