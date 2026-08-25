const fs = require('fs');
let code = fs.readFileSync('src/components/StokLantai3.tsx', 'utf8');

// 1. Add 'sudah_so?: boolean;' to StokLantai3Item
code = code.replace(
  '  updated_at: string;\n}',
  '  updated_at: string;\n  sudah_so?: boolean;\n}'
);

// 2. Add useAuth import if not present
if (!code.includes("import { useAuth } from '../context/AuthContext';")) {
  code = code.replace(
    "import { supabase } from '../lib/supabase';",
    "import { supabase } from '../lib/supabase';\nimport { useAuth } from '../context/AuthContext';"
  );
}

// 3. Add states
const statesInjection = `
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [showSoModal, setShowSoModal] = useState(false);
  const [soInputData, setSoInputData] = useState<Record<string, string>>({});
  const [isProcessingSo, setIsProcessingSo] = useState(false);
  const { userEmail, userRole } = useAuth();
`;

code = code.replace(
  '  const [itemsPerPage, setItemsPerPage] = useState(100);',
  '  const [itemsPerPage, setItemsPerPage] = useState(100);' + statesInjection
);

// 4. Add SO handlers
const handlersInjection = `
  const handleCopySelected = () => {
    if (selectedProductIds.size === 0) return;
    const selectedData = stokData.filter(item => selectedProductIds.has(item.id));
    const textData = selectedData.map(item => \`\${item.nama_produk}\\t\${item.qty}\\t\${item.rak || '-'}\`).join('\\n');
    navigator.clipboard.writeText(textData).then(() => {
      showToast(\`\${selectedData.length} data berhasil dicopy!\`, 'success');
    });
  };

  const handlePrintSelected = () => {
    if (selectedProductIds.size === 0) return;
    const selectedData = stokData.filter(item => selectedProductIds.has(item.id));

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(\`
        <html>
          <head>
            <title>Print Data Barang Terpilih</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; text-transform: uppercase; font-size: 12px; }
              th { background-color: #f4f4f4; }
              h2 { text-align: center; text-transform: uppercase; }
            </style>
          </head>
          <body>
            <h2>Data Barang Terpilih (\${selectedData.length} Item)</h2>
            <table>
              <thead>
                <tr>
                  <th>No</th>
                  <th>Nama Produk</th>
                  <th>Rak</th>
                  <th>Packing</th>
                  <th>Qty Sistem</th>
                  <th>Qty Fisik (Kosong)</th>
                </tr>
              </thead>
              <tbody>
                \${selectedData.map((item, index) => \`
                  <tr>
                    <td>\${index + 1}</td>
                    <td>\${item.nama_produk}</td>
                    <td>\${item.rak || '-'}</td>
                    <td>\${item.packing || '-'}</td>
                    <td>\${item.qty} \${item.satuan || ''}</td>
                    <td></td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
            <script>
              window.onload = () => { window.print(); window.close(); }
            </script>
          </body>
        </html>
      \`);
      printWindow.document.close();
    }
  };

  const openSoModal = () => {
    setSoInputData({});
    setShowSoModal(true);
  };

  const handleProcessSO = async () => {
    const selectedItemsList = stokData.filter(i => selectedProductIds.has(i.id));
    
    setIsProcessingSo(true);
    try {
      const now = new Date();
      // YYYY-MM
      const yearMonth = \`\${now.getFullYear()}-\${String(now.getMonth() + 1).padStart(2, '0')}\`;
      // YYYY-MM-DD
      const dateKey = \`\${now.getFullYear()}-\${String(now.getMonth() + 1).padStart(2, '0')}-\${String(now.getDate()).padStart(2, '0')}\`;
      
      const batch = [];
      let processCount = 0;

      for (const item of selectedItemsList) {
        const qtyInputStr = soInputData[item.id];
        if (qtyInputStr === undefined || qtyInputStr.trim() === '') continue; // Skip if empty
        
        const stokAktual = parseInt(qtyInputStr, 10);
        if (isNaN(stokAktual) || stokAktual < 0) continue; // Skip invalid
        
        const stokDocId = item.id;
        
        // Push update query to supabase (stok_lantai3 is the table)
        const { error } = await supabase
          .from('stok_lantai3')
          .update({
            qty: stokAktual,
            qty_lama_terpakai: 0,
            sudah_so: true,
            updated_at: now.toISOString()
          })
          .eq('id', stokDocId);

        if (error) throw error;

        // Note: For simplicity we aren't writing to transaksi_lantai3_monthly directly here as we do not have all logic, 
        // but we just update stok_lantai3 since this is what user requested.
        
        processCount++;
      }

      if (processCount > 0) {
        showToast(\`Berhasil memproses Stock Opname untuk \${processCount} barang\`, 'success');
      } else {
        showToast('Tidak ada qty fisik valid yang dimasukkan', 'info');
      }

      setShowSoModal(false);
      setSelectedProductIds(new Set());
      loadStokData(false);
    } catch (error: any) {
      console.error('Error processing SO:', error);
      showToast('Gagal memproses Stock Opname', 'error');
    } finally {
      setIsProcessingSo(false);
    }
  };
`;

code = code.replace(
  '  const handleImportSubmit = async () => {',
  handlersInjection + '\n  const handleImportSubmit = async () => {'
);

// 5. Add action bar
const actionBarInjection = `
          {selectedProductIds.size > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-6 flex flex-wrap items-center justify-between gap-4 shadow-sm animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center text-blue-800 font-medium px-2">
                <CheckSquare className="h-5 w-5 mr-2 text-blue-600" />
                {selectedProductIds.size} produk terpilih
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCopySelected} className="bg-white hover:bg-blue-100 text-blue-700 border border-blue-300 shadow-sm">
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Data
                </Button>
                <Button onClick={handlePrintSelected} className="bg-white hover:bg-blue-100 text-blue-700 border border-blue-300 shadow-sm">
                  <Printer className="h-4 w-4 mr-2" />
                  Print Data
                </Button>
                {userRole?.toLowerCase().includes('admin') && (
                  <Button onClick={openSoModal} className="bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-200">
                    <ClipboardList className="h-4 w-4 mr-2" />
                    Stock Opname
                  </Button>
                )}
                <Button onClick={() => setSelectedProductIds(new Set())} variant="secondary" className="bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 shadow-sm">
                  <X className="h-4 w-4 mr-1" />
                  Batal
                </Button>
              </div>
            </div>
          )}
`;

// Also we need to import icons
if (!code.includes('CheckSquare')) {
  code = code.replace(
    'import { Building, Download',
    'import { CheckSquare, Copy, Printer, ClipboardList, Building, Download'
  );
}

code = code.replace(
  '{filteredStok.length === 0 && !loading ? (',
  actionBarInjection + '\n          {filteredStok.length === 0 && !loading ? ('
);

// 6. Add checkbox column
const theadInjection = `<th className="px-4 py-3 w-10">
                        <div className="flex items-center justify-center">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            checked={paginatedStok.length > 0 && paginatedStok.every(item => selectedProductIds.has(item.id))}
                            onChange={(e) => {
                              if (e.target.checked) {
                                const newSet = new Set(selectedProductIds);
                                paginatedStok.forEach(item => newSet.add(item.id));
                                setSelectedProductIds(newSet);
                              } else {
                                const newSet = new Set(selectedProductIds);
                                paginatedStok.forEach(item => newSet.delete(item.id));
                                setSelectedProductIds(newSet);
                              }
                            }}
                          />
                        </div>
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">`;

code = code.replace(
  '<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">',
  theadInjection
);

const tbodyOriginal = `                    {paginatedStok.map((item, index) => (
                      <tr key={item.id} className="hover:bg-gray-50">`;

const tbodyInjection = `                    {paginatedStok.map((item, index) => {
                      const isSelected = selectedProductIds.has(item.id);
                      return (
                      <tr key={item.id} className={\`hover:bg-gray-50 \${isSelected ? 'bg-blue-50' : ''}\`}>
                        <td className="px-4 py-3 w-10">
                          <div className="flex items-center justify-center">
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              checked={isSelected}
                              onChange={() => {
                                const newSet = new Set(selectedProductIds);
                                if (newSet.has(item.id)) newSet.delete(item.id);
                                else newSet.add(item.id);
                                setSelectedProductIds(newSet);
                              }}
                            />
                          </div>
                        </td>`;

code = code.replace(tbodyOriginal, tbodyInjection);

// Close map
code = code.replace(
  '                      </tr>\n                    ))}',
  '                      </tr>\n                    );\n                    })}'
);

// 7. Render Stock Opname Modal
const modalInjection = `
      {/* Stock Opname Modal */}
      <Modal
        isOpen={showSoModal}
        onClose={() => {
          if (!isProcessingSo) setShowSoModal(false);
        }}
        title="Proses Stock Opname"
        size="4xl"
      >
        <div className="space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-4 rounded-lg">
            <h4 className="font-medium flex items-center mb-1">
              <ClipboardList className="h-5 w-5 mr-2" />
              Konfirmasi Stock Opname
            </h4>
            <p className="text-sm">
              Anda akan memproses Stock Opname untuk {selectedProductIds.size} produk. Masukkan qty fisik aktual untuk memperbarui stok. Produk tanpa input qty akan diabaikan.
            </p>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama Produk</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rak</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Qty Sistem</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-48">Qty Aktual (Fisik)</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {stokData.filter(item => selectedProductIds.has(item.id)).map(item => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 text-sm font-medium">{item.nama_produk}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{item.rak || '-'} {item.sub_rak ? \`> \${item.sub_rak}\` : ''}</td>
                    <td className="px-4 py-3 text-sm">{item.qty} {item.satuan}</td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="0"
                        placeholder="Qty Fisik..."
                        className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                        value={soInputData[item.id] || ''}
                        onChange={(e) => setSoInputData({...soInputData, [item.id]: e.target.value})}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end pt-4 border-t gap-3 mt-4">
            <Button
              variant="secondary"
              onClick={() => setShowSoModal(false)}
              disabled={isProcessingSo}
            >
              Batal
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleProcessSO}
              disabled={isProcessingSo || Object.keys(soInputData).length === 0}
            >
              {isProcessingSo ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Memproses...
                </>
              ) : (
                'Proses SO Sekarang'
              )}
            </Button>
          </div>
        </div>
      </Modal>
`;

code = code.replace(
  '    </div>\n  );\n}\n',
  modalInjection + '    </div>\n  );\n}\n'
);

fs.writeFileSync('src/components/StokLantai3.tsx', code);
console.log('SO injected successfully!');
