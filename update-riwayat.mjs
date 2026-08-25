import fs from 'fs';

const filePath = 'src/components/RiwayatBarang.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add states
const newStates = `
  const [isRekapModalOpen, setIsRekapModalOpen] = useState(false);
  const [rekapData, setRekapData] = useState<{sku: string, jumlah: number}[]>([]);
  const [isRekapLoading, setIsRekapLoading] = useState(false);
`;

if (!content.includes('isRekapModalOpen')) {
  content = content.replace(
    '  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);',
    '  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);' + newStates
  );
}

// 2. Add handleOpenRekap and copy logic
const rekapLogic = `
  const handleOpenRekap = async () => {
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
  };
  
  const handleCopyRekap = () => {
    if (rekapData.length === 0) {
      showToast('Tidak ada data untuk disalin', 'warning');
      return;
    }
    
    // Format for Excel: SKU \t Harga(0) \t Jumlah
    const header = "SKU/Nama Barang\\tHarga\\tJumlah";
    const rows = rekapData.map(item => \`\${item.sku}\\t0\\t\${item.jumlah}\`);
    const textToCopy = [header, ...rows].join('\\n');
    
    navigator.clipboard.writeText(textToCopy).then(() => {
      showToast('Data berhasil disalin! Silakan paste ke Excel.', 'success');
    }).catch(err => {
      console.error('Failed to copy text: ', err);
      showToast('Gagal menyalin data', 'error');
    });
  };
`;

if (!content.includes('handleOpenRekap')) {
  content = content.replace(
    '  const exportDataDev = async () => {',
    rekapLogic + '\n  const exportDataDev = async () => {'
  );
}

// 3. Add Button next to CEK SALDO
const newButton = `
              <button
                onClick={handleOpenRekap}
                className="px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-black rounded-xl shadow-lg transition-all border border-orange-400/30 flex items-center gap-2 tracking-widest active:scale-95"
              >
                <FileText className="w-4 h-4" />
                REKAP OUT HARI INI
              </button>`;
              
if (!content.includes('REKAP OUT HARI INI')) {
  content = content.replace(
    'CEK SALDO\n              </button>',
    'CEK SALDO\n              </button>' + newButton
  );
}

// 4. Add Modal Component
const rekapModal = `
      <Modal isOpen={isRekapModalOpen} onClose={() => setIsRekapModalOpen(false)} title="Rekap Barang Keluar Hari Ini" size="lg">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
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
          </div>
          
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-gray-700 border-b">SKU / Nama Barang</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 border-b text-center">Harga</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 border-b text-center">Jumlah</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {isRekapLoading ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                        Memuat data...
                      </td>
                    </tr>
                  ) : rekapData.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-gray-500 font-medium">
                        Tidak ada barang keluar hari ini.
                      </td>
                    </tr>
                  ) : (
                    rekapData.map((item, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{item.sku}</td>
                        <td className="px-4 py-3 text-center text-gray-600">0</td>
                        <td className="px-4 py-3 text-center font-bold text-blue-700">{item.jumlah}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {!isRekapLoading && rekapData.length > 0 && (
                  <tfoot className="bg-gray-50 sticky bottom-0">
                    <tr>
                      <td colSpan={2} className="px-4 py-3 font-bold text-right text-gray-900 border-t">TOTAL ITEM KELUAR:</td>
                      <td className="px-4 py-3 font-black text-center text-blue-700 border-t">
                        {rekapData.reduce((sum, item) => sum + item.jumlah, 0)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      </Modal>
`;

if (!content.includes('title="Rekap Barang Keluar Hari Ini"')) {
  content = content.replace(
    '<Toast',
    rekapModal + '\n      <Toast'
  );
}

// We need to ensure FileText and Copy are imported from lucide-react if not already
if (!content.includes('FileText')) {
  content = content.replace(
    /import \{([^}]+)\} from 'lucide-react';/,
    (match, p1) => {
      const imports = new Set(p1.split(',').map((s) => s.trim()));
      imports.add('FileText');
      imports.add('Copy');
      return `import { ${Array.from(imports).join(', ')} } from 'lucide-react';`;
    }
  );
}

fs.writeFileSync(filePath, content);
console.log('RiwayatBarang updated successfully!');
