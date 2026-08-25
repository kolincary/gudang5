import fs from 'fs';

const filePath = 'src/components/StokLantai3.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const functionsToAdd = `  const getFilteredOptions = () => {
    if (!showFilterPopup) return [];
    
    // Get unique values for the column
    const uniqueValues = Array.from(new Set(
      stokData.map(item => {
        if (showFilterPopup === 'status') return getStatus(item);
        const val = item[showFilterPopup as keyof StokLantai3Item];
        return val ? String(val) : '';
      })
    )).filter(Boolean).sort();

    if (!filterSearch) return uniqueValues;

    return uniqueValues.filter(val => 
      val.toLowerCase().includes(filterSearch.toLowerCase())
    );
  };

`;

if (!content.includes('const getFilteredOptions')) {
  content = content.replace(
    '  const applyFilter = () => {',
    functionsToAdd + '  const applyFilter = () => {'
  );
  fs.writeFileSync(filePath, content);
  console.log('Fixed getFilteredOptions');
} else {
  console.log('Function already exists');
}
