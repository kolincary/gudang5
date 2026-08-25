import fs from 'fs';

const filePath = 'src/components/StokLantai3.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const functionsToAdd = `  const handleResetFilters = () => {
    setFilters({
      nama_produk: [],
      qty: [],
      satuan: [],
      packing: [],
      rak: [],
      sub_rak: [],
      status: [],
    });
    setTempSelectedFilters([]);
    setCurrentPage(1);
  };

`;

if (!content.includes('const handleResetFilters')) {
  content = content.replace(
    '  const applyFilter = () => {',
    functionsToAdd + '  const applyFilter = () => {'
  );
  fs.writeFileSync(filePath, content);
  console.log('Fixed handleResetFilters');
} else {
  console.log('Function already exists');
}
