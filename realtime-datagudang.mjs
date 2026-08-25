import fs from 'fs';

const filePath = 'src/components/DataGudang.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add sortConfig state
content = content.replace(
  'const [searchTerm, setSearchTerm] = useState(\'\');',
  'const [searchTerm, setSearchTerm] = useState(\'\');\n  const [sortConfig, setSortConfig] = useState<{ key: string, direction: \'asc\' | \'desc\' }>({ key: \'created_at\', direction: \'desc\' });'
);

// 2. Add Sort UI next to Search UI
const sortUI = `
              {/* Sort Dropdown */}
              <div className="lg:col-span-2">
                <select
                  value={sortConfig.key + '|' + sortConfig.direction}
                  onChange={(e) => {
                    const [key, direction] = e.target.value.split('|');
                    setSortConfig({ key, direction: direction as 'asc' | 'desc' });
                    setCurrentPage(1);
                  }}
                  className="w-full py-2.5 px-3 text-sm text-gray-800 bg-white rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all shadow-sm"
                >
                  <option value="created_at|desc">Terbaru Ditambahkan</option>
                  <option value="created_at|asc">Terlama Ditambahkan</option>
                  <option value="nama_produk|asc">Nama Produk (A-Z)</option>
                  <option value="nama_produk|desc">Nama Produk (Z-A)</option>
                </select>
              </div>
`;
content = content.replace(
  '{/* Filters */}',
  sortUI + '\n              {/* Filters */}'
);
// Fix the col-span of Search so it makes room for Sort UI
content = content.replace(
  '<div className="relative lg:col-span-5">',
  '<div className="relative lg:col-span-3">'
);

// 3. Rewrite loadStockData to handle sorting
const oldFilterLogic = `      // (Minus filter ditangani setelah hitung tersedia di bawah)\n\n      // 4. In-Memory Pagination`;
const newFilterLogic = `      // 3.5 In-Memory Sorting\n      allItems.sort((a, b) => {\n        if (sortConfig.key === 'nama_produk') {\n          const valA = (a.nama_produk || '').toLowerCase();\n          const valB = (b.nama_produk || '').toLowerCase();\n          if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;\n          if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;\n          return 0;\n        } else if (sortConfig.key === 'created_at') {\n          const dateA = new Date(a.created_at || 0).getTime();\n          const dateB = new Date(b.created_at || 0).getTime();\n          return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;\n        }\n        return 0;\n      });\n\n      // (Minus filter ditangani setelah hitung tersedia di bawah)\n\n      // 4. In-Memory Pagination`;

content = content.replace(oldFilterLogic, newFilterLogic);

// Add sortConfig to useEffect dependency
content = content.replace(
  'debouncedSearchTerm, debouncedRackFilter, currentPage, itemsPerPage, filters, snapshotFilter.enabled, showMinusOnly]',
  'debouncedSearchTerm, debouncedRackFilter, currentPage, itemsPerPage, filters, snapshotFilter.enabled, showMinusOnly, sortConfig]'
);

// Write changes
fs.writeFileSync(filePath, content);
console.log('Script applied!');
