import os

file_path = 'src/components/CekRak.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_modal_content = """            {showPullModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col overflow-visible">
                        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-indigo-50/50 rounded-t-3xl">
                            <div className="flex items-center space-x-3">
                                <div className="p-2 bg-indigo-100 rounded-xl text-indigo-600">
                                    <SearchCode size={20} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900 leading-tight">Tarik Barang ke {lastScanned}</h3>
                                    <p className="text-xs text-gray-500 font-medium">Cari barang yang fisiknya ada di sini</p>
                                </div>
                            </div>
                            <button onClick={() => setShowPullModal(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-visible flex-1">
                            {isFetchingPullData ? (
                                <div className="flex flex-col items-center justify-center py-10">
                                    <Loader className="animate-spin text-indigo-500 mb-4" size={32} />
                                    <p className="text-gray-500 font-medium">Memuat data gudang...</p>
                                </div>
                            ) : (
                                <div className="relative z-50 min-h-[250px]">
                                    <label className="block text-xs font-black text-gray-700 uppercase tracking-widest mb-2">Pilih Barang Fisik</label>
                                    <CustomDropdown
                                        value=""
                                        onChange={(e) => handlePullDropdownSelect(e.target.value)}
                                        options={pullDropdownOptions}
                                        placeholder="Ketik SKU atau Nama Barang..."
                                        className="w-full px-4 h-12 rounded-xl border-2 border-indigo-100 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all font-medium text-gray-900 bg-white shadow-sm"
                                        showClearButton={false}
                                    />
                                    <p className="text-xs text-gray-500 mt-4 text-center">
                                        Pilih barang dari dropdown, barang akan langsung ditarik ke {lastScanned}.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}\n"""

new_lines = lines[:895] + [new_modal_content] + lines[971:]

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Modal replaced successfully.")
