import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { Button } from '../ui/Button';
import { Toast } from '../ui/Toast';
import { Search, MapPin, Plus, X, Edit2, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useDatabaseConfig } from '../../lib/DatabaseContext';
import { DatabaseService } from '../../lib/DatabaseService';

interface RackLocation {
  id: string;
  nama: string;
  warehouse_id?: string;
  tampil_di_menu: 'INPUT_MASUK' | 'INPUT_KELUAR' | 'KEDUANYA';
  status: 'Aktif' | 'Tidak Aktif';
  created_at: string;
  updated_at: string;
}

export function LokasiRak() {
  const { writeMode } = useDatabaseConfig();
  const [rackLocations, setRackLocations] = useState<RackLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    nama: '',
    tampil_di_menu: 'KEDUANYA' as 'INPUT_MASUK' | 'INPUT_KELUAR' | 'KEDUANYA',
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

  const showToast = (message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') => {
    setToast({ isOpen: true, message, type });
    setTimeout(() => {
      setToast({ isOpen: false, message: '', type: 'info' });
    }, 4000);
  };

  // Load data from Supabase on component mount
  React.useEffect(() => {
    loadRackLocations();
  }, []);

  const loadRackLocations = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('rack_locations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading rack locations:', error);
        showToast('Gagal memuat data lokasi rak', 'error');
        return;
      }

      setRackLocations(data || []);
    } catch (error) {
      console.error('Error loading rack locations:', error);
      showToast('Terjadi kesalahan saat memuat data', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Function to determine default menu display based on rack name
  const getDefaultMenuDisplay = (namaRak: string): 'INPUT_MASUK' | 'INPUT_KELUAR' | 'KEDUANYA' => {
    const upperName = namaRak.toUpperCase();
    const inputMasukKeluar = ['UTAMA', 'ECER-M', 'ECER-N', 'ECER-O', 'BLOK-I', 'LANTAI 4', 'LANTAI 2'];

    if (inputMasukKeluar.includes(upperName)) {
      return 'KEDUANYA';
    }

    return 'INPUT_KELUAR';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingId) {
        // Update existing rack location
        const { error } = await DatabaseService.updateMasterData('rack_locations', editingId, {
          nama: formData.nama,
          tampil_di_menu: formData.tampil_di_menu,
          status: formData.status
        }, writeMode);

        if (error) {
          console.error('Error updating rack location:', error);
          showToast('Gagal mengupdate lokasi rak', 'error');
          return;
        }

        showToast('Lokasi rak berhasil diupdate!', 'success');
      } else {
        // Add new rack location
        const { error } = await DatabaseService.insertMasterData('rack_locations', [{
          nama: formData.nama,
          tampil_di_menu: formData.tampil_di_menu,
          status: formData.status
        }], writeMode);

        if (error) {
          console.error('Error adding rack location:', error);
          showToast('Gagal menambah lokasi rak', 'error');
          return;
        }

        showToast('Lokasi rak berhasil ditambahkan!', 'success');
      }

      resetForm();
      loadRackLocations(); // Reload data
    } catch (error) {
      console.error('Error submitting rack location:', error);
      showToast('Terjadi kesalahan saat menyimpan data', 'error');
    }
  };

  const resetForm = () => {
    setFormData({ nama: '', tampil_di_menu: 'KEDUANYA', status: 'Aktif' });
    setIsFormOpen(false);
    setEditingId(null);
  };

  const handleEdit = (location: RackLocation) => {
    setFormData({
      nama: location.nama,
      tampil_di_menu: location.tampil_di_menu || 'KEDUANYA',
      status: location.status
    });
    setEditingId(location.id);
    setIsFormOpen(true);
  };

  // Handle nama change and auto-set tampil_di_menu
  const handleNamaChange = (nama: string) => {
    // Only auto-set if we're adding new (not editing)
    if (!editingId) {
      const defaultMenuDisplay = getDefaultMenuDisplay(nama);
      setFormData({
        ...formData,
        nama,
        tampil_di_menu: defaultMenuDisplay
      });
    } else {
      // When editing, just update the name
      setFormData({
        ...formData,
        nama
      });
    }
  };

  const handleDelete = async (id: string, nama: string) => {
    if (confirm(`Apakah Anda yakin ingin menghapus lokasi rak "${nama}"?`)) {
      try {
        const { error } = await DatabaseService.deleteMasterData('rack_locations', id, writeMode);

        if (error) {
          console.error('Error deleting rack location:', error);
          showToast('Gagal menghapus lokasi rak', 'error');
          return;
        }

        showToast('Lokasi rak berhasil dihapus!', 'success');
        loadRackLocations(); // Reload data
      } catch (error) {
        console.error('Error deleting rack location:', error);
        showToast('Terjadi kesalahan saat menghapus data', 'error');
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
        {/* PREMIUM IMMERSIVE HEADER (310px) */}
        <div className="flex flex-col mb-8 lg:mb-12 uppercase">
          <div className="bg-gradient-to-br from-blue-700 via-indigo-800 to-slate-900 pt-[90px] lg:pt-0 lg:h-[310px] pb-[75px] lg:pb-0 px-6 lg:px-12 rounded-b-[40px] lg:rounded-b-[55px] shadow-2xl shadow-blue-900/40 relative overflow-hidden transition-all duration-500 flex flex-col justify-center">
            <div className="absolute -top-12 -right-12 text-white opacity-5">
              <MapPin className="w-72 h-72 lg:w-[480px] lg:h-[480px]" />
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
                  Lokasi <span className="text-blue-400">Rak</span>
                </h1>
                <div className="text-blue-100/80 font-medium text-[14px] lg:text-[18px] leading-relaxed max-w-[90%] normal-case flex items-center gap-3">
                  <div className="px-3 py-1 bg-white/10 rounded-full backdrop-blur-sm border border-white/10 flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                    </span>
                    <span className="text-[11px] font-bold tracking-widest uppercase">{rackLocations.length} Lokasi</span>
                  </div>
                  <span className="text-[13px] lg:text-[16px]">Kelola lokasi rak penyimpanan barang</span>
                </div>
              </div>
              <div className="relative z-10 flex flex-wrap gap-2 lg:gap-3 lg:mb-2 items-center">
                <Button
                  onClick={() => setIsFormOpen(true)}
                  className="h-12 px-6 bg-white hover:bg-blue-50 text-blue-700 font-black rounded-2xl shadow-[0_8px_25px_rgba(255,255,255,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2.5 border-none"
                >
                  <Plus className="h-4 w-4" />
                  <span className="uppercase text-xs font-black">Tambah Lokasi Rak</span>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Add/Edit Form */}
        {isFormOpen && (
          <Card>
            <CardHeader>
              <div className="bg-blue-600 text-white p-3 -m-6 mb-4 rounded-t-lg">
                <h3 className="font-semibold">
                  {editingId ? 'Edit Lokasi Rak' : 'Tambah Lokasi Rak Baru'}
                </h3>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nama Lokasi Rak
                  </label>
                  <input
                    type="text"
                    value={formData.nama}
                    onChange={(e) => handleNamaChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Nama lokasi rak"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tampil di Menu
                  </label>
                  <select
                    value={formData.tampil_di_menu}
                    onChange={(e) => setFormData({ ...formData, tampil_di_menu: e.target.value as 'INPUT_MASUK' | 'INPUT_KELUAR' | 'KEDUANYA' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="KEDUANYA">Input Masuk & Keluar</option>
                    <option value="INPUT_MASUK">Hanya Input Masuk</option>
                    <option value="INPUT_KELUAR">Hanya Input Keluar</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Pilih di menu mana lokasi rak ini akan muncul sebagai pilihan dropdown
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as 'Aktif' | 'Tidak Aktif' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="Aktif">Aktif</option>
                    <option value="Tidak Aktif">Tidak Aktif</option>
                  </select>
                </div>

                <div className="flex justify-end space-x-3 mt-4">
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
                    {editingId ? 'Update' : 'Simpan'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Rack Locations Table */}
        <Card>
          <CardContent className="p-0">
            {/* Search Bar */}
            <div className="p-4 border-b border-gray-100 flex items-center justify-end">
              <div className="relative w-full md:w-64">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Cari lokasi rak..."
                  className="w-full pl-10 pr-10 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50/50"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {loading && (
              <div className="flex items-center justify-center p-8">
                <div className="text-blue-600 font-medium">Memuat data...</div>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-blue-600 text-white">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium border-r border-blue-500">Lokasi Rak</th>
                    <th className="px-4 py-3 text-center text-sm font-medium border-r border-blue-500">Tampil di Menu</th>
                    <th className="px-4 py-3 text-center text-sm font-medium border-r border-blue-500">Status</th>
                    <th className="px-4 py-3 text-center text-sm font-medium border-r border-blue-500">Tanggal Dibuat</th>
                    <th className="px-4 py-3 text-center text-sm font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {rackLocations
                    .filter(loc => loc.nama.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map((location, index) => (
                    <tr key={location.id} className={`${index % 2 === 0 ? 'bg-blue-50' : 'bg-white'} hover:bg-blue-100 border-b border-gray-200`}>
                      <td className="px-4 py-3 text-sm font-bold border-r border-gray-200">
                        {location.nama}
                      </td>
                      <td className="px-4 py-3 text-center border-r border-gray-200">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${location.tampil_di_menu === 'KEDUANYA'
                          ? 'bg-blue-100 text-blue-800'
                          : location.tampil_di_menu === 'INPUT_MASUK'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-orange-100 text-orange-800'
                          }`}>
                          {location.tampil_di_menu === 'KEDUANYA' ? 'Masuk & Keluar' :
                            location.tampil_di_menu === 'INPUT_MASUK' ? 'Input Masuk' : 'Input Keluar'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center border-r border-gray-200">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${location.status === 'Aktif'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                          }`}>
                          {location.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-center border-r border-gray-200">
                        {new Date(location.created_at).toLocaleDateString('id-ID')}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center space-x-2">
                          <Button
                            onClick={() => handleEdit(location)}
                            className="h-8 w-8 p-0 flex items-center justify-center bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 rounded-lg transition-all duration-200 transform active:scale-90 border border-blue-500/20"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            onClick={() => handleDelete(location.id, location.nama)}
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

        {/* Summary */}
        <div className="bg-gray-50 p-3 rounded text-sm text-gray-600">
          <div className="flex justify-between items-center">
            <span>Total lokasi rak: {rackLocations.length}</span>
            <span>Lokasi rak aktif: {rackLocations.filter(l => l.status === 'Aktif').length}</span>
          </div>
        </div>
      </div>
    </>
  );
}