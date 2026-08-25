import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Toast } from './ui/Toast';
import { Modal } from './ui/Modal';
import { supabase } from '../lib/supabase';
import { MapPin, RefreshCw, Filter, Search, CheckSquare, Square, X, ListPlus } from 'lucide-react';

interface RackLocation {
  id: string;
  nama: string;
  status: string;
  auto_fill_scanner: boolean;
}

export function DevRackAutoFill() {
  const [racks, setRacks] = useState<RackLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

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
    }, 4000);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('rack_locations')
        .select('id, nama, status, auto_fill_scanner')
        .eq('status', 'Aktif')
        .order('nama', { ascending: true });

      if (error) throw error;

      setRacks(data || []);
      setSelectedItems(new Set());
      setSelectAll(false);
    } catch (error) {
      console.error('Error loading rack locations:', error);
      showToast('Gagal memuat data lokasi rak. Pastikan kolom auto_fill_scanner sudah ditambahkan di database.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredRacks = racks.filter(rack => 
    !searchTerm || rack.nama.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchInput, setBatchInput] = useState('');

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredRacks.map(item => item.id)));
    }
    setSelectAll(!selectAll);
  };

  const handleSelectItem = (id: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
    setSelectAll(newSelected.size === filteredRacks.length && filteredRacks.length > 0);
  };

  const handleBatchSelect = () => {
    const lines = batchInput.split(/[\n,;]+/);
    const namesToSelect = new Set<string>();
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // Check for range like A1-A99
      const rangeMatch = trimmed.match(/^([A-Za-z]+)(\d+)\s*-\s*([A-Za-z]+)(\d+)$/);
      if (rangeMatch) {
        const prefix1 = rangeMatch[1].toUpperCase();
        const num1 = parseInt(rangeMatch[2]);
        const prefix2 = rangeMatch[3].toUpperCase();
        const num2 = parseInt(rangeMatch[4]);
        
        if (prefix1 === prefix2 && num1 <= num2) {
          for (let i = num1; i <= num2; i++) {
            namesToSelect.add(`${prefix1}${i}`);
          }
          continue;
        }
      }
      
      namesToSelect.add(trimmed.toUpperCase());
    }
    
    // Match with existing racks
    const newSelected = new Set(selectedItems);
    let matchCount = 0;
    
    racks.forEach(rack => {
      if (namesToSelect.has(rack.nama.toUpperCase())) {
        newSelected.add(rack.id);
        matchCount++;
      }
    });
    
    setSelectedItems(newSelected);
    setIsBatchModalOpen(false);
    setBatchInput('');
    
    if (matchCount > 0) {
      showToast(`Berhasil memilih ${matchCount} rak dari input batch.`, 'success');
    } else {
      showToast('Tidak ada rak yang cocok dengan input.', 'warning');
    }
  };

  const handleToggleAutoFill = async (enable: boolean) => {
    if (selectedItems.size === 0) {
      showToast('Pilih rak terlebih dahulu', 'warning');
      return;
    }

    try {
      setSaving(true);
      
      const ArraySelected = Array.from(selectedItems);
      
      const { error } = await supabase
        .from('rack_locations')
        .update({ auto_fill_scanner: enable })
        .in('id', ArraySelected);

      if (error) throw error;

      showToast(
        `Berhasil mengatur ${selectedItems.size} rak menjadi ${enable ? 'AUTO-FILL' : 'MANUAL ONLY'}`, 
        'success'
      );
      
      await loadData();
    } catch (error) {
      console.error('Error updating rack auto_fill:', error);
      showToast('Gagal menyimpan perubahan. Pastikan kolom auto_fill_scanner sudah ada di tabel rack_locations.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen relative overflow-hidden bg-gray-50/30">
      <Toast
        isOpen={toast.isOpen}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ isOpen: false, message: '', type: 'info' })}
      />

      <main className="flex-1 flex flex-col relative min-w-0 w-full">
        {/* PREMIUM IMMERSIVE HEADER */}
        <div className="flex flex-col mb-8 lg:mb-12">
          <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 pt-[80px] lg:pt-0 lg:h-[310px] pb-[40px] lg:pb-0 px-6 lg:px-12 rounded-b-[40px] lg:rounded-b-[55px] shadow-2xl shadow-blue-900/20 relative overflow-hidden transition-all duration-500 flex flex-col justify-center">
            
            {/* Decorative Background Icon */}
            <div className="absolute -top-6 -right-6 text-white opacity-5">
              <MapPin className="w-64 h-64 lg:w-96 lg:h-96" />
            </div>

            {/* Decorative Floating Shapes */}
            <div className="absolute top-10 right-10 w-32 h-32 bg-white/10 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute top-24 left-1/4 w-16 h-16 bg-white/5 border border-white/10 rounded-2xl rotate-[35deg] backdrop-blur-sm hidden lg:block"></div>
            <div className="absolute bottom-10 right-1/3 w-12 h-12 bg-white/10 rounded-full border border-white/20 hidden lg:block"></div>
            <div className="absolute top-1/2 right-20 w-16 h-16 bg-blue-400/20 rounded-3xl -rotate-12 blur-xl hidden lg:block"></div>

            {/* Text Content */}
            <div className="relative z-10 w-full flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 lg:gap-6 uppercase text-left">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2 mb-2 lg:mb-3 opacity-90">
                  <div className="w-8 h-[2px] bg-white rounded-full"></div>
                  <span className="text-[10px] lg:text-[12px] font-black tracking-[0.3em] text-white">Dev Mode Tool</span>
                </div>
                <h1 className="text-[34px] lg:text-[54px] font-black text-white tracking-tight leading-[1.1] mb-2 uppercase">
                  Auto-Fill <span className="text-blue-200">Rak</span>
                </h1>
                <div className="text-blue-100/90 font-medium text-[14px] lg:text-[18px] leading-relaxed max-w-[90%] normal-case flex items-center gap-3">
                  <div className="px-3 py-1 bg-white/10 rounded-full backdrop-blur-sm border border-white/10 flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    <span className="text-[11px] font-bold tracking-widest uppercase text-white">{racks.length} Rak</span>
                  </div>
                  <span className="text-[13px] lg:text-[16px] text-white">Pilih rak yang otomatis terisi oleh scanner barcode</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap lg:justify-end items-center gap-2">
                <Button
                  onClick={loadData}
                  className="h-11 px-5 bg-white/10 hover:bg-white/20 text-white border border-white/10 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 font-bold backdrop-blur-sm"
                  disabled={loading}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-4 lg:p-8 space-y-6 w-full max-w-7xl mx-auto -mt-[30px] lg:-mt-[50px] relative z-20">
          {/* Search and Action Bar */}
          <div className="bg-white p-4 rounded-[20px] border-2 border-blue-100/80 shadow-xl shadow-blue-500/5 flex flex-col md:flex-row gap-4 justify-between items-center">
            <div className="relative w-full md:w-96">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 h-12 pr-10 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100 transition-all font-semibold"
                placeholder="Cari lokasi rak..."
              />
              {searchTerm ? (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              ) : (
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              )}
            </div>
            
            <div className="flex gap-2.5 w-full md:w-auto">
              <Button
                onClick={() => setIsBatchModalOpen(true)}
                className="flex-1 md:flex-none h-12 px-5 border-2 border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl font-bold transition-all active:scale-95 flex items-center justify-center shadow-sm"
              >
                <ListPlus className="h-4 w-4 mr-2" />
                Pilih Batch
              </Button>
              <Button
                onClick={() => handleToggleAutoFill(false)}
                disabled={selectedItems.size === 0 || saving}
                variant="danger"
                className="flex-1 md:flex-none h-12 px-5 rounded-xl font-bold shadow-md active:scale-95"
              >
                Matikan Auto-Fill ({selectedItems.size})
              </Button>
              <Button
                onClick={() => handleToggleAutoFill(true)}
                disabled={selectedItems.size === 0 || saving}
                variant="success"
                className="flex-1 md:flex-none h-12 px-5 rounded-xl font-bold shadow-md active:scale-95"
              >
                Nyalakan Auto-Fill ({selectedItems.size})
              </Button>
            </div>
          </div>
          
          {/* Information block */}
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-2xl shadow-sm">
            <p className="text-sm text-blue-800 leading-relaxed">
              <strong>Info:</strong> Rak yang berstatus <span className="font-semibold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">MANUAL</span> tidak akan diisi secara otomatis oleh scanner, meskipun barang tersebut memiliki stok di rak tersebut. Rak ini dikhususkan bagi rak yang sedang/sudah di Stock Opname.
            </p>
          </div>

          {/* Main Table */}
          <Card className="rounded-3xl border-2 border-blue-100/80 shadow-xl shadow-blue-500/5 bg-white overflow-hidden">
            <CardContent className="p-0">
              {loading && (
                <div className="flex items-center justify-center p-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
                  <span className="ml-3 text-gray-600 font-bold">Memuat data rak...</span>
                </div>
              )}
              
              {!loading && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-blue-50/50 text-blue-900 uppercase text-xs font-black tracking-wider">
                      <tr>
                        <th className="px-4 py-4 w-16 text-center border-b border-gray-100">
                          <button onClick={handleSelectAll} className="text-blue-600 hover:text-blue-800 transition-colors">
                            {selectAll ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                          </button>
                        </th>
                        <th className="px-6 py-4 border-b border-gray-100">Nama Lokasi Rak</th>
                        <th className="px-6 py-4 border-b border-gray-100 text-center">Status Auto-Fill</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredRacks.map((rack) => (
                        <tr 
                          key={rack.id} 
                          className={`hover:bg-blue-50/30 transition-colors cursor-pointer ${selectedItems.has(rack.id) ? 'bg-blue-50/20' : 'bg-white'}`}
                          onClick={() => handleSelectItem(rack.id)}
                        >
                          <td className="px-4 py-4 text-center">
                            <button className="text-blue-600">
                              {selectedItems.has(rack.id) ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5 text-gray-300" />}
                            </button>
                          </td>
                          <td className="px-6 py-4 font-black text-gray-900 uppercase">
                            {rack.nama}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {rack.auto_fill_scanner !== false ? (
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                ON (AUTO)
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold bg-rose-100 text-rose-800 border border-rose-200">
                                OFF (MANUAL)
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                      
                      {filteredRacks.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-6 py-12 text-center text-gray-500 font-bold">
                            Tidak ada data rak yang ditemukan.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Modal
            isOpen={isBatchModalOpen}
            onClose={() => {
              setIsBatchModalOpen(false);
              setBatchInput('');
            }}
            title="Pilih Rak Secara Batch"
          >
            <div className="space-y-4">
              <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded-xl">
                <p className="text-sm text-blue-800">
                  Masukkan nama rak dipisahkan dengan koma atau baris baru.<br/>
                  Anda juga bisa memasukkan rentang rak seperti <strong>A1-A99</strong>.
                </p>
              </div>
              <div>
                <textarea
                  className="w-full h-40 p-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 focus:outline-none font-medium"
                  placeholder="Contoh:&#10;A1, A2, A3&#10;Atau rentang: B1-B50"
                  value={batchInput}
                  onChange={(e) => setBatchInput(e.target.value)}
                />
              </div>
              <div className="flex justify-end space-x-2.5">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setIsBatchModalOpen(false);
                    setBatchInput('');
                  }}
                  className="h-11 px-5 rounded-xl font-bold"
                >
                  Batal
                </Button>
                <Button
                  onClick={handleBatchSelect}
                  disabled={!batchInput.trim()}
                  className="h-11 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md active:scale-95"
                >
                  Pilih Rak
                </Button>
              </div>
            </div>
          </Modal>
        </div>
      </main>
    </div>

  );
}
