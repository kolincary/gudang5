import sys

correct_mapping = """rakMismatchResults
                        .filter(res =>
                          res.sku.toLowerCase().includes(analysisSearchTerm.toLowerCase()) ||
                          res.inRak.toLowerCase().includes(analysisSearchTerm.toLowerCase()) ||
                          res.outRak.toLowerCase().includes(analysisSearchTerm.toLowerCase()) ||
                          res.tglScanRaw.toLowerCase().includes(analysisSearchTerm.toLowerCase())
                        )
                        .map((res, idx) => (
                          <tr key={idx} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 font-medium text-gray-900">{res.sku}</td>
                            <td className="px-4 py-3 text-center text-gray-600 font-mono text-xs">
                              {formatDateDisplay(res.tglScanRaw)}
                            </td>
                            <td className="px-4 py-3 text-green-700 font-medium">
                              <div className="font-bold">{res.inRak}</div>
                              {res.inSubRak && <div className="text-[10px] text-green-600/70 italic mt-0.5">Sub: {res.inSubRak}</div>}
                            </td>
                            <td className="px-4 py-3 text-red-700 font-medium">
                              <div className="font-bold">{res.outRak}</div>
                              {res.outSubRak && <div className="text-[10px] text-red-600/70 italic mt-0.5">Sub: {res.outSubRak}</div>}
                            </td>
                            <td className="px-4 py-3 text-center text-amber-700 font-bold">{res.outTotal.toLocaleString()}</td>
                            <td className="px-4 py-3 text-center">
                              <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                <AlertCircle className="h-3 w-3" />
                                <span>RAK BEDA</span>
                              </span>
                            </td>
                          </tr>
                        ))
"""

with open(r'c:\Users\jgilb\OneDrive\Dokumen\bolt new\2_gudang lantai 5\devmode\gudang 5 scan sub rak\src\components\RiwayatBarang.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

start_find = 'rakMismatchResults\n                        .filter(res =>'
end_find = '                        ))\n                    )}'

start_idx = content.find(start_find)
if start_idx == -1:
    print("Error: Could not find mapping block")
    sys.exit(1)

end_idx = content.find(end_find, start_idx) + len('                        ))')
if end_idx < start_idx + len('                        ))'):
    print("Error: Could not find end of mapping block")
    sys.exit(1)

new_content = content[:start_idx] + correct_mapping.strip() + content[end_idx:]

with open(r'c:\Users\jgilb\OneDrive\Dokumen\bolt new\2_gudang lantai 5\devmode\gudang 5 scan sub rak\src\components\RiwayatBarang.tsx', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Successfully fixed mapping!")
