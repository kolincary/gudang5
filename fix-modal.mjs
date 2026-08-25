import fs from 'fs';

const filePath = 'src/components/StokLantai3.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Update instructions
content = content.replace(
  '<li>Pastikan nama produk sama persis dengan nama di tabel Stok Lantai 3</li>',
  '<li>Pastikan nama produk sama persis dengan nama di tabel Stok Lantai 3</li>\n              <li><strong className="text-blue-600">Data dengan nama produk/SKU yang sama akan otomatis di-subtotal (dijumlahkan) qty-nya saat diimpor.</strong></li>'
);

// Update date input
content = content.replace(
  '              onClick={(e) => {\n                const target = e.target as HTMLInputElement;\n                if (target.showPicker) target.showPicker();\n              }}\n              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"',
  '              onClick={(e) => {\n                const target = e.target as HTMLInputElement;\n                if (target.showPicker) target.showPicker();\n              }}\n              onKeyDown={(e) => e.preventDefault()}\n              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer select-none caret-transparent"'
);

fs.writeFileSync(filePath, content);
console.log('Fixed modal');
