import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from './ui/Card';
import { Button } from './ui/Button';
import { Toast } from './ui/Toast';
import { RefreshCw, Database, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { supabase, fetchAllStockItems } from '../lib/supabase';

interface StockSyncResult {
  nama_produk: string;
  rak: string;
  old_masuk: number;
  old_keluar: number;
  old_tersedia: number;
  new_masuk: number;
  new_keluar: number;
  new_tersedia: number;
  difference: number;
}

export function FixStockSync() {
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [syncResults, setSyncResults] = useState<StockSyncResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [analysisStats, setAnalysisStats] = useState({
    totalItems: 0,
    processedItems: 0,
    utamaItems: 0,
    discrepanciesFound: 0
  });
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
    }, 5000);
  };

  // Utility function to fetch all database log entries
  const fetchAllDatabaseLogs = async () => {
    try {
      console.log('Starting to load all database log entries...');
      
      let allData: any[] = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;
      let totalCount = 0;
      
      while (hasMore) {
        const { data, error, count } = await supabase
          .from('database_log')
          .select('*', { count: 'exact' })
          .range(from, from + batchSize - 1)
          .order('created_at', { ascending: false });

        if (error) {
          console.error(`Error loading batch ${from}-${from + batchSize - 1}:`, error);
          throw error;
        }

        if (data && data.length > 0) {
          allData = [...allData, ...data];
          console.log(`Loaded batch: ${from + 1}-${from + data.length}, Total so far: ${allData.length}`);
          
          // Set total count from first batch
          if (from === 0 && count !== null) {
            totalCount = count;
            console.log(`Total database log entries: ${count}`);
          }
          
          // Check if we have more data
          if (data.length < batchSize) {
            hasMore = false;
            console.log('Reached end of database log data');
          } else {
            from += batchSize;
          }
        } else {
          hasMore = false;
          console.log('No more database log data to load');
        }
        
        // Add small delay to prevent overwhelming the database
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      console.log(`✓ Successfully loaded all ${allData.length} database log entries`);
      
      return {
        data: allData,
        totalCount: totalCount || allData.length,
        success: true
      };
      
    } catch (error) {
      console.error('Error fetching all database log entries:', error);
      return {
        data: [],
        totalCount: 0,
        success: false,
        error
      };
    }
  };

  const analyzeStockDiscrepancies = async () => {
    try {
      setAnalyzing(true);
      setSyncResults([]);
      setShowResults(false);
      setAnalysisStats({
        totalItems: 0,
        processedItems: 0,
        utamaItems: 0,
        discrepanciesFound: 0
      });
      showToast('Menganalisis perbedaan data...', 'info');

      // Load ALL stock items using the utility function
      showToast('Memuat semua data stock items...', 'info');
      const stockResult = await fetchAllStockItems();
      if (!stockResult.success) {
        throw new Error('Gagal memuat data stock items');
      }

      // Filter for UTAMA racks only
      const stockItems = stockResult.data.filter(item => 
        item.status === 'Aktif' && (
          item.rak?.toUpperCase().includes('UTAMA') || 
          item.sub_rak?.toUpperCase().includes('UTAMA')
        )
      );

      // Load ALL database log entries
      showToast('Memuat semua data database log...', 'info');
      const logResult = await fetchAllDatabaseLogs();
      if (!logResult.success) {
        throw new Error('Gagal memuat data database log');
      }
      const allLogData = logResult.data;

      setAnalysisStats(prev => ({
        ...prev,
        totalItems: stockResult.totalCount,
        utamaItems: stockItems.length
      }));

      showToast(`Menganalisis ${stockItems.length} item UTAMA dari ${stockResult.totalCount} total item...`, 'info');

      const results: StockSyncResult[] = [];
      let processedCount = 0;
      const totalItems = stockItems.length;

      for (const item of stockItems) {
        processedCount++;
        
        // Update progress every 50 items instead of 10 for better performance
        if (processedCount % 50 === 0) {
          showToast(`Menganalisis item ${processedCount} dari ${totalItems}...`, 'info');
          setAnalysisStats(prev => ({
            ...prev,
            processedItems: processedCount
          }));
          // Small delay to prevent UI blocking
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Filter log data from the complete dataset for this specific product and UTAMA racks
        const utamaLogData = allLogData.filter(log => 
          log.sku === item.nama_produk &&
          log.rak && log.rak.toUpperCase().includes('UTAMA')
        );

        const actualMasuk = utamaLogData
          .filter(log => log.type === 'IN')
          .reduce((sum, log) => sum + (log.jumlah || 0), 0);

        const actualKeluar = utamaLogData
          .filter(log => log.type === 'OUT')
          .reduce((sum, log) => sum + (log.jumlah || 0), 0);

        const actualTersedia = (item.stok_awal || 0) + actualMasuk - actualKeluar;

        // Check if there's a discrepancy
        if (item.masuk !== actualMasuk || item.keluar !== actualKeluar || item.tersedia !== actualTersedia) {
          results.push({
            nama_produk: item.nama_produk,
            rak: `${item.rak}${item.sub_rak && item.sub_rak !== item.rak ? ` / ${item.sub_rak}` : ''}`,
            old_masuk: item.masuk || 0,
            old_keluar: item.keluar || 0,
            old_tersedia: item.tersedia || 0,
            new_masuk: actualMasuk,
            new_keluar: actualKeluar,
            new_tersedia: actualTersedia,
            difference: actualTersedia - (item.tersedia || 0)
          });
        }
      }

      // Final update of analysis stats
      setAnalysisStats(prev => ({
        ...prev,
        processedItems: processedCount,
        discrepanciesFound: results.length
      }));

      setSyncResults(results);
      setShowResults(true);

      if (results.length === 0) {
        showToast(`✅ Semua data sudah sinkron! Tidak ada perbedaan yang ditemukan dari ${totalItems} item UTAMA yang dianalisis.`, 'success');
      } else {
        showToast(`⚠️ Analisis selesai! Ditemukan ${results.length} item dengan perbedaan data dari ${totalItems} item UTAMA yang diperiksa (Total database: ${stockResult.totalCount} item)`, 'warning');
      }

    } catch (error) {
      console.error('Error analyzing stock discrepancies:', error);
      showToast('Terjadi kesalahan saat menganalisis data', 'error');
    } finally {
      setAnalyzing(false);
    }
  };

  const fixStockSync = async () => {
    if (syncResults.length === 0) {
      showToast('Tidak ada data yang perlu diperbaiki', 'info');
      return;
    }

    try {
      setLoading(true);
      showToast('Memperbaiki sinkronisasi data...', 'info');

      let successCount = 0;
      let errorCount = 0;
      const totalToFix = syncResults.length;

      for (const result of syncResults) {
        try {
          // Update stock_items with correct values - target both rak and sub_rak UTAMA
          const { error } = await supabase
            .from('stock_items')
            .update({
              masuk: result.new_masuk,
              keluar: result.new_keluar,
              tersedia: result.new_tersedia
            })
            .eq('nama_produk', result.nama_produk)
            .or('rak.ilike.%UTAMA%,sub_rak.ilike.%UTAMA%');

          if (error) {
            console.error(`Error updating ${result.nama_produk}:`, error);
            errorCount++;
          } else {
            successCount++;
            
            // Show progress for large updates
            if (successCount % 5 === 0) {
              showToast(`Memperbaiki ${successCount} dari ${totalToFix} item...`, 'info');
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          }
        } catch (error) {
          console.error(`Error updating ${result.nama_produk}:`, error);
          errorCount++;
        }
      }

      if (successCount > 0) {
        showToast(`✅ Sinkronisasi selesai! Berhasil memperbaiki ${successCount} item${errorCount > 0 ? `, ${errorCount} item gagal` : ''}. Data sekarang sudah akurat.`, 'success');
        setSyncResults([]);
        setShowResults(false);
        setAnalysisStats({
          totalItems: 0,
          processedItems: 0,
          utamaItems: 0,
          discrepanciesFound: 0
        });
      } else {
        showToast('Gagal memperbaiki data. Silakan coba lagi.', 'error');
      }

    } catch (error) {
      console.error('Error fixing stock sync:', error);
      showToast('Terjadi kesalahan saat memperbaiki data', 'error');
    } finally {
      setLoading(false);
    }
  };

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
        <div className="bg-gradient-to-br from-rose-700 via-red-800 to-slate-900 pt-[90px] lg:pt-0 lg:h-[310px] pb-[75px] lg:pb-0 px-6 lg:px-12 rounded-b-[40px] lg:rounded-b-[55px] shadow-2xl shadow-red-900/40 relative overflow-hidden transition-all duration-500 flex flex-col justify-center">

          {/* Decorative Background Icon */}
          <div className="absolute -top-12 -right-12 text-white opacity-5">
            <Database className="w-72 h-72 lg:w-[480px] lg:h-[480px]" />
          </div>

          {/* Decorative Floating Elements */}
          <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-red-500/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-24 h-24 bg-orange-500/10 rounded-3xl rotate-45 blur-2xl"></div>

          {/* Text Content */}
          <div className="relative z-10 w-full flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 uppercase text-left">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 mb-3 lg:mb-4 opacity-90">
                <div className="w-10 h-[2px] bg-rose-400 rounded-full"></div>
                <span className="text-[10px] lg:text-[12px] font-black tracking-[0.4em] text-rose-100">Data Integrity System</span>
              </div>
              <h1 className="text-[34px] lg:text-[58px] font-black text-white tracking-tighter leading-[1] mb-3 uppercase">
                Fix Stock <span className="text-rose-400">Sync</span>
              </h1>
              <div className="text-rose-100/80 font-medium text-[14px] lg:text-[18px] leading-relaxed max-w-[90%] normal-case flex items-center gap-3">
                <div className="px-3 py-1 bg-white/10 rounded-full backdrop-blur-sm border border-white/10 flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                  </span>
                  <span className="text-[11px] font-bold tracking-widest uppercase">Maintenance Mode</span>
                </div>
                <span className="opacity-60 hidden sm:inline">|</span>
                <span className="text-[13px] lg:text-[16px]">
                  Sinkronkan data masuk/keluar di stock_items dengan database_log secara akurat
                </span>
              </div>
            </div>

            {/* Global Actions Container - Desktop */}
            <div className="relative z-10 flex flex-wrap gap-2 lg:gap-3 lg:mb-2 items-center">
              {(analyzing || loading) && (
                <div className="px-5 py-2.5 bg-red-500/20 backdrop-blur-md border border-white/20 rounded-2xl flex items-center gap-3 mr-2">
                  <RefreshCw className="w-4 h-4 text-white animate-spin" />
                  <span className="text-[11px] font-black text-white tracking-[0.2em] uppercase">Processing</span>
                </div>
              )}

              <button
                onClick={analyzeStockDiscrepancies}
                disabled={analyzing || loading}
                className="h-12 px-6 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2.5 border border-amber-400/50"
              >
                <RefreshCw className={`h-4 w-4 ${analyzing ? 'animate-spin' : ''}`} />
                <span className="uppercase text-xs font-black">{analyzing ? 'Menganalisis...' : 'Analisis Data'}</span>
              </button>

              {syncResults.length > 0 && (
                <button
                  onClick={fixStockSync}
                  disabled={loading}
                  className="h-12 px-6 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl shadow-[0_8px_25px_rgba(16,185,129,0.35)] transition-all active:scale-95 flex items-center justify-center gap-2.5 border border-emerald-400/50"
                >
                  <CheckCircle className="h-4 w-4" />
                  <span className="uppercase text-xs font-black">{loading ? 'Memperbaiki...' : 'Perbaiki Sekarang'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="lg:px-10 pb-12 -mt-6 lg:-mt-10">

        {/* Analysis Progress */}
        {analyzing && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center space-x-3">
              <RefreshCw className="h-6 w-6 text-blue-600 animate-spin" />
              <div className="flex-1">
                <h3 className="font-semibold text-blue-800 mb-2">Sedang Menganalisis Semua Data...</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-blue-600 font-medium">Total Item:</span>
                    <div className="text-blue-800 font-bold">{analysisStats.totalItems.toLocaleString()}</div>
                  </div>
                  <div>
                    <span className="text-blue-600 font-medium">Item UTAMA:</span>
                    <div className="text-blue-800 font-bold">{analysisStats.utamaItems.toLocaleString()}</div>
                  </div>
                  <div>
                    <span className="text-blue-600 font-medium">Diproses:</span>
                    <div className="text-blue-800 font-bold">{analysisStats.processedItems.toLocaleString()}</div>
                  </div>
                  <div>
                    <span className="text-blue-600 font-medium">Perbedaan:</span>
                    <div className="text-red-600 font-bold">{analysisStats.discrepanciesFound.toLocaleString()}</div>
                  </div>
                </div>
                {analysisStats.utamaItems > 0 && (
                  <div className="mt-3">
                    <div className="w-full bg-blue-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(analysisStats.processedItems / analysisStats.utamaItems) * 100}%` }}
                      ></div>
                    </div>
                    <div className="text-xs text-blue-600 mt-1">
                      Progress: {Math.round((analysisStats.processedItems / analysisStats.utamaItems) * 100)}%
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Warning Notice */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="h-6 w-6 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-yellow-800">
              <h3 className="font-semibold mb-2">Peringatan Penting</h3>
              <ul className="text-sm space-y-1 list-disc list-inside">
                <li>Tool ini akan memperbaiki data kolom <strong>masuk</strong>, <strong>keluar</strong>, dan <strong>tersedia</strong> di tabel stock_items</li>
                <li>Data akan dihitung ulang berdasarkan transaksi aktual di tabel database_log</li>
                <li>Fokus pada rak <strong>UTAMA</strong> dan sub_rak yang mengandung kata "UTAMA"</li>
                <li><strong>ANALISIS LENGKAP:</strong> Semua data di database akan dianalisis tanpa batas</li>
                <li>Pastikan backup data sebelum menjalankan perbaikan</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <Info className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-blue-800">
              <h3 className="font-semibold mb-2">Cara Menggunakan</h3>
              <ol className="text-sm space-y-1 list-decimal list-inside">
                <li>Klik <strong>"Analisis Semua Data"</strong> untuk memeriksa perbedaan antara stock_items dan database_log</li>
                <li>Sistem akan memuat dan menganalisis <strong>SEMUA</strong> data tanpa batas halaman</li>
                <li>Review hasil analisis untuk memastikan perhitungan sudah benar</li>
                <li>Klik <strong>"Perbaiki Sekarang"</strong> untuk menerapkan perbaikan ke database</li>
                <li>Sistem akan mengupdate kolom masuk, keluar, dan tersedia dengan nilai yang benar</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Analysis Results */}
        {showResults && (
          <Card>
            <CardHeader>
              <div className="bg-blue-600 text-white p-3 -m-6 mb-4 rounded-t-lg">
                <h3 className="font-semibold">Hasil Analisis Perbedaan Data</h3>
                <p className="text-blue-100 text-sm mt-1">
                  Ditemukan {syncResults.length} item dengan perbedaan data dari {analysisStats.utamaItems} item UTAMA
                </p>
                <p className="text-blue-100 text-xs mt-1">
                  Total item di database: {analysisStats.totalItems.toLocaleString()} | Dianalisis: {analysisStats.processedItems.toLocaleString()}
                </p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium border-r border-gray-300">Nama Produk</th>
                      <th className="px-4 py-3 text-center text-sm font-medium border-r border-gray-300">Rak</th>
                      <th className="px-4 py-3 text-center text-sm font-medium border-r border-gray-300 bg-red-50">Masuk (Lama)</th>
                      <th className="px-4 py-3 text-center text-sm font-medium border-r border-gray-300 bg-green-50">Masuk (Baru)</th>
                      <th className="px-4 py-3 text-center text-sm font-medium border-r border-gray-300 bg-red-50">Keluar (Lama)</th>
                      <th className="px-4 py-3 text-center text-sm font-medium border-r border-gray-300 bg-green-50">Keluar (Baru)</th>
                      <th className="px-4 py-3 text-center text-sm font-medium border-r border-gray-300 bg-red-50">Tersedia (Lama)</th>
                      <th className="px-4 py-3 text-center text-sm font-medium border-r border-gray-300 bg-green-50">Tersedia (Baru)</th>
                      <th className="px-4 py-3 text-center text-sm font-medium">Selisih</th>
                    </tr>
                  </thead>
                  <tbody>
                    {syncResults.map((result, index) => (
                      <tr key={index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 border-b border-gray-200`}>
                        <td className="px-4 py-3 text-sm border-r border-gray-200 font-medium">
                          {result.nama_produk}
                        </td>
                        <td className="px-4 py-3 text-sm text-center border-r border-gray-200">
                          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">
                            {result.rak}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-center border-r border-gray-200 bg-red-50">
                          <span className="text-red-600 font-medium">{result.old_masuk}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-center border-r border-gray-200 bg-green-50">
                          <span className="text-green-600 font-medium">{result.new_masuk}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-center border-r border-gray-200 bg-red-50">
                          <span className="text-red-600 font-medium">{result.old_keluar}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-center border-r border-gray-200 bg-green-50">
                          <span className="text-green-600 font-medium">{result.new_keluar}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-center border-r border-gray-200 bg-red-50">
                          <span className="text-red-600 font-bold">{result.old_tersedia}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-center border-r border-gray-200 bg-green-50">
                          <span className="text-green-600 font-bold">{result.new_tersedia}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-center">
                          <span className={`font-bold ${
                            result.difference > 0 ? 'text-green-600' : 
                            result.difference < 0 ? 'text-red-600' : 'text-gray-600'
                          }`}>
                            {result.difference > 0 ? '+' : ''}{result.difference}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Example Case */}
        <Card>
          <CardHeader>
            <div className="bg-orange-600 text-white p-3 -m-6 mb-4 rounded-t-lg">
              <h3 className="font-semibold">Contoh Kasus: CORRECTION-CT-553</h3>
              <p className="text-orange-100 text-sm mt-1">Data aktual yang akan diperbaiki berdasarkan database_log</p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold text-red-600 mb-3">❌ Data Lama (Tidak Sinkron)</h4>
                  <div className="bg-white p-3 rounded border border-red-200">
                    <div className="text-sm space-y-1">
                      <div><strong>Produk:</strong> CORRECTION-CT-553</div>
                      <div><strong>Rak:</strong> UTAMA</div>
                      <div><strong>Masuk:</strong> <span className="text-red-600 font-bold">4788</span></div>
                      <div><strong>Keluar:</strong> <span className="text-red-600 font-bold">4284</span></div>
                      <div><strong>Tersedia:</strong> <span className="text-red-600 font-bold">504</span></div>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold text-green-600 mb-3">✅ Data Baru (Setelah Sinkron)</h4>
                  <div className="bg-white p-3 rounded border border-green-200">
                    <div className="text-sm space-y-1">
                      <div><strong>Produk:</strong> CORRECTION-CT-553</div>
                      <div><strong>Rak:</strong> UTAMA</div>
                      <div><strong>Masuk:</strong> <span className="text-green-600 font-bold">3924</span></div>
                      <div><strong>Keluar:</strong> <span className="text-green-600 font-bold">3852</span></div>
                      <div><strong>Tersedia:</strong> <span className="text-green-600 font-bold">72</span></div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
                <p className="text-sm text-blue-800">
                  <strong>Selisih:</strong> Tersedia akan berkurang dari 504 menjadi 72 (selisih -432), 
                  sesuai dengan perhitungan aktual dari database_log.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm text-gray-600">
            <div>
              <span className="font-medium">Status:</span>
              <span className="ml-1 text-blue-600">
                {showResults ? `${syncResults.length} item perlu diperbaiki` : 'Siap untuk analisis lengkap'}
              </span>
            </div>
            <div>
              <span className="font-medium">Target:</span>
              <span className="ml-1 text-purple-600">Rak UTAMA dan sub_rak UTAMA</span>
            </div>
            <div>
              <span className="font-medium">Metode:</span>
              <span className="ml-1 text-orange-600">Analisis semua data tanpa batas</span>
            </div>
            <div>
              <span className="font-medium">Scope:</span>
              <span className="ml-1 text-green-600">Seluruh database</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}