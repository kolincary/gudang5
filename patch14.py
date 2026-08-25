import os
import re

file_path = 'src/components/CekRak.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add states
state_injection = """
    const [allPullableItems, setAllPullableItems] = useState<any[]>([]);
    const [pullDropdownOptions, setPullDropdownOptions] = useState<string[]>([]);
    const [isFetchingPullData, setIsFetchingPullData] = useState(false);
"""
if 'const [allPullableItems' not in code:
    code = code.replace('const [showPullModal, setShowPullModal] = useState(false);', 
                       'const [showPullModal, setShowPullModal] = useState(false);\n' + state_injection)

# 2. Add openPullModal function
open_modal_fn = """
    const openPullModal = async () => {
        setShowPullModal(true);
        setIsFetchingPullData(true);
        try {
            const { data, error } = await supabase
                .from('stock_items')
                .select('*')
                .neq('rak', lastScanned)
                .gt('tersedia', 0);
                
            if (error) throw error;
            
            // Group
            const grouped = data?.reduce((acc: any[], curr) => {
                const existing = acc.find((x: any) => x.sku === curr.sku && x.rak === curr.rak && x.tgl_scan === curr.tgl_scan);
                if (existing) {
                    existing.tersedia += curr.tersedia;
                } else {
                    acc.push({ ...curr });
                }
                return acc;
            }, []) || [];
            
            setAllPullableItems(grouped);
            setPullDropdownOptions(
                grouped.map((item: any) => `[${item.sku}] ${item.nama_produk} | RAK: ${item.rak} | STOK: ${item.tersedia} ${item.satuan} | TGL: ${item.tgl_scan}`)
            );
        } catch (error) {
            console.error('Error fetching pullable items', error);
            setToast({ isOpen: true, message: 'Gagal mengambil data gudang', type: 'error' });
        } finally {
            setIsFetchingPullData(false);
        }
    };
"""
if 'const openPullModal' not in code:
    code = code.replace('const handleSearchPull = async', open_modal_fn + '\n    const handleSearchPull = async')

# 3. Replace onClick={() => setShowPullModal(true)}
code = code.replace('onClick={() => setShowPullModal(true)}', 'onClick={openPullModal}')

# 4. Handle dropdown selection
dropdown_handler = """
    const handlePullDropdownSelect = (selectedString: string) => {
        // e.g. "[SKU123] Nama Produk | RAK: A1 | STOK: 50 pcs | TGL: 2026-07-21"
        const match = selectedString.match(/^\[(.*?)\]/);
        if (!match) return;
        const sku = match[1];
        
        const rakMatch = selectedString.match(/RAK:\s*([^|]+)/);
        const tglMatch = selectedString.match(/TGL:\s*(.+)$/);
        
        if (sku && rakMatch && tglMatch) {
            const rak = rakMatch[1].trim();
            const tgl = tglMatch[1].trim();
            const item = allPullableItems.find(x => x.sku === sku && x.rak === rak && x.tgl_scan === tgl);
            if (item) {
                handleConfirmPull(item);
                setShowPullModal(false);
            }
        }
    };
"""
if 'const handlePullDropdownSelect' not in code:
    code = code.replace('const handleSearchPull = async', dropdown_handler + '\n    const handleSearchPull = async')

# 5. Modify the modal UI
old_modal_start = """            {showPullModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[90vh] shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-indigo-50/50 rounded-t-3xl">"""

old_modal_body = re.search(r'\{showPullModal && \(\s*<div className="fixed inset-0.*?Tarik\s*</Button>\s*</div>\s*</div>\s*\)\s*\}\s*</div>\s*\)\s*:\s*\(\s*<div className="text-center py-10 text-gray-500">\s*Tidak menemukan barang di rak lain\s*</div>\s*\)\s*\}\s*</div>\s*</div>\s*</div>\s*\)', code, re.DOTALL)

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
                                <div className="relative z-50">
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
            )}"""

if old_modal_body:
    code = code.replace(old_modal_body.group(0), new_modal_content)
else:
    print("Could not find the old modal body regex match! Updating manually.")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(code)

print("Patch applied.")
