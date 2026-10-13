import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import {
  Copy,
  Trash2,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Sparkles,
  Check,
  X,
  Loader,
  Database,
  Info
} from 'lucide-react';
import { supabase, fetchAllStockItems } from '../lib/supabase';
import { DatabaseService } from '../lib/DatabaseService';
import { useDatabaseConfig } from '../lib/DatabaseContext';
import { doc, writeBatch, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface DuplicateStockGroup {
  key: string;
  sku: string;
  rak: string;
  items: any[];
  isExactMatch: boolean; // Apakah nilai stok_awal, masuk, keluar, tersedia persis sama
}

interface CekDataDuplikatGudangModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function CekDataDuplikatGudangModal({
  isOpen,
  onClose,
  onSuccess
}: CekDataDuplikatGudangModalProps) {
  const { writeMode } = useDatabaseConfig();

  const [loading, setLoading] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateStockGroup[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isProcessingDelete, setIsProcessingDelete] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const [mergeQuantities, setMergeQuantities] = useState(false); // Opsional: gabungkan total stok ke baris utama

  // Konfirmasi Hapus Modal
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    type: 'all' | 'single';
    targetGroup?: DuplicateStockGroup;
  }>({
    isOpen: false,
    type: 'all'
  });

  // Toast lokal
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // -------------------------------------------------------------
  // SCAN DATA GUDANG UNTUK MENCARI DUPLIKAT (SKU + RAK SAMA)
  // -------------------------------------------------------------
  const scanDuplicates = useCallback(async () => {
    try {
      setLoading(true);
      setStatusMsg(null);

      // Ambil seluruh data stok tanpa batasan 1000
      const stockRes = await fetchAllStockItems();
      if (!stockRes.success || !stockRes.data) {
        throw new Error('Gagal memuat data stock_items dari database');
      }

      const allItems = stockRes.data;

      // Grouping berdasarkan SKU (nama_produk) + RAK
      const map = new Map<string, any[]>();
      for (const item of allItems) {
        const normSku = (item.nama_produk || '').trim().toUpperCase();
        const normRak = (item.rak || '').trim().toUpperCase();
        if (!normSku) continue;

        const groupKey = `${normSku}__###__${normRak}`;
        if (!map.has(groupKey)) {
          map.set(groupKey, []);
        }
        map.get(groupKey)!.push(item);
      }

      // Filter yang punya data > 1
      const dupes: DuplicateStockGroup[] = [];
      map.forEach((items, key) => {
        if (items.length > 1) {
          const [sku, rak] = key.split('__###__');

          // Cek apakah data sama persis (tersedia, masuk, keluar, stok_awal)
          const first = items[0];
          const isExact = items.every(
            it =>
              Number(it.stok_awal || 0) === Number(first.stok_awal || 0) &&
              Number(it.masuk || 0) === Number(first.masuk || 0) &&
              Number(it.keluar || 0) === Number(first.keluar || 0) &&
              Number(it.tersedia || 0) === Number(first.tersedia || 0)
          );

          // Urutkan agar data yang paling lengkap / dibuat duluan berada di posisi 0 (Keeper)
          items.sort((a, b) => {
            // Prioritaskan yang ID nya valid / created_at lebih awal
            const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return timeA - timeB;
          });

          dupes.push({
            key,
            sku,
            rak,
            items,
            isExactMatch: isExact
          });
        }
      });

      // Urutkan grup berdasarkan nama SKU
      dupes.sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true, sensitivity: 'base' }));

      setDuplicateGroups(dupes);

      if (dupes.length === 0) {
        setStatusMsg({
          type: 'success',
          text: 'Hebat! Tidak ditemukan data duplikat dengan SKU dan Rak yang sama di Data Gudang.'
        });
      }
    } catch (err: any) {
      console.error('Error scanning duplicate stock:', err);
      setStatusMsg({
        type: 'error',
        text: err?.message || 'Terjadi kesalahan saat memindai data duplikat.'
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      scanDuplicates();
    }
  }, [isOpen, scanDuplicates]);

  // Total baris berlebih yang akan dihapus
  const totalExcessRows = useMemo(() => {
    return duplicateGroups.reduce((acc, g) => acc + (g.items.length - 1), 0);
  }, [duplicateGroups]);

  // Filtered Groups berdasarkan pencarian
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return duplicateGroups;
    const q = searchQuery.toLowerCase().trim();
    return duplicateGroups.filter(
      g => g.sku.toLowerCase().includes(q) || g.rak.toLowerCase().includes(q)
    );
  }, [duplicateGroups, searchQuery]);

  // -------------------------------------------------------------
  // EKSEKUSI PENGHAPUSAN DUPLIKAT (SISAKAN 1 DATA UNIK)
  // -------------------------------------------------------------
  const executeDeleteDuplicates = async (targetGroup?: DuplicateStockGroup) => {
    const groupsToProcess = targetGroup ? [targetGroup] : duplicateGroups;
    if (groupsToProcess.length === 0) return;

    try {
      setIsProcessingDelete(true);
      setConfirmDialog({ isOpen: false, type: 'all' });
      setProgressMessage('Mengidentifikasi baris duplikat yang akan dihapus...');

      const idsToDelete: string[] = [];
      const keeperUpdates: { keeperId: string; newValues: any }[] = [];

      for (const group of groupsToProcess) {
        if (group.items.length <= 1) continue;

        const keeper = group.items[0]; // Baris utama yang disimpan
        const duplicates = group.items.slice(1); // Baris yang dihapus

        duplicates.forEach(d => {
          if (d.id) idsToDelete.push(d.id);
        });

        // Jika opsi gabung jumlah stok aktif
        if (mergeQuantities) {
          const totalStokAwal = group.items.reduce((s, it) => s + Number(it.stok_awal || 0), 0);
          const totalMasuk = group.items.reduce((s, it) => s + Number(it.masuk || 0), 0);
          const totalKeluar = group.items.reduce((s, it) => s + Number(it.keluar || 0), 0);
          const totalTersedia = group.items.reduce((s, it) => s + Number(it.tersedia || 0), 0);

          keeperUpdates.push({
            keeperId: keeper.id,
            newValues: {
              stok_awal: totalStokAwal,
              masuk: totalMasuk,
              keluar: totalKeluar,
              tersedia: totalTersedia
            }
          });
        }
      }

      if (idsToDelete.length === 0) {
        setStatusMsg({ type: 'info', text: 'Tidak ada baris duplikat untuk dihapus.' });
        setIsProcessingDelete(false);
        return;
      }

      // 1. Jika ada update akumulasi stok pada keeper
      if (keeperUpdates.length > 0) {
        setProgressMessage(`Memperbarui ${keeperUpdates.length} data utama terpilih...`);
        for (const update of keeperUpdates) {
          await DatabaseService.updateStockItem(update.keeperId, update.newValues, writeMode);
        }
      }

      // 2. Hapus baris duplikat dari Supabase stock_items (dalam batch 100 ID)
      const chunkSize = 100;
      for (let i = 0; i < idsToDelete.length; i += chunkSize) {
        const chunk = idsToDelete.slice(i, i + chunkSize);
        setProgressMessage(`Menghapus baris duplikat (${i + 1} s/d ${Math.min(i + chunkSize, idsToDelete.length)} dari ${idsToDelete.length})...`);

        // Supabase deletion
        const { error: delErr } = await supabase
          .from('stock_items')
          .delete()
          .in('id', chunk);

        if (delErr) {
          console.error('Error deleting duplicates from Supabase:', delErr);
          throw delErr;
        }

        // Firestore dual-write deletion jika mode both / firebase
        if (writeMode === 'both' || writeMode === 'firebase') {
          try {
            const batch = writeBatch(db);
            chunk.forEach(id => {
              const ref = doc(db, 'stock_items', id);
              batch.delete(ref);
            });
            await batch.commit();
          } catch (fbErr) {
            console.warn('Firebase batch delete error:', fbErr);
          }
        }
      }

      setStatusMsg({
        type: 'success',
        text: `Sukses! Berhasil menghapus ${idsToDelete.length} data duplikat persis dan menyisakan data unik tunggal.`
      });

      // Refresh list duplikat
      await scanDuplicates();

      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      console.error('Gagal menghapus duplikat:', err);
      setStatusMsg({
        type: 'error',
        text: `Gagal menghapus duplikat: ${err?.message || 'Unknown error'}`
      });
    } finally {
      setIsProcessingDelete(false);
      setProgressMessage('');
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={() => {
          if (!isProcessingDelete) onClose();
        }}
        title="Pembersih Data Duplikat Gudang (SKU & Rak Sama)"
        size="7xl"
        className="w-[96vw] max-w-[1400px]"
      >
        <div className="space-y-6">

          {/* Header Banner */}
          <div className="bg-gradient-to-r from-teal-900 via-blue-900 to-slate-900 text-white rounded-2xl p-5 border border-teal-500/30 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-xs font-bold text-teal-200 border border-white/10">
                <Layers className="h-3.5 w-3.5 text-teal-300" />
                <span>Deteksi Duplikat SKU + Rak</span>
              </div>
              <h3 className="text-xl font-black text-white flex items-center gap-2">
                <span>Pembersih Duplikat Data Gudang</span>
              </h3>
              <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                Mendeteksi seluruh data barang yang memiliki <strong>SKU dan Lokasi Rak yang sama</strong>. Fitur ini memungkinkan Anda menghapus baris duplikat yang berlebih dan hanya <strong>menyisakan 1 baris unik/tunggal</strong>.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start md:self-auto">
              <Button
                type="button"
                onClick={scanDuplicates}
                disabled={loading || isProcessingDelete}
                className="h-10 px-4 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl border border-white/20 flex items-center gap-2 text-xs transition-all active:scale-95 cursor-pointer"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                <span>Pindai Ulang</span>
              </Button>
            </div>
          </div>

          {/* Status Alert */}
          {statusMsg && (
            <div
              className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs font-bold animate-in fade-in duration-200 ${
                statusMsg.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                  : statusMsg.type === 'error'
                  ? 'bg-rose-50 text-rose-900 border-rose-300'
                  : 'bg-blue-50 text-blue-900 border-blue-300'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {statusMsg.type === 'success' ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0" />
                )}
                <span>{statusMsg.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setStatusMsg(null)}
                className="p-1 hover:bg-black/5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Processing Progress Bar */}
          {isProcessingDelete && (
            <div className="p-4 bg-slate-900 text-white rounded-2xl border border-teal-500/30 space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="flex items-center gap-2 text-teal-300">
                  <Loader className="h-4 w-4 animate-spin text-teal-400" />
                  <span>Sedang Menghapus Data Duplikat...</span>
                </span>
                <span className="text-slate-400 font-mono">{progressMessage}</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                <div className="bg-gradient-to-r from-teal-400 to-emerald-400 h-2 rounded-full animate-pulse w-full"></div>
              </div>
            </div>
          )}

          {/* Summary Metric Cards & Global Delete Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Grup Duplikat Ditemukan</span>
              <span className="text-2xl font-black text-slate-900 mt-1 block">
                {duplicateGroups.length.toLocaleString('id-ID')} <span className="text-xs font-normal text-slate-500">Grup</span>
              </span>
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 shadow-xs">
              <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider block">Baris Duplikat Berlebih</span>
              <span className="text-2xl font-black text-rose-700 mt-1 block">
                {totalExcessRows.toLocaleString('id-ID')} <span className="text-xs font-normal text-rose-600">Baris Akan Dihapus</span>
              </span>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider block">Data Unik Yang Disisakan</span>
                <span className="text-2xl font-black text-emerald-800 mt-1 block">
                  {duplicateGroups.length.toLocaleString('id-ID')} <span className="text-xs font-normal text-emerald-600">Baris Tunggal</span>
                </span>
              </div>
            </div>
          </div>

          {/* Action Toolbar & Search */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Cari SKU atau Lokasi Rak duplikat..."
                className="w-full h-10 pl-9 pr-4 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Checkbox Opsional Akumulasi Stok */}
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={mergeQuantities}
                onChange={e => setMergeQuantities(e.target.checked)}
                className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 border-slate-300 cursor-pointer"
              />
              <span>Gabungkan / Akumulasikan Jumlah Stok ke Baris Utama</span>
            </label>

            {/* Global Delete Button */}
            <Button
              type="button"
              onClick={() => setConfirmDialog({ isOpen: true, type: 'all' })}
              disabled={loading || isProcessingDelete || duplicateGroups.length === 0}
              className="h-10 px-5 bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-700 hover:to-red-800 text-white font-black rounded-xl shadow-md shadow-rose-600/30 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 cursor-pointer text-xs uppercase tracking-wider"
            >
              <Trash2 className="h-4 w-4" />
              <span>Hapus Semua Duplikat ({totalExcessRows} Baris)</span>
            </Button>
          </div>

          {/* Duplicate Groups List Table */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs max-h-[520px] overflow-y-auto">
            {loading ? (
              <div className="p-16 text-center space-y-3">
                <RefreshCw className="h-8 w-8 animate-spin text-teal-600 mx-auto" />
                <p className="text-sm font-bold text-slate-600">Memindai seluruh data gudang untuk mencari duplikat SKU &amp; Rak...</p>
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="p-16 text-center space-y-2">
                <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
                <h4 className="text-base font-bold text-slate-800">
                  {duplicateGroups.length === 0
                    ? 'Tidak ada data duplikat ditemukan!'
                    : 'Tidak ada data duplikat yang cocok dengan pencarian.'}
                </h4>
                <p className="text-xs text-slate-500">
                  {duplicateGroups.length === 0
                    ? 'Semua data di stock_items sudah memiliki kombinasi SKU dan Rak yang unik.'
                    : 'Coba ubah kata kunci pencarian SKU atau Rak Anda.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {filteredGroups.map((group, gIdx) => (
                  <div key={group.key} className="p-4 hover:bg-slate-50/70 transition-colors space-y-3">
                    {/* Header Group */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="w-6 h-6 rounded-lg bg-teal-100 text-teal-900 flex items-center justify-center text-xs font-mono font-bold">
                          {gIdx + 1}
                        </span>
                        <span className="text-sm font-black text-slate-900 tracking-tight font-mono">
                          {group.sku}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-800 text-xs font-bold border border-slate-200">
                          Rak: <strong className="text-blue-700">{group.rak}</strong>
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                          {group.items.length} Data Terdeteksi ({group.items.length - 1} Duplikat)
                        </span>
                        {group.isExactMatch && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            Nilai Stok Sama Persis
                          </span>
                        )}
                      </div>

                      {/* Single Group Delete Button */}
                      <Button
                        type="button"
                        onClick={() => setConfirmDialog({ isOpen: true, type: 'single', targetGroup: group })}
                        disabled={isProcessingDelete}
                        className="h-8 px-3 bg-white hover:bg-rose-50 text-rose-700 font-bold rounded-lg border border-rose-200 text-xs flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
                        title="Hapus baris duplikat untuk SKU & Rak ini saja"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Hapus Duplikat Grup Ini</span>
                      </Button>
                    </div>

                    {/* Table of Rows under this Duplicate Group */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white text-xs">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-100 text-slate-600 text-[10px] uppercase font-bold tracking-wider border-b border-slate-200">
                          <tr>
                            <th className="p-2.5 w-32">Status Baris</th>
                            <th className="p-2.5">ID Stock</th>
                            <th className="p-2.5 text-center">Stok Awal</th>
                            <th className="p-2.5 text-center">Masuk</th>
                            <th className="p-2.5 text-center">Keluar</th>
                            <th className="p-2.5 text-center font-black">Tersedia</th>
                            <th className="p-2.5">Packing</th>
                            <th className="p-2.5">Tanggal Dibuat</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {group.items.map((item, idx) => {
                            const isKeeper = idx === 0;
                            return (
                              <tr
                                key={item.id || idx}
                                className={isKeeper ? 'bg-emerald-50/40' : 'bg-rose-50/30'}
                              >
                                <td className="p-2.5 font-bold">
                                  {isKeeper ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[11px] font-black">
                                      <Check className="w-3 h-3 text-emerald-700" />
                                      Disimpan (Utama)
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 text-[11px] font-black">
                                      <Trash2 className="w-3 h-3 text-rose-700" />
                                      Akan Dihapus
                                    </span>
                                  )}
                                </td>
                                <td className="p-2.5 font-mono text-[11px] text-slate-500">
                                  {item.id}
                                </td>
                                <td className="p-2.5 text-center text-slate-600">
                                  {Number(item.stok_awal || 0).toLocaleString()}
                                </td>
                                <td className="p-2.5 text-center text-emerald-700 font-semibold">
                                  {Number(item.masuk || 0).toLocaleString()}
                                </td>
                                <td className="p-2.5 text-center text-rose-700 font-semibold">
                                  {Number(item.keluar || 0).toLocaleString()}
                                </td>
                                <td className="p-2.5 text-center font-black text-slate-900">
                                  {Number(item.tersedia || 0).toLocaleString()} {item.satuan}
                                </td>
                                <td className="p-2.5 text-slate-600">
                                  {item.packing || '-'}
                                </td>
                                <td className="p-2.5 text-slate-500 text-[11px]">
                                  {item.created_at ? new Date(item.created_at).toLocaleString('id-ID') : '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <span className="text-xs text-slate-500 font-medium">
              Data Gudang Cleaner • Menghapus baris duplikat dan menyisakan data tunggal unik
            </span>
            <Button
              type="button"
              onClick={onClose}
              disabled={isProcessingDelete}
              className="h-10 px-6 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs cursor-pointer shadow-md"
            >
              Tutup
            </Button>
          </div>

        </div>
      </Modal>

      {/* CONFIRMATION DIALOG MODAL */}
      {confirmDialog.isOpen && (
        <Modal
          isOpen={true}
          onClose={() => setConfirmDialog({ isOpen: false, type: 'all' })}
          title="Konfirmasi Pembersihan Data Duplikat"
          size="md"
        >
          <div className="space-y-4">
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs text-rose-900 space-y-1">
                <p className="font-bold text-sm">
                  {confirmDialog.type === 'all'
                    ? `Apakah Anda yakin ingin menghapus ${totalExcessRows} baris duplikat?`
                    : `Hapus duplikat untuk SKU ${confirmDialog.targetGroup?.sku} di Rak ${confirmDialog.targetGroup?.rak}?`}
                </p>
                <p className="leading-relaxed">
                  Tindakan ini akan <strong>menghapus permanen</strong> baris data duplikat yang berlebih dari tabel <code>stock_items</code> dan <strong>hanya menyisakan 1 baris unik</strong> per SKU dan Rak.
                  {mergeQuantities && (
                    <strong className="block mt-1 text-emerald-800">
                      * Opsi akumulasi aktif: Nilai stok akan dijumlahkan ke baris data utama sebelum penghapusan.
                    </strong>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                onClick={() => setConfirmDialog({ isOpen: false, type: 'all' })}
                className="h-10 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
              >
                Batal
              </Button>
              <Button
                type="button"
                onClick={() => executeDeleteDuplicates(confirmDialog.targetGroup)}
                className="h-10 px-5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-md shadow-rose-600/30 flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>Ya, Hapus Duplikat Sekarang</span>
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
