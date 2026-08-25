import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from './ui/Card';
import { Button } from './ui/Button';
import { Toast } from './ui/Toast';
import { Settings, Play, Square, RefreshCw, Clock, CheckCircle, AlertCircle, Activity, Server, Smartphone } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDistanceToNow } from 'date-fns';
import { id } from 'date-fns/locale';
import { autoSyncService } from '../services/autoSyncService';

interface SyncLog {
  id: number;
  sync_type: string;
  status: string;
  items_updated: number;
  errors: number;
  message: string;
  duration_ms: number;
  created_at: string;
}

interface SyncSettings {
  sync_type: string;
  enabled: boolean;
  interval_minutes: number;
}

export function AutoSyncSettings() {
  const [stockSettings, setStockSettings] = useState<SyncSettings | null>(null);
  const [packingSettings, setPackingSettings] = useState<SyncSettings | null>(null);
  const [stockLogs, setStockLogs] = useState<SyncLog[]>([]);
  const [packingLogs, setPackingLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{
    isOpen: boolean;
    message: string;
    type: 'success' | 'info' | 'warning' | 'error';
  }>({
    isOpen: false,
    message: '',
    type: 'info'
  });

  const showToast = (message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') => {
    setToast({ isOpen: true, message, type });
    setTimeout(() => {
      setToast({ isOpen: false, message: '', type: 'info' });
    }, 4000);
  };

  const loadSettings = async () => {
    try {
      const { data: settings } = await supabase
        .from('auto_sync_settings')
        .select('*');

      if (settings) {
        const stock = settings.find(s => s.sync_type === 'stock');
        const packing = settings.find(s => s.sync_type === 'packing');
        setStockSettings(stock || null);
        setPackingSettings(packing || null);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const loadLogs = async () => {
    try {
      const { data: logs } = await supabase
        .from('auto_sync_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (logs) {
        setStockLogs(logs.filter(l => l.sync_type === 'stock'));
        setPackingLogs(logs.filter(l => l.sync_type === 'packing'));
      }
    } catch (error) {
      console.error('Error loading logs:', error);
    }
  };

  useEffect(() => {
    loadSettings();
    loadLogs();

    const interval = setInterval(() => {
      loadSettings();
      loadLogs();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const toggleSync = async (syncType: 'stock' | 'packing') => {
    setLoading(true);
    try {
      const currentSettings = syncType === 'stock' ? stockSettings : packingSettings;
      const newEnabled = !currentSettings?.enabled;

      const { error } = await supabase
        .from('auto_sync_settings')
        .update({ enabled: newEnabled, updated_at: new Date().toISOString() })
        .eq('sync_type', syncType);

      if (error) throw error;

      await loadSettings();
      showToast(
        `Auto-sync ${syncType} ${newEnabled ? 'diaktifkan' : 'dinonaktifkan'}`,
        newEnabled ? 'success' : 'info'
      );
    } catch (error) {
      console.error('Error toggling sync:', error);
      showToast('Gagal mengubah pengaturan', 'error');
    } finally {
      setLoading(false);
    }
  };

  const manualSync = async (syncType: 'stock' | 'packing', isSilent = false) => {
    if (!isSilent) setLoading(true);
    const startTime = Date.now();
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auto-sync-${syncType}`;

      let result;
      let usedFallback = false;
      
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error('Sync failed');
        }

        result = await response.json();
      } catch (err) {
        console.warn(`Edge function failed for ${syncType}, falling back to Client-Side Auto-Sync Daemon...`);
        usedFallback = true;
        
        let clientResult;
        if (syncType === 'stock') {
          clientResult = await (autoSyncService as any).syncStockData();
        } else {
          clientResult = await (autoSyncService as any).syncPackingData();
        }
        
        result = { itemsUpdated: clientResult.itemsUpdated, errors: clientResult.errors };
        
        // Write to log table since edge function didn't do it
        await supabase.from('auto_sync_logs').insert({
          sync_type: syncType,
          status: clientResult.success ? 'success' : 'error',
          items_updated: result.itemsUpdated,
          errors: result.errors,
          message: `[Client Daemon] ${clientResult.message}`,
          duration_ms: Date.now() - startTime
        });
      }

      await loadLogs();
      if (!isSilent) {
        showToast(
          `Sync ${syncType} berhasil: ${result.itemsUpdated} item diupdate ${usedFallback ? '(via Client Daemon)' : ''}`,
          'success'
        );
      }
    } catch (error) {
      console.error('Error manual sync:', error);
      if (!isSilent) showToast('Gagal melakukan sync', 'error');
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  // Client-Side Daemon Logic
  useEffect(() => {
    const daemonInterval = setInterval(() => {
      const now = new Date();
      
      // Check Stock Sync
      if (stockSettings?.enabled) {
        const lastStockLog = stockLogs[0];
        const lastSyncTime = lastStockLog ? new Date(lastStockLog.created_at) : new Date(0);
        const minutesSinceLastSync = (now.getTime() - lastSyncTime.getTime()) / 60000;
        
        if (minutesSinceLastSync >= (stockSettings.interval_minutes || 5)) {
          console.log('[Daemon] Triggering scheduled stock sync...');
          manualSync('stock', true);
        }
      }

      // Check Packing Sync
      if (packingSettings?.enabled) {
        const lastPackingLog = packingLogs[0];
        const lastSyncTime = lastPackingLog ? new Date(lastPackingLog.created_at) : new Date(0);
        const minutesSinceLastSync = (now.getTime() - lastSyncTime.getTime()) / 60000;
        
        if (minutesSinceLastSync >= (packingSettings.interval_minutes || 5)) {
          console.log('[Daemon] Triggering scheduled packing sync...');
          manualSync('packing', true);
        }
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(daemonInterval);
  }, [stockSettings, packingSettings, stockLogs, packingLogs]);

  const formatLastSync = (logs: SyncLog[]) => {
    if (logs.length === 0) return 'Belum pernah';
    try {
      return formatDistanceToNow(new Date(logs[0].created_at), { addSuffix: true, locale: id });
    } catch {
      return 'Tidak valid';
    }
  };

  const getTotalStats = (logs: SyncLog[]) => {
    return logs.reduce((acc, log) => ({
      syncs: acc.syncs + 1,
      items: acc.items + log.items_updated,
      errors: acc.errors + log.errors,
    }), { syncs: 0, items: 0, errors: 0 });
  };

  const stockStats = getTotalStats(stockLogs);
  const packingStats = getTotalStats(packingLogs);

  return (
    <>
      <Toast
        isOpen={toast.isOpen}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ isOpen: false, message: '', type: 'info' })}
      />

      <div className="space-y-6">
      {/* PREMIUM IMMERSIVE HEADER (310px) */}
      <div className="flex flex-col mb-8 lg:mb-12 uppercase">
        <div className="bg-gradient-to-br from-blue-700 via-indigo-800 to-slate-900 pt-[90px] lg:pt-0 lg:h-[310px] pb-[75px] lg:pb-0 px-6 lg:px-12 rounded-b-[40px] lg:rounded-b-[55px] shadow-2xl shadow-blue-900/40 relative overflow-hidden transition-all duration-500 flex flex-col justify-center">

          {/* Decorative Background Icon */}
          <div className="absolute -top-12 -right-12 text-white opacity-5">
            <Server className="w-72 h-72 lg:w-[480px] lg:h-[480px]" />
          </div>

          {/* Decorative Floating Elements */}
          <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-10 right-10 w-24 h-24 bg-indigo-500/10 rounded-3xl rotate-45 blur-2xl"></div>

          {/* Text Content */}
          <div className="relative z-10 w-full flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 uppercase text-left">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 mb-3 lg:mb-4 opacity-90">
                <div className="w-10 h-[2px] bg-blue-400 rounded-full"></div>
                <span className="text-[10px] lg:text-[12px] font-black tracking-[0.4em] text-blue-100">Automation Engine</span>
              </div>
              <h1 className="text-[34px] lg:text-[58px] font-black text-white tracking-tighter leading-[1] mb-3 uppercase">
                Auto-Sync <span className="text-blue-400">Control</span>
              </h1>
              <div className="text-blue-100/80 font-medium text-[14px] lg:text-[18px] leading-relaxed max-w-[90%] normal-case flex items-center gap-3">
                <div className="px-3 py-1 bg-white/10 rounded-full backdrop-blur-sm border border-white/10 flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-[11px] font-bold tracking-widest uppercase">Server Online 24/7</span>
                </div>
                <span className="opacity-60 hidden sm:inline">|</span>
                <span className="text-[13px] lg:text-[16px]">
                  Kelola sinkronisasi otomatis latar belakang server secara terpusat
                </span>
              </div>
            </div>

            {/* Global Actions Container - Desktop */}
            <div className="relative z-10 flex flex-wrap gap-2 lg:gap-3 lg:mb-2 items-center">
              {loading && (
                <div className="px-5 py-2.5 bg-blue-500/20 backdrop-blur-md border border-white/20 rounded-2xl flex items-center gap-3 mr-2">
                  <Activity className="w-4 h-4 text-white animate-spin" />
                  <span className="text-[11px] font-black text-white tracking-[0.2em] uppercase">Processing</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="lg:px-10 pb-12 -mt-6 lg:-mt-10">

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <CheckCircle className="h-6 w-6 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="text-green-800">
              <h3 className="font-semibold mb-2">Keuntungan Auto-Sync di Server</h3>
              <ul className="text-sm space-y-1 list-disc list-inside">
                <li><strong>Berjalan 24/7</strong> - Tidak perlu buka website, sinkronisasi tetap jalan</li>
                <li><strong>Otomatis setiap 5 menit</strong> - Data selalu update tanpa intervensi manual</li>
                <li><strong>Lebih cepat & efisien</strong> - Dijalankan langsung di server Supabase</li>
                <li><strong>Riwayat lengkap</strong> - Semua aktivitas tercatat dan dapat dipantau</li>
                <li>Aktifkan/nonaktifkan kapan saja sesuai kebutuhan</li>
              </ul>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="bg-red-600 text-white p-4 -m-6 mb-4 rounded-t-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <RefreshCw className={`h-6 w-6 ${stockSettings?.enabled ? 'animate-spin' : ''}`} />
                  <div>
                    <h3 className="text-lg font-bold">Auto-Sync Stok (Server)</h3>
                    <p className="text-red-100 text-sm mt-1">Sinkronkan kolom masuk/keluar/tersedia otomatis setiap 5 menit</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  {stockSettings?.enabled ? (
                    <span className="bg-green-500 text-white px-3 py-1 rounded-full text-sm font-medium flex items-center">
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Aktif
                    </span>
                  ) : (
                    <span className="bg-gray-500 text-white px-3 py-1 rounded-full text-sm font-medium flex items-center">
                      <Square className="h-4 w-4 mr-1" />
                      Tidak Aktif
                    </span>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Status</div>
                  <div className={`text-lg font-bold ${stockSettings?.enabled ? 'text-green-600' : 'text-gray-500'}`}>
                    {stockSettings?.enabled ? 'Berjalan' : 'Berhenti'}
                  </div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Total Sinkronisasi</div>
                  <div className="text-lg font-bold text-blue-600">{stockStats.syncs}</div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Item Diupdate</div>
                  <div className="text-lg font-bold text-green-600">{stockStats.items.toLocaleString()}</div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Error</div>
                  <div className="text-lg font-bold text-red-600">{stockStats.errors}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <div className="flex items-center space-x-2 mb-2">
                    <Clock className="h-5 w-5 text-blue-600" />
                    <div className="text-sm font-medium text-blue-800">Sinkronisasi Terakhir</div>
                  </div>
                  <div className="text-blue-900 font-semibold">
                    {formatLastSync(stockLogs)}
                  </div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <div className="flex items-center space-x-2 mb-2">
                    <Server className="h-5 w-5 text-green-600" />
                    <div className="text-sm font-medium text-green-800">Interval</div>
                  </div>
                  <div className="text-green-900 font-semibold">
                    Setiap 5 menit (otomatis)
                  </div>
                </div>
              </div>

              <div className="border-t pt-6">
                <div className="flex items-center justify-between">
                  <Button
                    onClick={() => manualSync('stock')}
                    variant="secondary"
                    disabled={loading}
                  >
                    <RefreshCw className="h-5 w-5 mr-2" />
                    Sync Manual Sekarang
                  </Button>
                  <Button
                    onClick={() => toggleSync('stock')}
                    variant={stockSettings?.enabled ? 'danger' : 'success'}
                    size="lg"
                    disabled={loading}
                    className={stockSettings?.enabled ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}
                  >
                    {stockSettings?.enabled ? (
                      <>
                        <Square className="h-5 w-5 mr-2" />
                        Nonaktifkan Auto-Sync
                      </>
                    ) : (
                      <>
                        <Play className="h-5 w-5 mr-2" />
                        Aktifkan Auto-Sync
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {stockLogs.length > 0 && (
                <div className="border-t pt-6">
                  <h4 className="font-semibold mb-3 text-gray-700">Riwayat Sinkronisasi (10 Terakhir)</h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {stockLogs.map((log) => (
                      <div
                        key={log.id}
                        className={`p-3 rounded-lg text-sm ${
                          log.status === 'success' ? 'bg-green-50 border border-green-200' :
                          log.status === 'partial' ? 'bg-yellow-50 border border-yellow-200' :
                          'bg-red-50 border border-red-200'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="font-medium">{log.message}</div>
                            <div className="text-gray-600 text-xs mt-1">
                              {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: id })}
                            </div>
                          </div>
                          <div className="text-right ml-4">
                            <div className="text-xs text-gray-500">
                              {(log.duration_ms / 1000).toFixed(1)}s
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="bg-orange-600 text-white p-4 -m-6 mb-4 rounded-t-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <RefreshCw className={`h-6 w-6 ${packingSettings?.enabled ? 'animate-spin' : ''}`} />
                  <div>
                    <h3 className="text-lg font-bold">Auto-Sync Packing (Server)</h3>
                    <p className="text-orange-100 text-sm mt-1">Lengkapi data packing kosong otomatis setiap 5 menit</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  {packingSettings?.enabled ? (
                    <span className="bg-green-500 text-white px-3 py-1 rounded-full text-sm font-medium flex items-center">
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Aktif
                    </span>
                  ) : (
                    <span className="bg-gray-500 text-white px-3 py-1 rounded-full text-sm font-medium flex items-center">
                      <Square className="h-4 w-4 mr-1" />
                      Tidak Aktif
                    </span>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Status</div>
                  <div className={`text-lg font-bold ${packingSettings?.enabled ? 'text-green-600' : 'text-gray-500'}`}>
                    {packingSettings?.enabled ? 'Berjalan' : 'Berhenti'}
                  </div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Total Sinkronisasi</div>
                  <div className="text-lg font-bold text-blue-600">{packingStats.syncs}</div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Item Diupdate</div>
                  <div className="text-lg font-bold text-green-600">{packingStats.items.toLocaleString()}</div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Error</div>
                  <div className="text-lg font-bold text-red-600">{packingStats.errors}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <div className="flex items-center space-x-2 mb-2">
                    <Clock className="h-5 w-5 text-blue-600" />
                    <div className="text-sm font-medium text-blue-800">Sinkronisasi Terakhir</div>
                  </div>
                  <div className="text-blue-900 font-semibold">
                    {formatLastSync(packingLogs)}
                  </div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <div className="flex items-center space-x-2 mb-2">
                    <Server className="h-5 w-5 text-green-600" />
                    <div className="text-sm font-medium text-green-800">Interval</div>
                  </div>
                  <div className="text-green-900 font-semibold">
                    Setiap 5 menit (otomatis)
                  </div>
                </div>
              </div>

              <div className="border-t pt-6">
                <div className="flex items-center justify-between">
                  <Button
                    onClick={() => manualSync('packing')}
                    variant="secondary"
                    disabled={loading}
                  >
                    <RefreshCw className="h-5 w-5 mr-2" />
                    Sync Manual Sekarang
                  </Button>
                  <Button
                    onClick={() => toggleSync('packing')}
                    variant={packingSettings?.enabled ? 'danger' : 'success'}
                    size="lg"
                    disabled={loading}
                    className={packingSettings?.enabled ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}
                  >
                    {packingSettings?.enabled ? (
                      <>
                        <Square className="h-5 w-5 mr-2" />
                        Nonaktifkan Auto-Sync
                      </>
                    ) : (
                      <>
                        <Play className="h-5 w-5 mr-2" />
                        Aktifkan Auto-Sync
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {packingLogs.length > 0 && (
                <div className="border-t pt-6">
                  <h4 className="font-semibold mb-3 text-gray-700">Riwayat Sinkronisasi (10 Terakhir)</h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {packingLogs.map((log) => (
                      <div
                        key={log.id}
                        className={`p-3 rounded-lg text-sm ${
                          log.status === 'success' ? 'bg-green-50 border border-green-200' :
                          log.status === 'partial' ? 'bg-yellow-50 border border-yellow-200' :
                          'bg-red-50 border border-red-200'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="font-medium">{log.message}</div>
                            <div className="text-gray-600 text-xs mt-1">
                              {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: id })}
                            </div>
                          </div>
                          <div className="text-right ml-4">
                            <div className="text-xs text-gray-500">
                              {(log.duration_ms / 1000).toFixed(1)}s
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <Activity className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-blue-800">
              <h3 className="font-semibold mb-2">Cara Kerja Auto-Sync Server</h3>
              <ul className="text-sm space-y-1 list-disc list-inside">
                <li>Auto-sync berjalan di <strong>server Supabase</strong>, bukan di browser</li>
                <li>Sinkronisasi otomatis dijalankan setiap <strong>5 menit</strong> oleh sistem</li>
                <li><strong>Tidak perlu buka website</strong> - sync tetap jalan 24/7</li>
                <li>Semua aktivitas tercatat di riwayat untuk monitoring</li>
                <li>Klik tombol "Aktifkan/Nonaktifkan" untuk mengontrol auto-sync</li>
                <li>Gunakan "Sync Manual" untuk sinkronisasi segera tanpa menunggu jadwal</li>
              </ul>
            </div>
          </div>
        </div>
        </div>
      </div>
    </>
  );
}
