import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader } from './ui/Card';
import { Button } from './ui/Button';
import { Toast } from './ui/Toast';
import { Package, RefreshCw, CheckCircle, AlertTriangle, Info, Play } from 'lucide-react';
import { supabase, fetchAllStockItems } from '../lib/supabase';

interface PackingIssue {
  id: string;
  nama_produk: string;
  rak: string;
  current_packing: string;
  suggested_packing: string;
  will_be_updated: boolean;
}

interface PackingStats {
  total_items: number;
  empty_packing: number;
  incomplete_packing: number;
  complete_packing: number;
  fixable_items: number;
}

export function UpdatePacking() {
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [packingIssues, setPackingIssues] = useState<PackingIssue[]>([]);
  const [packingStats, setPackingStats] = useState<PackingStats>({
    total_items: 0,
    empty_packing: 0,
    incomplete_packing: 0,
    complete_packing: 0,
    fixable_items: 0
  });
  const [showResults, setShowResults] = useState(false);
  const [toast, setToast] = useState<{
    isOpen: boolean;
    message: string;
    type: 'success' | 'info' | 'warning' | 'error';
  }>({
    isOpen: false,
    message: '',
    type: 'info'
  });

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') => {
    setToast({ isOpen: true, message, type });
    setTimeout(() => {
      setToast({ isOpen: false, message: '', type: 'info' });
    }, 5000);
  }, []);

  const analyzePackingIssues = async () => {
    try {
      setAnalyzing(true);
      setPackingIssues([]);
      setShowResults(false);
      showToast('Menganalisis data packing...', 'info');

      // Load all stock items
      const stockResult = await fetchAllStockItems();
      if (!stockResult.success) {
        throw new Error('Gagal memuat data stock items');
      }

      const stockItems = stockResult.data.filter(item => item.status === 'Aktif');
      
      // Group items by product name
      const productGroups = new Map<string, any[]>();
      stockItems.forEach(item => {
        const productName = item.nama_produk;
        if (!productGroups.has(productName)) {
          productGroups.set(productName, []);
        }
        productGroups.get(productName)!.push(item);
      });

      const issues: PackingIssue[] = [];
      let emptyCount = 0;
      let incompleteCount = 0;
      let completeCount = 0;
      let fixableCount = 0;

      // Analyze each product group
      for (const [productName, items] of productGroups) {
        // Find the most complete packing data for this product
        const completePacking = items
          .map(item => item.packing || '')
          .filter(packing => packing && packing !== 'CTN/' && packing.length > 4)
          .sort((a, b) => b.length - a.length)[0]; // Get the longest/most complete packing

        items.forEach(item => {
          const currentPacking = item.packing || '';
          
          // Categorize packing status
          if (!currentPacking || currentPacking.trim() === '') {
            emptyCount++;
          } else if (currentPacking === 'CTN/' || currentPacking.length <= 4) {
            incompleteCount++;
          } else {
            completeCount++;
          }

          // Check if this item needs fixing and can be fixed
          const needsFix = !currentPacking || currentPacking === 'CTN/' || currentPacking.trim() === '';
          const canBeFix = completePacking && completePacking !== currentPacking;

          if (needsFix && canBeFix) {
            issues.push({
              id: item.id,
              nama_produk: productName,
              rak: item.rak,
              current_packing: currentPacking || '(kosong)',
              suggested_packing: completePacking,
              will_be_updated: true
            });
            fixableCount++;
          }
        });
      }

      setPackingIssues(issues);
      setPackingStats({
        total_items: stockItems.length,
        empty_packing: emptyCount,
        incomplete_packing: incompleteCount,
        complete_packing: completeCount,
        fixable_items: fixableCount
      });
      setShowResults(true);

      if (issues.length === 0) {
        showToast('✅ Semua data packing sudah lengkap! Tidak ada yang perlu diperbaiki.', 'success');
      } else {
        showToast(`📋 Analisis selesai! Ditemukan ${issues.length} item yang dapat diperbaiki dari ${stockItems.length} total item.`, 'warning');
      }

    } catch (error) {
      console.error('Error analyzing packing issues:', error);
      showToast('Terjadi kesalahan saat menganalisis data packing', 'error');
    } finally {
      setAnalyzing(false);
    }
  };

  const fixPackingData = async () => {
    if (packingIssues.length === 0) {
      showToast('Tidak ada data yang perlu diperbaiki', 'info');
      return;
    }

    try {
      setFixing(true);
      showToast('Memperbaiki data packing...', 'info');

      let successCount = 0;
      let errorCount = 0;
      const totalToFix = packingIssues.length;

      // Process in batches for better performance
      const batchSize = 10;
      for (let i = 0; i < packingIssues.length; i += batchSize) {
        const batch = packingIssues.slice(i, i + batchSize);
        
        // Update each item in the batch
        const updatePromises = batch.map(async (issue) => {
          try {
            const { error } = await supabase
              .from('stock_items')
              .update({
                packing: issue.suggested_packing
              })
              .eq('id', issue.id);

            if (error) {
              console.error(`Error updating ${issue.nama_produk} at ${issue.rak}:`, error);
              return { success: false, error };
            }
            
            return { success: true };
          } catch (error) {
            console.error(`Error updating ${issue.nama_produk} at ${issue.rak}:`, error);
            return { success: false, error };
          }
        });

        const results = await Promise.all(updatePromises);
        
        results.forEach(result => {
          if (result.success) {
            successCount++;
          } else {
            errorCount++;
          }
        });

        // Show progress for large updates
        if (successCount % 20 === 0 && successCount > 0) {
          showToast(`Memperbaiki ${successCount} dari ${totalToFix} item...`, 'info');
        }

        // Small delay between batches to prevent overwhelming the database
        if (i + batchSize < packingIssues.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      if (successCount > 0) {
        showToast(`✅ Perbaikan selesai! Berhasil memperbaiki ${successCount} item packing${errorCount > 0 ? `, ${errorCount} item gagal` : ''}. Data packing sekarang sudah lengkap.`, 'success');
        
        // Clear results after successful fix
        setPackingIssues([]);
        setShowResults(false);
        setPackingStats({
          total_items: 0,
          empty_packing: 0,
          incomplete_packing: 0,
          complete_packing: 0,
          fixable_items: 0
        });
      } else {
        showToast('Gagal memperbaiki data packing. Silakan coba lagi.', 'error');
      }

    } catch (error) {
      console.error('Error fixing packing data:', error);
      showToast('Terjadi kesalahan saat memperbaiki data packing', 'error');
    } finally {
      setFixing(false);
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
        <div className="bg-gradient-to-br from-orange-600 via-amber-700 to-slate-900 pt-[90px] lg:pt-0 lg:h-[310px] pb-[75px] lg:pb-0 px-6 lg:px-12 rounded-b-[40px] lg:rounded-b-[55px] shadow-2xl shadow-orange-900/40 relative overflow-hidden transition-all duration-500 flex flex-col justify-center">

          {/* Decorative Background Icon */}
          <div className="absolute -top-12 -right-12 text-white opacity-5">
            <Package className="w-72 h-72 lg:w-[480px] lg:h-[480px]" />
          </div>

          {/* Decorative Floating Elements */}
          <div className="absolute top-1/4 right-1/4 w-32 h-32 bg-orange-500/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-10 left-10 w-20 h-20 bg-amber-500/10 rounded-3xl rotate-12 blur-xl"></div>

          {/* Text Content */}
          <div className="relative z-10 w-full flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 uppercase text-left">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 mb-3 lg:mb-4 opacity-90">
                <div className="w-10 h-[2px] bg-amber-400 rounded-full"></div>
                <span className="text-[10px] lg:text-[12px] font-black tracking-[0.4em] text-amber-100">Packaging Compliance System</span>
              </div>
              <h1 className="text-[34px] lg:text-[58px] font-black text-white tracking-tighter leading-[1] mb-3 uppercase">
                Update <span className="text-amber-400">Packing</span>
              </h1>
              <div className="text-amber-100/80 font-medium text-[14px] lg:text-[18px] leading-relaxed max-w-[90%] normal-case flex items-center gap-3">
                <div className="px-3 py-1 bg-white/10 rounded-full backdrop-blur-sm border border-white/10 flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </span>
                  <span className="text-[11px] font-bold tracking-widest uppercase">Analysis Ready</span>
                </div>
                <span className="opacity-60 hidden sm:inline">|</span>
                <span className="text-[13px] lg:text-[16px]">
                  Perbaiki data packing yang kosong atau tidak lengkap berdasarkan referensi produk
                </span>
              </div>
            </div>

            {/* Global Actions Container - Desktop */}
            <div className="relative z-10 flex flex-wrap gap-2 lg:gap-3 lg:mb-2 items-center">
              {(analyzing || fixing) && (
                <div className="px-5 py-2.5 bg-orange-500/20 backdrop-blur-md border border-white/20 rounded-2xl flex items-center gap-3 mr-2">
                  <RefreshCw className="w-4 h-4 text-white animate-spin" />
                  <span className="text-[11px] font-black text-white tracking-[0.2em] uppercase">Syncing</span>
                </div>
              )}

              <button
                onClick={analyzePackingIssues}
                disabled={analyzing || fixing}
                className="h-12 px-6 bg-white/10 hover:bg-white/20 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2.5 border border-white/30 backdrop-blur-xl disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${analyzing ? 'animate-spin' : ''}`} />
                <span className="uppercase text-xs font-black">{analyzing ? 'Menganalisis...' : 'Analisis Data'}</span>
              </button>

              {packingIssues.length > 0 && (
                <button
                  onClick={fixPackingData}
                  disabled={fixing}
                  className="h-12 px-6 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl shadow-[0_8px_25px_rgba(16,185,129,0.35)] transition-all active:scale-95 flex items-center justify-center gap-2.5 border border-emerald-400/50"
                >
                  <CheckCircle className="h-4 w-4" />
                  <span className="uppercase text-xs font-black">{fixing ? 'Memperbaiki...' : 'Perbaiki Sekarang'}</span>
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
                <h3 className="font-semibold text-blue-800 mb-2">Sedang Menganalisis Data Packing...</h3>
                <div className="text-sm text-blue-700">
                  Memeriksa semua item di stock_items untuk mencari data packing yang kosong atau tidak lengkap,
                  kemudian mencari data packing yang lengkap dari produk yang sama untuk dijadikan referensi.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* How It Works */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <Info className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-blue-800">
              <h3 className="font-semibold mb-2">Cara Kerja Update Packing</h3>
              <ol className="text-sm space-y-1 list-decimal list-inside">
                <li>Sistem akan mencari semua item dengan packing kosong atau hanya berisi "CTN/"</li>
                <li>Untuk setiap produk yang bermasalah, sistem mencari produk dengan nama yang sama</li>
                <li>Jika ditemukan data packing yang lengkap, sistem akan menyarankan untuk menggunakan data tersebut</li>
                <li>Klik "Perbaiki Sekarang" untuk menerapkan perbaikan ke semua item yang bermasalah</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Example Case */}
        <Card>
          <CardHeader>
            <div className="bg-orange-600 text-white p-3 -m-6 mb-4 rounded-t-lg">
              <h3 className="font-semibold">Contoh Kasus: MEMO-MMS-32</h3>
              <p className="text-orange-100 text-sm mt-1">Data yang akan diperbaiki berdasarkan referensi produk yang sama</p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold text-red-600 mb-3">❌ Data Bermasalah</h4>
                  <div className="bg-white p-3 rounded border border-red-200">
                    <div className="text-sm space-y-1">
                      <div><strong>Produk:</strong> MEMO-MMS-32</div>
                      <div><strong>Rak:</strong> B5</div>
                      <div><strong>Packing:</strong> <span className="text-red-600 font-bold">CTN/</span> (tidak lengkap)</div>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold text-green-600 mb-3">✅ Data Referensi</h4>
                  <div className="bg-white p-3 rounded border border-green-200">
                    <div className="text-sm space-y-1">
                      <div><strong>Produk:</strong> MEMO-MMS-32</div>
                      <div><strong>Rak:</strong> UTAMA</div>
                      <div><strong>Packing:</strong> <span className="text-green-600 font-bold">CTN/32BXS/12PACK</span> (lengkap)</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
                <p className="text-sm text-blue-800">
                  <strong>Hasil:</strong> Sistem akan mengupdate packing di rak B5 menjadi "CTN/32BXS/12PACK" 
                  berdasarkan data lengkap yang ditemukan di rak UTAMA.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statistics */}
        {showResults && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-blue-100 border border-blue-200 rounded-lg p-4">
              <div className="text-blue-600 text-sm font-medium">Total Item</div>
              <div className="text-2xl font-bold text-blue-800">{packingStats.total_items.toLocaleString()}</div>
            </div>
            <div className="bg-red-100 border border-red-200 rounded-lg p-4">
              <div className="text-red-600 text-sm font-medium">Packing Kosong</div>
              <div className="text-2xl font-bold text-red-800">{packingStats.empty_packing.toLocaleString()}</div>
            </div>
            <div className="bg-yellow-100 border border-yellow-200 rounded-lg p-4">
              <div className="text-yellow-600 text-sm font-medium">Tidak Lengkap</div>
              <div className="text-2xl font-bold text-yellow-800">{packingStats.incomplete_packing.toLocaleString()}</div>
            </div>
            <div className="bg-green-100 border border-green-200 rounded-lg p-4">
              <div className="text-green-600 text-sm font-medium">Packing Lengkap</div>
              <div className="text-2xl font-bold text-green-800">{packingStats.complete_packing.toLocaleString()}</div>
            </div>
            <div className="bg-purple-100 border border-purple-200 rounded-lg p-4">
              <div className="text-purple-600 text-sm font-medium">Dapat Diperbaiki</div>
              <div className="text-2xl font-bold text-purple-800">{packingStats.fixable_items.toLocaleString()}</div>
            </div>
          </div>
        )}

        {/* Analysis Results */}
        {showResults && packingIssues.length > 0 && (
          <Card>
            <CardHeader>
              <div className="bg-orange-600 text-white p-3 -m-6 mb-4 rounded-t-lg">
                <h3 className="font-semibold">Hasil Analisis - Item yang Akan Diperbaiki</h3>
                <p className="text-orange-100 text-sm mt-1">
                  Ditemukan {packingIssues.length} item dengan packing yang dapat diperbaiki
                </p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium border-r border-gray-300">Nama Produk</th>
                      <th className="px-4 py-3 text-center text-sm font-medium border-r border-gray-300">Rak</th>
                      <th className="px-4 py-3 text-center text-sm font-medium border-r border-gray-300 bg-red-50">Packing Saat Ini</th>
                      <th className="px-4 py-3 text-center text-sm font-medium border-r border-gray-300 bg-green-50">Packing Baru</th>
                      <th className="px-4 py-3 text-center text-sm font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {packingIssues.map((issue, index) => (
                      <tr key={issue.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 border-b border-gray-200`}>
                        <td className="px-4 py-3 text-sm border-r border-gray-200 font-medium">
                          {issue.nama_produk}
                        </td>
                        <td className="px-4 py-3 text-sm text-center border-r border-gray-200">
                          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">
                            {issue.rak}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-center border-r border-gray-200 bg-red-50">
                          <span className="text-red-600 font-medium">
                            {issue.current_packing}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-center border-r border-gray-200 bg-green-50">
                          <span className="text-green-600 font-medium">
                            {issue.suggested_packing}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-center">
                          {issue.will_be_updated ? (
                            <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">
                              ✓ Akan Diperbaiki
                            </span>
                          ) : (
                            <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-medium">
                              Tidak Ada Referensi
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Warning Notice */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="h-6 w-6 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-yellow-800">
              <h3 className="font-semibold mb-2">Peringatan Penting</h3>
              <ul className="text-sm space-y-1 list-disc list-inside">
                <li>Tool ini akan memperbaiki kolom <strong>packing</strong> di tabel stock_items</li>
                <li>Data packing akan diambil dari item lain dengan nama produk yang sama</li>
                <li>Hanya item dengan packing kosong atau "CTN/" yang akan diperbaiki</li>
                <li>Pastikan backup data sebelum menjalankan perbaikan</li>
                <li>Proses ini akan mengupdate data secara permanen</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <Play className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-blue-800">
              <h3 className="font-semibold mb-2">Cara Menggunakan</h3>
              <ol className="text-sm space-y-1 list-decimal list-inside">
                <li>Klik <strong>"Analisis Data"</strong> untuk memeriksa item dengan packing yang bermasalah</li>
                <li>Sistem akan mencari referensi packing lengkap dari produk yang sama</li>
                <li>Review hasil analisis untuk memastikan perbaikan sudah benar</li>
                <li>Klik <strong>"Perbaiki Sekarang"</strong> untuk menerapkan perbaikan ke database</li>
                <li>Sistem akan mengupdate kolom packing dengan data yang lengkap</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm text-gray-600">
            <div>
              <span className="font-medium">Status:</span>
              <span className="ml-1 text-blue-600">
                {showResults ? `${packingIssues.length} item perlu diperbaiki` : 'Siap untuk analisis'}
              </span>
            </div>
            <div>
              <span className="font-medium">Target:</span>
              <span className="ml-1 text-purple-600">Kolom packing kosong atau "CTN/"</span>
            </div>
            <div>
              <span className="font-medium">Metode:</span>
              <span className="ml-1 text-orange-600">Auto-fill dari produk yang sama</span>
            </div>
            <div>
              <span className="font-medium">Scope:</span>
              <span className="ml-1 text-green-600">Seluruh tabel stock_items</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}