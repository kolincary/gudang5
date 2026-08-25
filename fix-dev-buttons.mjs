import fs from 'fs';

const filePath = 'src/components/StokLantai3.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Insert handleDeleteTargetData below handleDeleteAll
const newFunction = `  const handleDeleteTargetData = async (targetTab: 'lantai3' | 'bundling') => {\n    const colName = targetTab === 'lantai3' ? 'Lantai 3' : 'Bundling';\n    if (!confirm(\`HAPUS SEMUA DATA (STOK & TRANSAKSI) KHUSUS \${colName.toUpperCase()}? Aksi ini tidak dapat dibatalkan.\`)) return;\n    \n    try {\n      setLoading(true);\n      const targetStokCol = targetTab === 'lantai3' ? 'stok_lantai3' : 'stok_bundling';\n      const targetTrxCol = targetTab === 'lantai3' ? 'transaksi_lantai3' : 'transaksi_bundling';\n      \n      const stokSnap = await getDocs(collection(db, targetStokCol));\n      if (!stokSnap.empty) {\n        const batchSize = 50;\n        for (let i = 0; i < stokSnap.docs.length; i += batchSize) {\n          const chunk = stokSnap.docs.slice(i, i + batchSize);\n          const batch = writeBatch(db);\n          chunk.forEach(d => batch.delete(d.ref));\n          await batch.commit();\n        }\n      }\n\n      const trxSnap = await getDocs(collection(db, targetTrxCol));\n      if (!trxSnap.empty) {\n        const batchSize = 50;\n        for (let i = 0; i < trxSnap.docs.length; i += batchSize) {\n          const chunk = trxSnap.docs.slice(i, i + batchSize);\n          const batch = writeBatch(db);\n          chunk.forEach(d => batch.delete(d.ref));\n          await batch.commit();\n        }\n      }\n      \n      showToast(\`Semua data \${colName} berhasil dihapus!\`, 'success');\n      if (activeTab === targetTab) {\n        loadStokData(true);\n        loadTransaksiData();\n      }\n    } catch (error: any) {\n      console.error('Error deleting data:', error);
      showToast(\`Gagal menghapus data: \${error.message}\`, 'error');\n    } finally {\n      setLoading(false);\n    }\n  };`;

content = content.replace(
  /  const handleDeleteAll = async \(\) => {[\s\S]*?  };/,
  newFunction
);

// 2. Replace the Dev button in the UI
const oldDevButton = `              {isDevMode && (\n                <Button\n                  onClick={handleDeleteTransaksiOnly}\n                  className="h-12 px-6 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-2xl shadow-[0_8px_25px_rgba(225,29,72,0.35)] transition-all active:scale-95 flex items-center justify-center gap-2.5 border border-rose-400/50"\n                >\n                  <Trash2 className="h-4 w-4" />\n                  <span className="uppercase text-xs font-black">Hapus Transaksi (Dev)</span>\n                </Button>\n              )}`;

const newDevButtons = `              {isDevMode && (\n                <>\n                  <Button\n                    onClick={() => handleDeleteTargetData('lantai3')}\n                    className="h-12 px-4 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl shadow-[0_4px_15px_rgba(225,29,72,0.35)] transition-all active:scale-95 flex items-center justify-center gap-2 border border-rose-400/50"\n                  >\n                    <Trash2 className="h-4 w-4" />\n                    <span className="uppercase text-[10px] font-black">Hapus Lt 3 (Dev)</span>\n                  </Button>\n                  <Button\n                    onClick={() => handleDeleteTargetData('bundling')}\n                    className="h-12 px-4 bg-indigo-800 hover:bg-indigo-900 text-white font-black rounded-xl shadow-[0_4px_15px_rgba(55,48,163,0.35)] transition-all active:scale-95 flex items-center justify-center gap-2 border border-indigo-500/50"\n                  >\n                    <Trash2 className="h-4 w-4" />\n                    <span className="uppercase text-[10px] font-black">Hapus Bundling (Dev)</span>\n                  </Button>\n                </>\n              )}`;

content = content.replace(oldDevButton, newDevButtons);

fs.writeFileSync(filePath, content);
console.log('Dev buttons replaced!');
