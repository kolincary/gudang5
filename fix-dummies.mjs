import fs from 'fs';
const filePath = 'src/components/StokLantai3.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Add dummy loadStokData right before loadTransaksiData if it doesn't exist
if (!content.includes('const loadStokData = async')) {
  content = content.replace(
    'const loadTransaksiData = async () => {',
    'const loadStokData = async (showLoadingState = true) => { /* handled by onSnapshot */ };\n\n  const loadTransaksiData = async () => {'
  );
}

fs.writeFileSync(filePath, content);
console.log('Fixed loadStokData reference error!');
