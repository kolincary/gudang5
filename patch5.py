import sys
import re

file_path = 'src/components/RiwayatBarang.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update State Definition
content = content.replace('useState<{sku: string, jumlah: number}[]>([]);', 'useState<{sku: string, jumlah: number, waktu: string}[]>([]);\n  const [isCopyConfirmOpen, setIsCopyConfirmOpen] = useState(false);')

# 2. Update handleOpenRekap logic
old_open_rekap = '''  const handleOpenRekap = async () => {
    setIsRekapModalOpen(true);
    setIsRekapLoading(true);
    setRekapData([]);
    
    try {
      const today = new Date().toISOString().split('T')[0];
      // Query database_log where tgl = today AND type = 'OUT'
      const { data, error } = await supabase
        .from('database_log')
        .select('sku, jumlah')
        .eq('tgl', today)
        .eq('type', 'OUT');
        
      if (error) throw error;
      
      if (!data || data.length === 0) {
        showToast('Tidak ada data barang keluar hari ini.', 'info');
        setIsRekapLoading(false);
        return;
      }
      
      // Group and sum
      const grouped = new Map<string, number>();
      data.forEach(item => {
        const sku = item.sku || 'UNKNOWN';
        const qty = Number(item.jumlah || 0);
        grouped.set(sku, (grouped.get(sku) || 0) + qty);
      });
      
      const result = Array.from(grouped.entries()).map(([sku, jumlah]) => ({ sku, jumlah }));
      // Sort alphabetically by SKU
      result.sort((a, b) => a.sku.localeCompare(b.sku));
      
      setRekapData(result);
    } catch (error) {
      console.error('Failed to load rekap:', error);
      showToast('Gagal memuat rekap OUT hari ini.', 'error');
    } finally {
      setIsRekapLoading(false);
    }
  };'''

new_open_rekap = '''  const handleOpenRekap = async () => {
    setIsRekapModalOpen(true);
    setIsRekapLoading(true);
    setRekapData([]);
    
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Check local storage for last copied timestamp today
      const lastCopiedTimestamp = localStorage.getItem(`rekap_copied_${today}`);
      
      let query = supabase
        .from('database_log')
        .select('sku, jumlah, waktu, created_at')
        .eq('tgl', today)
        .eq('type', 'OUT');
        
      if (lastCopiedTimestamp) {
        query = query.gt('created_at', lastCopiedTimestamp);
      }
      
      const { data, error } = await query;
        
      if (error) throw error;
      
      if (!data || data.length === 0) {
        setRekapData([]);
        setIsRekapLoading(false);
        return;
      }
      
      // Group and sum, also keep latest waktu
      const grouped = new Map<string, {jumlah: number, waktu: string}>();
      data.forEach(item => {
        const sku = item.sku || 'UNKNOWN';
        const qty = Number(item.jumlah || 0);
        const time = item.waktu || '';
        
        if (grouped.has(sku)) {
           const existing = grouped.get(sku)!;
           grouped.set(sku, { 
             jumlah: existing.jumlah + qty, 
             waktu: time > existing.waktu ? time : existing.waktu 
           });
        } else {
           grouped.set(sku, { jumlah: qty, waktu: time });
        }
      });
      
      const result = Array.from(grouped.entries()).map(([sku, val]) => ({ sku, jumlah: val.jumlah, waktu: val.waktu }));
      result.sort((a, b) => a.sku.localeCompare(b.sku));
      
      setRekapData(result);
    } catch (error) {
      console.error('Failed to load rekap:', error);
      showToast('Gagal memuat rekap OUT hari ini.', 'error');
    } finally {
      setIsRekapLoading(false);
    }
  };'''

content = content.replace(old_open_rekap, new_open_rekap)

# 3. Update handleCopyRekap logic
old_copy = '''  const handleCopyRekap = () => {
    if (rekapData.length === 0) {
      showToast('Tidak ada data untuk disalin', 'warning');
      return;
    }
    
    // Format for Excel: SKU \t Harga(0) \t Jumlah
    const header = "SKU/Nama Barang\tHarga\tJumlah";
    const rows = rekapData.map(item => `${item.sku}\t0\t${item.jumlah}`);
    const textToCopy = [header, ...rows].join('\n');
    
    navigator.clipboard.writeText(textToCopy).then(() => {
      showToast('Data berhasil disalin! Silakan paste ke Excel.', 'success');
    }).catch(err => {
      console.error('Failed to copy text: ', err);
      showToast('Gagal menyalin data', 'error');
    });
  };'''

new_copy = '''  const handleCopyRekap = () => {
    if (rekapData.length === 0) {
      showToast('Tidak ada data untuk disalin', 'warning');
      return;
    }
    setIsCopyConfirmOpen(true);
  };

  const handleConfirmCopyAndClose = () => {
    const rows = rekapData.map(item => `${item.sku}\t0\t${item.jumlah}`);
    const textToCopy = rows.join('\n');
    
    navigator.clipboard.writeText(textToCopy).then(() => {
      showToast('Data berhasil disalin (tanpa header)!', 'success');
      // Save timestamp so next fetch ignores these
      const today = new Date().toISOString().split('T')[0];
      const now = new Date().toISOString();
      localStorage.setItem(`rekap_copied_${today}`, now);
      setIsCopyConfirmOpen(false);
      setIsRekapModalOpen(false);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
      showToast('Gagal menyalin data', 'error');
      setIsCopyConfirmOpen(false);
    });
  };'''

content = content.replace(old_copy, new_copy)

# 4. Update the Table in the Modal (add Waktu)
old_thead = '''<thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-gray-700 border-b">SKU / Nama Barang</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 border-b text-center">Harga</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 border-b text-center">Jumlah</th>
                  </tr>
                </thead>'''
new_thead = '''<thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-gray-700 border-b">Waktu</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 border-b">SKU / Nama Barang</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 border-b text-center">Harga</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 border-b text-center">Jumlah</th>
                  </tr>
                </thead>'''
content = content.replace(old_thead, new_thead)

old_tbody_cols = '''                        <td className="px-4 py-3 font-medium text-gray-900">{item.sku}</td>
                        <td className="px-4 py-3 text-center text-gray-600">0</td>
                        <td className="px-4 py-3 text-center font-bold text-blue-700">{item.jumlah}</td>'''
new_tbody_cols = '''                        <td className="px-4 py-3 text-gray-500 text-xs">{item.waktu}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{item.sku}</td>
                        <td className="px-4 py-3 text-center text-gray-600">0</td>
                        <td className="px-4 py-3 text-center font-bold text-blue-700">{item.jumlah}</td>'''
content = content.replace(old_tbody_cols, new_tbody_cols)

old_colspan = '''<td colSpan={3} className="px-4 py-8 text-center text-gray-500 font-medium">
                        Tidak ada barang keluar hari ini.
                      </td>'''
new_colspan = '''<td colSpan={4} className="px-4 py-8 text-center text-gray-500 font-medium">
                        Tidak ada barang keluar yang belum disalin hari ini.
                      </td>'''
content = content.replace(old_colspan, new_colspan)

old_colspan2 = '''<td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />'''
new_colspan2 = '''<td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />'''
content = content.replace(old_colspan2, new_colspan2)

# 5. Add Confirmation Modal below the Rekap Modal
confirm_modal = '''
      <Modal isOpen={isCopyConfirmOpen} onClose={() => setIsCopyConfirmOpen(false)} title="Konfirmasi Salin Data" size="md">
        <div className="p-6">
          <p className="text-gray-700 mb-6">
            Apakah Anda yakin ingin menyalin data ini? <br/><br/>
            <span className="text-red-600 font-medium">PENTING:</span> Setelah disalin, data ini tidak akan tampil lagi di halaman rekap ini. Rekap berikutnya hanya akan menampilkan data pemotongan <strong>terbaru</strong> sejak penyalinan terakhir.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setIsCopyConfirmOpen(false)}>Batal</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleConfirmCopyAndClose}>
              Ya, Salin & Tutup
            </Button>
          </div>
        </div>
      </Modal>
'''
# Insert just before the end of the return statement or before the first Modal.
# Actually let's just insert it right after the Rekap Modal's </Modal>

content = content.replace('      </Modal>\n\n      {/* Modal Filter Export */}', '      </Modal>\n' + confirm_modal + '\n      {/* Modal Filter Export */}')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Patch 5 applied")
