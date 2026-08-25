import fs from 'fs';

const filePath = 'src/components/StokLantai3.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const functionsToAdd = `  const openFilterPopup = (column: keyof typeof filters) => {
    setShowFilterPopup(column);
    setTempSelectedFilters(filters[column] || []);
    setFilterSearch('');
  };

  const closeFilterPopup = () => {
    setShowFilterPopup(null);
  };

  const toggleFilterValue = (value: string | number) => {
    const valStr = String(value);
    setTempSelectedFilters(prev => 
      prev.includes(valStr)
        ? prev.filter(v => v !== valStr)
        : [...prev, valStr]
    );
  };

  const applyFilter = () => {
    if (showFilterPopup) {
      setFilters(prev => ({
        ...prev,
        [showFilterPopup]: tempSelectedFilters
      }));
    }
    closeFilterPopup();
  };

`;

if (!content.includes('const openFilterPopup')) {
  content = content.replace(
    '  const hasActiveFilters = () => {',
    functionsToAdd + '  const hasActiveFilters = () => {'
  );
  fs.writeFileSync(filePath, content);
  console.log('Fixed all filter buttons');
} else {
  console.log('Functions already exist');
}
