import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from './ui/Card';
import { Button } from './ui/Button';
import { Toast } from './ui/Toast';
import { CheckCircle, AlertCircle, Loader, RefreshCw, BarChart3, Eye, EyeOff } from 'lucide-react';
import { transferSyncService, MissingTransferItem, ProcessResult, SyncLogEntry } from '../services/transferSyncService';

interface Stats {
  total: number;
  with_stock_items: number;
  without_stock_items: number;
}

interface SyncStatus {
  last_sync_at: string | null;
  total_created: number;
  total_skipped: number;
  last_operation_type: string | null;
}

export function TransferSync() {
  const [stats, setStats] = useState<Stats>({ total: 0, with_stock_items: 0, without_stock_items: 0 });
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    last_sync_at: null,
    total_created: 0,
    total_skipped: 0,
    last_operation_type: null,
  });
  const [missingItems, setMissingItems] = useState<MissingTransferItem[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showMissingDetails, setShowMissingDetails] = useState(false);
  const [showSyncLogs, setShowSyncLogs] = useState(false);

  const [toast, setToast] = useState<{
    isOpen: boolean;
    message: string;
    type: 'success' | 'info' | 'warning' | 'error';
  }>({
    isOpen: false,
    message: '',
    type: 'info',
  });

  const showToast = (message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') => {
    setToast({ isOpen: true, message, type });
    setTimeout(() => {
      setToast({ isOpen: false, message: '', type: 'info' });
    }, 4000);
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [statsResult, statusResult, logsResult] = await Promise.all([
        transferSyncService.getTransferEntriesCount(),
        transferSyncService.getRecentSyncStats(),
        transferSyncService.getSyncLogs(10),
      ]);

      if (statsResult.success && statsResult.total !== undefined) {
        setStats({
          total: statsResult.total,
          with_stock_items: statsResult.with_stock_items || 0,
          without_stock_items: statsResult.without_stock_items || 0,
        });
      }

      if (statusResult.success && statusResult.stats) {
        setSyncStatus(statusResult.stats);
      }

      if (logsResult.success && logsResult.data) {
        setSyncLogs(logsResult.data);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      showToast('Gagal memuat data', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckMissing = async () => {
    setIsLoading(true);
    try {
      const result = await transferSyncService.findMissingTransferItems();

      if (!result.success) {
        showToast('Gagal memeriksa missing items', 'error');
        return;
      }

      setMissingItems(result.data || []);
      showToast(`Ditemukan ${result.data?.length || 0} kombinasi SKU+RAK yang hilang`, 'info');
    } catch (error) {
      console.error('Error checking missing items:', error);
      showToast('Error saat memeriksa missing items', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleProcessTransfers = async () => {
    if (stats.without_stock_items === 0) {
      showToast('Tidak ada TRANSFER entry yang perlu disinkronisasi', 'info');
      return;
    }

    setIsSyncing(true);
    try {
      const result = await transferSyncService.processPendingTransfers();

      if (!result.success) {
        showToast('Gagal memproses TRANSFER entries', 'error');
        return;
      }

      showToast(
        `Sinkronisasi selesai: ${result.result?.items_created || 0} dibuat, ${result.result?.items_skipped || 0} dilewati`,
        'success'
      );

      await loadData();
    } catch (error) {
      console.error('Error processing transfers:', error);
      showToast('Error saat memproses TRANSFER entries', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('id-ID', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* PREMIUM IMMERSIVE HEADER (310px) */}
      <div className="flex flex-col mb-8 lg:mb-12 uppercase">
        <div className="bg-gradient-to-br from-blue-700 via-indigo-800 to-slate-900 pt-[90px] lg:pt-0 lg:h-[310px] pb-[75px] lg:pb-0 px-6 lg:px-12 rounded-b-[40px] lg:rounded-b-[55px] shadow-2xl shadow-blue-900/40 relative overflow-hidden transition-all duration-500 flex flex-col justify-center">

          {/* Decorative Background Icon */}
          <div className="absolute -top-12 -right-12 text-white opacity-5">
            <BarChart3 className="w-72 h-72 lg:w-[480px] lg:h-[480px]" />
          </div>

          {/* Decorative Floating Elements */}
          <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-24 h-24 bg-indigo-500/10 rounded-3xl rotate-45 blur-2xl"></div>

          {/* Text Content */}
          <div className="relative z-10 w-full flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 uppercase text-left">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 mb-3 lg:mb-4 opacity-90">
                <div className="w-10 h-[2px] bg-blue-400 rounded-full"></div>
                <span className="text-[10px] lg:text-[12px] font-black tracking-[0.4em] text-blue-100">Data Synchronization Center</span>
              </div>
              <h1 className="text-[34px] lg:text-[58px] font-black text-white tracking-tighter leading-[1] mb-3 uppercase">
                Transfer <span className="text-blue-400">Sync</span>
              </h1>
              <div className="text-blue-100/80 font-medium text-[14px] lg:text-[18px] leading-relaxed max-w-[90%] normal-case flex items-center gap-3">
                <div className="px-3 py-1 bg-white/10 rounded-full backdrop-blur-sm border border-white/10 flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${stats.without_stock_items > 0 ? 'bg-orange-400' : 'bg-emerald-400'} opacity-75`}></span>
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${stats.without_stock_items > 0 ? 'bg-orange-500' : 'bg-emerald-500'}`}></span>
                  </span>
                  <span className="text-[11px] font-bold tracking-widest uppercase">
                    {stats.without_stock_items > 0 ? 'Action Required' : 'Fully Synced'}
                  </span>
                </div>
                <span className="opacity-60 hidden sm:inline">|</span>
                <span className="text-[13px] lg:text-[16px]">
                  Sinkronisasi entry dari database log ke stock items secara terpusat
                </span>
              </div>
            </div>

            {/* Global Actions Container - Desktop */}
            <div className="relative z-10 flex flex-wrap gap-2 lg:gap-3 lg:mb-2 items-center">
              {(isLoading || isSyncing) && (
                <div className="px-5 py-2.5 bg-blue-500/20 backdrop-blur-md border border-white/20 rounded-2xl flex items-center gap-3 mr-2">
                  <RefreshCw className="w-4 h-4 text-white animate-spin" />
                  <span className="text-[11px] font-black text-white tracking-[0.2em] uppercase">Syncing</span>
                </div>
              )}

              <button
                onClick={loadData}
                disabled={isLoading || isSyncing}
                className="h-12 px-6 bg-white/10 hover:bg-white/20 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2.5 border border-white/30 backdrop-blur-xl disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading || isSyncing ? 'animate-spin' : ''}`} />
                <span className="uppercase text-xs font-black">Refresh Data</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="lg:px-10 pb-12 -mt-6 lg:-mt-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 relative z-20">
          <div className="bg-white/90 backdrop-blur-sm border border-white/50 p-6 rounded-3xl shadow-xl shadow-blue-900/5 group hover:scale-[1.02] transition-all duration-300">
            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-2 opacity-70 group-hover:opacity-100">Total Entries</p>
            <div className="flex items-end justify-between">
              <h2 className="text-4xl font-black text-slate-800 tracking-tighter">{stats.total}</h2>
              <div className="p-2 bg-blue-50 rounded-xl">
                <BarChart3 className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white/90 backdrop-blur-sm border border-white/50 p-6 rounded-3xl shadow-xl shadow-blue-900/5 group hover:scale-[1.02] transition-all duration-300">
            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2 opacity-70 group-hover:opacity-100">With Stock Items</p>
            <div className="flex items-end justify-between">
              <h2 className="text-4xl font-black text-emerald-600 tracking-tighter">{stats.with_stock_items}</h2>
              <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600 font-black text-[10px]">
                {stats.total > 0 ? Math.round((stats.with_stock_items / stats.total) * 100) : 0}%
              </div>
            </div>
          </div>

          <div className={`backdrop-blur-sm p-6 rounded-3xl shadow-xl group hover:scale-[1.02] transition-all duration-300 ${stats.without_stock_items > 0 ? 'bg-orange-500 text-white shadow-orange-500/25 border-orange-400' : 'bg-white/90 border-white/50 shadow-blue-900/5'}`}>
            <p className={`text-[10px] font-black uppercase tracking-widest mb-2 opacity-70 group-hover:opacity-100 ${stats.without_stock_items > 0 ? 'text-white/80' : 'text-slate-500'}`}>Requires Sync</p>
            <div className="flex items-end justify-between">
              <h2 className={`text-4xl font-black tracking-tighter ${stats.without_stock_items > 0 ? 'text-white' : 'text-slate-800'}`}>{stats.without_stock_items}</h2>
              {stats.without_stock_items > 0 && (
                <div className="p-2 bg-white/20 rounded-xl animate-pulse">
                  <AlertCircle className="w-5 h-5 text-white" />
                </div>
              )}
            </div>
          </div>
        </div>

      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900">Status Sinkronisasi</h3>
        </CardHeader>
        <CardContent>
          {syncStatus.last_sync_at ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                <span className="text-sm text-gray-600">Terakhir disinkronisasi:</span>
                <span className="font-medium text-gray-900">{formatDate(syncStatus.last_sync_at)}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <div className="rounded-lg bg-green-50 p-3">
                  <p className="text-xs text-gray-600">Dibuat</p>
                  <p className="mt-1 text-2xl font-bold text-green-600">{syncStatus.total_created}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-600">Dilewati</p>
                  <p className="mt-1 text-2xl font-bold text-gray-600">{syncStatus.total_skipped}</p>
                </div>
                <div className="rounded-lg bg-blue-50 p-3">
                  <p className="text-xs text-gray-600">Tipe Operasi</p>
                  <p className="mt-1 text-sm font-semibold text-blue-600">{syncStatus.last_operation_type}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-lg bg-gray-50 p-6">
              <p className="text-sm text-gray-500">Belum ada data sinkronisasi</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900">Aksi</h3>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            onClick={handleCheckMissing}
            disabled={isLoading || isSyncing}
            variant="outline"
            className="w-full gap-2"
          >
            {isLoading ? <Loader className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
            Lihat Missing Stock Items
          </Button>

          <Button
            onClick={handleProcessTransfers}
            disabled={isSyncing || isLoading || stats.without_stock_items === 0}
            className="w-full gap-2 bg-blue-600 text-white hover:bg-blue-700"
          >
            {isSyncing ? <Loader className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            {isSyncing ? 'Memproses...' : 'Sinkronisasi TRANSFER'}
          </Button>
        </CardContent>
      </Card>

      {showMissingDetails && missingItems.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Missing Stock Items ({missingItems.length})</h3>
              <button onClick={() => setShowMissingDetails(false)} className="text-gray-400 hover:text-gray-600">
                <EyeOff className="h-5 w-5" />
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-2 text-left font-semibold text-gray-900">SKU</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-900">Rak</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-900">Nama Produk</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-900">Satuan</th>
                    <th className="px-4 py-2 text-center font-semibold text-gray-900">Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  {missingItems.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-900">{item.sku}</td>
                      <td className="px-4 py-2 text-gray-900">{item.rak}</td>
                      <td className="px-4 py-2 text-gray-700">{item.product_name}</td>
                      <td className="px-4 py-2 text-gray-700">{item.satuan}</td>
                      <td className="px-4 py-2 text-center font-medium text-orange-600">{item.count_in_log}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {showSyncLogs && syncLogs.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Sync History</h3>
              <button onClick={() => setShowSyncLogs(false)} className="text-gray-400 hover:text-gray-600">
                <EyeOff className="h-5 w-5" />
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {syncLogs.map((log) => (
                <div key={log.id} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{log.operation_type}</p>
                      <p className="mt-1 text-xs text-gray-500">{formatDate(log.created_at)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600">
                        <span className="font-semibold text-green-600">{log.items_created}</span> dibuat
                      </p>
                      <p className="mt-1 text-sm text-gray-600">
                        <span className="font-semibold text-gray-600">{log.items_skipped}</span> dilewati
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    Total diproses: {log.total_processed} | Oleh: {log.created_by}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {missingItems.length > 0 && !showMissingDetails && (
        <Button
          onClick={() => setShowMissingDetails(true)}
          variant="outline"
          className="w-full gap-2"
        >
          <Eye className="h-4 w-4" />
          Tampilkan {missingItems.length} Missing Items
        </Button>
      )}

      {syncLogs.length > 0 && !showSyncLogs && (
        <Button
          onClick={() => setShowSyncLogs(true)}
          variant="outline"
          className="w-full gap-2"
        >
          <Eye className="h-4 w-4" />
          Tampilkan Sync History
        </Button>
      )}

        </div>

      <Toast
        isOpen={toast.isOpen}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ ...toast, isOpen: false })}
      />
    </div>
  );
}
