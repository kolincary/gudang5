import fs from 'fs';

const filePath = 'src/components/StokLantai3.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Inject states
const stateTarget = `export function StokLantai3() {\n  const [stokData, setStokData] = useState<StokLantai3Item[]>([]);`;
const stateReplacement = `export function StokLantai3() {\n  const [activeTab, setActiveTab] = useState<'lantai3' | 'bundling'>('lantai3');\n  const STOK_COL = activeTab === 'lantai3' ? 'stok_lantai3' : 'stok_bundling';\n  const TRX_COL = activeTab === 'lantai3' ? 'transaksi_lantai3' : 'transaksi_bundling';\n  const GUDANG_LABEL = activeTab === 'lantai3' ? 'Lantai 3' : 'Bundling';\n  const THEME = activeTab === 'lantai3' ? 'blue' : 'indigo';\n  const TITLE = activeTab === 'lantai3' ? 'STOK LANTAI 3' : 'STOK BUNDLING';\n  const [stokData, setStokData] = useState<StokLantai3Item[]>([]);`;
content = content.replace(stateTarget, stateReplacement);

// 2. Replace hardcoded collections with variables
// Since we declare STOK_COL and TRX_COL in the component, we can just replace the string literals globally inside the component body, but we have to be careful.
content = content.replace(/'stok_lantai3'/g, 'STOK_COL');
content = content.replace(/'transaksi_lantai3'/g, 'TRX_COL');

// 3. Fix GUDANG_LABEL inside loadTransaksiData
content = content.replace(/gudang: 'Lantai 3'/g, 'gudang: GUDANG_LABEL');

// 4. Update useEffect dependencies
content = content.replace(
  `  useEffect(() => {\n    loadActiveProducts();\n    loadActivePackingData();\n    loadStokData();\n    loadTransaksiData();\n  }, []);`,
  `  useEffect(() => {\n    loadActiveProducts();\n    loadActivePackingData();\n    loadStokData();\n    loadTransaksiData();\n  }, [activeTab]);`
);

// 5. Inject Tab Buttons in UI & change header title
const uiTarget = `return (\n    <div className="space-y-6">\n      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">\n        <div>\n          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">\n            <Building className="h-6 w-6 text-blue-600" />\n            STOK <span className="text-blue-200">LANTAI 3</span>\n          </h2>`;

const uiReplacement = `return (\n    <div className="space-y-6">\n      <div className="flex space-x-4 mb-2">\n        <button \n          onClick={() => setActiveTab('lantai3')}\n          className={\`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all duration-200 shadow-sm border-b-4 \n            \${activeTab === 'lantai3' \n              ? 'bg-blue-600 text-white border-blue-800 scale-100' \n              : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:text-gray-700 opacity-70 scale-95'\n            }\`}\n        >\n          STOK LANTAI 3\n        </button>\n        <button \n          onClick={() => setActiveTab('bundling')}\n          className={\`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all duration-200 shadow-sm border-b-4 \n            \${activeTab === 'bundling' \n              ? 'bg-indigo-700 text-white border-indigo-900 scale-100' \n              : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:text-gray-700 opacity-70 scale-95'\n            }\`}\n        >\n          STOK BUNDLING\n        </button>\n      </div>\n\n      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">\n        <div>\n          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">\n            <Building className={\`h-6 w-6 text-\${THEME}-600\`} />\n            STOK <span className={\`text-\${THEME}-200\`}>{activeTab === 'lantai3' ? 'LANTAI 3' : 'BUNDLING'}</span>\n          </h2>`;

content = content.replace(uiTarget, uiReplacement);

// 6. Dynamic styling for some elements to match theme
// Main background gradient:
content = content.replace('bg-gradient-to-r from-blue-600 to-blue-800', '`bg-gradient-to-r ${activeTab === \'lantai3\' ? \'from-blue-600 to-blue-800\' : \'from-indigo-700 to-indigo-900\'}`');
// Actually, let's just do a string replacement for className="bg-gradient-to-r from-blue-600 to-blue-800..."
content = content.replace(/className="bg-gradient-to-r from-blue-600 to-blue-800 ([^"]+)"/g, 'className={`bg-gradient-to-r ${activeTab === \'lantai3\' ? \'from-blue-600 to-blue-800\' : \'from-indigo-700 to-indigo-900\'} $1`}');

// 7. Update Sisa Stok Input Label dynamically
content = content.replace(
  /<option value="SISA_STOK">SISA STOK - Input Sisa Stok Awal Lantai 3 \(Stok Masuk\)<\/option>/g,
  `<option value="SISA_STOK">SISA STOK - Input Sisa Stok Awal {GUDANG_LABEL} (Stok Masuk)</option>`
);
content = content.replace(
  /Sisa Stok Awal Lantai 3/g,
  'Sisa Stok Awal ${GUDANG_LABEL}' // wait, inside typeConfig it's a string, so we'll use backticks
);
// Fix typeConfig to use GUDANG_LABEL properly
content = content.replace(
  /'SISA_STOK': { multiplier: 1, outKey: 'sisa_stok' as const, label: 'Sisa Stok Awal \$\{GUDANG_LABEL\}' }/g, 
  "'SISA_STOK': { multiplier: 1, outKey: 'sisa_stok' as const, label: `Sisa Stok Awal ${GUDANG_LABEL}` }"
);

fs.writeFileSync(filePath, content);
console.log('Tabs logic applied!');
