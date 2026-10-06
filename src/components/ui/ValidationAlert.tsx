import { AlertTriangle, X, CheckCircle } from 'lucide-react';

interface ValidationAlertProps {
  isOpen: boolean;
  onClose: () => void;
  invalidCount: number;
  errors: string[];
}

export function ValidationAlert({ isOpen, onClose, invalidCount, errors }: ValidationAlertProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[500] overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-auto border-t-4 border-red-500">
          <div className="p-6 bg-gradient-to-br from-red-50 to-orange-50 rounded-t-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                    <AlertTriangle className="h-6 w-6 text-red-600" />
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-red-800">
                    {errors.includes('batch_stok') && errors.length === 1 ? 'Validasi Stok Batch Gagal' : 'Oops! Data Belum Lengkap'}
                  </h3>
                  <p className="text-sm text-red-600 mt-1">
                    {errors.includes('batch_stok') && errors.length === 1 ? 'Stok batch tanggal scan tidak sesuai atau tidak mencukupi' : 'Mohon lengkapi data yang diperlukan'}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-red-600 transition-colors p-1 hover:bg-red-100 rounded-full"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="p-6">
            <div className="mb-6">
              <div className="bg-white border border-red-200 rounded-lg p-4 mb-4">
                <div className="flex items-center space-x-2 mb-2">
                  <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-sm font-bold">{invalidCount}</span>
                  </div>
                  <p className="text-gray-800 font-medium">
                    {errors.includes('batch_stok') && errors.length === 1
                      ? `${invalidCount === 1 ? 'Ada 1 baris' : `Ada ${invalidCount} baris`} dengan kendala stok batch / tanggal scan`
                      : `${invalidCount === 1 ? 'Ada 1 baris' : `Ada ${invalidCount} baris`} yang belum lengkap`}
                  </p>
                </div>
                <p className="text-sm text-gray-600">
                  {errors.includes('batch_stok') && errors.length === 1
                    ? 'Silakan periksa detail notifikasi error dan sesuaikan tanggal scan atau rak pada baris yang ditandai border merah.'
                    : 'Silakan periksa dan lengkapi data pada baris yang ditandai dengan warna merah.'}
                </p>
              </div>

              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-3">
                  <CheckCircle className="h-5 w-5 text-blue-600" />
                  <p className="text-sm font-semibold text-blue-800">Kolom yang wajib diisi:</p>
                </div>
                <ul className="text-sm text-blue-700 space-y-2">
                  {!errors.includes('batch_stok') ? (
                    <>
                      {errors.includes('nama_produk') && (
                        <li className="flex items-center">
                          <span className="w-3 h-3 bg-blue-500 rounded-full mr-3"></span>
                          <span className="font-medium">Nama Produk</span> - Harus diisi / pilih dari dropdown
                        </li>
                      )}
                      {errors.includes('jumlah') && (
                        <li className="flex items-center">
                          <span className="w-3 h-3 bg-blue-500 rounded-full mr-3"></span>
                          <span className="font-medium">Jumlah</span> - Masukkan angka lebih dari 0
                        </li>
                      )}
                      {errors.includes('rak') && (
                        <li className="flex items-center">
                          <span className="w-3 h-3 bg-blue-500 rounded-full mr-3"></span>
                          <span className="font-medium">Rak</span> - Pilih atau ketik lokasi rak
                        </li>
                      )}
                      {errors.includes('gudang') && (
                        <li className="flex items-center">
                          <span className="w-3 h-3 bg-blue-500 rounded-full mr-3"></span>
                          <span className="font-medium">Gudang</span> - Gudang harus diisi
                        </li>
                      )}
                    </>
                  ) : (
                    <li className="flex items-start transition-all">
                      <div className="w-2 h-2 bg-orange-500 rounded-full mr-3 mt-1.5 flex-shrink-0 animate-pulse"></div>
                      <div>
                        <span className="font-bold text-orange-800">MASALAH STOK BATCH:</span>
                        <p className="mt-1 text-xs text-orange-700 leading-relaxed">
                          Data barang tidak ditemukan di rak tsb atau tidak ada barang masuk di tanggal scan tsb.
                          Silakan cek kembali kombinasi SKU, lokasi Rak, dan Tgl Scan.
                        </p>
                      </div>
                    </li>
                  )}
                </ul>
              </div>

              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-xs text-yellow-800 flex items-center">
                  <span className="w-4 h-4 bg-yellow-400 rounded-full mr-2 flex-shrink-0"></span>
                  <span><strong>Tips:</strong> Kolom yang bermasalah sudah ditandai dengan border merah di tabel. Scroll ke atas untuk melihat baris yang perlu diperbaiki.</span>
                </p>
              </div>
            </div>

            <div className="flex justify-center">
              <button
                onClick={onClose}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                ✓ Mengerti, Saya akan Perbaiki
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}