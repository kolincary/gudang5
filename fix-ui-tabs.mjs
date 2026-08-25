import fs from 'fs';

const filePath = 'src/components/StokLantai3.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const uiTarget = `  return (\n    <div className="space-y-6">\n      {/* PREMIUM IMMERSIVE HEADER (310px) */}`;

const uiReplacement = `  return (\n    <div className="space-y-6">\n\n      {/* TAB NAVIGATION */}\n      <div className="flex space-x-4 mb-2">\n        <button \n          onClick={() => setActiveTab('lantai3')}\n          className={\`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all duration-200 shadow-sm border-b-4 \n            \${activeTab === 'lantai3' \n              ? 'bg-blue-600 text-white border-blue-800 scale-100' \n              : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:text-gray-700 opacity-70 scale-95'\n            }\`}\n        >\n          STOK LANTAI 3\n        </button>\n        <button \n          onClick={() => setActiveTab('bundling')}\n          className={\`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all duration-200 shadow-sm border-b-4 \n            \${activeTab === 'bundling' \n              ? 'bg-indigo-700 text-white border-indigo-900 scale-100' \n              : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:text-gray-700 opacity-70 scale-95'\n            }\`}\n        >\n          STOK BUNDLING\n        </button>\n      </div>\n\n      {/* PREMIUM IMMERSIVE HEADER (310px) */}`;

content = content.replace(uiTarget, uiReplacement);

// Now fix the header title from hardcoded to dynamic
const titleTarget = `STOK <span className="text-blue-200">LANTAI 3</span>`;
const titleReplacement = `STOK <span className={\`text-\${THEME}-200\`}>{activeTab === 'lantai3' ? 'LANTAI 3' : 'BUNDLING'}</span>`;
content = content.replace(titleTarget, titleReplacement);

// Also fix the gradient background
const gradientTarget = `className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800`;
const gradientReplacement = `className={\`bg-gradient-to-br transition-all duration-500 \${activeTab === 'lantai3' ? 'from-blue-600 via-blue-700 to-indigo-800' : 'from-indigo-700 via-indigo-800 to-slate-900'}`;
content = content.replace(gradientTarget, gradientReplacement);

fs.writeFileSync(filePath, content);
console.log('UI Tabs Injected!');
