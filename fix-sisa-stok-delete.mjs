import fs from 'fs';

const filePath = 'src/components/StokLantai3.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Fix loadTransaksiData
content = content.replace(
  /id: \`\$\{docSnap\.id\}_\$\{dateKey\}_sisa_stok\`,\s*doc_id: docSnap\.id,\s*out_key: 'in',/g,
  "id: `${docSnap.id}_${dateKey}_sisa_stok`,\n                doc_id: docSnap.id,\n                out_key: 'sisa_stok',"
);

// Fix item history modal rendering for sisa_stok
const itemHistoryModalTarget = `                        {item.tipe === 'pembelian_customer' && (\n                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800">Pembelian</span>\n                        )}`;
const itemHistoryModalReplacement = `                        {item.tipe === 'sisa_stok' && (\n                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-teal-100 text-teal-800">Sisa Stok Awal</span>\n                        )}\n                        {item.tipe === 'pembelian_customer' && (\n                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800">Pembelian</span>\n                        )}`;

content = content.replace(itemHistoryModalTarget, itemHistoryModalReplacement);

fs.writeFileSync(filePath, content);
console.log('Fixed sisa_stok out_key and item history modal!');
