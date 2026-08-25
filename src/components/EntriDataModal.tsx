import React, { useState, useEffect } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { Plus, Trash2, Save, X, Search } from 'lucide-react';
import { CustomDropdown } from './ui/CustomDropdown';
import { supabase } from '../lib/supabase';
import type { StockReport } from './DataGudang';

interface EntriDataRow {
  id: string;
  nama_produk: string;
  packing: string;
  rak: string;
  sub_rak: string;
  satuan: string;
}

interface RackLocation {
  id: string;
  nama: string;
  status: string;
}

interface EntriDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (newItems: StockReport[]) => void;
  editData?: StockReport;
  editDataArray?: StockReport[];
}

export function EntriDataModal({ isOpen, onClose, onSave, editData, editDataArray }: EntriDataModalProps) {
  const [rows, setRows] = useState<EntriDataRow[]>([]);
  const [rackLocations, setRackLocations] = useState<RackLocation[]>([]);
  const [unitLocations, setUnitLocations] = useState<RackLocation[]>([]);
  const [selectionModal, setSelectionModal] = useState<{
    isOpen: boolean;
    type: 'rak' | 'satuan';
    rowId: string;
    currentValue: string;
  }>({
    isOpen: false,
    type: 'rak',
    rowId: '',
    currentValue: ''
  });
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    rowId: string;
    productName: string;
  }>({
    isOpen: false,
    rowId: '',
    productName: ''
  });

  // Load rack locations on component mount
  useEffect(() => {
    if (isOpen) {
      loadRackLocations();
      loadUnitLocations();
      resetRows();
    }
  }, [isOpen]);

  const resetRows = () => {
    if (editDataArray && editDataArray.length > 0) {
      setRows(editDataArray.map(item => ({
        id: item.id,
        nama_produk: item.nama_produk,
        packing: item.packing || 'CTN/',
        rak: item.rak || '',
        sub_rak: item.sub_rak || item.rak || '',
        satuan: item.satuan || ''
      })));
    } else if (editData) {
      setRows([{
        id: editData.id,
        nama_produk: editData.nama_produk,
        packing: editData.packing,
        rak: editData.rak,
        sub_rak: editData.sub_rak || editData.rak,
        satuan: editData.satuan
      }]);
    } else {
      setRows(Array.from({ length: 10 }, (_, index) => ({
        id: (index + 1).toString(),
        nama_produk: '',
        packing: 'CTN/',
        rak: '',
        sub_rak: '',
        satuan: ''
      })));
    }
  };

  const loadRackLocations = async () => {
    try {
      const { data, error } = await supabase
        .from('rack_locations')
        .select('id, nama, status')
        .eq('status', 'Aktif')
        .order('nama', { ascending: true });

      if (error) {
        console.error('Error loading rack locations:', error);
        return;
      }

      setRackLocations(data || []);
    } catch (error) {
      console.error('Error loading rack locations:', error);
    }
  };

  const loadUnitLocations = async () => {
    try {
      const { data, error } = await supabase
        .from('units')
        .select('id, nama, status')
        .eq('status', 'Aktif')
        .order('nama', { ascending: true });

      if (error) {
        console.error('Error loading units:', error);
        return;
      }

      setUnitLocations(data || []);
    } catch (error) {
      console.error('Error loading units:', error);
    }
  };

  const addRow = () => {
    if (editData || editDataArray) return;

    const newRow: EntriDataRow = {
      id: Date.now().toString(),
      nama_produk: '',
      packing: 'CTN/',
      rak: '',
      sub_rak: '',
      satuan: ''
    };
    setRows([...rows, newRow]);
  };

  const handleDeleteClick = (id: string) => {
    if (editData || editDataArray) return;

    const row = rows.find(r => r.id === id);
    if (row && rows.length > 1) {
      setConfirmDialog({
        isOpen: true,
        rowId: id,
        productName: row.nama_produk || 'baris kosong'
      });
    }
  };

  const confirmDelete = () => {
    setRows(rows.filter(row => row.id !== confirmDialog.rowId));
    setConfirmDialog({ isOpen: false, rowId: '', productName: '' });
  };

  const updateRow = (id: string, field: keyof EntriDataRow, value: string) => {
    setRows(rows.map(row => {
      if (row.id === id) {
        let updatedValue = value;

        if (field === 'packing') {
          if (!value.startsWith('CTN/')) {
            updatedValue = 'CTN/' + value.replace(/^CTN\/?/, '');
          }
        }

        const updatedRow = { ...row, [field]: updatedValue };

        // Logic for auto-filling sub_rak
        if (field === 'rak') {
          updatedRow.sub_rak = updatedValue;
        }

        return updatedRow;
      }
      return row;
    }));
  };

  const handleSubmit = () => {
    const validRows = rows.filter(row =>
      row.nama_produk.trim() !== '' && row.nama_produk.trim().length > 0
    );

    if (validRows.length === 0) {
      alert('Tidak ada data yang valid untuk disimpan. Pastikan minimal satu baris memiliki Nama Produk yang diisi.');
      return;
    }

    const processedRows = validRows.map(row => ({
      ...row,
      nama_produk: row.nama_produk.trim().toUpperCase(),
      packing: row.packing.trim().toUpperCase(),
      rak: row.rak.trim().toUpperCase(),
      sub_rak: row.sub_rak.trim().toUpperCase(),
      satuan: row.satuan.trim().toUpperCase()
    }));

    if (editData) {
      const updatedItem: StockReport = {
        ...editData,
        id: editData.id,
        nama_produk: processedRows[0].nama_produk,
        packing: processedRows[0].packing,
        rak: processedRows[0].rak,
        sub_rak: processedRows[0].sub_rak,
        satuan: processedRows[0].satuan
      };

      onSave([updatedItem]);
    } else if (editDataArray && editDataArray.length > 0) {
      const updatedItems: StockReport[] = processedRows.map(row => {
        const originalItem = editDataArray.find(item => item.id === row.id);
        return {
          ...(originalItem as StockReport),
          nama_produk: row.nama_produk,
          packing: row.packing,
          rak: row.rak,
          sub_rak: row.sub_rak,
          satuan: row.satuan
        };
      });
      onSave(updatedItems);
    } else {
      const newStockItems: StockReport[] = processedRows.map((row, index) => ({
        id: `stock_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
        nama_produk: row.nama_produk,
        packing: row.packing,
        rak: row.rak,
        sub_rak: row.sub_rak,
        satuan: row.satuan,
        stok_awal: 0,
        masuk: 0,
        keluar: 0,
        tersedia: 0
      }));

      onSave(newStockItems);
    }

    if (!editData && !editDataArray) {
      resetRows();
    }

    onClose();
  };

  const clearAll = () => {
    if (editData || editDataArray) return;
    resetRows();
  };

  const setAllToUtama = () => {
    setRows(rows.map(row => ({
      ...row,
      rak: 'UTAMA',
      sub_rak: 'UTAMA'
    })));
  };

  const setAllToPcs = () => {
    setRows(rows.map(row => ({
      ...row,
      satuan: 'PCS'
    })));
  };

  const SearchableSelectModal = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const options = selectionModal.type === 'rak' ? rackLocations : unitLocations;
    
    const filteredOptions = options.filter(opt => opt.nama.toLowerCase().includes(searchTerm.toLowerCase()));

    const handleSelect = (val: string) => {
      updateRow(selectionModal.rowId, selectionModal.type, val);
      setSelectionModal({ ...selectionModal, isOpen: false });
      setSearchTerm('');
    };

    return (
      <Modal 
        isOpen={selectionModal.isOpen} 
        onClose={() => { setSelectionModal({ ...selectionModal, isOpen: false }); setSearchTerm(''); }} 
        title={`CARI ${selectionModal.type === 'rak' ? 'RAK' : 'SATUAN'}`}
        size="md"
        headerVariant="premium"
      >
        <div className="flex flex-col space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input 
              type="text" 
              placeholder={`Ketik untuk mencari ${selectionModal.type}...`} 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-10 py-3 bg-white border-2 border-blue-100 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-slate-700 font-medium transition-all"
              autoFocus
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 rounded-full transition-colors">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-slate-200">
            {filteredOptions.length > 0 ? filteredOptions.map(opt => (
              <div 
                key={opt.id} 
                onClick={() => handleSelect(opt.nama)}
                className={`px-4 py-3 rounded-xl border-2 cursor-pointer transition-all flex justify-between items-center ${selectionModal.currentValue === opt.nama ? 'border-blue-500 bg-blue-50 text-blue-700 font-bold shadow-sm' : 'border-slate-100 bg-white hover:border-blue-300 hover:bg-blue-50 text-slate-700'}`}
              >
                <span>{opt.nama}</span>
                {selectionModal.currentValue === opt.nama && <span className="w-2 h-2 rounded-full bg-blue-500"></span>}
              </div>
            )) : (
              <div className="text-center py-8 text-slate-400 font-medium flex flex-col items-center justify-center">
                <Search className="h-8 w-8 text-slate-200 mb-2" />
                Tidak ada data yang cocok
              </div>
            )}
          </div>
        </div>
      </Modal>
    );
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={editData || (editDataArray && editDataArray.length > 0) ? "EDIT DATA BARANG" : "ENTRI DATA BARANG"} size="7xl">
        <div className="space-y-6">
          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
              <Button 
                onClick={addRow} 
                variant="outline" 
                disabled={!!editData}
                className="h-10 px-4 rounded-xl flex items-center justify-center gap-2 border-slate-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all font-semibold active:scale-95 disabled:opacity-50 disabled:scale-100"
              >
                <Plus className="h-4 w-4 text-blue-500" />
                <span>Tambah Baris</span>
              </Button>
              <Button 
                onClick={setAllToUtama} 
                variant="outline" 
                disabled={rows.length === 0}
                className="h-10 px-4 rounded-xl flex items-center justify-center gap-2 border-slate-200 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200 transition-all font-semibold active:scale-95 disabled:opacity-50 disabled:scale-100"
              >
                <div className="flex items-center gap-1 font-bold">SET ALL TO <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-[10px]">UTAMA</span></div>
              </Button>
              <Button 
                onClick={setAllToPcs} 
                variant="outline" 
                disabled={rows.length === 0}
                className="h-10 px-4 rounded-xl flex items-center justify-center gap-2 border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-all font-semibold active:scale-95 disabled:opacity-50 disabled:scale-100"
              >
                <div className="flex items-center gap-1 font-bold">SET ALL TO <span className="bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded text-[10px]">PCS</span></div>
              </Button>
              <Button 
                onClick={clearAll} 
                variant="outline" 
                disabled={!!editData}
                className="h-10 px-4 rounded-xl flex items-center justify-center gap-2 border-slate-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-all font-semibold active:scale-95 disabled:opacity-50 disabled:scale-100"
              >
                <Trash2 className="h-4 w-4 text-rose-500" />
                <span>Clear All</span>
              </Button>
            </div>
            <div className="flex items-center">
              <Button 
                onClick={handleSubmit} 
                variant="success"
                className="w-full sm:w-auto h-10 px-6 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold rounded-xl shadow-[0_4px_12px_rgba(16,185,129,0.2)] hover:shadow-emerald-500/30 transition-all duration-200 active:scale-95 flex items-center justify-center gap-2 border-none"
              >
                <Save className="h-4 w-4" />
                <span>{editData || (editDataArray && editDataArray.length > 0) ? 'Update Data' : 'Simpan Data'}</span>
              </Button>
            </div>
          </div>

          {/* Data Entry Table */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
              <table className="w-full border-collapse">
                <thead className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3.5 text-center text-xs font-bold uppercase tracking-wider border-r border-white/10 w-12 flex-shrink-0">No</th>
                    <th className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wider border-r border-white/10 min-w-[280px]">Nama Produk</th>
                    <th className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wider border-r border-white/10 min-w-[170px]">Packing</th>
                    <th className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wider border-r border-white/10 min-w-[190px]">
                      Rak
                      <span className="block text-[10px] text-blue-200 font-medium normal-case mt-0.5">(bisa diketik)</span>
                    </th>
                    <th className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wider border-r border-white/10 min-w-[170px]">Sub Rak</th>
                    <th className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wider border-r border-white/10 min-w-[150px]">Satuan</th>
                    <th className="px-4 py-3.5 text-center text-xs font-bold uppercase tracking-wider w-16">Aksi</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {rows.map((row, index) => (
                    <tr key={row.id} className={`${index % 2 === 0 ? 'bg-slate-50/30' : 'bg-white'} hover:bg-blue-50/50 transition-colors`}>
                      <td className="px-4 py-3 text-sm text-center border-r border-slate-100 font-semibold text-slate-500">
                        {index + 1}
                      </td>
                      <td className="px-4 py-3 border-r border-slate-100">
                        <input
                          type="text"
                          value={row.nama_produk}
                          onChange={(e) => updateRow(row.id, 'nama_produk', e.target.value)}
                          className={`w-full px-3 py-2 border border-slate-200 rounded-lg text-sm transition-all font-medium text-slate-800 ${editDataArray && editDataArray.length > 0 ? 'bg-slate-200 cursor-not-allowed' : 'bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'}`}
                          readOnly={!!(editDataArray && editDataArray.length > 0)}
                          placeholder="Masukkan nama produk..."
                        />
                      </td>
                      <td className="px-4 py-3 border-r border-slate-100">
                        <div className="flex rounded-lg overflow-hidden border border-slate-200 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all bg-slate-50/50">
                          <span className="flex items-center px-3 bg-slate-100 border-r border-slate-200 text-slate-500 text-xs font-bold tracking-wider select-none">CTN/</span>
                          <input
                            type="text"
                            value={row.packing.replace('CTN/', '')}
                            onChange={(e) => updateRow(row.id, 'packing', 'CTN/' + e.target.value)}
                            className="flex-1 px-3 py-2 bg-transparent text-sm focus:outline-none font-medium text-slate-800"
                            placeholder="24PCS, 12BOX..."
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 border-r border-slate-100">
                        <div className="relative" style={{ minWidth: '140px' }}>
                          <input
                            type="text"
                            readOnly
                            value={row.rak}
                            onClick={() => setSelectionModal({ isOpen: true, type: 'rak', rowId: row.id, currentValue: row.rak })}
                            className={`w-full px-3 py-2 border rounded-lg text-sm transition-all font-medium cursor-pointer ${!row.rak ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50/50 text-slate-800'} hover:border-blue-400 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
                            placeholder="Pilih Rak..."
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 border-r border-slate-100">
                        <input
                          type="text"
                          value={row.sub_rak}
                          onChange={(e) => updateRow(row.id, 'sub_rak', e.target.value)}
                          className={`w-full px-3 py-2 border border-slate-200 rounded-lg text-sm transition-all font-medium text-slate-800 ${editDataArray && editDataArray.length > 0 ? 'bg-slate-200 cursor-not-allowed' : 'bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'}`}
                          readOnly={!!(editDataArray && editDataArray.length > 0)}
                          placeholder="Sub lokasi rak..."
                        />
                      </td>
                      <td className="px-4 py-3 border-r border-slate-100">
                        <div className="relative" style={{ minWidth: '130px' }}>
                          <input
                            type="text"
                            readOnly
                            value={row.satuan}
                            onClick={() => setSelectionModal({ isOpen: true, type: 'satuan', rowId: row.id, currentValue: row.satuan })}
                            className={`w-full px-3 py-2 border rounded-lg text-sm transition-all font-medium cursor-pointer ${!row.satuan ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50/50 text-slate-800'} hover:border-blue-400 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
                            placeholder="Pilih Satuan..."
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button
                          onClick={() => handleDeleteClick(row.id)}
                          size="sm"
                          variant="danger"
                          disabled={rows.length <= 1 || (editData && rows.length === 1) || !!(editDataArray && editDataArray.length > 0)}
                          className="h-8 w-8 p-0 rounded-lg flex items-center justify-center hover:bg-red-700 active:scale-95 transition-all shadow-[0_2px_8px_rgba(220,38,38,0.15)] mx-auto"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-slate-50/80 border border-slate-100 p-4 rounded-2xl text-sm text-slate-600 shadow-inner">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 bg-slate-400 rounded-full"></span>
                  Total Baris: <strong className="text-slate-800 font-bold">{rows.length}</strong>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 bg-emerald-500 rounded-full"></span>
                  Baris Terisi: <strong className="text-emerald-600 font-bold">{rows.filter(row => row.nama_produk.trim()).length}</strong>
                </span>
              </div>
              <span className="text-xs text-slate-400 italic">
                * Minimal satu baris terisi Nama Produk untuk dapat menyimpan data.
              </span>
            </div>
          </div>
        </div>
      </Modal>

      {/* Selection Modal for Rak/Satuan */}
      <SearchableSelectModal />

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ isOpen: false, rowId: '', productName: '' })}
        onConfirm={confirmDelete}
        title="Konfirmasi Hapus"
        message={`Apakah Anda yakin ingin menghapus data "${confirmDialog.productName}"? Tindakan ini tidak dapat dibatalkan.`}
      />
    </>
  );
}