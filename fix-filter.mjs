import fs from 'fs';

const filePath = 'src/components/StokLantai3.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const functionsToAdd = `  const openFilterPopup = (column: FilterableColumn) => {
    setShowFilterPopup(column);
  };

  const closeFilterPopup = () => {
    setShowFilterPopup(null);
  };

`;

if (!content.includes('const openFilterPopup')) {
  content = content.replace(
    '  // Pindahkan toggleFilter ke sini agar memiliki scope ke filters',
    functionsToAdd + '  // Pindahkan toggleFilter ke sini agar memiliki scope ke filters'
  );
  fs.writeFileSync(filePath, content);
  console.log('Fixed filter buttons');
} else {
  console.log('Functions already exist');
}
