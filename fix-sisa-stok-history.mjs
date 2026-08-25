import fs from 'fs';

const filePath = 'src/components/StokLantai3.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add SISA_STOK to loadTransaksiData
const targetLoadTransaksi = `            if (dayData.out && dayData.out > 0) {\n              formattedData.push({\n                id: \`\${docSnap.id}_\${dateKey}_out\`,\n                doc_id: docSnap.id,\n                out_key: 'out',\n                nama_produk: data.nama_produk || '',\n                qty: -dayData.out,\n                tipe: 'pembelian_customer',\n                gudang: 'Lantai 3',\n                rak: '',\n                sub_rak: '',\n                keterangan: \`Order Keluar\`,\n                tanggal: dateKey,\n                waktu: '',\n                user_name: '',\n                created_at: data.created_at || ''\n              });\n            }\n          });`;

const newLoadTransaksi = `            if (dayData.out && dayData.out > 0) {\n              formattedData.push({\n                id: \`\${docSnap.id}_\${dateKey}_out\`,\n                doc_id: docSnap.id,\n                out_key: 'out',\n                nama_produk: data.nama_produk || '',\n                qty: -dayData.out,\n                tipe: 'pembelian_customer',\n                gudang: 'Lantai 3',\n                rak: '',\n                sub_rak: '',\n                keterangan: \`Order Keluar\`,\n                tanggal: dateKey,\n                waktu: '',\n                user_name: '',\n                created_at: data.created_at || ''\n              });\n            }\n            if (dayData.sisa_stok && dayData.sisa_stok > 0) {\n              formattedData.push({\n                id: \`\${docSnap.id}_\${dateKey}_sisa_stok\`,\n                doc_id: docSnap.id,\n                out_key: 'in',\n                nama_produk: data.nama_produk || '',\n                qty: dayData.sisa_stok,\n                tipe: 'sisa_stok',\n                gudang: 'Lantai 3',\n                rak: '',\n                sub_rak: '',\n                keterangan: \`Sisa Stok Awal\`,\n                tanggal: dateKey,\n                waktu: '',\n                user_name: '',\n                created_at: data.created_at || ''\n              });\n            }\n          });`;

content = content.replace(targetLoadTransaksi, newLoadTransaksi);

// 2. Add SISA_STOK to handleShowItemHistory
const targetShowHistory = `            if (dayData.out && dayData.out > 0) {\n              formattedData.push({\n                id: \`\${docSnap.id}_\${dateKey}_out\`,\n                nama_produk: data.nama_produk,\n                qty: -dayData.out,\n                tipe: 'pembelian_customer',\n                gudang: 'Lantai 3',\n                rak: '', sub_rak: '',\n                keterangan: \`Order Keluar\`,\n                tanggal: dateKey,\n                waktu: '', user_name: '',\n                created_at: data.created_at || ''\n              });\n            }\n          }\n        }\n      });`;

const newShowHistory = `            if (dayData.out && dayData.out > 0) {\n              formattedData.push({\n                id: \`\${docSnap.id}_\${dateKey}_out\`,\n                nama_produk: data.nama_produk,\n                qty: -dayData.out,\n                tipe: 'pembelian_customer',\n                gudang: 'Lantai 3',\n                rak: '', sub_rak: '',\n                keterangan: \`Order Keluar\`,\n                tanggal: dateKey,\n                waktu: '', user_name: '',\n                created_at: data.created_at || ''\n              });\n            }\n            if (dayData.sisa_stok && dayData.sisa_stok > 0) {\n              formattedData.push({\n                id: \`\${docSnap.id}_\${dateKey}_sisa_stok\`,\n                nama_produk: data.nama_produk,\n                qty: dayData.sisa_stok,\n                tipe: 'sisa_stok',\n                gudang: 'Lantai 3',\n                rak: '', sub_rak: '',\n                keterangan: \`Sisa Stok Awal\`,\n                tanggal: dateKey,\n                waktu: '', user_name: '',\n                created_at: data.created_at || ''\n              });\n            }\n          }\n        }\n      });`;

content = content.replace(targetShowHistory, newShowHistory);

// 3. Update handleImportData to reset qty_lama_terpakai to 0 on SISA_STOK
const targetImportLogic = `            if (isSisaStokTransaction) {\n              stokUpdateData.sudah_so = true;\n            }`;

const newImportLogic = `            if (isSisaStokTransaction) {\n              stokUpdateData.sudah_so = true;\n              stokUpdateData.qty_lama_terpakai = 0; // RESET stok lama karena sudah fisik pasti aktualnya.\n            }`;

content = content.replace(targetImportLogic, newImportLogic);

fs.writeFileSync(filePath, content);
console.log('Fixed missing history and reset logic!');
