import sys
import re

file_path = 'src/components/RiwayatBarang.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. State updates
old_state = "  const [rekapData, setRekapData] = useState<{sku: string, jumlah: number, waktu: string}[]>([]);"
new_state = '''  const [rekapData, setRekapData] = useState<{sku: string, jumlah: number, waktu: string}[]>([]);
  const [rekapViewMode, setRekapViewMode] = useState<'current' | 'history' | 'batch_detail'>('current');
  const [rekapBatches, setRekapBatches] = useState<{id: number, time: string, data: {sku: string, jumlah: number, waktu: string}[]}[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<{id: number, time: string, data: {sku: string, jumlah: number, waktu: string}[]} | null>(null);'''
if 'setRekapViewMode' not in content:
    content = content.replace(old_state, new_state)

# 2. handleOpenRekap logic
old_open_rekap_load = "      setRekapData(result);"
new_open_rekap_load = '''      setRekapData(result);
      
      // Load batches
      const savedBatches = localStorage.getItem(`rekap_batches_${today}`);
      if (savedBatches) {
        setRekapBatches(JSON.parse(savedBatches));
      } else {
        setRekapBatches([]);
      }
      setRekapViewMode('current');'''
if 'setRekapBatches(JSON.parse' not in content:
    content = content.replace(old_open_rekap_load, new_open_rekap_load)

# 3. handleConfirmCopyAndClose logic
old_save_timestamp = "      localStorage.setItem(`rekap_copied_${today}`, now);"
new_save_timestamp = '''      localStorage.setItem(`rekap_copied_${today}`, now);
      
      const savedBatches = localStorage.getItem(`rekap_batches_${today}`);
      const batches = savedBatches ? JSON.parse(savedBatches) : [];
      batches.push({
        id: batches.length + 1,
        time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        data: rekapData
      });
      localStorage.setItem(`rekap_batches_${today}`, JSON.stringify(batches));'''
if 'batches.push' not in content:
    content = content.replace(old_save_timestamp, new_save_timestamp)

# 4. handleResetRekap & handleCopyBatch (Insert before handleCopyRekap)
new_funcs = '''  const handleResetRekap = () => {
    const today = new Date().toISOString().split('T')[0];
    localStorage.removeItem(`rekap_copied_${today}`);
    localStorage.removeItem(`rekap_batches_${today}`);
    setRekapBatches([]);
    setRekapViewMode('current');
    showToast('Data rekap berhasil di-reset!', 'success');
    handleOpenRekap();
  };

  const handleCopyBatch = (batch: any) => {
    if (!batch || batch.data.length === 0) return;
    const rows = batch.data.map((item: any) => `${item.sku}\t0\t${item.jumlah}`);
    const textToCopy = rows.join('\n');
    navigator.clipboard.writeText(textToCopy).then(() => {
      showToast('Data batch berhasil disalin!', 'success');
    }).catch(err => {
      console.error('Failed to copy', err);
      showToast('Gagal menyalin data', 'error');
    });
  };

  const handleCopyRekap = () => {'''
if 'handleResetRekap' not in content:
    content = content.replace('  const handleCopyRekap = () => {', new_funcs)

# 5. Modal Header UI
old_header = '''          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-600">
              Data rekap total barang keluar (OUT) untuk tanggal <strong>{new Date().toLocaleDateString('id-ID')}</strong>.
            </p>
            <Button 
              onClick={handleCopyRekap}
              disabled={rekapData.length === 0 || isRekapLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2"
            >
              <Copy className="w-4 h-4" />
              Salin Data (Excel)
            </Button>
          </div>'''

new_header = '''          <div className="flex justify-between items-start mb-4">
            {rekapViewMode === 'current' && (
              <>
                <div className="flex flex-col gap-1">
                  <p className="text-sm text-gray-600">
                    Data rekap total barang keluar (OUT) untuk tanggal <strong>{new Date().toLocaleDateString('id-ID')}</strong>.
                  </p>
                  <div className="flex gap-2 mt-2">
                    {isDevMode && (
                      <Button onClick={handleResetRekap} className="bg-red-600 hover:bg-red-700 text-white flex items-center gap-2 h-8 text-xs px-3">
                        Reset Data
                      </Button>
                    )}
                    <Button onClick={() => setRekapViewMode('history')} className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 h-8 text-xs px-3">
                      <List className="w-3 h-3" />
                      Riwayat Copy
                    </Button>
                  </div>
                </div>
                <Button 
                  onClick={handleCopyRekap}
                  disabled={rekapData.length === 0 || isRekapLoading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  Salin Data (Excel)
                </Button>
              </>
            )}
            
            {rekapViewMode === 'history' && (
              <div className="flex flex-col gap-1">
                <p className="text-sm text-gray-600">
                  Riwayat Batch Copy (<strong>{new Date().toLocaleDateString('id-ID')}</strong>)
                </p>
                <div className="flex gap-2 mt-2">
                  <Button onClick={() => setRekapViewMode('current')} variant="outline" className="flex items-center gap-2 h-8 text-xs px-3">
                    Kembali ke Rekap
                  </Button>
                </div>
              </div>
            )}

            {rekapViewMode === 'batch_detail' && (
              <>
                <div className="flex flex-col gap-1">
                  <p className="text-sm text-gray-600">
                    Detail Batch #{selectedBatch?.id} ({selectedBatch?.time})
                  </p>
                  <div className="flex gap-2 mt-2">
                    <Button onClick={() => setRekapViewMode('history')} variant="outline" className="flex items-center gap-2 h-8 text-xs px-3">
                      Kembali ke Riwayat
                    </Button>
                  </div>
                </div>
                <Button 
                  onClick={() => handleCopyBatch(selectedBatch)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  Salin Ulang (Excel)
                </Button>
              </>
            )}
          </div>'''
if 'Riwayat Batch Copy' not in content:
    content = content.replace(old_header, new_header)

# 6. Table Body toggle logic
# We will replace the entire table div wrapper `          <div className="border border-gray-200 rounded-lg overflow-hidden">
#            <div className="max-h-[60vh] overflow-y-auto">`
old_table_wrapper_start = '''          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm text-left">'''

new_table_wrapper_start = '''          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="max-h-[60vh] overflow-y-auto">
              {rekapViewMode === 'history' ? (
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-gray-700 border-b">Batch #</th>
                      <th className="px-4 py-3 font-semibold text-gray-700 border-b">Waktu Copy</th>
                      <th className="px-4 py-3 font-semibold text-gray-700 border-b text-center">Jumlah Item (SKU)</th>
                      <th className="px-4 py-3 font-semibold text-gray-700 border-b text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {rekapBatches.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-gray-500 font-medium">
                          Belum ada riwayat copy hari ini.
                        </td>
                      </tr>
                    ) : (
                      rekapBatches.map((batch, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">Batch {batch.id}</td>
                          <td className="px-4 py-3 text-gray-600">{batch.time}</td>
                          <td className="px-4 py-3 text-center font-bold text-blue-700">{batch.data.length} SKU</td>
                          <td className="px-4 py-3 text-center">
                            <Button onClick={() => { setSelectedBatch(batch); setRekapViewMode('batch_detail'); }} className="bg-blue-50 text-blue-600 hover:bg-blue-100 h-8 text-xs px-3 py-1 rounded-md">
                              View Data
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-sm text-left">'''

if "Belum ada riwayat copy hari ini" not in content:
    content = content.replace(old_table_wrapper_start, new_table_wrapper_start)

old_tbody_content = '''                    rekapData.map((item, index) => ('''
new_tbody_content = '''                    (rekapViewMode === 'current' ? rekapData : selectedBatch?.data || []).map((item, index) => ('''
if "rekapViewMode === 'current' ? rekapData" not in content:
    content = content.replace(old_tbody_content, new_tbody_content)

old_tfoot = '''                {!isRekapLoading && rekapData.length > 0 && (
                  <tfoot className="bg-gray-50 sticky bottom-0">
                    <tr>
                      <td colSpan={2} className="px-4 py-3 font-bold text-right text-gray-900 border-t">TOTAL ITEM KELUAR:</td>
                      <td className="px-4 py-3 font-black text-center text-blue-700 border-t">
                        {rekapData.reduce((sum, item) => sum + item.jumlah, 0)}
                      </td>
                    </tr>
                  </tfoot>
                )}'''

new_tfoot = '''                {!isRekapLoading && (rekapViewMode === 'current' ? rekapData.length > 0 : selectedBatch?.data.length) && (
                  <tfoot className="bg-gray-50 sticky bottom-0">
                    <tr>
                      <td colSpan={2} className="px-4 py-3 font-bold text-right text-gray-900 border-t">TOTAL ITEM KELUAR:</td>
                      <td className="px-4 py-3 font-black text-center text-blue-700 border-t">
                        {(rekapViewMode === 'current' ? rekapData : (selectedBatch?.data || [])).reduce((sum, item) => sum + item.jumlah, 0)}
                      </td>
                      <td className="border-t"></td>
                    </tr>
                  </tfoot>
                )}'''
if "(selectedBatch?.data || [])).reduce" not in content:
    content = content.replace(old_tfoot, new_tfoot)

old_table_wrapper_end = '''              </table>
            </div>
          </div>'''
new_table_wrapper_end = '''              </table>
              )}
            </div>
          </div>'''
if "              )}\n            </div>\n          </div>" not in content:
    content = content.replace(old_table_wrapper_end, new_table_wrapper_end)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Patch 9 applied")
