import fs from 'fs';

const filePath = 'src/components/StokLantai3.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Interface StokLantai3Item
content = content.replace(
  `  qty: number;\n  qty_lama_terpakai?: number;`,
  `  qty: number;\n  qty_lama_terpakai?: number;\n  sudah_so?: boolean;`
);

// 2. loadStokData
content = content.replace(
  `          qty_lama_terpakai: data.qty_lama_terpakai || 0,`,
  `          qty_lama_terpakai: data.qty_lama_terpakai || 0,\n          sudah_so: data.sudah_so || false,`
);

// 3. handleImportData Logic
const targetImportLogic = `          } else {\n            const currentQty = existingStok.qty || 0;\n            let currentQtyLamaTerpakai = existingStok.qty_lama_terpakai || 0;\n            \n            let newQty = currentQty;\n            \n            if (config.multiplier < 0) { // OUT\n              const deductAmount = item.qty;\n              if (currentQty >= deductAmount) {\n                newQty -= deductAmount;\n              } else {\n                newQty = 0;\n                const sisa = deductAmount - currentQty;\n                currentQtyLamaTerpakai += sisa;\n              }\n            } else { // IN (Retur)\n               newQty += item.qty;\n            }\n\n            batch.set(stokRef, {\n              qty: newQty,\n              qty_lama_terpakai: currentQtyLamaTerpakai,\n              updated_at: now.toISOString()\n            }, { merge: true });\n          }`;

const newImportLogic = `          } else {\n            const currentQty = existingStok.qty || 0;\n            let currentQtyLamaTerpakai = existingStok.qty_lama_terpakai || 0;\n            const isSisaStokTransaction = transactionType === 'SISA_STOK';\n            const sudahSo = existingStok.sudah_so || isSisaStokTransaction;\n            \n            let newQty = currentQty;\n            \n            if (config.multiplier < 0) { // OUT\n              const deductAmount = item.qty;\n              if (sudahSo) {\n                // Jika sudah SO, kita bypass fallback ke nol.\n                // Biarkan stok menjadi minus dan qty_lama_terpakai tidak disentuh.\n                newQty -= deductAmount;\n              } else {\n                if (currentQty >= deductAmount) {\n                  newQty -= deductAmount;\n                } else {\n                  newQty = 0;\n                  const sisa = deductAmount - currentQty;\n                  currentQtyLamaTerpakai += sisa;\n                }\n              }\n            } else { // IN\n               newQty += item.qty;\n            }\n\n            const stokUpdateData: any = {\n              qty: newQty,\n              qty_lama_terpakai: currentQtyLamaTerpakai,\n              updated_at: now.toISOString()\n            };\n\n            if (isSisaStokTransaction) {\n              stokUpdateData.sudah_so = true;\n            }\n\n            batch.set(stokRef, stokUpdateData, { merge: true });\n          }`;

content = content.replace(targetImportLogic, newImportLogic);

// 4. Update the newly created data mapping inside handleImportData
content = content.replace(
  `                nama_produk: item.nama_produk,\n                qty: item.qty,\n                satuan: '', packing: '', rak: '', sub_rak: '',\n                created_at: now.toISOString(),\n                updated_at: now.toISOString()\n              });`,
  `                nama_produk: item.nama_produk,\n                qty: item.qty,\n                satuan: '', packing: '', rak: '', sub_rak: '',\n                sudah_so: transactionType === 'SISA_STOK',\n                created_at: now.toISOString(),\n                updated_at: now.toISOString()\n              });`
);

// 5. Table UI Rendering
const targetTableRow = `<td className="px-4 py-3 text-sm text-gray-900">\n                        {activeProducts.get(item.nama_produk) || item.nama_produk}\n                      </td>`;
const newTableRow = `<td className="px-4 py-3 text-sm text-gray-900">\n                        <div className="flex items-center gap-2">\n                          {activeProducts.get(item.nama_produk) || item.nama_produk}\n                          {item.sudah_so && (\n                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200" title="Sudah dilakukan Sisa Stok (Stok Opname)">\n                              ✅ SO\n                            </span>\n                          )}\n                        </div>\n                      </td>`;

content = content.replace(targetTableRow, newTableRow);

fs.writeFileSync(filePath, content);
console.log('Modifications applied successfully!');
