import fs from 'fs';

const filePath = 'src/components/StokLantai3.tsx';
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(
  "const STOK_COL = activeTab === 'lantai3' ? STOK_COL : 'stok_bundling';",
  "const STOK_COL = activeTab === 'lantai3' ? 'stok_lantai3' : 'stok_bundling';"
);

content = content.replace(
  "const TRX_COL = activeTab === 'lantai3' ? TRX_COL : 'transaksi_bundling';",
  "const TRX_COL = activeTab === 'lantai3' ? 'transaksi_lantai3' : 'transaksi_bundling';"
);

fs.writeFileSync(filePath, content);
console.log('Fixed self-reference bug!');
