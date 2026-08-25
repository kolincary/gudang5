import fs from 'fs';

const filePath = 'src/components/master-data/DataSKU.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add states
if (!content.includes('showPasteInput')) {
  content = content.replace(
    '  const [addSkuRows, setAddSkuRows] = useState<AddSkuRow[]>([]);',
    '  const [addSkuRows, setAddSkuRows] = useState<AddSkuRow[]>([]);\n  const [showPasteInput, setShowPasteInput] = useState(false);\n  const [pasteContent, setPasteContent] = useState("");'
  );
}

// 2. Add handleProcessPaste function
const processPasteCode = `
  const handleProcessPaste = () => {
    const lines = pasteContent.split(/\\r?\\n/).map(line => line.trim()).filter(line => line);
    if (lines.length === 0) {
      showToast('Tidak ada data valid untuk diproses', 'warning');
      return;
    }

    let nextIdNumber = addSkuRows.length > 0
      ? (parseInt(addSkuRows[addSkuRows.length - 1].id_barang) || 0) + 1
      : lastId + 1;

    const newRows = lines.map((line, index) => ({
      id: Date.now() + index,
      id_barang: String(nextIdNumber + index),
      nama: line,
      satuan: 'PCS',
      status: 'Aktif'
    }));

    // Remove empty initial rows if they haven't been touched
    const existingValidRows = addSkuRows.filter(row => row.nama.trim() !== '');

    if (existingValidRows.length === 0) {
      // Replace entirely if it was just empty templates
      setAddSkuRows(newRows as AddSkuRow[]);
    } else {
      // Append
      setAddSkuRows([...existingValidRows, ...newRows] as AddSkuRow[]);
    }

    setPasteContent('');
    setShowPasteInput(false);
    showToast("Berhasil memproses " + lines.length + " SKU!", 'success');
  };
`;

if (!content.includes('handleProcessPaste')) {
  content = content.replace(
    '  const handleAddRow = () => {',
    processPasteCode + '\n  const handleAddRow = () => {'
  );
}

// 3. Add UI
const newUiCode = `
                <Button
                  type="button"
                  onClick={() => setShowPasteInput(!showPasteInput)}
                  className="px-4 h-10 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 font-bold rounded-xl border border-indigo-500/20 backdrop-blur-md transition-all active:scale-95 flex items-center justify-center ml-3"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Paste Data Sekaligus
                </Button>`

if (!content.includes('Paste Data Sekaligus')) {
  content = content.replace(
    '<PlusCircle className="h-4 w-4 mr-2" />\n                  Tambah Baris\n                </Button>',
    '<PlusCircle className="h-4 w-4 mr-2" />\n                  Tambah Baris\n                </Button>' + newUiCode
  );
}

// 4. Add paste area UI
const pasteAreaCode = `
              {showPasteInput && (
                <div className="mt-4 p-4 bg-indigo-50 border border-indigo-100 rounded-xl space-y-3">
                  <label className="block text-sm font-medium text-indigo-800">
                    Paste data nama produk vertikal (dari Excel/Spreadsheet):
                  </label>
                  <textarea
                    value={pasteContent}
                    onChange={(e) => setPasteContent(e.target.value)}
                    placeholder="Contoh:\nProduk A\nProduk B\nProduk C"
                    className="w-full h-32 p-3 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white resize-y"
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={handleProcessPaste}
                      className="px-6 h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md transition-all active:scale-95 flex items-center justify-center"
                    >
                      Proses Data
                    </Button>
                  </div>
                </div>
              )}`

if (!content.includes('Paste data nama produk vertikal')) {
  content = content.replace(
    '</table>\n              </div>',
    '</table>\n              </div>' + pasteAreaCode
  );
}

fs.writeFileSync(filePath, content);
console.log('Paste feature added successfully');
