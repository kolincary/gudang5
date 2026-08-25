import React, { useState, useEffect, useRef } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Download, Calendar, Search, RefreshCw, X, Trash2 } from 'lucide-react';
import { getExportHistory, saveExportHistory, deleteExportHistory, ExportHistoryData } from '../lib/exportHistoryService';
import { DocumentSnapshot } from 'firebase/firestore';
import { Toast } from './ui/Toast';

interface ExportHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ExportHistoryModal({ isOpen, onClose }: ExportHistoryModalProps) {
  const [data, setData] = useState<ExportHistoryData[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Pagination
  const [pageSize, setPageSize] = useState(20);
  const [lastDocs, setLastDocs] = useState<(DocumentSnapshot | null)[]>([null]);
  const [currentPage, setCurrentPage] = useState(0); // 0-indexed internally
  const [hasMore, setHasMore] = useState(true);

  // Filters
  const [dateFilter, setDateFilter] = useState('');
  
  // Custom Date Picker refs
  const dateInputRef = useRef<HTMLInputElement>(null);

  // DevMode & Delete features
  const [devModeSecret, setDevModeSecret] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const secretBuffer = useRef('');

  const loadData = async (pageIndex: number, currentLastDoc: DocumentSnapshot | null, isRefresh = false) => {
    try {
      setLoading(true);
      const result = await getExportHistory(
        pageSize, 
        currentLastDoc, 
        dateFilter || undefined, 
        dateFilter || undefined // Using same date for single day filter
      );
      
      setData(result.data);
      setHasMore(result.hasMore);
      
      if (isRefresh) {
        setLastDocs([null, result.lastDoc]);
        setCurrentPage(0);
      } else {
        const newLastDocs = [...lastDocs];
        newLastDocs[pageIndex + 1] = result.lastDoc;
        setLastDocs(newLastDocs);
        setCurrentPage(pageIndex);
      }
    } catch (error) {
      console.error("Gagal memuat riwayat export", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData(0, null, true);
      setSelectedIds(new Set()); // Reset selections on open
    }
  }, [isOpen, pageSize, dateFilter]);

  // Secret DevMode Key Listener
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Hanya tangkap karakter huruf
      if (e.key.length === 1 && e.key.match(/[a-z]/i)) {
        secretBuffer.current += e.key.toLowerCase();
        // Keep buffer size to exactly the length of 'devmode'
        if (secretBuffer.current.length > 7) {
          secretBuffer.current = secretBuffer.current.slice(-7);
        }
        
        if (secretBuffer.current === 'devmode') {
          setDevModeSecret(prev => {
            const nextState = !prev;
            if (!nextState) setSelectedIds(new Set()); // Bersihkan pilihan kalau mode dimatikan
            return nextState;
          });
          secretBuffer.current = ''; // reset after match
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const toggleAllSelection = () => {
    if (selectedIds.size === data.length) {
      setSelectedIds(new Set()); // Deselect all
    } else {
      const newSet = new Set(data.map(item => item.id!));
      setSelectedIds(newSet);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    
    if (!window.confirm(`Yakin ingin menghapus ${selectedIds.size} riwayat export? (File juga akan dihapus dari Storage jika bisa)`)) {
      return;
    }

    try {
      setIsDeleting(true);
      const itemsToDelete = data
        .filter(item => selectedIds.has(item.id!))
        .map(item => ({ id: item.id!, fileUrl: item.fileUrl }));
        
      await deleteExportHistory(itemsToDelete);
      
      // Reset & Reload
      setSelectedIds(new Set());
      loadData(0, null, true);
    } catch (error) {
      console.error("Gagal menghapus:", error);
      alert("Gagal menghapus beberapa data.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleNextPage = () => {
    if (hasMore) {
      loadData(currentPage + 1, lastDocs[currentPage + 1]);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 0) {
      loadData(currentPage - 1, lastDocs[currentPage - 1]);
    }
  };

  const clearDateFilter = (e: React.MouseEvent) => {
    e.stopPropagation(); // prevent opening calendar
    setDateFilter('');
  };

  const openCalendar = () => {
    if (dateInputRef.current) {
      dateInputRef.current.showPicker?.();
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Riwayat Export Excel" size="xl">
      <div className="flex flex-col h-[70vh] bg-gray-50 rounded-b-xl overflow-hidden">
        
        {/* Toolbar */}
        <div className="bg-white p-4 border-b flex flex-wrap gap-4 items-end justify-between shadow-sm z-10">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Filter Tanggal
              </label>
              <div 
                className="relative flex items-center h-10 bg-white border border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 transition-colors w-48 shadow-sm"
                onClick={openCalendar}
              >
                <div className="pl-3 text-gray-400">
                  <Calendar className="w-4 h-4" />
                </div>
                <input
                  ref={dateInputRef}
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="absolute opacity-0 w-0 h-0 pointer-events-none" // Hide actual input but keep it for picker
                />
                <div className="flex-1 px-3 text-sm font-medium text-gray-700 select-none">
                  {dateFilter || 'Semua Tanggal'}
                </div>
                {dateFilter && (
                  <button 
                    onClick={clearDateFilter}
                    className="pr-3 text-gray-400 hover:text-red-500 transition-colors focus:outline-none"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Per Halaman
              </label>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-10 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
              >
                <option value={20}>20 Baris</option>
                <option value={50}>50 Baris</option>
                <option value={100}>100 Baris</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            {devModeSecret && selectedIds.size > 0 && (
              <Button 
                onClick={handleDeleteSelected}
                disabled={isDeleting}
                className="h-10 px-4 flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 shadow-sm transition-colors"
              >
                <Trash2 className={`w-4 h-4 ${isDeleting ? 'animate-bounce' : ''}`} />
                <span className="font-medium">Hapus Terpilih ({selectedIds.size})</span>
              </Button>
            )}
            
            <Button 
              onClick={() => loadData(0, null, true)}
              className="h-10 px-4 flex items-center justify-center gap-2 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 shadow-sm transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="font-medium">Refresh</span>
            </Button>
          </div>
        </div>

        {/* Table Area */}
        <div className="flex-1 overflow-auto p-4">
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-600 uppercase bg-gray-50 border-b">
                  <tr>
                    {devModeSecret && (
                      <th className="px-4 py-3 font-semibold w-12 text-center">
                        <input 
                          type="checkbox" 
                          checked={data.length > 0 && selectedIds.size === data.length}
                          onChange={toggleAllSelection}
                          className="w-4 h-4 text-blue-600 rounded border-gray-300 cursor-pointer"
                        />
                      </th>
                    )}
                    <th className="px-4 py-3 font-semibold">Tanggal & Waktu</th>
                    <th className="px-4 py-3 font-semibold">User</th>
                    <th className="px-4 py-3 font-semibold">File Name</th>
                    <th className="px-4 py-3 font-semibold">Ukuran</th>
                    <th className="px-4 py-3 font-semibold text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading && data.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                        <p>Memuat riwayat export...</p>
                      </td>
                    </tr>
                  ) : data.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                          <Search className="w-6 h-6 text-gray-400" />
                        </div>
                        <p className="font-medium">Tidak ada riwayat export ditemukan</p>
                        {dateFilter && <p className="text-xs mt-1">Coba hapus filter tanggal</p>}
                      </td>
                    </tr>
                  ) : (
                    data.map((row) => (
                      <tr key={row.id} className={`hover:bg-blue-50/50 transition-colors ${selectedIds.has(row.id!) ? 'bg-blue-50/30' : ''}`}>
                        {devModeSecret && (
                          <td className="px-4 py-3 text-center">
                            <input 
                              type="checkbox" 
                              checked={selectedIds.has(row.id!)}
                              onChange={() => toggleSelection(row.id!)}
                              className="w-4 h-4 text-blue-600 rounded border-gray-300 cursor-pointer"
                            />
                          </td>
                        )}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-medium text-gray-900">{row.tanggal}</div>
                          <div className="text-xs text-gray-500">{row.waktu}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold uppercase">
                              {row.user?.substring(0, 2) || 'U'}
                            </div>
                            <span className="font-medium text-gray-700">{row.user}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600 max-w-[200px] truncate" title={row.fileName}>
                          {row.fileName}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-medium text-gray-700">{row.sizeMB}</div>
                          <div className="text-xs text-gray-400">{row.sizeKB}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          <a 
                            href={row.fileUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-500 rounded-lg shadow-sm transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Unduh
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Pagination Footer */}
        <div className="bg-white p-4 border-t flex items-center justify-between shadow-[0_-4px_10px_rgba(0,0,0,0.02)] z-10">
          <div className="text-sm text-gray-600 font-medium">
            Halaman {currentPage + 1}
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handlePrevPage}
              disabled={currentPage === 0 || loading}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 border-none px-4"
            >
              Sebelumnya
            </Button>
            <Button
              onClick={handleNextPage}
              disabled={!hasMore || loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4"
            >
              Selanjutnya
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
