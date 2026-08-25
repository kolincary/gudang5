import React, { useState, useRef, useMemo } from 'react';
import { Upload, CheckCircle2, AlertTriangle, Info, Play, Save, RefreshCw, FileSpreadsheet, ArrowRight, Layers, Trash2, Send, Edit3, LayoutGrid } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';

// Mock UI Component for Button to match existing styles
const Button = ({ children, onClick, disabled, className, variant = 'primary' }: any) => {
  const baseStyle = "font-black rounded-3xl transition-all active:scale-95 flex items-center justify-center gap-4 disabled:opacity-40 disabled:grayscale uppercase tracking-[0.2em] text-sm";
  const variants = {
    primary: "bg-blue-600 hover:bg-blue-700 text-white shadow-2xl shadow-blue-100",
    success: "bg-gradient-to-r from-emerald-500 to-emerald-700 hover:from-emerald-600 hover:to-emerald-800 text-white shadow-2xl shadow-emerald-100",
    outline: "border-2 border-gray-100 text-gray-400 hover:bg-gray-50",
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`${baseStyle} ${variants[variant as keyof typeof variants]} ${className}`}>
      {children}
    </button>
  );
};

interface ImportRow {
  tgl: string;
  waktu: string;
  sku: string;
  jumlah: number;
  type: string;
  rak: string;
  user_name: string;
}

interface DbRow extends ImportRow {
  id: string;
}

type SyncStatus = 'Match' | 'Update Required' | 'Insert Required';
type FilterMode = 'Semua' | 'Sesuai' | 'Perlu Update' | 'Data Baru';

interface PreviewItem {
  id: string;
  importRow: ImportRow;
  dbRow: DbRow | null;
  status: SyncStatus;
  changes?: {
    rak?: { old: string; new: string };
    jumlah?: { old: number; new: number };
  };
}

const ImportDataExport: React.FC = () => {
  const [files, setFiles] = useState<FileList | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  const [syncResult, setSyncResult] = useState<{ success: number; failed: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterMode, setFilterMode] = useState<FilterMode>('Semua');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles(e.target.files);
      setPreviewData([]);
      setSyncResult(null);
      setSyncProgress({ current: 0, total: 0 });
      setSelectedIds(new Set());
      setFilterMode('Semua');
    }
  };

  const formatExcelDate = (excelDate: any): string => {
    if (!excelDate) return '';
    if (typeof excelDate === 'string') {
      const parts = excelDate.split('/');
      if (parts.length === 3) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
      return excelDate;
    }
    if (typeof excelDate === 'number') {
      const date = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }
    if (excelDate instanceof Date) {
      return `${excelDate.getFullYear()}-${String(excelDate.getMonth() + 1).padStart(2, '0')}-${String(excelDate.getDate()).padStart(2, '0')}`;
    }
    return String(excelDate);
  };

  const isUtamaPattern = (rakValue: string) => {
    if (!rakValue) return false;
    const upperRak = rakValue.trim().toUpperCase();
    
    const nonUtama = ['LANTAI 2', 'LANTAI 4', 'ECER-N', 'BLOK-I', 'ECER-O', 'ECER-M'];
    if (nonUtama.includes(upperRak)) return false;

    if (upperRak.startsWith('TEMP') || upperRak.startsWith('LORONG-')) return true;
    
    // Match A1, A2, up to ZZZ999
    const match = upperRak.match(/^[A-Z]{1,3}\d{1,3}$/i);
    if (match) return true;
    
    return false;
  };

  const checkRakMatch = (importRak: string, dbRak: string) => {
    const imp = importRak.trim().toUpperCase();
    const db = dbRak.trim().toUpperCase();
    if (imp === db) return true;
    if (imp === 'UTAMA' && isUtamaPattern(dbRak)) return true;
    return false;
  };

  const processFile = async () => {
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    setPreviewData([]);
    setSyncResult(null);
    setSyncProgress({ current: 0, total: 0 });
    setSelectedIds(new Set());

    try {
      const importRows: ImportRow[] = [];
      const uniqueDates = new Set<string>();

      // Read all selected files
      for (let f = 0; f < files.length; f++) {
        const file = files[f];
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const rawData = XLSX.utils.sheet_to_json(worksheet) as any[];
        
        for (const row of rawData) {
          const type = String(row['Type'] || row['type'] || '').toUpperCase();
          if (type !== 'OUT') continue;

          const tgl = formatExcelDate(row['Tanggal'] || row['tgl']);
          if (!tgl) continue;

          const rawWaktu = row['Waktu'] || row['waktu'];
          let waktuStr = String(rawWaktu || '').trim();
          if (typeof rawWaktu === 'number') {
             const totalSeconds = Math.round(rawWaktu * 86400);
             const h = Math.floor(totalSeconds / 3600);
             const m = Math.floor((totalSeconds % 3600) / 60);
             const s = totalSeconds % 60;
             waktuStr = `${String(h).padStart(2, '0')}.${String(m).padStart(2, '0')}.${String(s).padStart(2, '0')}`;
          }

          const parsedRow: ImportRow = {
            tgl: tgl,
            waktu: waktuStr,
            sku: String(row['SKU/Nama Barang'] || row['SKU'] || row['sku'] || ''),
            jumlah: Number(row['Jumlah'] || row['jumlah']) || 0,
            type: type,
            rak: String(row['Rak'] || row['rak'] || ''),
            user_name: String(row['User'] || row['user_name'] || '')
          };

          importRows.push(parsedRow);
          uniqueDates.add(tgl);
        }
      }

      if (importRows.length === 0) {
        alert('Tidak ada data berjenis OUT di dalam file Excel yang dipilih.');
        setIsProcessing(false);
        return;
      }

      const datesArray = Array.from(uniqueDates);
      let allDbData: DbRow[] = [];

      for (let i = 0; i < datesArray.length; i += 5) {
        const chunk = datesArray.slice(i, i + 5);
        const { data, error } = await supabase
          .from('database_log')
          .select('id, tgl, waktu, sku, jumlah, type, rak, user_name')
          .in('tgl', chunk)
          .eq('type', 'OUT');

        if (error) {
          console.error('Error fetching DB data:', error);
          alert('Gagal mengambil data dari database.');
          setIsProcessing(false);
          return;
        }
        
        if (data) {
          allDbData = [...allDbData, ...data as DbRow[]];
        }
      }

      const newPreviewData: PreviewItem[] = [];

      for (let i = 0; i < importRows.length; i++) {
        const importRow = importRows[i];
        
        // Robust Matching
        const importSku = importRow.sku.trim().toLowerCase();
        const importUser = importRow.user_name.trim().toLowerCase();
        const importWaktu = importRow.waktu.replace(/\D/g, ''); // strip all non-digits
        const importTgl = importRow.tgl.trim();

        const matchingDbRows = allDbData.filter(db => {
           const dbSku = db.sku.trim().toLowerCase();
           const dbUser = db.user_name.trim().toLowerCase();
           const dbWaktu = db.waktu.replace(/\D/g, '');
           return db.tgl === importTgl && dbWaktu === importWaktu && dbSku === importSku && dbUser === importUser;
        });

        let exactMatch = matchingDbRows.find(db => checkRakMatch(importRow.rak, db.rak) && db.jumlah === importRow.jumlah);
        
        if (exactMatch) {
          newPreviewData.push({
            id: `row-${i}`,
            importRow,
            dbRow: exactMatch,
            status: 'Match'
          });
          allDbData = allDbData.filter(db => db.id !== exactMatch!.id);
        } else if (matchingDbRows.length > 0) {
          const bestMatch = matchingDbRows[0];
          const changes: any = {};
          
          if (!checkRakMatch(importRow.rak, bestMatch.rak)) {
            changes.rak = { old: bestMatch.rak, new: importRow.rak };
          }
          if (bestMatch.jumlah !== importRow.jumlah) {
            changes.jumlah = { old: bestMatch.jumlah, new: importRow.jumlah };
          }

          newPreviewData.push({
            id: `row-${i}`,
            importRow,
            dbRow: bestMatch,
            status: 'Update Required',
            changes
          });
          allDbData = allDbData.filter(db => db.id !== bestMatch.id);
        } else {
          newPreviewData.push({
            id: `row-${i}`,
            importRow,
            dbRow: null,
            status: 'Insert Required'
          });
        }
      }

      setPreviewData(newPreviewData);
    } catch (error) {
      console.error('Error processing file:', error);
      alert('Terjadi kesalahan saat membaca file.');
    } finally {
      setIsProcessing(false);
    }
  };

  const executeSync = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Anda akan menyinkronkan ${selectedIds.size} baris data yang dipilih. Lanjutkan?`)) return;

    setIsSyncing(true);
    let successCount = 0;
    let failedCount = 0;
    
    const itemsToProcess = previewData.filter(item => selectedIds.has(item.id));
    const itemsToUpdate = itemsToProcess.filter(item => item.status === 'Update Required' && item.dbRow);
    const itemsToInsert = itemsToProcess.filter(item => item.status === 'Insert Required');
    
    const totalTasks = itemsToUpdate.length + itemsToInsert.length;
    setSyncProgress({ current: 0, total: totalTasks });

    try {
      // 1. Process Updates
      for (let i = 0; i < itemsToUpdate.length; i++) {
        const item = itemsToUpdate[i];
        if (!item.dbRow) continue;
        
        const { error } = await supabase
          .from('database_log')
          .update({
            rak: item.importRow.rak,
            jumlah: item.importRow.jumlah
          })
          .eq('id', item.dbRow.id);

        if (error) {
          console.error(`Update failed for ID ${item.dbRow.id}:`, error);
          failedCount++;
        } else {
          successCount++;
        }
        
        if (i % 5 === 0 || i === itemsToUpdate.length - 1) {
          setSyncProgress(prev => ({ ...prev, current: i + 1 }));
        }
      }

      // 2. Process Inserts (Chunked)
      const chunkSize = 50;
      let insertsProcessed = 0;
      
      for (let i = 0; i < itemsToInsert.length; i += chunkSize) {
        const chunkItems = itemsToInsert.slice(i, i + chunkSize);
        const chunk = chunkItems.map(item => ({
          tgl: item.importRow.tgl,
          waktu: item.importRow.waktu,
          sku: item.importRow.sku,
          jumlah: item.importRow.jumlah,
          type: item.importRow.type,
          rak: item.importRow.rak,
          user_name: item.importRow.user_name,
          tgl_scan: new Date().toISOString().split('T')[0],
          gudang: 'N/A'
        }));
        
        const { error } = await supabase
          .from('database_log')
          .insert(chunk);

        if (error) {
          console.error('Insert chunk failed:', error);
          failedCount += chunk.length;
        } else {
          successCount += chunk.length;
        }
        
        insertsProcessed += chunk.length;
        setSyncProgress(prev => ({ ...prev, current: itemsToUpdate.length + insertsProcessed }));
      }

      setSyncResult({ success: successCount, failed: failedCount });
      alert(`Sinkronisasi Selesai!\nBerhasil: ${successCount}\nGagal: ${failedCount}`);
      
      // Cleanup successful syncs from preview
      if (failedCount === 0) {
        setPreviewData(prev => prev.filter(item => !selectedIds.has(item.id)));
        setSelectedIds(new Set());
        setSyncProgress({ current: 0, total: 0 });
      }

    } catch (error) {
      console.error('Sync process error:', error);
      alert('Terjadi kesalahan tidak terduga saat sinkronisasi.');
    } finally {
      setIsSyncing(false);
    }
  };

  const filteredData = useMemo(() => {
    switch (filterMode) {
      case 'Sesuai': return previewData.filter(d => d.status === 'Match');
      case 'Perlu Update': return previewData.filter(d => d.status === 'Update Required');
      case 'Data Baru': return previewData.filter(d => d.status === 'Insert Required');
      default: return previewData;
    }
  }, [previewData, filterMode]);

  const toggleSelectAll = () => {
    if (filteredData.every(item => selectedIds.has(item.id))) {
      // Deselect all visible
      const newSet = new Set(selectedIds);
      filteredData.forEach(item => newSet.delete(item.id));
      setSelectedIds(newSet);
    } else {
      // Select all visible
      const newSet = new Set(selectedIds);
      filteredData.forEach(item => newSet.add(item.id));
      setSelectedIds(newSet);
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const matchCount = previewData.filter(d => d.status === 'Match').length;
  const updateCount = previewData.filter(d => d.status === 'Update Required').length;
  const insertCount = previewData.filter(d => d.status === 'Insert Required').length;

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-8 pb-24">
      {/* UPLOAD SECTION - Like InputBarangMasuk */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-2xl">
            <Layers className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h3 className="font-black text-lg uppercase leading-tight tracking-tight text-gray-800">Sinkronisasi Closing (Massal)</h3>
            <p className="text-gray-400 text-[10px] md:text-sm font-medium">Pilih file hasil ekspor closing dan sesuaikan perubahannya.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        <div className="flex flex-col h-full space-y-4">
          <div className="flex-1 relative group bg-white rounded-[2.5rem] p-8 border-2 border-gray-100 shadow-sm transition-all hover:border-gray-200">
            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileChange}
              ref={fileInputRef}
              multiple
              className="block w-full text-sm text-slate-600
                file:mr-4 file:py-3 file:px-6
                file:rounded-xl file:border-0
                file:text-sm file:font-bold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100 file:transition-all
                file:cursor-pointer bg-slate-50 rounded-xl border border-slate-200 focus:outline-none"
            />
            <div className="mt-4 text-xs font-bold text-gray-400 uppercase tracking-widest">
              {files ? `${files.length} File Terpilih` : 'Pilih File (Bisa lebih dari 1)'}
            </div>
          </div>

          <div className="flex gap-4">
            <Button
              onClick={processFile}
              disabled={!files || isProcessing}
              className="flex-1 h-16"
            >
              {isProcessing ? (
                <RefreshCw className="h-5 w-5 animate-spin" />
              ) : (
                <Play className="h-5 w-5" />
              )}
              {isProcessing ? 'Membaca Data...' : 'Analisa Sekarang'}
            </Button>
            <Button
              onClick={() => {
                setFiles(null);
                setPreviewData([]);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              variant="outline"
              className="h-16 px-8 flex items-center justify-center gap-2"
            >
              <Trash2 className="h-5 w-5" />
              <span className="font-bold text-xs uppercase tracking-widest hidden sm:inline">Reset File</span>
            </Button>
          </div>
        </div>
      </div>

      {/* PREVIEW & PROGRESS SECTION */}
      <AnimatePresence>
        {previewData.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex flex-col bg-white rounded-[2.5rem] border border-gray-100 shadow-2xl overflow-hidden"
          >
            <div className="p-6 border-b border-gray-50 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 bg-slate-50/50">
              <div className="w-full">
                <h4 className="font-black text-xs uppercase tracking-[0.2em] text-gray-400">Preview Penyesuaian</h4>
                <div className="flex flex-wrap gap-3 mt-3">
                  <button onClick={() => setFilterMode('Semua')} className={`px-4 py-2 rounded-2xl text-xs font-black border transition-all ${filterMode === 'Semua' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'}`}>
                    Semua ({previewData.length})
                  </button>
                  <button onClick={() => setFilterMode('Sesuai')} className={`px-4 py-2 rounded-2xl text-xs font-black border transition-all ${filterMode === 'Sesuai' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100'}`}>
                    Sesuai ({matchCount})
                  </button>
                  <button onClick={() => setFilterMode('Perlu Update')} className={`px-4 py-2 rounded-2xl text-xs font-black border transition-all ${filterMode === 'Perlu Update' ? 'bg-amber-500 text-white border-amber-500' : 'bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-100'}`}>
                    Perlu Update ({updateCount})
                  </button>
                  <button onClick={() => setFilterMode('Data Baru')} className={`px-4 py-2 rounded-2xl text-xs font-black border transition-all ${filterMode === 'Data Baru' ? 'bg-blue-500 text-white border-blue-500' : 'bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100'}`}>
                    Data Baru ({insertCount})
                  </button>
                </div>
              </div>

              <div className="w-full lg:w-auto flex flex-col items-end gap-3 min-w-[300px]">
                <Button
                  onClick={executeSync}
                  variant="success"
                  disabled={isSyncing || selectedIds.size === 0}
                  className="w-full h-16"
                >
                  {isSyncing ? (
                    <RefreshCw className="h-5 w-5 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                  {isSyncing ? 'Sinkronisasi...' : `Sinkronkan Terpilih (${selectedIds.size})`}
                </Button>
                
                {/* PROGRESS BAR */}
                {isSyncing && syncProgress.total > 0 && (
                  <div className="w-full">
                    <div className="flex justify-between text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5">
                      <span>Progress</span>
                      <span>{Math.round((syncProgress.current / syncProgress.total) * 100)}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-auto max-h-[600px] p-0 custom-scrollbar">
              <table className="w-full text-left text-sm whitespace-nowrap border-collapse">
                <thead className="bg-white text-slate-400 font-black uppercase text-[10px] tracking-widest sticky top-0 shadow-sm z-10">
                  <tr>
                    <th className="px-6 py-4 border-b border-gray-100 w-16">
                      <input 
                        type="checkbox" 
                        checked={filteredData.length > 0 && filteredData.every(item => selectedIds.has(item.id))}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                    <th className="px-6 py-4 border-b border-gray-100">Status</th>
                    <th className="px-6 py-4 border-b border-gray-100">Tanggal & Waktu</th>
                    <th className="px-6 py-4 border-b border-gray-100">User</th>
                    <th className="px-6 py-4 border-b border-gray-100 max-w-[250px]">SKU/Nama Barang</th>
                    <th className="px-6 py-4 border-b border-gray-100 text-center">Rak (DB)</th>
                    <th className="px-6 py-4 border-b border-gray-100 text-center">Rak (Excel)</th>
                    <th className="px-6 py-4 border-b border-gray-100 text-center">Qty (Excel)</th>
                    <th className="px-6 py-4 border-b border-gray-100">Penyesuaian di DB</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 bg-gray-50/30">
                  {filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-gray-400">
                        <Edit3 className="h-12 w-12 stroke-[1] mx-auto mb-3 opacity-50" />
                        <p className="text-[10px] font-black uppercase tracking-[0.3em]">Tidak ada data</p>
                      </td>
                    </tr>
                  ) : (
                    filteredData.map((item) => (
                      <tr key={item.id} className="hover:bg-white transition-colors group">
                        <td className="px-6 py-4">
                           <input 
                            type="checkbox" 
                            checked={selectedIds.has(item.id)}
                            onChange={() => toggleSelect(item.id)}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-6 py-4">
                          {item.status === 'Match' ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest font-black bg-emerald-50 text-emerald-600 border border-emerald-100">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Sesuai
                            </span>
                          ) : item.status === 'Update Required' ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest font-black bg-amber-50 text-amber-600 border border-amber-100">
                              <AlertTriangle className="w-3.5 h-3.5" /> Perlu Update
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest font-black bg-blue-50 text-blue-600 border border-blue-100">
                              Data Baru
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-black text-gray-700">{item.importRow.tgl}</div>
                          <div className="text-[10px] font-bold text-gray-400">{item.importRow.waktu}</div>
                        </td>
                        <td className="px-6 py-4 text-xs font-bold text-gray-500">{item.importRow.user_name}</td>
                        <td className="px-6 py-4 text-sm font-black text-gray-800 truncate max-w-[250px]" title={item.importRow.sku}>
                          {item.importRow.sku}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="bg-gray-100 text-gray-500 px-3 py-1 rounded-xl text-xs font-black uppercase line-through opacity-70">
                            {item.dbRow ? item.dbRow.rak : '-'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-xl text-xs font-black uppercase">
                            {item.importRow.rak}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-emerald-600 text-lg font-black">
                            {item.importRow.jumlah}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {item.status === 'Update Required' && (
                            <div className="flex flex-col gap-2">
                              {item.changes?.rak && (
                                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold">
                                  <span className="text-gray-400 w-8">RAK</span>
                                  <span className="line-through text-rose-500 bg-rose-50 px-2 py-1 rounded-lg">{item.changes.rak.old || '-'}</span>
                                  <ArrowRight className="w-3 h-3 text-gray-300" />
                                  <span className="text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">{item.changes.rak.new}</span>
                                </div>
                              )}
                              {item.changes?.jumlah && (
                                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold">
                                  <span className="text-gray-400 w-8">QTY</span>
                                  <span className="line-through text-rose-500 bg-rose-50 px-2 py-1 rounded-lg">{item.changes.jumlah.old}</span>
                                  <ArrowRight className="w-3 h-3 text-gray-300" />
                                  <span className="text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">{item.changes.jumlah.new}</span>
                                </div>
                              )}
                            </div>
                          )}
                          {item.status === 'Match' && (
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Tidak ada perbedaan</span>
                          )}
                          {item.status === 'Insert Required' && (
                            <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">Akan ditambahkan ke DB</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ImportDataExport;
