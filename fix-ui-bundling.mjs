import fs from 'fs';

const filePath = 'src/components/StokLantai3.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Fix Button text
content = content.replace(
  />\s*Import Order Keluar\s*<\/Button>/,
  `>{activeTab === 'lantai3' ? 'Import Order Keluar' : 'Import Stok Bundling'}</Button>`
);

// 2. Fix Modal titles
content = content.replace(
  /title="Riwayat Transaksi Lantai 3"/g,
  "title={`Riwayat Transaksi ${activeTab === 'lantai3' ? 'Lantai 3' : 'Bundling'}`}"
);

content = content.replace(
  /title={`Riwayat Transaksi - \$\{selectedItem\?\.nama_produk\}`}/g,
  "title={`Riwayat ${activeTab === 'lantai3' ? 'Lantai 3' : 'Bundling'} - ${selectedItem?.nama_produk}`}"
);

// 3. Improve Tab Buttons UI
const oldTabNav = `      {/* TAB NAVIGATION */}\n      <div className="flex space-x-4 mb-2">\n        <button \n          onClick={() => setActiveTab('lantai3')}\n          className={\`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all duration-200 shadow-sm border-b-4 \n            \${activeTab === 'lantai3' \n              ? 'bg-blue-600 text-white border-blue-800 scale-100' \n              : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:text-gray-700 opacity-70 scale-95'\n            }\`}\n        >\n          STOK LANTAI 3\n        </button>\n        <button \n          onClick={() => setActiveTab('bundling')}\n          className={\`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all duration-200 shadow-sm border-b-4 \n            \${activeTab === 'bundling' \n              ? 'bg-indigo-700 text-white border-indigo-900 scale-100' \n              : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:text-gray-700 opacity-70 scale-95'\n            }\`}\n        >\n          STOK BUNDLING\n        </button>\n      </div>`;

const newTabNav = `      {/* TAB NAVIGATION */}\n      <div className="flex space-x-4 mb-2 bg-gray-100/50 p-2 rounded-xl border border-gray-200/60">\n        <button \n          onClick={() => setActiveTab('lantai3')}\n          className={\`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all duration-300 shadow-sm border-b-4 flex items-center justify-center gap-2\n            \${activeTab === 'lantai3' \n              ? 'bg-blue-600 text-white border-blue-800 scale-100 ring-2 ring-blue-600/20' \n              : 'bg-white text-gray-600 border-gray-300 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 opacity-90 scale-[0.98]'\n            }\`}\n        >\n          <Package className="w-4 h-4" />\n          STOK LANTAI 3\n        </button>\n        <button \n          onClick={() => setActiveTab('bundling')}\n          className={\`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all duration-300 shadow-sm border-b-4 flex items-center justify-center gap-2\n            \${activeTab === 'bundling' \n              ? 'bg-indigo-700 text-white border-indigo-900 scale-100 ring-2 ring-indigo-700/20' \n              : 'bg-white text-gray-600 border-gray-300 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 opacity-90 scale-[0.98]'\n            }\`}\n        >\n          <Package className="w-4 h-4" />\n          STOK BUNDLING\n        </button>\n      </div>`;

content = content.replace(oldTabNav, newTabNav);

fs.writeFileSync(filePath, content);
console.log('UI Bundling fixes applied!');
