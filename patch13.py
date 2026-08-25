import re

def patch():
    with open('src/components/CekRak.tsx', 'r', encoding='utf-8') as f:
        code = f.read()

    # 1. Update Imports
    if 'CheckCircle2' not in code:
        code = code.replace("import { Search, Package,", "import { Search, Package, CheckCircle2, SearchCode, ArrowDownToLine, Archive,")

    # 2. Update States
    state_injection = """
    // Audit / Susun Ulang State (New Flow)
    const [isAuditMode, setIsAuditMode] = useState(false);
    const [showPullModal, setShowPullModal] = useState(false);
    const [pullSearchTerm, setPullSearchTerm] = useState('');
    const [pullSearchResults, setPullSearchResults] = useState<any[]>([]);
    const [isSearchingPull, setIsSearchingPull] = useState(false);
    const [isCompletingAudit, setIsCompletingAudit] = useState(false);
"""
    # Replace old draft states
    code = re.sub(
        r'// Audit / Susun Ulang State.*?const \[isSavingDraft, setIsSavingDraft\] = useState\(false\);',
        state_injection.strip(),
        code,
        flags=re.DOTALL
    )

    # 3. Add calculateExactStockByTglScan & Pull functions
    pull_functions = """
    // --- AUDIT MODE FUNCTIONS (NEW FLOW) ---

    // Mengambil sisa stok asli berdasarkan log transfer agar akurat per tgl_scan
    const calculateExactStockByTglScan = async (sku: string, rakAsal: string, tgl_scan: string) => {
        const { data: logs, error } = await supabase
            .from('database_log')
            .select('*')
            .eq('sku', sku)
            .eq('tgl_scan', tgl_scan)
            .or(`rak.eq.${rakAsal},rak_tujuan.eq.${rakAsal}`);

        if (error) {
            console.error('Error fetching logs:', error);
            return 0;
        }

        let totalIn = 0;
        let totalOut = 0;

        logs?.forEach(log => {
            if (log.jenis_log === 'IN' && log.rak === rakAsal) totalIn += log.jumlah;
            if (log.jenis_log === 'OUT' && log.rak === rakAsal) totalOut += log.jumlah;
            if (log.jenis_log === 'TRANSFER') {
                if (log.rak === rakAsal) totalOut += log.jumlah; // keluar dari rak ini
                if (log.rak_tujuan === rakAsal) totalIn += log.jumlah; // masuk ke rak ini
            }
        });

        return totalIn - totalOut;
    };

    const handleSearchPull = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pullSearchTerm.trim()) return;

        setIsSearchingPull(true);
        try {
            // Search all items in other racks that match the SKU or name
            const { data, error } = await supabase
                .from('stock_items')
                .select('*')
                .neq('rak', lastScanned) // Don't pull from the same rack
                .or(`sku.ilike.%${pullSearchTerm}%,nama_produk.ilike.%${pullSearchTerm}%`)
                .gt('tersedia', 0);

            if (error) throw error;
            
            // Group by SKU, Rak, and TglScan to show options
            const grouped = data?.reduce((acc: any[], curr) => {
                const existing = acc.find(x => x.sku === curr.sku && x.rak === curr.rak && x.tgl_scan === curr.tgl_scan);
                if (existing) {
                    existing.tersedia += curr.tersedia;
                } else {
                    acc.push({ ...curr });
                }
                return acc;
            }, []) || [];

            setPullSearchResults(grouped);
        } catch (error: any) {
            console.error('Search pull error:', error);
            setToast({ isOpen: true, message: 'Gagal mencari barang', type: 'error' });
        } finally {
            setIsSearchingPull(false);
        }
    };

    const handleConfirmPull = async (itemToPull: any) => {
        if (!lastScanned) return;

        try {
            const exactStock = await calculateExactStockByTglScan(itemToPull.sku, itemToPull.rak, itemToPull.tgl_scan);
            if (exactStock <= 0) {
                setToast({ isOpen: true, message: 'Stok tidak tersedia di rak asal.', type: 'error' });
                return;
            }

            // 1. Catat log TRANSFER (Kosongkan seluruh sisa stok per tgl_scan itu dari rak asal)
            const { error: logError } = await supabase
                .from('database_log')
                .insert([{
                    tanggal: new Date().toISOString().split('T')[0],
                    waktu: new Date().toTimeString().split(' ')[0],
                    sku: itemToPull.sku,
                    nama_produk: itemToPull.nama_produk,
                    kategori: itemToPull.kategori,
                    jumlah: exactStock, // Transfer seluruh sisa stok di tgl_scan tersebut
                    satuan: itemToPull.satuan,
                    packing: itemToPull.packing,
                    rak: itemToPull.rak,
                    rak_tujuan: lastScanned,
                    jenis_log: 'TRANSFER',
                    keterangan: `Ditarik via Audit Rak ${lastScanned}`,
                    petugas: userEmail,
                    tgl_scan: itemToPull.tgl_scan,
                    barcode: itemToPull.barcode
                }]);

            if (logError) throw logError;

            // 2. Buat record baru di rak tujuan (is_verified = true)
            const { error: insertError } = await supabase
                .from('stock_items')
                .insert([{
                    sku: itemToPull.sku,
                    nama_produk: itemToPull.nama_produk,
                    kategori: itemToPull.kategori,
                    tersedia: exactStock,
                    satuan: itemToPull.satuan,
                    packing: itemToPull.packing,
                    rak: lastScanned,
                    tgl_scan: itemToPull.tgl_scan,
                    barcode: itemToPull.barcode,
                    is_verified: true
                }]);
            
            if (insertError) throw insertError;

            // 3. (Optional) Kosongkan/update record di rak lama jika perlu, tapi view rekap_stok_tgl_scan akan otomatis menyesuaikan karena ada log TRANSFER.
            // Namun agar rapi, kita set tersedia = 0 di rak lama.
            await supabase
                .from('stock_items')
                .update({ tersedia: 0 })
                .eq('sku', itemToPull.sku)
                .eq('rak', itemToPull.rak)
                .eq('tgl_scan', itemToPull.tgl_scan);

            setToast({ isOpen: true, message: `Berhasil menarik ${exactStock} ${itemToPull.satuan} ${itemToPull.sku}`, type: 'success' });
            
            // Hapus dari hasil pencarian agar tidak diklik dua kali
            setPullSearchResults(prev => prev.filter(x => !(x.sku === itemToPull.sku && x.rak === itemToPull.rak && x.tgl_scan === itemToPull.tgl_scan)));
            
            // Refresh data rak ini
            fetchItems(lastScanned, false);

        } catch (error: any) {
            console.error('Pull error:', error);
            setToast({ isOpen: true, message: 'Gagal menarik barang: ' + error.message, type: 'error' });
        }
    };

    const handleMarkAsVerified = async (item: any) => {
        try {
            const { error } = await supabase
                .from('stock_items')
                .update({ is_verified: true })
                .eq('id', item.id);
            
            if (error) throw error;
            
            setToast({ isOpen: true, message: 'Barang ditandai AKURAT!', type: 'success' });
            fetchItems(lastScanned, false);
        } catch (error: any) {
            setToast({ isOpen: true, message: 'Gagal menandai barang', type: 'error' });
        }
    };

    const handleCompleteAudit = async () => {
        if (!lastScanned) return;
        
        if (!window.confirm(`Selesaikan Susun Rak ${lastScanned}? Barang yang BELUM ditandai AKURAT akan dilempar ke WADAH-SEMENTARA.`)) {
            return;
        }

        setIsCompletingAudit(true);
        try {
            // Cari barang yang belum verified di rak ini
            const unverifiedItems = items.filter(item => !item.is_verified);

            for (const item of unverifiedItems) {
                const exactStock = await calculateExactStockByTglScan(item.sku, item.rak, item.tgl_scan);
                if (exactStock > 0) {
                    // Transfer ke WADAH-SEMENTARA
                    await supabase
                        .from('database_log')
                        .insert([{
                            tanggal: new Date().toISOString().split('T')[0],
                            waktu: new Date().toTimeString().split(' ')[0],
                            sku: item.sku,
                            nama_produk: item.nama_produk,
                            kategori: item.kategori,
                            jumlah: exactStock,
                            satuan: item.satuan,
                            packing: item.packing,
                            rak: item.rak,
                            rak_tujuan: 'WADAH-SEMENTARA',
                            jenis_log: 'TRANSFER',
                            keterangan: `Sisa Audit Rak ${lastScanned} (Tidak ada fisik)`,
                            petugas: userEmail,
                            tgl_scan: item.tgl_scan,
                            barcode: item.barcode
                        }]);
                    
                    await supabase
                        .from('stock_items')
                        .insert([{
                            ...item,
                            id: undefined, // let auto increment
                            rak: 'WADAH-SEMENTARA',
                            tersedia: exactStock,
                            is_verified: false
                        }]);
                }
                
                // Hapus / set 0 di rak lama
                await supabase
                    .from('stock_items')
                    .update({ tersedia: 0 })
                    .eq('id', item.id);
            }

            // Setelah semua dilempar, kembalikan semua is_verified = false agar besok-besok normal kembali (opsional, tapi disarankan)
            // Atau biarkan true sebagai penanda permanen. Kita biarkan true sesuai pesanan.

            setToast({ isOpen: true, message: 'Audit selesai! Sisa barang tak ada fisik dilempar ke WADAH-SEMENTARA.', type: 'success' });
            setIsAuditMode(false);
            fetchItems(lastScanned, true);

        } catch (error: any) {
            console.error('Audit complete error:', error);
            setToast({ isOpen: true, message: 'Gagal menyelesaikan audit.', type: 'error' });
        } finally {
            setIsCompletingAudit(false);
        }
    };
"""
    # Remove old handleAddToDraft and handleSaveDraftList
    code = re.sub(
        r'const handleAddToDraft =.*?};.*?const handleSaveDraftList =.*?};',
        pull_functions.strip() + '\n\n',
        code,
        flags=re.DOTALL
    )

    # 4. Modify UI Header Buttons
    # Old code had the buttons inside a div:
    # <Button variant={isAuditMode ? "default" : "outline"} onClick={() => setIsAuditMode(!isAuditMode)} ...>
    header_buttons_injection = """
                                <div className="flex flex-wrap sm:flex-nowrap gap-3 w-full sm:w-auto mt-2 sm:mt-0">
                                    {isAuditMode ? (
                                        <>
                                            <Button
                                                onClick={() => setShowPullModal(true)}
                                                className="w-full sm:w-auto h-12 px-4 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg flex items-center justify-center animate-in fade-in zoom-in"
                                            >
                                                <SearchCode size={18} className="mr-2" />
                                                <span>Tarik Barang Fisik</span>
                                            </Button>
                                            <Button
                                                onClick={handleCompleteAudit}
                                                disabled={isCompletingAudit}
                                                className="w-full sm:w-auto h-12 px-4 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg flex items-center justify-center animate-in fade-in zoom-in"
                                            >
                                                {isCompletingAudit ? <Loader className="animate-spin h-5 w-5" /> : <Archive size={18} className="mr-2" />}
                                                <span className="ml-2">Selesai & Bersihkan</span>
                                            </Button>
                                            <Button
                                                variant="outline"
                                                onClick={() => setIsAuditMode(false)}
                                                className="w-full sm:w-auto h-12 px-4 rounded-xl font-bold border-red-200 text-red-600 hover:bg-red-50"
                                            >
                                                <X size={18} className="mr-2" />
                                                Batal Audit
                                            </Button>
                                        </>
                                    ) : (
                                        <Button
                                            variant="outline"
                                            onClick={() => setIsAuditMode(true)}
                                            className="w-full sm:w-auto h-12 px-4 rounded-xl font-bold bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 shadow-sm flex items-center justify-center"
                                        >
                                            <AlertTriangle size={18} className="mr-2" />
                                            <span>Mulai Susun / Audit</span>
                                        </Button>
                                    )}
"""
    code = re.sub(
        r'<div className="flex flex-wrap sm:flex-nowrap gap-3 w-full sm:w-auto mt-2 sm:mt-0">.*?<Button\s+variant=\{isAuditMode \? "default" : "outline"\}.*?</Button>',
        header_buttons_injection.strip(),
        code,
        flags=re.DOTALL
    )

    # 5. Modify Row UI
    # In the mapping of `items.map((item) => ...)`
    # We want to change the border and add a verified badge
    row_ui_injection = """
                                        <Card key={item.id} className={`overflow-hidden rounded-2xl transition-all duration-300 hover:shadow-xl border-l-4 ${item.is_verified ? 'border-l-emerald-500 bg-emerald-50/30' : 'border-l-blue-500'} group relative`}>
                                            {item.is_verified && (
                                                <div className="absolute top-0 right-0 bg-emerald-500 text-white px-3 py-1 rounded-bl-xl font-bold text-[10px] flex items-center tracking-wider z-10 shadow-sm">
                                                    <CheckCircle2 size={12} className="mr-1" />
                                                    AKURAT
                                                </div>
                                            )}
                                            <CardContent className="p-0">
                                                <div className={`p-4 sm:p-5 ${item.is_verified ? 'opacity-80' : ''}`}>
                                                    <div className="flex justify-between items-start mb-3 sm:mb-4 gap-4">
"""
    code = re.sub(
        r'<Card key=\{item\.id\} className="overflow-hidden rounded-2xl transition-all duration-300 hover:shadow-xl border-l-4 border-l-blue-500 group relative">.*?<CardContent className="p-0">.*?<div className="p-4 sm:p-5">.*?<div className="flex justify-between items-start mb-3 sm:mb-4 gap-4">',
        row_ui_injection.strip(),
        code,
        flags=re.DOTALL
    )

    # 6. Modify Row Buttons
    # If it's verified, don't show the button. If it's audit mode, show "Konfirmasi Benar"
    row_btn_injection = """
                                                        {item.is_verified ? (
                                                            <div className="h-10 px-4 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs uppercase tracking-wider">
                                                                Terkonfirmasi
                                                            </div>
                                                        ) : (
                                                            <button
                                                                onClick={() => {
                                                                    if (isAuditMode) {
                                                                        handleMarkAsVerified(item);
                                                                    } else {
                                                                        setSelectedMoveItem(item);
                                                                        setMoveData({ rak_tujuan: '', jumlah_pindah: '' });
                                                                        setShowMoveModal(true);
                                                                    }
                                                                }}
                                                                className={`h-10 px-4 rounded-xl text-white flex items-center justify-center font-bold text-xs uppercase tracking-wider shadow-md hover:shadow-lg transition-all ${isAuditMode ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'}`}
                                                            >
                                                                {isAuditMode ? (
                                                                    <>
                                                                        <CheckCircle2 className="h-4 w-4 mr-2" />
                                                                        Konfirmasi
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <ArrowRightLeft className="h-4 w-4 mr-2" />
                                                                        Pindah
                                                                    </>
                                                                )}
                                                            </button>
                                                        )}
"""
    code = re.sub(
        r'<button\s+onClick=\{\(\) => \{\s+if \(isAuditMode\) \{\s+handleAddToDraft\(item\);\s+\} else \{.*?Pindah\'\}\s+</button>',
        row_btn_injection.strip(),
        code,
        flags=re.DOTALL
    )

    # 7. Replace Draft UI with Pull UI
    pull_modal_ui = """
            {showPullModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[90vh] shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-indigo-50/50 rounded-t-3xl">
                            <div className="flex items-center space-x-3">
                                <div className="p-2 bg-indigo-100 rounded-xl text-indigo-600">
                                    <SearchCode size={24} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900">Tarik Barang Fisik ke {lastScanned}</h3>
                                    <p className="text-sm text-gray-500 font-medium">Cari barang yang secara fisik ada di rak ini</p>
                                </div>
                            </div>
                            <button onClick={() => setShowPullModal(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="p-6 border-b border-gray-100">
                            <form onSubmit={handleSearchPull} className="flex gap-3">
                                <input
                                    type="text"
                                    placeholder="Scan Barcode atau ketik nama/SKU..."
                                    value={pullSearchTerm}
                                    onChange={(e) => setPullSearchTerm(e.target.value)}
                                    className="flex-1 border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 outline-none text-lg transition-all"
                                    autoFocus
                                />
                                <Button type="submit" disabled={isSearchingPull} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-6 py-3 h-auto font-bold">
                                    {isSearchingPull ? <Loader className="animate-spin h-5 w-5" /> : 'Cari'}
                                </Button>
                            </form>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 bg-gray-50/50">
                            {pullSearchResults.length === 0 ? (
                                <div className="text-center py-10 text-gray-500">
                                    {pullSearchTerm ? 'Tidak menemukan barang di rak lain' : 'Gunakan kolom pencarian di atas'}
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {pullSearchResults.map((result, idx) => (
                                        <div key={idx} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                                            <div>
                                                <p className="font-bold text-gray-900 text-lg leading-tight mb-1">{result.nama_produk}</p>
                                                <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
                                                    <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">{result.sku}</span>
                                                    <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-bold">Tgl: {result.tgl_scan}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4 shrink-0 bg-gray-50 p-2 rounded-xl">
                                                <div className="text-right">
                                                    <p className="text-[10px] uppercase font-bold text-gray-400">Lokasi Data</p>
                                                    <p className="font-black text-gray-900 text-lg">{result.rak}</p>
                                                </div>
                                                <div className="h-8 w-px bg-gray-200"></div>
                                                <div className="text-right">
                                                    <p className="text-[10px] uppercase font-bold text-gray-400">Sisa Stok</p>
                                                    <p className="font-black text-blue-600 text-lg">{result.tersedia} <span className="text-sm font-bold text-blue-400">{result.satuan}</span></p>
                                                </div>
                                                <Button
                                                    onClick={() => handleConfirmPull(result)}
                                                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg h-10 px-4 font-bold shadow-md ml-2"
                                                >
                                                    <ArrowDownToLine size={16} className="mr-2" />
                                                    Tarik
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
"""
    # Remove old draft UI completely
    code = re.sub(
        r'\{isAuditMode && draftItems\.length > 0 && \(.*?</span>\s*</Button>\s*</div>\s*\)\}',
        '',
        code,
        flags=re.DOTALL
    )
    code = re.sub(
        r'\{showDraftModal && \(.*?Simpan Susunan \(Permanen\)\'.*?</Button>\s*</div>\s*</div>\s*</div>\s*\)\}',
        pull_modal_ui.strip(),
        code,
        flags=re.DOTALL
    )

    with open('src/components/CekRak.tsx', 'w', encoding='utf-8') as f:
        f.write(code)
    
    print("Patch applied successfully.")

if __name__ == '__main__':
    patch()
