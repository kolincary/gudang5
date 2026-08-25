import React, { useState } from 'react';
import { useDatabaseConfig } from '../lib/DatabaseContext';
import { Database, Server, RefreshCw, HardDrive, ShieldAlert, CheckCircle2, AlertTriangle, Info, UploadCloud } from 'lucide-react';
import { Button } from './ui/Button';
import { DatabaseService } from '../lib/DatabaseService';

export function DatabaseSettings() {
  const { writeMode, setWriteMode, readMode, setReadMode } = useDatabaseConfig();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncingLogs, setIsSyncingLogs] = useState(false);
  const [toast, setToast] = useState<{ show: boolean; msg: string; type: 'success' | 'error' }>({
    show: false, msg: '', type: 'success'
  });

  const handleSyncMasterData = async () => {
    if (!window.confirm('Apakah Anda yakin ingin menyinkronkan SEMUA data stok_items dari Supabase ke Firebase? Ini bisa memakan waktu beberapa detik.')) return;
    
    setIsSyncing(true);
    try {
      const result = await DatabaseService.syncMasterDataToFirebase();
      setToast({ show: true, msg: `Berhasil sinkronisasi ${result.count} data master ke Firebase!`, type: 'success' });
    } catch (error) {
      console.error(error);
      setToast({ show: true, msg: 'Gagal melakukan sinkronisasi data master.', type: 'error' });
    } finally {
      setIsSyncing(false);
      setTimeout(() => setToast({ show: false, msg: '', type: 'success' }), 5000);
    }
  };

  const handleSyncLogs = async () => {
    if (!window.confirm('Apakah Anda yakin ingin menyinkronkan SEMUA data database_log dari Supabase ke Firebase? Ini bisa memakan waktu cukup lama tergantung jumlah data.')) return;
    
    setIsSyncingLogs(true);
    try {
      const result = await DatabaseService.syncLogsToFirebase();
      setToast({ show: true, msg: `Berhasil sinkronisasi ${result.count} data log ke Firebase!`, type: 'success' });
    } catch (error) {
      console.error(error);
      setToast({ show: true, msg: 'Gagal melakukan sinkronisasi log.', type: 'error' });
    } finally {
      setIsSyncingLogs(false);
      setTimeout(() => setToast({ show: false, msg: '', type: 'success' }), 5000);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Toast Notification */}
      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-5 ${
          toast.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <ShieldAlert className="w-5 h-5 text-red-600" />}
          <span className="font-medium">{toast.msg}</span>
        </div>
      )}

      {/* PREMIUM IMMERSIVE HEADER (310px) */}
      <div className="flex flex-col mb-8 lg:mb-12 uppercase">
        <div className="bg-gradient-to-br from-blue-700 via-indigo-800 to-slate-900 pt-[90px] lg:pt-0 lg:h-[310px] pb-[75px] lg:pb-0 px-6 lg:px-12 rounded-b-[40px] lg:rounded-b-[55px] shadow-2xl shadow-blue-900/40 relative overflow-hidden transition-all duration-500 flex flex-col justify-center">
          {/* Decorative Background Icon */}
          <div className="absolute -top-12 -right-12 text-white opacity-5">
            <Database className="w-72 h-72 lg:w-[480px] lg:h-[480px]" />
          </div>
          {/* Decorative Floating Elements */}
          <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-24 h-24 bg-indigo-500/10 rounded-3xl rotate-45 blur-2xl"></div>

          {/* Text Content */}
          <div className="relative z-10 w-full flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 uppercase text-left">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 mb-3 lg:mb-4 opacity-90">
                <div className="w-10 h-[2px] bg-blue-400 rounded-full"></div>
                <span className="text-[10px] lg:text-[12px] font-black tracking-[0.4em] text-blue-100">System Config</span>
              </div>
              <h1 className="text-[34px] lg:text-[54px] font-black text-white tracking-tighter leading-[0.9] mb-3 uppercase">
                Database <span className="text-blue-400">Pusat</span>
              </h1>
              <div className="text-blue-100/80 font-medium text-[14px] lg:text-[18px] leading-relaxed max-w-[90%] normal-case flex items-center gap-3">
                  <div className="px-3 py-1 bg-white/10 rounded-full backdrop-blur-sm border border-white/10 flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                    </span>
                    <span className="text-[11px] font-bold tracking-widest uppercase">Infrastruktur Data</span>
                  </div>
                  <span className="text-[13px] lg:text-[16px]">Kelola sinkronisasi & mode fallback.</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="relative z-10 flex flex-wrap gap-2 lg:gap-3 lg:mb-2 items-center">
              <Button 
                onClick={handleSyncMasterData} 
                disabled={isSyncing || isSyncingLogs}
                className="h-12 px-6 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-2xl shadow-[0_8px_25px_rgba(16,185,129,0.35)] transition-all active:scale-95 flex items-center justify-center gap-2.5 border border-emerald-400/50"
              >
                {isSyncing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                <span className="uppercase text-xs font-black">
                  {isSyncing ? 'Menyinkronkan...' : 'Sync Master Data'}
                </span>
              </Button>
              <Button 
                onClick={handleSyncLogs} 
                disabled={isSyncing || isSyncingLogs}
                className="h-12 px-6 bg-blue-500 hover:bg-blue-600 text-white font-black rounded-2xl shadow-[0_8px_25px_rgba(59,130,246,0.35)] transition-all active:scale-95 flex items-center justify-center gap-2.5 border border-blue-400/50"
              >
                {isSyncingLogs ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                <span className="uppercase text-xs font-black">
                  {isSyncingLogs ? 'Menyinkronkan...' : 'Sync Log Riwayat'}
                </span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 shadow-sm">
        <ShieldAlert className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-bold text-amber-800">Area Berbahaya (Developer Only)</h3>
          <p className="text-xs text-amber-700 mt-1">
            Mengubah pengaturan ini akan mempengaruhi dari mana seluruh aplikasi membaca dan menulis data. Pastikan Anda memahami dampaknya sebelum mengubah mode.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* WRITE MODE */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 p-4 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-indigo-600" />
              Mode Tulis (Write)
            </h2>
            <p className="text-xs text-gray-500 mt-1">Tentukan ke mana data akan disimpan saat ada perubahan.</p>
          </div>
          <div className="p-4 space-y-3">
            <label className={`flex items-start p-3 rounded-xl border-2 cursor-pointer transition-all ${writeMode === 'supabase' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-100 hover:bg-gray-50'}`}>
              <input 
                type="radio" 
                name="writeMode"
                className="mt-1 mr-3 h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                checked={writeMode === 'supabase'}
                onChange={() => setWriteMode('supabase')}
              />
              <div>
                <span className="block text-sm font-bold text-gray-900">Supabase Saja</span>
                <span className="block text-xs text-gray-500 mt-0.5">Normal mode. Data hanya ditulis ke Supabase PostgreSQL.</span>
              </div>
            </label>

            <label className={`flex items-start p-3 rounded-xl border-2 cursor-pointer transition-all ${writeMode === 'firebase' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-100 hover:bg-gray-50'}`}>
              <input 
                type="radio" 
                name="writeMode"
                className="mt-1 mr-3 h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                checked={writeMode === 'firebase'}
                onChange={() => setWriteMode('firebase')}
              />
              <div>
                <span className="block text-sm font-bold text-gray-900">Firebase Saja (Darurat)</span>
                <span className="block text-xs text-gray-500 mt-0.5">Supabase diabaikan. Penulisan dialihkan sepenuhnya ke Firestore.</span>
              </div>
            </label>

            <label className={`flex items-start p-3 rounded-xl border-2 cursor-pointer transition-all ${writeMode === 'both' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-100 hover:bg-gray-50'}`}>
              <input 
                type="radio" 
                name="writeMode"
                className="mt-1 mr-3 h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                checked={writeMode === 'both'}
                onChange={() => setWriteMode('both')}
              />
              <div>
                <span className="flex items-center gap-2 text-sm font-bold text-gray-900">
                  Dual-Write (Rekomendasi)
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                </span>
                <span className="block text-xs text-gray-500 mt-0.5">Menulis ke Supabase & Firestore secara bersamaan sebagai cadangan aktif.</span>
              </div>
            </label>
          </div>
        </div>

        {/* READ MODE */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 p-4 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Server className="h-5 w-5 text-emerald-600" />
              Mode Baca (Read)
            </h2>
            <p className="text-xs text-gray-500 mt-1">Tentukan dari mana data ditarik untuk ditampilkan ke UI.</p>
          </div>
          <div className="p-4 space-y-3">
            <label className={`flex items-start p-3 rounded-xl border-2 cursor-pointer transition-all ${readMode === 'supabase' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-100 hover:bg-gray-50'}`}>
              <input 
                type="radio" 
                name="readMode"
                className="mt-1 mr-3 h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                checked={readMode === 'supabase'}
                onChange={() => setReadMode('supabase')}
              />
              <div>
                <span className="flex items-center gap-2 text-sm font-bold text-gray-900">
                  Supabase (Primary)
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                </span>
                <span className="block text-xs text-gray-500 mt-0.5">Membaca seluruh data dari PostgreSQL.</span>
              </div>
            </label>

            <label className={`flex items-start p-3 rounded-xl border-2 cursor-pointer transition-all ${readMode === 'firebase' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-100 hover:bg-gray-50'}`}>
              <input 
                type="radio" 
                name="readMode"
                className="mt-1 mr-3 h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                checked={readMode === 'firebase'}
                onChange={() => setReadMode('firebase')}
              />
              <div>
                <span className="block text-sm font-bold text-gray-900 flex items-center gap-2">
                  Firebase (Fallback)
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                </span>
                <span className="block text-xs text-gray-500 mt-0.5">Membaca dari Firestore. Gunakan hanya jika Supabase down.</span>
              </div>
            </label>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <h4 className="text-sm font-bold text-blue-900 flex items-center gap-2">
          <Info className="h-4 w-4" />
          Status Implementasi
        </h4>
        <ul className="mt-2 text-xs text-blue-800 space-y-1 list-disc list-inside">
          <li>Pengaturan di atas tersimpan otomatis di browser (localStorage).</li>
          <li>Saat ini mode Dual-Write baru diimplementasikan untuk form Input Barang Keluar & Database Log.</li>
          <li>Komponen lain sedang dalam tahap migrasi ke Database Service secara bertahap.</li>
        </ul>
      </div>
    </div>
  );
}
