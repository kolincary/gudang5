import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Toast } from './ui/Toast';
import { Modal } from './ui/Modal';
import {
  Layers,
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  Upload,
  Download,
  PlusCircle,
  Save,
  Info,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Copy,
  RefreshCw,
  Boxes,
  PackageCheck
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { skuConversionService, SKUConversion } from '../services/skuConversionService';
import { fetchAllProducts } from '../lib/supabase';

interface PasteRow {
  id: number;
  sku_konversi: string;
  sku_pcs: string;
  satuan_packing: string;
  qty: number | string;
}

export function KonversiPCS() {
  const [conversions, setConversions] = useState<SKUConversion[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    sku_konversi: '',
    sku_pcs: '',
    satuan_packing: 'CTN/16PACK/12PCS',
    qty: 12
  });

  const [pasteContent, setPasteContent] = useState('');
  const [pasteRows, setPasteRows] = useState<PasteRow[]>([]);
  const [allSkuList, setAllSkuList] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [sortConfig, setSortConfig] = useState<{ key: keyof SKUConversion; direction: 'asc' | 'desc' } | null>(null);

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

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await skuConversionService.fetchConversions();
      setConversions(data);
    } catch (error) {
      console.error('Error loading conversions:', error);
      showToast('Gagal memuat data konversi', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 1. Initial cached load
    const cached = skuConversionService.getCachedConversions();
    if (cached.length > 0) {
      setConversions(cached);
      setLoading(false);
    }

    loadData();

    // 2. Load product catalogue for autocomplete / lookup
    const loadSkus = async () => {
      try {
        const res = await fetchAllProducts(undefined, true);
        if (res.data) {
          setAllSkuList(res.data.map((p: any) => p.nama));
        }
      } catch (err) {
        console.error('Error loading SKU list:', err);
      }
    };
    loadSkus();

    // 3. Realtime listener
    const unsubscribe = skuConversionService.subscribe(() => {
      setConversions(skuConversionService.getCachedConversions());
    });

    return () => unsubscribe();
  }, []);

  const handleSort = (key: keyof SKUConversion) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: keyof SKUConversion) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <ArrowUp className="h-4 w-4 ml-1 opacity-20" />;
    }
    return sortConfig.direction === 'asc' ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />;
  };

  const filteredConversions = React.useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return conversions;
    return conversions.filter(item =>
      item.sku_konversi.toLowerCase().includes(term) ||
      item.sku_pcs.toLowerCase().includes(term) ||
      item.satuan_packing.toLowerCase().includes(term) ||
      String(item.qty).includes(term)
    );
  }, [conversions, searchTerm]);

  const sortedConversions = React.useMemo(() => {
    let list = [...filteredConversions];
    if (sortConfig !== null) {
      list.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
        }
        const aStr = String(aVal || '').toLowerCase();
        const bStr = String(bVal || '').toLowerCase();
        if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return list;
  }, [filteredConversions, sortConfig]);

  const totalPages = Math.ceil(sortedConversions.length / itemsPerPage) || 1;
  const currentItems = sortedConversions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const resetSingleForm = () => {
    setFormData({
      sku_konversi: '',
      sku_pcs: '',
      satuan_packing: 'CTN/16PACK/12PCS',
      qty: 12
    });
    setEditingId(null);
    setIsFormOpen(false);
    setIsEditModalOpen(false);
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.sku_konversi.trim() || !formData.sku_pcs.trim()) {
      showToast('SKU Konversi dan SKU PCS wajib diisi', 'warning');
      return;
    }

    try {
      if (editingId) {
        await skuConversionService.updateConversion(editingId, {
          sku_konversi: formData.sku_konversi.trim(),
          sku_pcs: formData.sku_pcs.trim(),
          satuan_packing: formData.satuan_packing.trim(),
          qty: Number(formData.qty) || 1
        });
        showToast('Data konversi berhasil diperbarui!', 'success');
      } else {
        await skuConversionService.addConversion({
          sku_konversi: formData.sku_konversi.trim(),
          sku_pcs: formData.sku_pcs.trim(),
          satuan_packing: formData.satuan_packing.trim(),
          qty: Number(formData.qty) || 1
        });
        showToast('Konversi baru berhasil ditambahkan!', 'success');
      }
      resetSingleForm();
      setConversions(skuConversionService.getCachedConversions());
    } catch (error) {
      console.error('Error saving conversion:', error);
      showToast('Terjadi kesalahan saat menyimpan data', 'error');
    }
  };

  const handleEdit = (item: SKUConversion) => {
    setFormData({
      sku_konversi: item.sku_konversi,
      sku_pcs: item.sku_pcs,
      satuan_packing: item.satuan_packing,
      qty: item.qty
    });
    setEditingId(item.id);
    setIsEditModalOpen(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Apakah Anda yakin ingin menghapus aturan konversi untuk "${name}"?`)) {
      try {
        setConversions(prev => prev.filter(item => item.id !== id));
        await skuConversionService.deleteConversion(id);
        showToast('Aturan konversi berhasil dihapus', 'success');
      } catch (error) {
        console.error('Error deleting conversion:', error);
        showToast('Gagal menghapus konversi', 'error');
        setConversions(skuConversionService.getCachedConversions());
      }
    }
  };

  const handleProcessPasteText = () => {
    const lines = pasteContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      showToast('Tidak ada data teks yang valid untuk diproses', 'warning');
      return;
    }

    const rows: PasteRow[] = [];
    lines.forEach((line, idx) => {
      let parts: string[] = [];
      if (line.includes('\t')) {
        parts = line.split('\t');
      } else if (line.includes(';')) {
        parts = line.split(';');
      } else if (line.includes(',') && !line.includes('  ')) {
        parts = line.split(',');
      } else {
        parts = [line];
      }

      const skuKonversi = (parts[0] || '').trim();
      const skuPcs = (parts[1] || '').trim();
      const satuanPacking = (parts[2] || '').trim() || 'CTN/16PACK/12PCS';
      const qty = parseInt(parts[3] || '12', 10) || 12;

      rows.push({
        id: Date.now() + idx,
        sku_konversi: skuKonversi,
        sku_pcs: skuPcs,
        satuan_packing: satuanPacking,
        qty: qty
      });
    });

    setPasteRows(rows);
    showToast(`Berhasil membaca ${rows.length} baris! Silakan tinjau tabel sebelum simpan.`, 'info');
  };

  const handleSavePasteRows = async () => {
    const validRows = pasteRows.filter(r => r.sku_konversi.trim() && r.sku_pcs.trim());
    if (validRows.length === 0) {
      showToast('Tidak ada baris valid dengan SKU Konversi & SKU PCS', 'warning');
      return;
    }

    try {
      await skuConversionService.addBatchConversions(
        validRows.map(r => ({
          sku_konversi: r.sku_konversi.trim(),
          sku_pcs: r.sku_pcs.trim(),
          satuan_packing: r.satuan_packing.trim() || 'CTN/16PACK/12PCS',
          qty: Number(r.qty) || 1
        }))
      );

      showToast(`Sukses menambahkan ${validRows.length} aturan konversi baru!`, 'success');
      setPasteContent('');
      setPasteRows([]);
      setIsPasteModalOpen(false);
      setConversions(skuConversionService.getCachedConversions());
    } catch (error) {
      console.error('Error batch adding conversions:', error);
      showToast('Gagal menyimpan data massal', 'error');
    }
  };

  const handleExportExcel = () => {
    try {
      const headers = ['SKU Konversi', 'SKU PCS', 'Satuan Packing', 'Qty'];
      const data = filteredConversions.map(item => [
        item.sku_konversi,
        item.sku_pcs,
        item.satuan_packing,
        item.qty
      ]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Konversi PCS");
      XLSX.writeFile(wb, `Data_Konversi_PCS_${new Date().toISOString().split('T')[0]}.xlsx`);
      showToast(`Berhasil mengunduh ${filteredConversions.length} data konversi!`, 'success');
    } catch (error) {
      console.error('Error exporting Excel:', error);
      showToast('Gagal melakukan export Excel', 'error');
    }
  };

  const handleDownloadTemplate = () => {
    const headers = ['SKU Konversi', 'SKU PCS', 'Satuan Packing', 'Qty'];
    const sample = [
      ['BOOK-1PACK/CLBK-3501', 'BOOK-CLBK-3501/1PC', 'CTN/16PACK/12PCS', 12],
      ['PEN-1BOX/STANDARD-01', 'PEN-STANDARD-01/1PC', 'CTN/20BOX/10PCS', 10],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sample]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template Konversi");
    XLSX.writeFile(wb, "Template_Konversi_PCS.xlsx");
    showToast('Template Excel berhasil diunduh!', 'success');
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      try {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        const lines = data.filter(row => row.length > 0 && row.some(cell => cell !== undefined && cell !== null && String(cell).trim() !== ''));
        const firstRowStr = lines[0]?.map(String).join(' ').toLowerCase() || '';
        const dataLines = (firstRowStr.includes('sku') || firstRowStr.includes('konversi') || firstRowStr.includes('qty'))
          ? lines.slice(1)
          : lines;

        const importedRows: { sku_konversi: string; sku_pcs: string; satuan_packing: string; qty: number }[] = [];
        dataLines.forEach(cols => {
          if (cols.length >= 2 && cols[0] && cols[1]) {
            importedRows.push({
              sku_konversi: String(cols[0]).trim(),
              sku_pcs: String(cols[1]).trim(),
              satuan_packing: String(cols[2] || 'CTN/16PACK/12PCS').trim(),
              qty: parseInt(String(cols[3] || '12'), 10) || 12
            });
          }
        });

        if (importedRows.length > 0) {
          await skuConversionService.addBatchConversions(importedRows);
          showToast(`Berhasil mengimpor ${importedRows.length} data konversi dari Excel!`, 'success');
          setIsImportModalOpen(false);
          setConversions(skuConversionService.getCachedConversions());
        } else {
          showToast('Tidak ada data valid yang ditemukan di file Excel.', 'warning');
        }
      } catch (err) {
        console.error('Error importing Excel:', err);
        showToast('Gagal memproses file Excel', 'error');
      } finally {
        e.target.value = '';
      }
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
        {/* PREMIUM IMMERSIVE HEADER */}
        <div className="flex flex-col mb-8 lg:mb-12 uppercase">
          <div className="bg-gradient-to-br from-blue-700 via-blue-800 to-slate-900 pt-[90px] lg:pt-0 lg:h-[310px] pb-[75px] lg:pb-0 px-6 lg:px-12 rounded-b-[40px] lg:rounded-b-[55px] shadow-2xl shadow-blue-900/40 relative overflow-hidden transition-all duration-500 flex flex-col justify-center">
            <div className="absolute -top-12 -right-12 text-white opacity-5 pointer-events-none">
              <Boxes className="w-72 h-72 lg:w-[480px] lg:h-[480px]" />
            </div>
            <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute bottom-1/4 right-1/4 w-24 h-24 bg-indigo-500/10 rounded-3xl rotate-45 blur-2xl"></div>
            
            <div className="relative z-10 w-full flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 uppercase text-left">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2 mb-3 lg:mb-4 opacity-90">
                  <div className="w-10 h-[2px] bg-blue-400 rounded-full"></div>
                  <span className="text-[10px] lg:text-[12px] font-black tracking-[0.4em] text-blue-100">Formula & Auto Multiplier</span>
                </div>
                <h1 className="text-[34px] lg:text-[54px] font-black text-white tracking-tighter leading-[0.9] mb-3 uppercase">
                  Konversi <span className="text-blue-300">PCS</span>
                </h1>
                <div className="text-blue-100/80 font-medium text-[14px] lg:text-[18px] leading-relaxed max-w-[90%] normal-case flex items-center gap-3">
                  <div className="px-3 py-1 bg-white/10 rounded-full backdrop-blur-sm flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                    </span>
                    <span className="text-[11px] font-bold tracking-widest uppercase">{conversions.length.toLocaleString()} Formula Terdaftar</span>
                  </div>
                  <span className="text-[13px] lg:text-[16px]">Pemetaan pengali stok pack ke satuan PCS</span>
                </div>
              </div>

              {/* Action buttons on Header */}
              <div className="relative z-10 flex flex-wrap gap-2 lg:gap-3 lg:mb-2 items-center">
                <Button
                  onClick={() => setIsPasteModalOpen(true)}
                  className="h-12 px-5 bg-white/10 hover:bg-white/20 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 border-none backdrop-blur-xl"
                >
                  <Copy className="h-4 w-4" />
                  <span className="uppercase text-[10px] font-black">Paste Sekaligus</span>
                </Button>
                <Button
                  onClick={() => setIsImportModalOpen(true)}
                  className="h-12 px-5 bg-white/10 hover:bg-white/20 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 border-none backdrop-blur-xl"
                >
                  <Upload className="h-4 w-4" />
                  <span className="uppercase text-[10px] font-black">Import Excel</span>
                </Button>
                <Button
                  onClick={handleExportExcel}
                  className="h-12 px-5 bg-white/10 hover:bg-white/20 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 border-none backdrop-blur-xl"
                >
                  <Download className="h-4 w-4" />
                  <span className="uppercase text-[10px] font-black">Export Excel</span>
                </Button>
                <Button
                  onClick={() => {
                    resetSingleForm();
                    setIsFormOpen(true);
                  }}
                  className="h-12 px-6 bg-white hover:bg-blue-50 text-blue-700 font-black rounded-2xl shadow-[0_8px_25px_rgba(255,255,255,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2.5 border-none"
                >
                  <Plus className="h-4 w-4" />
                  <span className="uppercase text-xs font-black">Tambah Konversi</span>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* UNIFIED SEARCH & TABLE WRAPPER (CONNECTED & BLUE THEME) */}
        <div className="bg-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] rounded-[20px] border border-blue-100 flex flex-col relative overflow-hidden mb-8">
          
          {/* Connected Blue Search Toolbar */}
          <div className="bg-blue-600 p-4 lg:p-5 relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <span className="text-white font-bold text-sm tracking-wide hidden sm:inline">Search</span>
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-10 pr-10 py-2.5 text-sm text-gray-800 bg-white rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all font-medium placeholder-gray-400 shadow-sm"
                  placeholder="Cari SKU Konversi, SKU PCS, atau Packing..."
                />
                {searchTerm && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setCurrentPage(1);
                    }}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1.5 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Total Count Badge */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-white/90 bg-white/10 px-3.5 py-2 rounded-xl backdrop-blur-sm border border-white/20">
                {sortedConversions.length} Formula Ditemukan
              </span>
            </div>
          </div>

          {/* Table Content */}
          <div className="overflow-x-auto">
            {loading && (
              <div className="flex items-center justify-center p-8 space-x-3">
                <RefreshCw className="h-5 w-5 text-blue-600 animate-spin" />
                <div className="text-blue-600 font-bold text-sm">Memuat data konversi...</div>
              </div>
            )}
            <table className="w-full">
              <thead className="bg-blue-600 text-white">
                <tr>
                  <th className="px-4 py-3.5 text-center text-xs font-black uppercase tracking-wider w-[5%] border-r border-blue-500/40">
                    No
                  </th>
                  <th
                    className="px-4 py-3.5 text-left text-xs font-black uppercase tracking-wider border-r border-blue-500/40 cursor-pointer hover:bg-blue-700 transition-colors w-[30%]"
                    onClick={() => handleSort('sku_konversi')}
                  >
                    <div className="flex items-center justify-between">
                      SKU Konversi (Pack / Box) {getSortIcon('sku_konversi')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3.5 text-left text-xs font-black uppercase tracking-wider border-r border-blue-500/40 cursor-pointer hover:bg-blue-700 transition-colors w-[30%]"
                    onClick={() => handleSort('sku_pcs')}
                  >
                    <div className="flex items-center justify-between">
                      SKU PCS (Target Pcs) {getSortIcon('sku_pcs')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3.5 text-center text-xs font-black uppercase tracking-wider border-r border-blue-500/40 cursor-pointer hover:bg-blue-700 transition-colors w-[15%]"
                    onClick={() => handleSort('satuan_packing')}
                  >
                    <div className="flex items-center justify-center">
                      Satuan Packing {getSortIcon('satuan_packing')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3.5 text-center text-xs font-black uppercase tracking-wider border-r border-blue-500/40 cursor-pointer hover:bg-blue-700 transition-colors w-[10%]"
                    onClick={() => handleSort('qty')}
                  >
                    <div className="flex items-center justify-center">
                      Qty (Pcs) {getSortIcon('qty')}
                    </div>
                  </th>
                  <th className="px-4 py-3.5 text-center text-xs font-black uppercase tracking-wider w-[10%]">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {currentItems.length > 0 ? (
                  currentItems.map((item, index) => (
                    <tr
                      key={item.id}
                      className={`${index % 2 === 0 ? 'bg-blue-50/20' : 'bg-white'} hover:bg-blue-50/60 transition-colors`}
                    >
                      <td className="px-4 py-3.5 text-xs text-center font-bold text-gray-500 border-r border-gray-100">
                        {(currentPage - 1) * itemsPerPage + index + 1}
                      </td>
                      <td className="px-4 py-3.5 text-xs font-black text-gray-900 border-r border-gray-100 font-mono">
                        <span className="bg-blue-50 text-blue-900 px-2.5 py-1 rounded-md border border-blue-100/60">
                          {item.sku_konversi}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-xs font-bold text-blue-900 border-r border-gray-100 font-mono">
                        <span className="bg-indigo-50 text-indigo-900 px-2.5 py-1 rounded-md border border-indigo-100/60">
                          {item.sku_pcs}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-center border-r border-gray-100 font-bold text-rose-600">
                        <span className="bg-rose-50 px-2.5 py-1 rounded-md border border-rose-100">
                          {item.satuan_packing || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-center border-r border-gray-100">
                        <span className="inline-flex items-center justify-center bg-emerald-500 text-white font-black px-3 py-1 rounded-full text-xs shadow-sm">
                          × {item.qty}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex justify-center space-x-1.5">
                          <Button
                            onClick={() => handleEdit(item)}
                            className="h-8 w-8 p-0 flex items-center justify-center bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 rounded-lg transition-all active:scale-90 border-none"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            onClick={() => handleDelete(item.id, item.sku_konversi)}
                            className="h-8 w-8 p-0 flex items-center justify-center bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 rounded-lg transition-all active:scale-90 border-none"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-gray-500 text-sm">
                      {searchTerm ? 'Tidak ditemukan data konversi yang cocok' : 'Belum ada data konversi terdaftar'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* PAGINATION */}
        <div className="flex flex-wrap items-center justify-between gap-4 mt-4">
          <div className="flex items-center space-x-2">
            <span className="text-xs text-gray-600 font-bold">Baris per halaman:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-2 py-1 border border-gray-200 rounded-md bg-white text-xs font-bold"
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={500}>500</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <Button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="h-9 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg border-none transition-all active:scale-95 disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4 mr-1.5" />
              Sebelumnya
            </Button>
            <div className="text-xs text-gray-700 font-bold px-3.5 py-2 bg-blue-50 text-blue-800 rounded-lg">
              Halaman {currentPage} dari {totalPages}
            </div>
            <Button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="h-9 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg border-none transition-all active:scale-95 disabled:opacity-50"
            >
              Berikutnya
              <ChevronRight className="h-4 w-4 ml-1.5" />
            </Button>
          </div>
        </div>

        {/* MODAL: Tambah / Edit Konversi */}
        <Modal
          isOpen={isFormOpen || isEditModalOpen}
          onClose={resetSingleForm}
          title={editingId ? 'Edit Aturan Konversi PCS' : 'Tambah Aturan Konversi PCS'}
          size="4xl"
        >
          <div className="p-6 bg-gray-50 rounded-2xl">
            <div className="mb-5 p-4 bg-blue-50 rounded-xl flex items-start gap-3 border border-blue-100">
              <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-900 font-medium leading-relaxed">
                Saat SKU Konversi dicari di <strong>Dashboard</strong>, stok akan otomatis dikalikan dengan <strong>Qty</strong> untuk menampilkan total stok dalam satuan <strong>PCS</strong>.
              </p>
            </div>

            <form onSubmit={handleSingleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  SKU Konversi (Nama Produk Pack / Box) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: BOOK-1PACK/CLBK-3501"
                  value={formData.sku_konversi}
                  onChange={(e) => setFormData({ ...formData, sku_konversi: e.target.value.toUpperCase() })}
                  className="w-full px-3.5 py-2.5 text-xs font-bold border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  SKU PCS (Nama Produk Satuan PCS) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: BOOK-CLBK-3501/1PC"
                  value={formData.sku_pcs}
                  onChange={(e) => setFormData({ ...formData, sku_pcs: e.target.value.toUpperCase() })}
                  className="w-full px-3.5 py-2.5 text-xs font-bold border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase bg-white"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Satuan Packing
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: CTN/16PACK/12PCS"
                    value={formData.satuan_packing}
                    onChange={(e) => setFormData({ ...formData, satuan_packing: e.target.value.toUpperCase() })}
                    className="w-full px-3.5 py-2.5 text-xs font-bold border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Qty (Pengali PCS per Pack) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="Contoh: 12"
                    value={formData.qty}
                    onChange={(e) => setFormData({ ...formData, qty: parseInt(e.target.value, 10) || 1 })}
                    className="w-full px-3.5 py-2.5 text-xs font-bold border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <Button
                  type="button"
                  onClick={resetSingleForm}
                  className="px-5 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-xl border-none transition-all active:scale-95 text-xs"
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-lg transition-all active:scale-95 border-none flex items-center gap-2 text-xs uppercase"
                >
                  <Save className="h-4 w-4" />
                  {editingId ? 'Simpan Perubahan' : 'Tambah Aturan'}
                </Button>
              </div>
            </form>
          </div>
        </Modal>

        {/* MODAL: Paste Data Sekaligus (Multi-column) */}
        <Modal
          isOpen={isPasteModalOpen}
          onClose={() => setIsPasteModalOpen(false)}
          title="Paste Data Sekaligus (Excel / Spreadsheet)"
          size="7xl"
          fullHeight={true}
        >
          <div className="p-6 bg-gray-50 rounded-2xl space-y-5">
            <div className="p-4 bg-indigo-50 rounded-xl flex items-start gap-3">
              <Info className="h-5 w-5 text-indigo-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-indigo-900 font-medium leading-relaxed">
                <p>Salin 4 kolom langsung dari Excel / Spreadsheet dengan format:</p>
                <p className="font-mono mt-1 font-bold">Kolom 1: SKU Konversi | Kolom 2: SKU PCS | Kolom 3: Satuan Packing | Kolom 4: Qty</p>
                <p className="text-gray-500 italic mt-0.5">Contoh: <code>BOOK-1PACK/CLBK-3501 [TAB] BOOK-CLBK-3501/1PC [TAB] CTN/16PACK/12PCS [TAB] 12</code></p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* LEFT: Text Area Input */}
              <div className="lg:col-span-5 bg-white p-5 rounded-2xl shadow-sm space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    Tempelkan Baris Data dari Excel:
                  </label>
                  <textarea
                    value={pasteContent}
                    onChange={(e) => setPasteContent(e.target.value)}
                    placeholder="Tempel data di sini...&#10;BOOK-1PACK/CLBK-3501	BOOK-CLBK-3501/1PC	CTN/16PACK/12PCS	12"
                    rows={12}
                    className="w-full p-3 text-xs font-mono border border-indigo-100 rounded-xl focus:ring-2 focus:ring-indigo-500 bg-indigo-50/20 resize-none font-semibold text-gray-800"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={handleProcessPasteText}
                    className="flex-1 h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center text-xs border-none"
                  >
                    <PlusCircle className="h-4 w-4 mr-1.5" />
                    Proses ke Tabel
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      setPasteContent('');
                      setPasteRows([]);
                    }}
                    className="h-10 px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-xl text-xs transition-all border-none"
                  >
                    Reset
                  </Button>
                </div>
              </div>

              {/* RIGHT: Parsed Table Review */}
              <div className="lg:col-span-7 bg-white p-5 rounded-2xl shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase text-indigo-900 tracking-wider">
                    Hasil Analisis Data ({pasteRows.length} Baris)
                  </h4>
                  <span className="text-[10px] text-gray-400">Pastikan data sudah benar sebelum disimpan</span>
                </div>

                <div className="max-h-[380px] overflow-y-auto border border-gray-100 rounded-xl">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-indigo-600 text-white text-[11px] sticky top-0 font-bold uppercase">
                      <tr>
                        <th className="p-2.5">SKU Konversi</th>
                        <th className="p-2.5">SKU PCS</th>
                        <th className="p-2.5 text-center">Packing</th>
                        <th className="p-2.5 text-center">Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-xs font-mono">
                      {pasteRows.length > 0 ? (
                        pasteRows.map((r) => (
                          <tr key={r.id} className="hover:bg-indigo-50/50">
                            <td className="p-2.5 font-bold text-gray-900">{r.sku_konversi}</td>
                            <td className="p-2.5 text-blue-800">{r.sku_pcs}</td>
                            <td className="p-2.5 text-center text-rose-600 font-bold">{r.satuan_packing}</td>
                            <td className="p-2.5 text-center font-bold text-emerald-600">×{r.qty}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="p-8 text-center text-gray-400 font-sans text-xs">
                            Belum ada baris yang diproses. Tempelkan teks di sisi kiri lalu klik <strong>"Proses ke Tabel"</strong>.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button
                    type="button"
                    onClick={() => setIsPasteModalOpen(false)}
                    className="h-10 px-5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl border-none transition-all active:scale-95 text-xs"
                  >
                    Batal
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSavePasteRows}
                    disabled={pasteRows.length === 0}
                    className="h-10 px-7 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg transition-all active:scale-95 text-xs flex items-center border-none disabled:opacity-50"
                  >
                    <Save className="h-4 w-4 mr-1.5" />
                    Simpan Semua Data ({pasteRows.length})
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Modal>

        {/* MODAL: Import Excel */}
        <Modal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          title="Import Konversi PCS dari Excel (.xlsx)"
          size="lg"
        >
          <div className="p-6 space-y-6">
            <div className="p-4 bg-indigo-600 rounded-2xl text-white flex items-center justify-between gap-4 shadow-lg">
              <div>
                <h4 className="font-black text-sm uppercase">1. Unduh Template Excel</h4>
                <p className="text-indigo-100 text-xs font-medium">Gunakan template yang sudah diformat dengan benar.</p>
              </div>
              <Button
                type="button"
                onClick={handleDownloadTemplate}
                className="bg-white text-indigo-700 hover:bg-indigo-50 font-black rounded-xl px-4 h-10 active:scale-95 transition-all shadow-md text-xs flex items-center border-none"
              >
                <Download className="h-4 w-4 mr-1.5" /> Download
              </Button>
            </div>

            <div className="border-2 border-dashed border-gray-300 rounded-2xl p-8 text-center bg-gray-50/50">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleExcelImport}
                className="hidden"
                id="excel-conversion-upload"
              />
              <Upload className="mx-auto h-12 w-12 text-indigo-400 mb-2" />
              <p className="font-bold text-sm text-gray-700">Pilih file Excel yang sudah diisi</p>
              <p className="text-xs text-gray-400 mt-1 mb-4">Format: .xlsx atau .xls</p>
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-6 h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all active:scale-95 text-xs border-none"
              >
                <Upload className="h-4 w-4 mr-1.5" /> Pilih File Excel
              </Button>
            </div>
          </div>
        </Modal>

      </div>
    </>
  );
}
