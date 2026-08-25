import fs from 'fs';

const filePath = 'src/components/StokLantai3.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Refresh Button Styling
content = content.replace(
  `              <Button\n                onClick={handleRefresh}\n                disabled={isRefreshing}\n                className="h-12 px-6 bg-white/10 hover:bg-white/20 text-white font-black rounded-2xl backdrop-blur-md transition-all active:scale-95 flex items-center justify-center gap-2.5 border border-white/20"\n              >\n                <RefreshCw className={\`h-4 w-4 \${isRefreshing ? 'animate-spin' : ''}\`} />\n                <span className="uppercase text-xs font-black">\n                  {isRefreshing ? 'Refreshing...' : 'Refresh'}\n                </span>\n              </Button>`,
  `              <Button\n                onClick={handleRefresh}\n                disabled={isRefreshing}\n                className="h-14 px-8 bg-white/15 hover:bg-white/25 text-white font-black rounded-2xl shadow-xl transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center gap-3 border border-white/20 backdrop-blur-md"\n              >\n                <RefreshCw className={\`h-5 w-5 \${isRefreshing ? 'animate-spin' : 'text-white/80'}\`} />\n                REFRESH DATA\n              </Button>`
);

// 2. Stok Minus Calculation
content = content.replace(
  `const stokMinus = stokData.filter(item => item.qty < 0).length;`,
  `const stokMinus = stokData.filter(item => (item.qty - (item.qty_lama_terpakai || 0)) < 0).length;`
);

// 3. getStatus
content = content.replace(
  `  const getStatus = (qty: number): string => {\n    if (qty < 0) return 'minus';\n    if (qty === 0) return 'habis';\n    if (qty < 10) return 'low';\n    return 'tersedia';\n  };`,
  `  const getStatus = (item: StokLantai3Item): string => {\n    const aktual = item.qty - (item.qty_lama_terpakai || 0);\n    if (aktual < 0) return 'minus';\n    if (item.qty === 0 && aktual === 0) return 'habis';\n    if (aktual < 10) return 'low';\n    return 'tersedia';\n  };`
);

content = content.replace(
  `filters.status.includes(getStatus(item.qty))`,
  `filters.status.includes(getStatus(item))`
);
content = content.replace(
  `values.add(getStatus(item.qty));`,
  `values.add(getStatus(item));`
);

// 4. Status in Table Row
content = content.replace(
  `                      <td className="px-4 py-3 text-center">\n                        {item.qty < 0 ? (\n                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">Minus</span>\n                        ) : item.qty === 0 ? (\n                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">Habis</span>\n                        ) : item.qty < 10 ? (\n                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">Low</span>\n                        ) : (\n                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Tersedia</span>\n                        )}\n                      </td>`,
  `                      <td className="px-4 py-3 text-center">\n                        {(item.qty - (item.qty_lama_terpakai || 0)) < 0 ? (\n                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">Minus</span>\n                        ) : item.qty === 0 && (item.qty - (item.qty_lama_terpakai || 0)) === 0 ? (\n                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">Habis</span>\n                        ) : (item.qty - (item.qty_lama_terpakai || 0)) < 10 ? (\n                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">Low</span>\n                        ) : (\n                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Tersedia</span>\n                        )}\n                      </td>`
);

// 5. Hide Sub Rak (Headers)
content = content.replace(
  `const headers = ['Nama Produk', 'Qty', 'Satuan', 'Packing', 'Rak', 'Sub Rak'];`,
  `const headers = ['Nama Produk', 'Qty', 'Satuan', 'Packing', 'Rak'];`
);

content = content.replace(
  `                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">\n                      <div className="flex items-center justify-center">\n                        <span>Sub Rak</span>\n                        <button\n                          onClick={() => openFilterPopup('sub_rak')}\n                          className={\`ml-2 p-1 rounded hover:bg-gray-200 relative \${\n                            getActiveFilterCount('sub_rak') > 0 ? 'text-blue-600' : 'text-gray-400'\n                          }\`}\n                        >\n                          <Filter className="h-4 w-4" />\n                          {getActiveFilterCount('sub_rak') > 0 && (\n                            <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">\n                              {getActiveFilterCount('sub_rak')}\n                            </span>\n                          )}\n                        </button>\n                      </div>\n                    </th>\n`,
  ``
);

content = content.replace(
  `<td className="px-4 py-3 text-sm text-gray-600 text-center">{item.sub_rak}</td>\n`,
  ``
);

// 6. SISA_STOK transaction
content = content.replace(
  `        'TRANSFER_MASUK': { multiplier: 1, outKey: 'in' as const, label: 'Transfer Masuk' }`,
  `        'TRANSFER_MASUK': { multiplier: 1, outKey: 'in' as const, label: 'Transfer Masuk' },\n        'SISA_STOK': { multiplier: 1, outKey: 'sisa_stok' as const, label: 'Sisa Stok Awal Lantai 3' }`
);

content = content.replace(
  `  const [transactionType, setTransactionType] = useState<'ORDER' | 'OUTBOUND' | 'RETUR' | 'TRANSFER_MASUK' | ''>('');`,
  `  const [transactionType, setTransactionType] = useState<'ORDER' | 'OUTBOUND' | 'RETUR' | 'TRANSFER_MASUK' | 'SISA_STOK' | ''>('');`
);

content = content.replace(
  `onChange={(e) => setTransactionType(e.target.value as 'ORDER' | 'OUTBOUND' | 'RETUR' | 'TRANSFER_MASUK' | '')}`,
  `onChange={(e) => setTransactionType(e.target.value as 'ORDER' | 'OUTBOUND' | 'RETUR' | 'TRANSFER_MASUK' | 'SISA_STOK' | '')}`
);

content = content.replace(
  `<option value="RETUR">RETUR - Retur dari Customer (Stok Masuk)</option>`,
  `<option value="RETUR">RETUR - Retur dari Customer (Stok Masuk)</option>\n                <option value="SISA_STOK">SISA STOK - Input Sisa Stok Awal Lantai 3 (Stok Masuk)</option>`
);

content = content.replace(
  `{transactionType === 'RETUR' && '📥 Stok akan bertambah (retur dari customer yang ditolak/dikembalikan)'}`,
  `{transactionType === 'RETUR' && '📥 Stok akan bertambah (retur dari customer yang ditolak/dikembalikan)'}\n                {transactionType === 'SISA_STOK' && '📥 Stok akan bertambah (Input stok awal lantai 3 ke sistem)'}`
);

content = content.replace(
  `                        {item.tipe === 'retur' && (\n                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-800">Retur Customer</span>\n                        )}`,
  `                        {item.tipe === 'retur' && (\n                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-800">Retur Customer</span>\n                        )}\n                        {item.tipe === 'sisa_stok' && (\n                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-teal-100 text-teal-800">Sisa Stok Awal</span>\n                        )}`
);

content = content.replace(
  `<option value="retur">Retur Customer</option>`,
  `<option value="retur">Retur Customer</option>\n                <option value="sisa_stok">Sisa Stok Awal</option>`
);

// Don't forget loadTransaksiData mapping for sisa_stok
content = content.replace(
  `            if (dayData.retur && dayData.retur > 0) {\n              formattedData.push({
                id: \`\${docSnap.id}_\${dateKey}_retur\`,\n                doc_id: docSnap.id,\n                out_key: 'retur',\n                nama_produk: data.nama_produk || '',\n                qty: dayData.retur,\n                tipe: 'retur',\n                gudang: dayData.gudang || '',\n                rak: dayData.rak || '',\n                sub_rak: dayData.sub_rak || '',\n                keterangan: \`Retur Customer\`,\n                tanggal: dateKey,\n                waktu: '',\n                user_name: '',\n                created_at: ''\n              });\n            }`,
  `            if (dayData.retur && dayData.retur > 0) {\n              formattedData.push({
                id: \`\${docSnap.id}_\${dateKey}_retur\`,\n                doc_id: docSnap.id,\n                out_key: 'retur',\n                nama_produk: data.nama_produk || '',\n                qty: dayData.retur,\n                tipe: 'retur',\n                gudang: dayData.gudang || '',\n                rak: dayData.rak || '',\n                sub_rak: dayData.sub_rak || '',\n                keterangan: \`Retur Customer\`,\n                tanggal: dateKey,\n                waktu: '',\n                user_name: '',\n                created_at: ''\n              });\n            }\n            if (dayData.sisa_stok && dayData.sisa_stok > 0) {\n              formattedData.push({
                id: \`\${docSnap.id}_\${dateKey}_sisa_stok\`,\n                doc_id: docSnap.id,\n                out_key: 'sisa_stok',\n                nama_produk: data.nama_produk || '',\n                qty: dayData.sisa_stok,\n                tipe: 'sisa_stok',\n                gudang: dayData.gudang || '',\n                rak: dayData.rak || '',\n                sub_rak: dayData.sub_rak || '',\n                keterangan: \`Sisa Stok Awal Lantai 3\`,\n                tanggal: dateKey,\n                waktu: '',\n                user_name: '',\n                created_at: ''\n              });\n            }`
);

// also in handleShowItemHistory
content = content.replace(
  `            if (dayData.retur && dayData.retur > 0) {\n              history.push({
                id: \`\${docSnap.id}_\${dateKey}_retur\`,\n                doc_id: docSnap.id,\n                out_key: 'retur',\n                nama_produk: item.nama_produk,\n                qty: dayData.retur,\n                tipe: 'retur',\n                gudang: dayData.gudang || '',\n                rak: dayData.rak || '',\n                sub_rak: dayData.sub_rak || '',\n                keterangan: \`Retur Customer\`,\n                tanggal: dateKey,\n                waktu: '',\n                user_name: '',\n                created_at: ''\n              });\n            }`,
  `            if (dayData.retur && dayData.retur > 0) {\n              history.push({
                id: \`\${docSnap.id}_\${dateKey}_retur\`,\n                doc_id: docSnap.id,\n                out_key: 'retur',\n                nama_produk: item.nama_produk,\n                qty: dayData.retur,\n                tipe: 'retur',\n                gudang: dayData.gudang || '',\n                rak: dayData.rak || '',\n                sub_rak: dayData.sub_rak || '',\n                keterangan: \`Retur Customer\`,\n                tanggal: dateKey,\n                waktu: '',\n                user_name: '',\n                created_at: ''\n              });\n            }\n            if (dayData.sisa_stok && dayData.sisa_stok > 0) {\n              history.push({
                id: \`\${docSnap.id}_\${dateKey}_sisa_stok\`,\n                doc_id: docSnap.id,\n                out_key: 'sisa_stok',\n                nama_produk: item.nama_produk,\n                qty: dayData.sisa_stok,\n                tipe: 'sisa_stok',\n                gudang: dayData.gudang || '',\n                rak: dayData.rak || '',\n                sub_rak: dayData.sub_rak || '',\n                keterangan: \`Sisa Stok Awal Lantai 3\`,\n                tanggal: dateKey,\n                waktu: '',\n                user_name: '',\n                created_at: ''\n              });\n            }`
);

// Update history type TypeScript definition
content = content.replace(
  `tipe: 'transfer_masuk' | 'pembelian_customer' | 'adjustment';`,
  `tipe: 'transfer_masuk' | 'pembelian_customer' | 'adjustment' | 'retur' | 'sisa_stok';`
);

fs.writeFileSync(filePath, content);
console.log('Modifications applied successfully!');
