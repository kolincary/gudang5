import fs from 'fs';

const filePath = 'src/components/StokLantai3.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Add onSnapshot to imports
content = content.replace(
  /getDocs, (\w+, )*query/,
  'getDocs, onSnapshot, query'
);
if (!content.includes('onSnapshot')) {
  content = content.replace('getDocs', 'getDocs, onSnapshot');
}

const oldUseEffect = `  useEffect(() => {\n    loadActiveProducts();\n    loadActivePackingData();\n    loadStokData();\n    loadTransaksiData();\n  }, [activeTab]);`;

const newUseEffect = `  useEffect(() => {\n    loadActiveProducts();\n    loadActivePackingData();\n  }, []);\n\n  useEffect(() => {\n    setLoading(true);\n    const unsubStok = onSnapshot(collection(db, STOK_COL), (snapshot) => {\n      const allData: StokLantai3Item[] = snapshot.docs.map(docSnap => {\n        const data = docSnap.data();\n        return {\n          id: docSnap.id,\n          nama_produk: data.nama_produk || '',\n          qty: data.qty || 0,\n          qty_lama_terpakai: data.qty_lama_terpakai || 0,\n          sudah_so: data.sudah_so || false,\n          satuan: data.satuan || '',\n          packing: data.packing || '',\n          rak: data.rak || '',\n          sub_rak: data.sub_rak || '',\n          created_at: data.created_at || '',\n          updated_at: data.updated_at || ''\n        };\n      });\n      allData.sort((a, b) => a.nama_produk.localeCompare(b.nama_produk));\n      setStokData(allData);\n      setLoading(false);\n    }, (error) => {\n      console.error('Error loading stok realtime:', error);\n      setLoading(false);\n    });\n\n    const unsubTrx = onSnapshot(collection(db, TRX_COL), (snapshot) => {\n      const formattedData: TransaksiLantai3[] = [];\n      snapshot.docs.forEach(docSnap => {\n        const data = docSnap.data();\n        if (data.harian) {\n          Object.keys(data.harian).forEach(dateKey => {\n            const dayData = data.harian[dateKey];\n            if (dayData.in && dayData.in > 0) {\n              formattedData.push({\n                id: \`\${docSnap.id}_\${dateKey}_in\`,\n                doc_id: docSnap.id,\n                out_key: 'in',\n                nama_produk: data.nama_produk || '',\n                qty: dayData.in,\n                tipe: 'transfer_masuk',\n                gudang: GUDANG_LABEL,\n                rak: '',\n                sub_rak: '',\n                keterangan: 'Masuk dari Gudang Utama',\n                tanggal: dateKey,\n                waktu: '',\n                user_name: '',\n                created_at: data.created_at || ''\n              });\n            }\n            if (dayData.retur && dayData.retur > 0) {\n              formattedData.push({\n                id: \`\${docSnap.id}_\${dateKey}_retur\`,\n                doc_id: docSnap.id,\n                out_key: 'retur',\n                nama_produk: data.nama_produk || '',\n                qty: dayData.retur,\n                tipe: 'retur',\n                gudang: GUDANG_LABEL,\n                rak: '',\n                sub_rak: '',\n                keterangan: 'Retur Customer',\n                tanggal: dateKey,\n                waktu: '',\n                user_name: '',\n                created_at: data.created_at || ''\n              });\n            }\n            if (dayData.sisa_stok) {\n              formattedData.push({\n                id: \`\${docSnap.id}_\${dateKey}_sisa_stok\`,\n                doc_id: docSnap.id,\n                out_key: 'sisa_stok',\n                nama_produk: data.nama_produk || '',\n                qty: dayData.sisa_stok,\n                tipe: 'sisa_stok',\n                gudang: GUDANG_LABEL,\n                rak: '',\n                sub_rak: '',\n                keterangan: 'Sisa Stok Awal',\n                tanggal: dateKey,\n                waktu: '',\n                user_name: '',\n                created_at: data.created_at || ''\n              });\n            }\n          });\n        }\n        if (data.pembelian) {\n          Object.keys(data.pembelian).forEach(orderId => {\n            const qtyOut = data.pembelian[orderId];\n            if (qtyOut > 0) {\n              formattedData.push({\n                id: \`\${docSnap.id}_\${orderId}\`,\n                doc_id: docSnap.id,\n                out_key: orderId,\n                nama_produk: data.nama_produk || '',\n                qty: -qtyOut,\n                tipe: 'pembelian',\n                gudang: '',\n                rak: '',\n                sub_rak: '',\n                keterangan: 'Order Keluar',\n                tanggal: docSnap.id,\n                waktu: '',\n                user_name: '',\n                created_at: data.created_at || ''\n              });\n            }\n          });\n        }\n      });\n      formattedData.sort((a, b) => {\n        const dateCompare = b.tanggal.localeCompare(a.tanggal);\n        if (dateCompare !== 0) return dateCompare;\n        return (b.waktu || '00:00:00').localeCompare(a.waktu || '00:00:00');\n      });\n      setTransaksiData(formattedData);\n    }, (error) => {\n      console.error('Error loading transaksi realtime:', error);\n    });\n\n    return () => {\n      unsubStok();\n      unsubTrx();\n    };\n  }, [activeTab]);`;

content = content.replace(oldUseEffect, newUseEffect);

// Remove the old loadStokData and loadTransaksiData completely to avoid errors, and replace calls to them.
// It's safer to just provide empty dummy functions so we don't have to chase down every single call.
const dummyFunctions = `  const loadStokData = async (showLoadingState = true) => { /* Auto handled by onSnapshot */ };\n  const loadTransaksiData = async () => { /* Auto handled by onSnapshot */ };`;

content = content.replace(/  const loadStokData = async[\s\S]*?showToast\('Gagal memuat data stok', 'error'\);\n    } finally {\n      if \(showLoadingState\) {\n        setLoading\(false\);\n      }\n    }\n  };/, '');
content = content.replace(/  const loadTransaksiData = async \(\) => {[\s\S]*?setTransaksiData\(formattedData\);\n    } catch \(error\) {\n      console.error\('Error loading transaksi data:', error\);\n    }\n  };/, dummyFunctions);

// Update handleRefresh to just simulate delay
const oldRefresh = /  const handleRefresh = async \(\) => {[\s\S]*?setIsRefreshing\(false\);\n    }\n  };/;
const newRefresh = `  const handleRefresh = async () => {\n    setIsRefreshing(true);\n    try {\n      await new Promise(resolve => setTimeout(resolve, 500));\n      showToast('Data sudah tersinkronisasi realtime', 'success');\n    } finally {\n      setIsRefreshing(false);\n    }\n  };`;

content = content.replace(oldRefresh, newRefresh);

fs.writeFileSync(filePath, content);
console.log('Realtime refactor applied!');
