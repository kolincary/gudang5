import fs from 'fs';

const filePath = 'src/components/StokLantai3.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const tabNavStr = `      {/* TAB NAVIGATION */}\n      <div className="flex space-x-4 mb-2">\n        <button \n          onClick={() => setActiveTab('lantai3')}\n          className={\`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all duration-200 shadow-sm border-b-4 \n            \${activeTab === 'lantai3' \n              ? 'bg-blue-600 text-white border-blue-800 scale-100' \n              : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:text-gray-700 opacity-70 scale-95'\n            }\`}\n        >\n          STOK LANTAI 3\n        </button>\n        <button \n          onClick={() => setActiveTab('bundling')}\n          className={\`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all duration-200 shadow-sm border-b-4 \n            \${activeTab === 'bundling' \n              ? 'bg-indigo-700 text-white border-indigo-900 scale-100' \n              : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:text-gray-700 opacity-70 scale-95'\n            }\`}\n        >\n          STOK BUNDLING\n        </button>\n      </div>\n`;

// 1. Remove the tab navigation from the top
content = content.replace(tabNavStr, '');

// 2. Insert it right after the grid of summary cards
const insertionPoint = `      </div>\n\n      <Card>` // End of grid, before the search Card
const newInsertion = `      </div>\n\n${tabNavStr}\n      <Card>`;
content = content.replace(insertionPoint, newInsertion);

fs.writeFileSync(filePath, content);
console.log('Tabs moved successfully!');
