import sys

file_path = 'src/components/RiwayatBarang.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

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

bad_block = modal_str + '\n    </div>\n  );\n}'

# Only replace the FIRST occurrence (in CustomDropdown) with the normal closing tags
content = content.replace(bad_block, '    </div>\n  );\n}', 1)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Patch 11 applied: removed duplicate modal from CustomDropdown")
