import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Toast } from '../ui/Toast';
import { Modal } from '../ui/Modal';
import {
  Tag,
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  Upload,
  Download,
  PlusCircle,
  Save,
  RefreshCcw,
  Info,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Copy
} from 'lucide-react';
import { supabase, fetchAllProducts } from '../../lib/supabase';
import { queryOptimizer } from '../../lib/queryOptimizer';
import * as XLSX from 'xlsx';
import { useDatabaseConfig } from '../../lib/DatabaseContext';
import { DatabaseService } from '../../lib/DatabaseService';

interface SKU {
  id: string;
  id_barang: string;
  nama: string;
  satuan: string;
  status: 'Aktif' | 'Tidak Aktif';
  created_at: string;
  updated_at: string;
}

interface ImportProgress {
  isImporting: boolean;
  progress: number;
  total: number;
  current: number;
  message: string;
}

interface MassUpdateRow {
  id: number;
  old_sku: string;
  old_id_barang: string;
  new_sku: string;
}

interface AddSkuRow {
  id: number;
  id_barang: string;
  nama: string;
  satuan: string;
  status: 'Aktif' | 'Tidak Aktif';
}

export function DataSKU() {
  const { writeMode } = useDatabaseConfig();
  const [skus, setSKUs] = useState<SKU[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress>({
    isImporting: false,
    progress: 0,
    total: 0,
    current: 0,
    message: ''
  });
  const [updateProgress, setUpdateProgress] = useState({
    isUpdating: false,
    progress: 0,
    total: 0,
    current: 0,
    message: ''
  });
  const [formData, setFormData] = useState({
    id_barang: '',
    nama: '',
    satuan: '',
    status: 'Aktif' as 'Aktif' | 'Tidak Aktif'
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

  const [updateRows, setUpdateRows] = useState<MassUpdateRow[]>(
    Array.from({ length: 5 }, (_, i) => ({
      id: i,
      old_sku: '',
      old_id_barang: '',
      new_sku: '',
    }))
  );

  const [addSkuRows, setAddSkuRows] = useState<AddSkuRow[]>([]);
  const [showPasteInput, setShowPasteInput] = useState(false);
  const [pasteContent, setPasteContent] = useState("");
  const [satuanOptions, setSatuanOptions] = useState<string[]>(['PCS', 'BOX', 'CTN', 'PACK', 'SET', 'UNIT', 'KG']);
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);
  const [lastId, setLastId] = useState<number>(0);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [skuNames, setSkuNames] = useState<SKU[]>([]);
  const [filteredSkuNames, setFilteredSkuNames] = useState<SKU[]>([]);
  const [focusedRow, setFocusedRow] = useState<number | null>(null);
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const [sortConfig, setSortConfig] = useState<{ key: keyof SKU; direction: 'asc' | 'desc' } | null>(null);

  const handleSort = (key: keyof SKU) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: keyof SKU) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <ArrowUp className="h-4 w-4 ml-1 opacity-20" />;
    }
    return sortConfig.direction === 'asc' ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />;
  };

  const showToast = (message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') => {
    setToast({ isOpen: true, message, type });
    setTimeout(() => {
      setToast({ isOpen: false, message: '', type: 'info' });
    }, 4000);
  };

  const extractIdNumber = (id_barang: string): number => {
    const match = id_barang.match(/\d+$/);
    return match ? parseInt(match[0]) : 0;
  };

  const determineLastId = (data: SKU[]) => {
    if (data && data.length > 0) {
      const sortedData = [...data].sort((a, b) => {
        const idA = extractIdNumber(a.id_barang);
        const idB = extractIdNumber(b.id_barang);
        return idA - idB;
      });
      const lastSku = sortedData.pop();
      return lastSku ? extractIdNumber(lastSku.id_barang) : 0;
    }
    return 0;
  };

  const fetchEntireProductsList = async (): Promise<SKU[]> => {
    const result = await fetchAllProducts();
    return (result.data || []) as SKU[];
  };

  const fetchAndStoreSKUs = async () => {
    try {
      setLoading(true);

      const result = await fetchAllProducts();
      let allSkus: SKU[] = (result.data || []) as SKU[];

      const count = allSkus.length;

      const skuData = allSkus.map(item => ({
        id: item.id,
        id_barang: item.id_barang,
        nama: item.nama,
        satuan: item.satuan,
        status: item.status,
        created_at: item.created_at,
        updated_at: item.updated_at
      }));

      setSKUs(skuData);
      localStorage.setItem('sku_data', JSON.stringify(skuData));

      const allSkuNames = skuData.filter(sku => sku.status === 'Aktif');
      setSkuNames(allSkuNames);
      localStorage.setItem('sku_names_cache', JSON.stringify(allSkuNames));

      setLastId(determineLastId(skuData));

      if (!loading) {
        showToast(`Berhasil menyinkronkan ${count.toLocaleString()} SKU dari database`, 'success');
      }

    } catch (error) {
      console.error('Error loading all SKUs:', error);
      showToast('Terjadi kesalahan saat memuat seluruh data dari database', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const cachedData = localStorage.getItem('sku_data');
    if (cachedData) {
      const parsedData: SKU[] = JSON.parse(cachedData);
      parsedData.sort((a, b) => b.id_barang.localeCompare(a.id_barang));
      setSKUs(parsedData);
      setLastId(determineLastId(parsedData));
      showToast('Data cache dimuat, menyinkronkan data terbaru...', 'info');
    }

    fetchAndStoreSKUs();

    const fetchFullSkuNames = async () => {
      try {
        const allProducts = await fetchEntireProductsList();
        setSkuNames(allProducts);
        localStorage.setItem('sku_names_cache', JSON.stringify(allProducts));
      } catch (error) {
        console.error('Error fetching full SKU list for dropdown:', error);
      }
    };
    fetchFullSkuNames();

    const fetchSatuan = async () => {
      try {
        const { data, error } = await supabase.from('units').select('nama').eq('status', 'Aktif');
        if (data && data.length > 0) {
          setSatuanOptions(data.map(u => u.nama));
        }
      } catch (err) {
        console.error('Error fetching satuan:', err);
      }
    };
    fetchSatuan();

    const channel = supabase.channel('sku-updates').on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, payload => {
      console.log('Real-time update received:', payload);
      showToast('Data SKU diperbarui, menyinkronkan...', 'info');
      fetchAndStoreSKUs();
      fetchFullSkuNames();
    }).subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (isFormOpen) {
      const initialRows: AddSkuRow[] = Array.from({ length: 6 }, (_, i) => ({
        id: i,
        id_barang: String(lastId + i + 1),
        nama: '',
        satuan: 'PCS',
        status: 'Aktif'
      }));
      setAddSkuRows(initialRows);
    }
  }, [isFormOpen, lastId]);

  useEffect(() => {
    if (isUpdateModalOpen) {
      const filtered = skuNames.filter(sku => sku.status === 'Aktif');
      setFilteredSkuNames(filtered);
    }
  }, [isUpdateModalOpen, skuNames]);

  const filteredSKUs = React.useMemo(() => {
    let result = skus.filter(sku =>
      sku.id_barang.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sku.nama.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sku.satuan.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (showDuplicatesOnly) {
      const nameCounts = new Map<string, number>();
      result.forEach(sku => {
        const name = sku.nama.toLowerCase().trim();
        nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
      });
      
      result = result.filter(sku => {
        const name = sku.nama.toLowerCase().trim();
        return (nameCounts.get(name) || 0) > 1;
      });
    }
    
    return result;
  }, [skus, searchTerm, showDuplicatesOnly]);

  const sortedSKUs = React.useMemo(() => {
    let sortableItems = [...filteredSKUs];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        if (sortConfig.key === 'id_barang') {
          const valA = extractIdNumber(a.id_barang);
          const valB = extractIdNumber(b.id_barang);
          return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
        }
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [filteredSKUs, sortConfig]);

  const totalPages = Math.ceil(sortedSKUs.length / itemsPerPage);
  const currentItems = sortedSKUs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        const originalSku = skus.find(sku => sku.id === editingId);
        if (!originalSku) {
          showToast('Data SKU tidak ditemukan', 'error');
          return;
        }

        const { error: productsError } = await DatabaseService.updateMasterData('products', editingId, {
          nama: formData.nama,
          satuan: formData.satuan,
          status: formData.status
        }, writeMode);

        if (productsError) {
          console.error('Error updating SKU in products:', productsError);
          showToast('Gagal mengupdate SKU utama', 'error');
          return;
        }

        const { error: logError } = await supabase
          .from('database_log')
          .update({ sku: formData.nama })
          .eq('sku', originalSku.nama);

        if (logError) {
          console.error('Error updating SKU in database_log:', logError);
        }

        const { error: stockError } = await supabase
          .from('stock_items')
          .update({ nama_produk: formData.nama })
          .eq('nama_produk', originalSku.nama);

        if (stockError) {
          console.error('Error updating SKU in stock_items:', stockError);
        }

        setSKUs(prev => prev.map(sku => sku.id === editingId ? { ...sku, nama: formData.nama, satuan: formData.satuan, status: formData.status } : sku));
        showToast('SKU berhasil diupdate di semua tabel terkait!', 'success');
      }

      resetForm();
    } catch (error) {
      console.error('Error submitting SKU:', error);
      showToast('Terjadi kesalahan saat menyimpan data', 'error');
    }
  };

  const resetForm = () => {
    setFormData({
      id_barang: '',
      nama: '',
      satuan: '',
      status: 'Aktif'
    });
    setIsFormOpen(false);
    setIsEditModalOpen(false);
    setEditingId(null);
  };

  const handleEdit = (sku: SKU) => {
    setFormData({
      id_barang: sku.id_barang,
      nama: sku.nama,
      satuan: sku.satuan,
      status: sku.status
    });
    setEditingId(sku.id);
    setIsEditModalOpen(true);
  };

  const handleDelete = async (id: string, nama: string) => {
    if (confirm(`Apakah Anda yakin ingin menghapus SKU "${nama}"?`)) {
      try {
        const { error } = await DatabaseService.deleteMasterData('products', id, writeMode);

        if (error) {
          console.error('Error deleting SKU:', error);
          showToast('Gagal menghapus SKU', 'error');
          return;
        }

        setSKUs(prev => prev.filter(sku => sku.id !== id));
        showToast('SKU berhasil dihapus!', 'success');
      } catch (error) {
        console.error('Error deleting SKU:', error);
        showToast('Terjadi kesalahan saat menghapus data', 'error');
      }
    }
  };

  const handleImport = () => {
    setIsImportModalOpen(true);
  };

  const handleFileSelect = (file: File) => {
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv'))) {
      processExcelFile(file);
    } else {
      showToast('Silakan pilih file Excel (.xlsx/.xls) atau CSV yang valid', 'error');
    }
  };

  const processExcelFile = async (file: File) => {
    try {
      setImportProgress({
        isImporting: true,
        progress: 0,
        total: 0,
        current: 0,
        message: 'Membaca file...'
      });

      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

      // Remove empty lines
      const lines = data.filter(row => row.length > 0 && row.some(cell => cell !== undefined && cell !== null && String(cell).trim() !== ''));

      // Assume header might be present if the first row has "ID", "Barang", "Nama"
      const firstRowStr = lines[0]?.map(String).join(' ').toLowerCase() || '';
      const dataLines = (firstRowStr.includes('id') || firstRowStr.includes('barang') || firstRowStr.includes('nama')) 
        ? lines.slice(1) 
        : lines;

      const total = dataLines.length;

      setImportProgress(prev => ({
        ...prev,
        total,
        message: `Memproses ${total} baris data...`
      }));

      const existingIds = new Set(skus.map(s => s.id_barang.toUpperCase()));
      const importData: any[] = [];
      let skippedCount = 0;

      for (let i = 0; i < dataLines.length; i++) {
        const columns = dataLines[i];

        if (columns.length >= 2 && columns[0] && columns[1]) {
          const id_barang = String(columns[0]).trim().toUpperCase();
          const nama = String(columns[1]).trim();

          if (id_barang && nama) {
            if (existingIds.has(id_barang)) {
              skippedCount++;
            } else {
              importData.push({
                id_barang: id_barang,
                sku_code: id_barang,
                nama: nama,
                satuan: 'PCS',
                status: 'Aktif'
              });
              existingIds.add(id_barang); // Prevent duplicate insertions from the file itself
            }
          }
        }

        if (i % 100 === 0 || i === dataLines.length - 1) {
          const progress = Math.round(((i + 1) / total) * 50);
          setImportProgress(prev => ({
            ...prev,
            progress,
            current: i + 1,
            message: `Memproses baris ${i + 1} dari ${total}...`
          }));
        }
      }

      setImportProgress(prev => ({
        ...prev,
        progress: 50,
        message: 'Menyimpan data ke database...'
      }));

      if (importData.length > 0) {
        const { error } = await DatabaseService.upsertMasterData('products', importData, 'id_barang', writeMode);

        if (error) {
          console.error('Error upserting data:', error);
          showToast(`Terjadi kesalahan saat impor: ${error.message}`, 'error');
          setImportProgress({ isImporting: false, progress: 0, total: 0, current: 0, message: '' });
          return;
        }

        const defaultStockItems = importData.map(item => ({
          nama_produk: item.nama,
          rak: 'UTAMA',
          sub_rak: 'UTAMA',
          packing: 'CTN/',
          satuan: item.satuan,
          stok_awal: 0,
          status: 'Aktif'
        }));

        const { error: stockError } = await DatabaseService.insertMasterData('stock_items', defaultStockItems, writeMode);

        if (stockError) {
          console.error('Notice: Could not insert default stock items for imported SKUs (might already exist):', stockError);
        }

        setImportProgress(prev => ({
          ...prev,
          progress: 100,
          current: total,
          message: 'Impor selesai! Semua data berhasil diproses.'
        }));

        setTimeout(() => {
          setImportProgress({ isImporting: false, progress: 0, total: 0, current: 0, message: '' });
          setIsImportModalOpen(false);
          fetchAndStoreSKUs();
          const msg = skippedCount > 0 
            ? `Impor selesai! ${importData.length} SKU baru ditambahkan. ${skippedCount} SKU dilewati karena ID sudah ada.` 
            : `Impor berhasil! ${importData.length} SKU baru telah ditambahkan.`;
          showToast(msg, 'success');
        }, 2000);

      } else {
        setImportProgress({ isImporting: false, progress: 0, total: 0, current: 0, message: '' });
        if (skippedCount > 0) {
          showToast(`Semua data (${skippedCount} SKU) dilewati karena ID Barang sudah terdaftar.`, 'info');
        } else {
          showToast('Tidak ada data valid untuk diimpor.', 'warning');
        }
      }

    } catch (error) {
      console.error('Error processing CSV:', error);
      setImportProgress({
        isImporting: false,
        progress: 0,
        total: 0,
        current: 0,
        message: ''
      });
      showToast('Terjadi kesalahan fatal saat memproses file CSV', 'error');
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const handleExport = () => {
    try {
      const headers = ['ID Barang', 'Nama Produk', 'Satuan', 'Status', 'Tanggal Dibuat'];
      const data = filteredSKUs.map(sku => [
        sku.id_barang,
        sku.nama,
        sku.satuan,
        sku.status,
        new Date(sku.created_at).toLocaleDateString('id-ID')
      ]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Data SKU");
      XLSX.writeFile(wb, `Data-SKU-${new Date().toISOString().split('T')[0]}.xlsx`);

      showToast(`Export berhasil! ${filteredSKUs.length} data telah diunduh.`, 'success');
    } catch (error) {
      console.error('Error exporting data:', error);
      showToast('Terjadi kesalahan saat export data', 'error');
    }
  };

  const clearSearch = () => {
    setSearchTerm('');
  };


  const handleProcessPaste = () => {
    const lines = pasteContent.split(/\r?\n/).map(line => line.trim()).filter(line => line);
    if (lines.length === 0) {
      showToast('Tidak ada data valid untuk diproses', 'warning');
      return;
    }

    let nextIdNumber = addSkuRows.length > 0
      ? (parseInt(addSkuRows[addSkuRows.length - 1].id_barang) || 0) + 1
      : lastId + 1;

    const newRows = lines.map((line, index) => ({
      id: Date.now() + index,
      id_barang: String(nextIdNumber + index),
      nama: line,
      satuan: 'PCS',
      status: 'Aktif'
    }));

    // Remove empty initial rows if they haven't been touched
    const existingValidRows = addSkuRows.filter(row => row.nama.trim() !== '');

    if (existingValidRows.length === 0) {
      // Replace entirely if it was just empty templates
      setAddSkuRows(newRows as AddSkuRow[]);
    } else {
      // Append
      setAddSkuRows([...existingValidRows, ...newRows] as AddSkuRow[]);
    }

    setPasteContent('');
    setShowPasteInput(false);
    showToast("Berhasil memproses " + lines.length + " SKU!", 'success');
  };

  const handleAddRow = () => {
    const nextIdNumber = addSkuRows.length > 0
      ? (parseInt(addSkuRows[addSkuRows.length - 1].id_barang) || 0) + 1
      : lastId + 1;

    setAddSkuRows([...addSkuRows, {
      id: Date.now(),
      id_barang: String(nextIdNumber),
      nama: '',
      satuan: 'PCS',
      status: 'Aktif'
    }]);
  };

  const handleAddUpdateRow = () => {
    setUpdateRows([...updateRows, { id: Date.now(), old_sku: '', old_id_barang: '', new_sku: '' }]);
  };

  const handleAddUpdate10Row = () => {
    const newRows = Array.from({ length: 10 }, (_, i) => ({
      id: Date.now() + i,
      old_sku: '',
      old_id_barang: '',
      new_sku: ''
    }));
    setUpdateRows([...updateRows, ...newRows]);
  };

  const handleCleanupUpdateRows = () => {
    const cleanedRows = updateRows.filter(row => row.old_sku.trim() !== '' || row.new_sku.trim() !== '');
    if (cleanedRows.length === 0) {
      setUpdateRows([{ id: Date.now(), old_sku: '', old_id_barang: '', new_sku: '' }]);
    } else {
      setUpdateRows(cleanedRows);
    }
  };

  const handleRemoveUpdateRow = (idToRemove: number) => {
    if (updateRows.length > 1) {
      setUpdateRows(updateRows.filter(row => row.id !== idToRemove));
    }
  };

  const handleRemoveAddRow = (idToRemove: number) => {

    if (addSkuRows.length > 1) {
      setAddSkuRows(addSkuRows.filter(row => row.id !== idToRemove));
    }
  };

  const handleUpdateInputChange = (e: React.ChangeEvent<HTMLInputElement>, id: number, field: 'old_sku' | 'new_sku') => {
    const { value } = e.target;
    setUpdateRows(prevRows =>
      prevRows.map(row => {
        if (row.id === id) {
          if (field === 'old_sku') {
            const filteredNames = skuNames.filter(sku =>
              sku.nama.toLowerCase().includes(value.toLowerCase())
            );
            setFilteredSkuNames(filteredNames);
            const foundSku = skuNames.find(sku => sku.nama === value);
            return { ...row, old_sku: value, old_id_barang: foundSku ? foundSku.id_barang : '' };
          }
          return { ...row, [field]: value };
        }
        return row;
      })
    );
    if (field === 'old_sku') {
      const filteredNames = skuNames.filter(sku =>
        sku.nama.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredSkuNames(filteredNames);
      setFocusedRow(id);
      setHighlightedSuggestionIndex(0);
    }
  };

  const handleUpdateInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowId: number) => {
    if (focusedRow === rowId && filteredSkuNames.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedSuggestionIndex(prev => Math.min(prev + 1, filteredSkuNames.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedSuggestionIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selectedSku = filteredSkuNames[highlightedSuggestionIndex];
        if (selectedSku) {
          handleSelectSuggestion(selectedSku, rowId);
          // Focus the next row's old_sku input
          const currentIndex = updateRows.findIndex(r => r.id === rowId);
          if (currentIndex !== -1 && currentIndex < updateRows.length - 1) {
            const nextId = updateRows[currentIndex + 1].id;
            setTimeout(() => {
              const nextInput = document.getElementById(`old_sku_${nextId}`);
              if (nextInput) nextInput.focus();
            }, 50);
          }
        }
      }
    }
  };

  const handleNewSkuPaste = (e: React.ClipboardEvent<HTMLInputElement>, rowIndex: number) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    const pastedLines = pastedText.split(/\r?\n/).map(line => line.trim()).filter(line => line);
    if (pastedLines.length === 0) return;

    setUpdateRows(prevRows => {
      const newRows = [...prevRows];
      for (let i = 0; i < pastedLines.length; i++) {
        const targetIndex = rowIndex + i;
        if (targetIndex < newRows.length) {
          newRows[targetIndex] = { ...newRows[targetIndex], new_sku: pastedLines[i] };
        } else {
          // Add new rows if paste is larger than available rows
          newRows.push({
            id: Date.now() + i,
            old_sku: '',
            old_id_barang: '',
            new_sku: pastedLines[i],
          });
        }
      }
      return newRows;
    });
  };

  const handleSelectSuggestion = (sku: SKU, rowId: number) => {
    setUpdateRows(prevRows =>
      prevRows.map(row =>
        row.id === rowId ? { ...row, old_sku: sku.nama, old_id_barang: sku.id_barang } : row
      )
    );
    setFilteredSkuNames([]);
    setFocusedRow(null);
  };

  const handleMassUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    const updates = updateRows.filter(row => row.old_id_barang && row.new_sku);

    if (updates.length === 0) {
      showToast('Tidak ada data valid untuk diperbarui.', 'warning');
      return;
    }

    let totalSuccess = 0;
    let totalErrors = 0;
    const total = updates.length;

    setUpdateProgress({
      isUpdating: true,
      progress: 0,
      total,
      current: 0,
      message: 'Mulai memperbarui SKU massal...'
    });

    for (let i = 0; i < updates.length; i++) {
      const update = updates[i];
      const oldIdBarang = update.old_id_barang;
      const newNamaProduk = update.new_sku.trim();

      setUpdateProgress(prev => ({
        ...prev,
        current: i,
        progress: Math.round((i / total) * 100),
        message: `Memperbarui SKU (${i + 1}/${total}): ${update.old_sku} -> ${newNamaProduk}`
      }));

      try {
        const { error: productsError } = await DatabaseService.updateMasterDataByField(
          'products', 'id_barang', oldIdBarang, { nama: newNamaProduk }, writeMode
        );

        if (productsError) {
          console.error(`Gagal update tabel products untuk ID ${oldIdBarang}:`, productsError);
          totalErrors++;
          continue;
        }

        const { error: logError } = await DatabaseService.updateMasterDataByField(
          'database_log', 'sku', update.old_sku, { sku: newNamaProduk }, writeMode
        );

        if (logError) {
          console.error(`Gagal update tabel database_log untuk SKU ${update.old_sku}:`, logError);
        }

        const { error: stockError } = await DatabaseService.updateMasterDataByField(
          'stock_items', 'nama_produk', update.old_sku, { nama_produk: newNamaProduk }, writeMode
        );

        if (stockError) {
          console.error(`Gagal update tabel stock_items untuk SKU ${update.old_sku}:`, stockError);
        }

        totalSuccess++;
      } catch (error) {
        console.error('Terjadi kesalahan saat update massal:', error);
        totalErrors++;
      }
    }

    setUpdateProgress(prev => ({
      ...prev,
      current: total,
      progress: 100,
      message: `Pembaruan selesai! Berhasil: ${totalSuccess}, Gagal: ${totalErrors}`
    }));

    // Wait a brief moment so they see it hits 100%
    await new Promise(resolve => setTimeout(resolve, 1000));

    setUpdateProgress({
      isUpdating: false,
      progress: 0,
      total: 0,
      current: 0,
      message: ''
    });

    if (totalErrors > 0) {
      showToast(`Update massal selesai. Berhasil: ${totalSuccess}, Gagal: ${totalErrors}.`, 'warning');
    } else {
      showToast(`Update massal berhasil! ${totalSuccess} SKU diperbarui.`, 'success');
    }

    // Bersihkan semua cache agar Dashboard langsung menampilkan data terbaru
    queryOptimizer.invalidateAllCache();
    // Hapus juga localStorage cache Dashboard
    localStorage.removeItem('dashboard_products_cache');
    localStorage.removeItem('dashboard_stock_cache');
    localStorage.removeItem('dashboard_logs_cache');

    setIsUpdateModalOpen(false);
    setUpdateRows(Array.from({ length: 5 }, (_, i) => ({ id: i, old_sku: '', old_id_barang: '', new_sku: '' })));
    fetchAndStoreSKUs();
  };

  const handleMassUpdateImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      try {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        // Remove empty lines
        const lines = data.filter(row => row.length > 0 && row.some(cell => cell !== undefined && cell !== null && String(cell).trim() !== ''));
        
        // Skip header if present
        const firstRowStr = lines[0]?.map(String).join(' ').toLowerCase() || '';
        const dataLines = (firstRowStr.includes('lama') || firstRowStr.includes('baru') || firstRowStr.includes('id')) 
          ? lines.slice(1) 
          : lines;

        const importedRows: MassUpdateRow[] = [];
        let index = 0;
        
        for (const columns of dataLines) {
          if (columns.length >= 2 && columns[0] && columns[1]) {
            const oldSku = String(columns[0]).trim();
            const newSku = String(columns[1]).trim();

            // Cari ID Barang di list skuNames/skus
            const foundSku = skuNames.find(sku => sku.nama.toLowerCase().trim() === oldSku.toLowerCase().trim());
            
            importedRows.push({
              id: Date.now() + index,
              old_sku: oldSku,
              old_id_barang: foundSku ? foundSku.id_barang : '',
              new_sku: newSku
            });
            index++;
          }
        }

        if (importedRows.length > 0) {
          setUpdateRows(importedRows);
          showToast(`Berhasil memuat ${importedRows.length} baris dari Excel! Silakan periksa tabel di bawah sebelum menekan tombol Update.`, 'success');
        } else {
          showToast('Tidak ada data valid yang ditemukan di file Excel. Pastikan format kolom sesuai template.', 'warning');
        }
      } catch (error) {
        console.error('Error parsing mass update Excel:', error);
        showToast('Gagal memproses file Excel', 'error');
      } finally {
        // Reset file input so same file can be loaded again if needed
        e.target.value = '';
      }
    }
  };

  const handleAddSkuChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>, id: number, field: keyof AddSkuRow) => {
    const { value } = e.target;
    setAddSkuRows(prevRows =>
      prevRows.map(row =>
        row.id === id ? { ...row, [field]: value } : row
      )
    );
  };

  const handleAddSkuSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newSkus = addSkuRows.filter(row => row.id_barang && row.nama);

    if (newSkus.length === 0) {
      showToast('Tidak ada data valid untuk ditambahkan.', 'warning');
      return;
    }

    try {
      const formattedSkus = newSkus.map(sku => ({
        id_barang: sku.id_barang,
        sku_code: sku.id_barang,
        nama: sku.nama,
        satuan: sku.satuan,
        status: sku.status
      }));

      const { data, error } = await DatabaseService.insertMasterData('products', formattedSkus, writeMode);

      if (error) {
        console.error('Error adding new SKUs:', error);
        showToast('Gagal menambah SKU baru', 'error');
        return;
      }

      const defaultStockItems = formattedSkus.map(sku => ({
        nama_produk: sku.nama,
        rak: 'UTAMA',
        sub_rak: 'UTAMA',
        packing: 'CTN/',
        satuan: sku.satuan,
        stok_awal: 0,
        status: 'Aktif'
      }));

      const { error: stockError } = await DatabaseService.insertMasterData('stock_items', defaultStockItems, writeMode);

      if (stockError) {
        console.error('Notice: Could not insert default stock items (might already exist):', stockError);
      }

      showToast(`${newSkus.length} SKU berhasil ditambahkan!`, 'success');
      setIsFormOpen(false);
      setAddSkuRows(Array.from({ length: 6 }, (_, i) => ({
        id: i,
        id_barang: String(lastId + i + 1),
        nama: '',
        satuan: 'PCS',
        status: 'Aktif'
      })));

      if (data && Array.isArray(data)) {
        setSKUs(prev => [...data, ...prev].sort((a, b) => b.id_barang.localeCompare(a.id_barang)));
      } else {
        fetchAndStoreSKUs();
      }
    } catch (error) {
      console.error('Error submitting new SKUs:', error);
      showToast('Terjadi kesalahan saat menyimpan data', 'error');
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
          <div className="bg-gradient-to-br from-blue-700 via-indigo-800 to-slate-900 pt-[90px] lg:pt-0 lg:h-[310px] pb-[75px] lg:pb-0 px-6 lg:px-12 rounded-b-[40px] lg:rounded-b-[55px] shadow-2xl shadow-blue-900/40 relative overflow-hidden transition-all duration-500 flex flex-col justify-center">
            <div className="absolute -top-12 -right-12 text-white opacity-5">
              <Tag className="w-72 h-72 lg:w-[480px] lg:h-[480px]" />
            </div>
            <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute bottom-1/4 right-1/4 w-24 h-24 bg-indigo-500/10 rounded-3xl rotate-45 blur-2xl"></div>
            <div className="relative z-10 w-full flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 uppercase text-left">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2 mb-3 lg:mb-4 opacity-90">
                  <div className="w-10 h-[2px] bg-blue-400 rounded-full"></div>
                  <span className="text-[10px] lg:text-[12px] font-black tracking-[0.4em] text-blue-100">Master Data Management</span>
                </div>
                <h1 className="text-[34px] lg:text-[54px] font-black text-white tracking-tighter leading-[0.9] mb-3 uppercase">
                  Data <span className="text-blue-400">SKU</span>
                </h1>
                <div className="text-blue-100/80 font-medium text-[14px] lg:text-[18px] leading-relaxed max-w-[90%] normal-case flex items-center gap-3">
                  <div className="px-3 py-1 bg-white/10 rounded-full backdrop-blur-sm border border-white/10 flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                    </span>
                    <span className="text-[11px] font-bold tracking-widest uppercase">{skus.length.toLocaleString()} Produk</span>
                  </div>
                  <span className="text-[13px] lg:text-[16px]">Kelola data SKU dan informasi produk</span>
                </div>
              </div>
              <div className="relative z-10 flex flex-wrap gap-2 lg:gap-3 lg:mb-2 items-center">
                <Button
                  onClick={() => setShowDuplicatesOnly(!showDuplicatesOnly)}
                  className={`h-12 px-5 font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 border border-white/30 backdrop-blur-xl ${showDuplicatesOnly ? 'bg-amber-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                >
                  <Copy className="h-4 w-4" />
                  <span className="uppercase text-[10px] font-black">Cari Duplikat</span>
                </Button>
                <Button
                  onClick={() => setIsUpdateModalOpen(true)}
                  className="h-12 px-5 bg-white/10 hover:bg-white/20 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 border border-white/30 backdrop-blur-xl"
                >
                  <RefreshCcw className="h-4 w-4" />
                  <span className="uppercase text-[10px] font-black">Update Massal</span>
                </Button>
                <Button
                  onClick={handleImport}
                  className="h-12 px-5 bg-white/10 hover:bg-white/20 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 border border-white/30 backdrop-blur-xl"
                >
                  <Upload className="h-4 w-4" />
                  <span className="uppercase text-[10px] font-black">Import</span>
                </Button>
                <Button
                  onClick={handleExport}
                  className="h-12 px-5 bg-white/10 hover:bg-white/20 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 border border-white/30 backdrop-blur-xl"
                >
                  <Download className="h-4 w-4" />
                  <span className="uppercase text-[10px] font-black">Export</span>
                </Button>
                <Button
                  onClick={() => setIsFormOpen(true)}
                  className="h-12 px-6 bg-white hover:bg-blue-50 text-blue-700 font-black rounded-2xl shadow-[0_8px_25px_rgba(255,255,255,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2.5 border-none"
                >
                  <Plus className="h-4 w-4" />
                  <span className="uppercase text-xs font-black">Tambah SKU</span>
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-blue-600 text-white p-3 rounded-lg flex items-center space-x-4">
          <div className="flex items-center space-x-2 flex-1">
            <span className="font-medium">Search</span>
            <div className="relative w-96">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-1 pr-8 text-black rounded border-0 focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="Cari ID Barang, Nama Produk, atau Satuan..."
              />
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                {searchTerm ? (
                  <button
                    onClick={clearSearch}
                    className="text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : (
                  <Search className="h-4 w-4 text-gray-400" />
                )}
              </div>
            </div>
          </div>
        </div>

        <Modal
          isOpen={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          title="Tambah SKU Baru"
          size="xl"
        >
          <div className="p-4 bg-gray-50 rounded-lg shadow-inner">
            <p className="text-sm text-gray-600 mb-2">
              Masukkan data untuk SKU baru. Anda dapat menambahkan beberapa SKU sekaligus.
            </p>
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 shadow-sm">
              <Info className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700 font-medium leading-relaxed">
                SKU yang baru ditambahkan akan <strong>otomatis dibuatkan datanya</strong> di menu Data Gudang (dengan Rak UTAMA, CTN/, dan Stok 0).
              </p>
            </div>
            <form onSubmit={handleAddSkuSubmit} className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-blue-600 text-white">
                      <th className="p-2 text-left w-[15%]">ID Barang</th>
                      <th className="p-2 text-left w-[35%]">Nama Produk</th>
                      <th className="p-2 text-left w-[15%]">Satuan</th>
                      <th className="p-2 text-left w-[15%]">Status</th>
                      <th className="p-2 text-center w-[10%]">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {addSkuRows.map((row, index) => (
                      <tr key={row.id} className="border-b border-gray-200">
                        <td className="p-2">
                          <input
                            type="text"
                            className="w-full px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-100 cursor-not-allowed"
                            placeholder="ID Barang"
                            value={row.id_barang}
                            readOnly
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            className="w-full px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Nama Produk"
                            value={row.nama}
                            onChange={(e) => handleAddSkuChange(e, row.id, 'nama')}
                            required={index === 0}
                          />
                        </td>
                        <td className="p-2">
                          <select
                            value={row.satuan}
                            onChange={(e) => handleAddSkuChange(e, row.id, 'satuan')}
                            className="w-full px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                            required={index === 0}
                          >
                            {satuanOptions.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2">
                          <select
                            value={row.status}
                            onChange={(e) => handleAddSkuChange(e, row.id, 'status')}
                            className="w-full px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                            required={index === 0}
                          >
                            <option value="Aktif">Aktif</option>
                            <option value="Tidak Aktif">Tidak Aktif</option>
                          </select>
                        </td>
                        <td className="p-2">
                          <div className="flex justify-center">
                            {addSkuRows.length > 1 && (
                              <Button
                                type="button"
                                onClick={() => handleRemoveAddRow(row.id)}
                                className="h-8 w-8 p-0 flex items-center justify-center bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 rounded-lg transition-all duration-200 transform active:scale-90 border border-rose-500/20"
                              >
                                <Trash2 className="h-4 w-4 text-rose-600 stroke-[2.5px]" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {showPasteInput && (
                <div className="mt-4 p-4 bg-indigo-50 border border-indigo-100 rounded-xl space-y-3">
                  <label className="block text-sm font-medium text-indigo-800">
                    Paste data nama produk vertikal (dari Excel/Spreadsheet):
                  </label>
                  <textarea
                    value={pasteContent}
                    onChange={(e) => setPasteContent(e.target.value)}
                    placeholder="Contoh:
Produk A
Produk B
Produk C"
                    className="w-full h-32 p-3 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white resize-y"
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={handleProcessPaste}
                      className="px-6 h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md transition-all active:scale-95 flex items-center justify-center"
                    >
                      Proses Data
                    </Button>
                  </div>
                </div>
              )}
              <div className="flex justify-between items-center mt-4">
                <Button
                  type="button"
                  onClick={handleAddRow}
                  className="px-6 h-10 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 font-bold rounded-xl border border-blue-500/20 backdrop-blur-md transition-all active:scale-95 flex items-center justify-center"
                >
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Tambah Baris
                </Button>
                <Button
                  type="button"
                  onClick={() => setShowPasteInput(!showPasteInput)}
                  className="px-4 h-10 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 font-bold rounded-xl border border-indigo-500/20 backdrop-blur-md transition-all active:scale-95 flex items-center justify-center ml-3"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Paste Data Sekaligus
                </Button>
                <div className="flex space-x-3">
                  <Button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="px-6 h-10 bg-white/10 hover:bg-white/20 text-gray-700 font-bold rounded-xl border border-gray-300/50 backdrop-blur-md transition-all active:scale-95 flex items-center justify-center"
                  >
                    Batal
                  </Button>
                  <Button
                    type="submit"
                    className="px-8 h-10 bg-gradient-to-br from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white font-bold rounded-xl shadow-lg border border-white/20 backdrop-blur-md transition-all active:scale-95 flex items-center justify-center"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Simpan
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </Modal>

        <Modal
          isOpen={isEditModalOpen}
          onClose={resetForm}
          title={`Edit SKU: ${formData.nama}`}
          size="lg"
        >
          <div className="p-6 bg-gray-50 rounded-lg">
            <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
              <div className="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-3 rounded-md flex items-center text-sm mb-4">
                <Info className="h-5 w-5 mr-3 flex-shrink-0" />
                <span>Setiap perubahan akan secara otomatis tersinkronisasi ke menu <strong>Database Log</strong> dan <strong>Data Gudang</strong>.</span>
              </div>
              <div>
                <label htmlFor="id_barang_edit" className="block text-sm font-medium text-gray-700 mb-1">
                  ID Barang
                </label>
                <input
                  id="id_barang_edit"
                  type="text"
                  value={formData.id_barang}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none bg-gray-100 cursor-not-allowed"
                  readOnly
                />
              </div>
              <div>
                <label htmlFor="nama_edit" className="block text-sm font-medium text-gray-700 mb-1">
                  Nama Produk
                </label>
                <input
                  id="nama_edit"
                  type="text"
                  value={formData.nama}
                  onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label htmlFor="satuan_edit" className="block text-sm font-medium text-gray-700 mb-1">
                  Satuan
                </label>
                <select
                  id="satuan_edit"
                  value={formData.satuan}
                  onChange={(e) => setFormData({ ...formData, satuan: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  {satuanOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="status_edit" className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  id="status_edit"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as 'Aktif' | 'Tidak Aktif' })}
                  className="w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="Aktif">Aktif</option>
                  <option value="Tidak Aktif">Tidak Aktif</option>
                </select>
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <Button
                  type="button"
                  onClick={resetForm}
                  className="px-6 h-10 bg-white/10 hover:bg-white/20 text-gray-700 font-bold rounded-xl border border-gray-300/50 backdrop-blur-md transition-all active:scale-95"
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  className="px-8 h-10 bg-gradient-to-br from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white font-bold rounded-xl shadow-lg border border-white/20 backdrop-blur-md transition-all active:scale-95"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Simpan Perubahan
                </Button>
              </div>
            </form>
          </div>
        </Modal>

        <Modal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          title="Import SKU dari Excel"
          size="4xl"
        >
          <div className="p-6">
            {importProgress.isImporting ? (
              <div className="text-center">
                <p className="font-medium text-lg mb-2">{importProgress.message}</p>
                <progress
                  className="w-full h-4 rounded-lg [&::-webkit-progress-bar]:bg-gray-200 [&::-webkit-progress-value]:bg-blue-600 [&::-moz-progress-bar]:bg-blue-600"
                  value={importProgress.progress}
                  max="100"
                />
                <p className="text-sm text-gray-600 mt-2">
                  {importProgress.progress}% ({importProgress.current.toLocaleString()} / {importProgress.total.toLocaleString()})
                </p>
              </div>
            ) : (
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'
                  }`}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileInputChange}
                  className="hidden"
                  id="file-upload"
                />
                <label htmlFor="file-upload" className="cursor-pointer block">
                  <Upload className="mx-auto h-12 w-12 text-gray-400" />
                  <p className="mt-2 font-medium text-gray-700">
                    Seret & lepas file Excel (.xlsx) di sini
                  </p>
                  <p className="text-sm text-gray-500 my-1">atau</p>
                  <div className="flex gap-2 justify-center mt-2 mb-4">
                    <Button
                      type="button"
                      className="px-6 h-10 bg-gradient-to-br from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white font-bold rounded-xl shadow-lg border border-white/20 backdrop-blur-md transition-all active:scale-95"
                      onClick={(e) => {
                        e.preventDefault();
                        inputRef.current?.click();
                      }}
                    >
                      <Upload className="h-4 w-4 mr-2 inline-block" /> Pilih File Excel
                    </Button>
                  </div>

                  <div className="flex flex-col gap-4 mb-6">
                    <div className="p-4 bg-blue-600 rounded-3xl text-white shadow-xl flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
                          <Download className="h-6 w-6" />
                        </div>
                        <div>
                          <h3 className="font-black text-lg uppercase leading-tight tracking-tight">Template Impor</h3>
                          <p className="text-blue-100 text-[10px] md:text-sm font-medium opacity-90 text-left">Gunakan file Excel sesuai format.</p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          const headers = ['ID Barang', 'Nama Produk'];
                          const ws = XLSX.utils.aoa_to_sheet([
                            headers,
                            ['1001', 'PRODUK CONTOH A'],
                            ['1002', 'PRODUK CONTOH B']
                          ]);
                          const wb = XLSX.utils.book_new();
                          XLSX.utils.book_append_sheet(wb, ws, "Template Import");
                          XLSX.writeFile(wb, "Template_Import_SKU.xlsx");
                        }}
                        className="bg-white text-blue-600 hover:bg-blue-50 font-black rounded-2xl px-6 h-12 active:scale-95 transition-all shadow-lg"
                      >
                        <Download className="h-4 w-4 mr-2" /> Download
                      </Button>
                    </div>
                  </div>
                  
                    <div className="bg-white p-6 rounded-[2.5rem] border-2 border-blue-50 shadow-sm text-left">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse"></div>
                        <h4 className="font-black text-xs uppercase tracking-widest text-blue-900">Panduan Kolom (Excel)</h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                          <p className="text-[10px] font-black text-blue-600 uppercase mb-1">Kolom 1 (A)</p>
                          <p className="text-xs font-bold text-gray-700">ID Barang</p>
                          <p className="text-[9px] text-gray-400 mt-1 italic">Contoh: 1001, SKU-001</p>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                          <p className="text-[10px] font-black text-blue-600 uppercase mb-1">Kolom 2 (B)</p>
                          <p className="text-xs font-bold text-gray-700">Nama Produk</p>
                          <p className="text-[9px] text-gray-400 mt-1 italic">Contoh: PULPEN-BP-01</p>
                        </div>
                      </div>
                      <p className="mt-4 text-[9px] font-medium text-blue-500/70 italic">* Pastikan baris pertama adalah header sesuai template.</p>
                      <div className="mt-5 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 shadow-sm">
                        <Info className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-red-700 font-medium leading-relaxed">
                          SKU yang baru diimpor akan <strong>otomatis dibuatkan datanya</strong> di menu Data Gudang (dengan Rak UTAMA, CTN/, dan Stok 0).
                        </p>
                      </div>
                    </div>
                </label>
              </div>
            )}
          </div>
        </Modal>

        <Modal
          isOpen={isUpdateModalOpen}
          onClose={() => !updateProgress.isUpdating && setIsUpdateModalOpen(false)}
          title="Update Massal SKU"
          size="7xl"
        >
          <div className="p-5 bg-gray-50 rounded-2xl shadow-inner">
            {updateProgress.isUpdating ? (
              <div className="text-center p-10 bg-white rounded-[2.5rem] border-2 border-indigo-50 shadow-sm flex flex-col items-center justify-center space-y-6">
                <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center animate-bounce">
                  <RefreshCcw className="h-10 w-10 text-indigo-600 animate-spin" />
                </div>
                <div>
                  <h4 className="text-xl font-black text-indigo-900 uppercase tracking-widest mb-2">Memproses Update Massal SKU</h4>
                  <p className="text-sm font-bold text-indigo-600/80 bg-indigo-50 px-4 py-2 rounded-2xl border border-indigo-100 max-w-2xl mx-auto">{updateProgress.message}</p>
                </div>
                <div className="w-full max-w-md">
                  <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden shadow-inner">
                    <div
                      className="bg-gradient-to-r from-indigo-500 to-violet-600 h-4 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${updateProgress.progress}%` }}
                    ></div>
                  </div>
                  <p className="text-sm font-black text-gray-500 mt-3">
                    {updateProgress.progress}% ({updateProgress.current.toLocaleString()} / {updateProgress.total.toLocaleString()})
                  </p>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-600 mb-6">
                  Ubah nama produk lama menjadi nama produk baru. Semua data yang terkait di tabel products (kolom nama), database_log (kolom sku), dan stock_items (kolom nama_produk) akan diperbarui secara otomatis.
                </p>

                {/* Impor Massal SKU Section */}
                <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Card 1: Download Template */}
                  <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 p-5 rounded-3xl text-white shadow-lg flex flex-col justify-between items-start">
                    <div className="mb-4 text-left">
                      <h4 className="font-black text-sm uppercase tracking-wider mb-1">1. Download Template Update</h4>
                      <p className="text-indigo-100 text-xs font-medium opacity-90">Gunakan template Excel khusus untuk memperbarui nama SKU lama ke SKU baru.</p>
                    </div>
                    <Button
                      type="button"
                      onClick={() => {
                        const headers = ['Nama Produk Lama', 'Nama Produk Baru'];
                        const ws = XLSX.utils.aoa_to_sheet([
                          headers,
                          ['PRODUK CONTOH LAMA A', 'PRODUK CONTOH BARU A'],
                          ['PRODUK CONTOH LAMA B', 'PRODUK CONTOH BARU B']
                        ]);
                        const wb = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb, ws, "Template Update Massal");
                        XLSX.writeFile(wb, "Template_Update_Massal_SKU.xlsx");
                        showToast('Template berhasil diunduh!', 'success');
                      }}
                      className="bg-white text-indigo-600 hover:bg-indigo-50 font-black rounded-2xl px-5 h-11 active:scale-95 transition-all shadow-md text-xs flex items-center"
                    >
                      <Download className="h-4 w-4 mr-2" /> Unduh Template
                    </Button>
                  </div>

                  {/* Card 2: Upload CSV */}
                  <div className="bg-white p-5 rounded-3xl border-2 border-indigo-50 shadow-sm flex flex-col justify-between items-start">
                    <div className="mb-4 text-left">
                      <h4 className="font-black text-sm text-indigo-900 uppercase tracking-wider mb-1">2. Impor Update Massal</h4>
                      <p className="text-gray-500 text-xs font-medium">Pilih file Excel template yang sudah diisi untuk memuat data langsung ke tabel di bawah.</p>
                    </div>
                    <div className="w-full">
                      <label className="flex items-center justify-center bg-indigo-50 hover:bg-indigo-100/80 text-indigo-600 font-black rounded-2xl px-5 h-11 active:scale-95 transition-all shadow-sm text-xs cursor-pointer border border-indigo-100 w-full text-center">
                        <Upload className="h-4 w-4 mr-2" /> Pilih & Unggah File Excel
                        <input
                          type="file"
                          accept=".xlsx,.xls,.csv"
                          className="hidden"
                          onChange={handleMassUpdateImport}
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleMassUpdate} className="space-y-4">
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex space-x-2">
                      <Button
                        type="button"
                        onClick={handleAddUpdateRow}
                        className="px-4 h-10 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 font-bold rounded-xl border border-indigo-500/20 backdrop-blur-md transition-all active:scale-95 flex items-center justify-center text-xs"
                      >
                        <PlusCircle className="h-4 w-4 mr-2" />
                        1 Baris
                      </Button>
                      <Button
                        type="button"
                        onClick={handleAddUpdate10Row}
                        className="px-4 h-10 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 font-bold rounded-xl border border-indigo-500/20 backdrop-blur-md transition-all active:scale-95 flex items-center justify-center text-xs"
                      >
                        <PlusCircle className="h-4 w-4 mr-2" />
                        10 Baris
                      </Button>
                      <Button
                        type="button"
                        onClick={handleCleanupUpdateRows}
                        className="px-4 h-10 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 font-bold rounded-xl border border-rose-500/20 backdrop-blur-md transition-all active:scale-95 flex items-center justify-center text-xs"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Penyesuaian
                      </Button>
                      <div className="flex items-center ml-2 px-3 bg-gray-100 rounded-lg border border-gray-200">
                        <span className="text-xs font-bold text-gray-600">{updateRows.length} Baris Data</span>
                      </div>
                    </div>
                    <div className="flex space-x-3">
                      <Button
                        type="button"
                        onClick={() => setIsUpdateModalOpen(false)}
                        className="px-6 h-10 bg-white/10 hover:bg-white/20 text-gray-700 font-bold rounded-xl border border-gray-300/50 backdrop-blur-md transition-all active:scale-95 flex items-center justify-center"
                      >
                        Batal
                      </Button>
                      <Button
                        type="submit"
                        className="px-8 h-10 bg-gradient-to-br from-indigo-500 to-violet-700 hover:from-indigo-600 hover:to-violet-800 text-white font-bold rounded-xl shadow-lg border border-white/20 backdrop-blur-md transition-all active:scale-95 flex items-center justify-center"
                      >
                        <Save className="h-4 w-4 mr-2" />
                        Update
                      </Button>
                    </div>
                  </div>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-blue-600 text-white">
                        <th className="p-2 text-left w-[15%]">ID Barang</th>
                        <th className="p-2 text-left w-[35%]">Nama Produk Lama</th>
                        <th className="p-2 text-left w-[35%]">Nama Produk Baru</th>
                        <th className="p-2 text-center w-[15%]">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {updateRows.map((row) => (
                        <tr key={row.id} className="border-b border-gray-200">
                          <td className="p-2 text-sm">
                            <input
                              type="text"
                              className="w-full px-2 py-1 border border-gray-300 rounded-md bg-gray-100 cursor-not-allowed focus:outline-none"
                              value={row.old_id_barang}
                              readOnly
                            />
                          </td>
                          <td className="p-2">
                            <div className="relative">
                              <input
                                id={`old_sku_${row.id}`}
                                type="text"
                                className="w-full px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Ketik nama produk lama..."
                                value={row.old_sku}
                                onChange={(e) => handleUpdateInputChange(e, row.id, 'old_sku')}
                                onKeyDown={(e) => handleUpdateInputKeyDown(e, row.id)}
                                onFocus={() => {
                                  setFocusedRow(row.id);
                                  setFilteredSkuNames(skuNames);
                                  setHighlightedSuggestionIndex(0);
                                }}
                                onBlur={() => setTimeout(() => setFocusedRow(null), 200)}
                              />
                              {focusedRow === row.id && filteredSkuNames.length > 0 && (
                                <ul className="absolute z-10 w-full bg-white border border-gray-300 rounded-md mt-1 max-h-48 overflow-y-auto shadow-lg">
                                  {filteredSkuNames.map((sku, skuIndex) => (
                                    <li
                                      key={skuIndex}
                                      className={`px-3 py-2 cursor-pointer transition-colors ${skuIndex === highlightedSuggestionIndex ? 'bg-blue-100 text-blue-900 font-bold' : 'hover:bg-gray-100'}`}
                                      onMouseDown={() => handleSelectSuggestion(sku, row.id)}
                                    >
                                      {sku.nama}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              className="w-full px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="Nama produk baru... (Bisa paste vertikal dari Excel)"
                              value={row.new_sku}
                              onChange={(e) => handleUpdateInputChange(e, row.id, 'new_sku')}
                              onPaste={(e) => {
                                const rowIndex = updateRows.findIndex(r => r.id === row.id);
                                handleNewSkuPaste(e, rowIndex);
                              }}
                            />
                          </td>
                          <td className="p-2 text-center">
                            {updateRows.length > 1 && (
                              <Button
                                type="button"
                                onClick={() => handleRemoveUpdateRow(row.id)}
                                className="h-8 w-8 p-0 flex items-center justify-center bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 rounded-lg transition-all duration-200 transform active:scale-90 border border-rose-500/20"
                              >
                                <Trash2 className="h-4 w-4 text-rose-600 stroke-[2.5px]" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </form>
              </>
            )}
          </div>
        </Modal>

        <Card>
          <CardContent className="p-0">
            {loading && (
              <div className="flex items-center justify-center p-8">
                <div className="text-blue-600 font-medium">Memuat data...</div>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-blue-600 text-white">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium border-r border-blue-500 cursor-pointer hover:bg-blue-700 transition-colors" onClick={() => handleSort('id_barang')}>
                      <div className="flex items-center justify-between">ID Barang {getSortIcon('id_barang')}</div>
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium border-r border-blue-500 cursor-pointer hover:bg-blue-700 transition-colors" onClick={() => handleSort('nama')}>
                      <div className="flex items-center justify-between">Nama Produk {getSortIcon('nama')}</div>
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-medium border-r border-blue-500 cursor-pointer hover:bg-blue-700 transition-colors" onClick={() => handleSort('satuan')}>
                      <div className="flex items-center justify-center">Satuan {getSortIcon('satuan')}</div>
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-medium border-r border-blue-500 cursor-pointer hover:bg-blue-700 transition-colors" onClick={() => handleSort('status')}>
                      <div className="flex items-center justify-center">Status {getSortIcon('status')}</div>
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-medium border-r border-blue-500 cursor-pointer hover:bg-blue-700 transition-colors" onClick={() => handleSort('created_at')}>
                      <div className="flex items-center justify-center">Tanggal Dibuat {getSortIcon('created_at')}</div>
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {currentItems.map((sku, index) => (
                    <tr key={sku.id} className={`${index % 2 === 0 ? 'bg-blue-50' : 'bg-white'} hover:bg-blue-100 border-b border-gray-200`}>
                      <td className="px-4 py-3 text-sm font-bold border-r border-gray-200">
                        {sku.id_barang}
                      </td>
                      <td className="px-4 py-3 text-sm border-r border-gray-200">
                        {sku.nama}
                      </td>
                      <td className="px-4 py-3 text-sm text-center border-r border-gray-200">
                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded font-medium">
                          {sku.satuan}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center border-r border-gray-200">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${sku.status === 'Aktif'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                          }`}>
                          {sku.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-center border-r border-gray-200">
                        {new Date(sku.created_at).toLocaleDateString('id-ID')}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center space-x-2">
                          <Button
                            onClick={() => handleEdit(sku)}
                            className="h-8 w-8 p-0 flex items-center justify-center bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 rounded-lg transition-all duration-200 transform active:scale-90 border border-blue-500/20"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            onClick={() => handleDelete(sku.id, sku.nama)}
                            className="h-8 w-8 p-0 flex items-center justify-center bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 rounded-lg transition-all duration-200 transform active:scale-90 border border-rose-500/20"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-700">Baris per halaman:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-2 py-1 border border-gray-300 rounded-md bg-white text-sm"
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
              className="h-9 px-4 bg-white/10 hover:bg-white/20 text-gray-700 font-bold rounded-lg border border-gray-300/50 backdrop-blur-md transition-all active:scale-95 disabled:opacity-50 disabled:scale-100"
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              Sebelumnya
            </Button>
            <div className="text-sm text-gray-600 font-bold px-4 py-1.5 bg-blue-50 rounded-lg border border-blue-100">
              Halaman {currentPage} dari {totalPages}
            </div>
            <Button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="h-9 px-4 bg-white/10 hover:bg-white/20 text-gray-700 font-bold rounded-lg border border-gray-300/50 backdrop-blur-md transition-all active:scale-95 disabled:opacity-50 disabled:scale-100"
            >
              Berikutnya
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>

        <div className="bg-gray-50 p-3 rounded text-sm text-gray-600">
          <div className="flex justify-between items-center">
            <span>Total SKU: {skus.length.toLocaleString()}</span>
            <div className="flex items-center space-x-4">
              <span>SKU aktif: {skus.filter(s => s.status === 'Aktif').length.toLocaleString()}</span>
              <span>Hasil pencarian: {filteredSKUs.length.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}