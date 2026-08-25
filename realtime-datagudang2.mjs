import fs from 'fs';

const filePath = 'src/components/DataGudang.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add onSnapshot to imports if missing
if (!content.includes('onSnapshot')) {
  content = content.replace(
    "import { supabase, fetchAllStockItems } from '../lib/supabase';",
    "import { supabase, fetchAllStockItems } from '../lib/supabase';\nimport { collection, onSnapshot, query, where } from 'firebase/firestore';\nimport { db } from '../lib/firebase';"
  );
}

// 2. Add real-time listener useEffect
const listenerCode = `
  // Real-time listener untuk Master Barang (stock_items)
  useEffect(() => {
    if (readMode !== 'firebase') return;
    
    const unsub = onSnapshot(collection(db, 'stock_items'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as StockReport[];
      // Hanya update jika ada perubahan jumlah data atau perubahan signifikan agar tidak infinite loop
      allStockItemsRef.current = data;
      // Memicu re-render data saat ini
      setSearchTerm(prev => prev); 
    });
    return () => unsub();
  }, [readMode]);
`;

content = content.replace(
  '// Load initial data dan setup\n  useEffect(() => {',
  listenerCode + '\n  // Load initial data dan setup\n  useEffect(() => {'
);

// 3. Make refreshData faster (just visual, since realtime handles it)
const oldRefresh = `  const refreshData = useCallback(() => {\n    setLogCache(new Map()); // Clear cache\n    // Reset filter\n    clearSearch();\n    clearRackFilter();\n    // Reload data\n    loadStockData(true);\n    loadUniqueRacks();\n  }, [clearSearch, clearRackFilter]);`;
const newRefresh = `  const refreshData = useCallback(() => {\n    setLogCache(new Map()); // Clear cache\n    // Reset filter\n    clearSearch();\n    clearRackFilter();\n    // Jika mode firebase, data sudah realtime, cukup pancing render ulang.\n    // Jika supabase, paksa ambil data lagi.\n    if (readMode === 'firebase') {\n      loadStockData(false);\n    } else {\n      loadStockData(true);\n    }\n    loadUniqueRacks();\n    showToast('Sinkronisasi selesai', 'success');\n  }, [clearSearch, clearRackFilter, readMode]);`;

content = content.replace(oldRefresh, newRefresh);

fs.writeFileSync(filePath, content);
console.log('Script 2 applied!');
