import sys
import re

file_path = 'src/components/RiwayatBarang.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Interfaces
if 'interface BalanceAnalysisResult' not in content:
    interface_str = '''
interface BalanceAnalysisResult {
  sku: string;
  rak: string;
  subRaks: Set<string>;
  tglScan: string;
  totalIn: number;
  totalOut: number;
  balance: number;
}
'''
    content = content.replace('// --- Interface dan Tipe Data ---', '// --- Interface dan Tipe Data ---' + interface_str)

# 2. States
if 'const [isAnalysisModalOpen' not in content:
    state_str = '''  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<BalanceAnalysisResult[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisSku, setAnalysisSku] = useState('');'''
    content = content.replace('const [isMigrating, setIsMigrating] = useState(false);', 'const [isMigrating, setIsMigrating] = useState(false);\n' + state_str)

# 3. Logic
if 'const handleAnalyzeStockBalance' not in content:
    logic_str = '''
  const handleAnalyzeStockBalance = async (skuToAnalyze: string) => {
    if (!skuToAnalyze) {
      showToast('Silakan pilih atau cari SKU terlebih dahulu untuk melakukan analisis.', 'warning');
      return;
    }

    try {
      setIsAnalyzing(true);
      setAnalysisResults([]);
      showToast('Memulai analisis saldo stok... Ini mungkin memakan waktu untuk data yang besar.', 'info');

      let query = supabase
        .from('database_log')
        .select('sku, rak, sub_rak, tgl_scan, type, jumlah')
        .or('type.ilike.%IN%,type.ilike.%OUT%')
        .order('id', { ascending: true })
        .ilike('sku', skuToAnalyze.trim());

      const batchSize = 1000;
      let from = 0;
      let hasMore = true;
      let allLogs: any[] = [];

      while (hasMore) {
        const { data, error } = await query.range(from, from + batchSize - 1);
        if (error) throw error;

        if (data && data.length > 0) {
          allLogs = [...allLogs, ...data];
          from += batchSize;
          if (data.length < batchSize) hasMore = false;
        } else {
          hasMore = false;
        }

        if (allLogs.length > 50000) {
          showToast('Data terlalu besar (>50.000). Hasil dibatasi untuk performa.', 'warning');
          hasMore = false;
        }
      }

      const balanceMap = new Map<string, BalanceAnalysisResult>();

      allLogs.forEach(log => {
        const normSku = (log.sku || '').trim().toUpperCase();
        const normRak = (log.rak || '').trim().toUpperCase();
        const normSubRak = (log.sub_rak || '').trim().toUpperCase();
        const normTglScan = formatDateDisplay(log.tgl_scan) || 'No Date';
        const normType = (log.type || '').trim().toUpperCase();

        if (!normType.includes('IN') && !normType.includes('OUT')) return;
        const finalType = normType.includes('IN') ? 'IN' : 'OUT';

        const key = `${normSku}|${normRak}|${normTglScan}`;

        if (!balanceMap.has(key)) {
          balanceMap.set(key, {
            sku: normSku,
            rak: normRak,
            subRaks: new Set<string>(),
            tglScan: normTglScan,
            totalIn: 0,
            totalOut: 0,
            balance: 0
          });
        }

        const result = balanceMap.get(key)!;
        if (normSubRak) result.subRaks.add(normSubRak);

        const jumlah = Number(log.jumlah || 0);

        if (finalType === 'IN') {
          result.totalIn += jumlah;
        } else {
          result.totalOut += jumlah;
        }
        result.balance = result.totalIn - result.totalOut;
      });

      const resultsArray = Array.from(balanceMap.values());

      resultsArray.sort((a, b) => {
        if (a.balance === 0 && b.balance !== 0) return 1;
        if (b.balance === 0 && a.balance !== 0) return -1;
        return a.sku.localeCompare(b.sku);
      });

      setAnalysisResults(resultsArray);
      showToast(`Analisis selesai! Menampilkan ${resultsArray.length} kombinasi SKU/Rak/Tgl Scan.`, 'success');
    } catch (error) {
      console.error('Analysis failed:', error);
      showToast('Gagal melakukan analisis saldo stok.', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };
'''
    content = content.replace('  const loadHistoryData = useCallback(async () => {', logic_str + '\n  const loadHistoryData = useCallback(async () => {')

# 4. Modal UI
if '<Modal isOpen={isAnalysisModalOpen}' not in content:
    modal_str = '''
      <Modal 
        isOpen={isAnalysisModalOpen} 
        onClose={() => setIsAnalysisModalOpen(false)} 
        title="Analisis Saldo Stok per Rak & Tanggal" 
        size="5xl"
      >
        <div className="p-6 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <input 
              type="text" 
              placeholder="Masukkan SKU untuk dianalisa..."
              className="border border-gray-300 p-2 rounded-md flex-1 text-sm focus:outline-none focus:border-blue-500"
              value={analysisSku}
              onChange={(e) => setAnalysisSku(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyzeStockBalance(analysisSku)}
            />
            <Button 
              onClick={() => handleAnalyzeStockBalance(analysisSku)}
              disabled={isAnalyzing || !analysisSku}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isAnalyzing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              <span className="ml-2">Analisa</span>
            </Button>
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden mt-4">
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-gray-700 border-b">SKU</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 border-b">Rak / Sub Rak</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 border-b">Tgl Scan</th>
                    <th className="px-4 py-3 font-semibold text-green-700 border-b text-center">Total IN</th>
                    <th className="px-4 py-3 font-semibold text-red-700 border-b text-center">Total OUT</th>
                    <th className="px-4 py-3 font-semibold text-blue-700 border-b text-center">SALDO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {isAnalyzing ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                        Menganalisa data...
                      </td>
                    </tr>
                  ) : analysisResults.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500 font-medium">
                        Belum ada hasil analisa. Silakan cari SKU.
                      </td>
                    </tr>
                  ) : (
                    analysisResults.map((res, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{res.sku}</td>
                        <td className="px-4 py-3 text-gray-700">
                          {res.rak} <br/>
                          <span className="text-xs text-gray-500">{Array.from(res.subRaks).join(', ')}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{res.tglScan}</td>
                        <td className="px-4 py-3 text-center font-bold text-green-600">{res.totalIn}</td>
                        <td className="px-4 py-3 text-center font-bold text-red-600">{res.totalOut}</td>
                        <td className={`px-4 py-3 text-center font-bold ${res.balance < 0 ? 'text-red-600' : res.balance > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                          {res.balance}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Modal>
'''
    content = content.replace('    </div>\n  );\n}', modal_str + '\n    </div>\n  );\n}')

# 5. Button UI
old_rekap_btn = '''              <button
                onClick={handleOpenRekap}
                className="px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-black rounded-xl shadow-lg transition-all border border-orange-400/30 flex items-center gap-2 tracking-widest active:scale-95"
              >
                <FileText className="w-4 h-4" />
                REKAP OUT HARI INI
              </button>'''
new_rekap_btn = '''              <button
                onClick={() => {
                  setIsAnalysisModalOpen(true);
                  if (analysisSku) handleAnalyzeStockBalance(analysisSku);
                }}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black rounded-xl shadow-lg transition-all border border-blue-400/30 flex items-center gap-2 tracking-widest active:scale-95"
              >
                <Calculator className="w-4 h-4" />
                CEK SALDO
              </button>
              <button
                onClick={handleOpenRekap}
                className="px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-black rounded-xl shadow-lg transition-all border border-orange-400/30 flex items-center gap-2 tracking-widest active:scale-95"
              >
                <FileText className="w-4 h-4" />
                REKAP OUT HARI INI
              </button>'''
if 'CEK SALDO' not in content:
    content = content.replace(old_rekap_btn, new_rekap_btn)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Patch 10 applied")
