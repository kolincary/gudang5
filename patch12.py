import re

def patch():
    with open('src/components/CekRak.tsx', 'r', encoding='utf-8') as f:
        code = f.read()

    # 1. Add States
    state_injection = """
    // Audit / Susun Ulang State
    const [isAuditMode, setIsAuditMode] = useState(false);
    const [draftItems, setDraftItems] = useState<{item: StockItem, targetRack: string, jumlah: number}[]>([]);
    const [showDraftModal, setShowDraftModal] = useState(false);
    const [isSavingDraft, setIsSavingDraft] = useState(false);
"""
    if "const [isAuditMode, setIsAuditMode]" not in code:
        code = code.replace("const [loading, setLoading] = useState(false);", "const [loading, setLoading] = useState(false);\n" + state_injection)

    # 2. Add helper function calculateExactStockByTglScan
    helper_code = """
    const calculateExactStockByTglScan = async (sku: string, rak: string, jumlah_pindah: number) => {
        const { data: logs, error } = await supabase
            .from('database_log')
            .select('*')
            .eq('sku', sku)
            .eq('rak', rak)
            .in('type', ['IN', 'OUT'])
            .order('tgl_scan', { ascending: true })
            .order('waktu', { ascending: true });
            
        if (error || !logs) return [];

        const stockMap = new Map();
        logs.forEach(log => {
            const date = log.tgl_scan;
            if (!stockMap.has(date)) stockMap.set(date, { in: 0, out: 0, records: [] });
            if (log.type === 'IN') {
                stockMap.get(date).in += log.jumlah;
                stockMap.get(date).records.push(log);
            } else if (log.type === 'OUT') {
                stockMap.get(date).out += log.jumlah;
            }
        });

        let remainingNeeded = jumlah_pindah;
        const slices = [];
        
        for (const [date, data] of Array.from(stockMap.entries())) {
            const available = data.in - data.out;
            if (available > 0) {
                const take = Math.min(available, remainingNeeded);
                if (take > 0) {
                    slices.push({
                        tgl_scan: date,
                        waktu: data.records[0]?.waktu || new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
                        jumlah: take
                    });
                    remainingNeeded -= take;
                }
            }
            if (remainingNeeded <= 0) break;
        }
        
        if (remainingNeeded > 0) {
            const now = new Date();
            slices.push({
                tgl_scan: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
                waktu: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
                jumlah: remainingNeeded
            });
        }
        return slices;
    };

    const handleAddToDraft = (item: StockItem) => {
        if (item.is_verified) {
            showToast('Barang ini sudah terverifikasi akurat dan tidak bisa dipindah via massal', 'error');
            return;
        }
        setSelectedMoveItem(item);
        setMoveData({ rak_tujuan: '', jumlah_pindah: item.tersedia });
        setShowMoveModal(true);
    };

    const handleSaveDraftList = async () => {
        if (draftItems.length === 0) return;
        setIsSavingDraft(true);
        try {
            const now = new Date();
            const tgl = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const waktu = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
            
            const allLogEntries = [];
            const stockUpdates = [];

            for (const draft of draftItems) {
                const { item, targetRack, jumlah } = draft;
                
                // 1. Calculate slices based on tgl_scan
                const slices = await calculateExactStockByTglScan(item.sku || item.nama_produk, item.rak, jumlah);
                
                for (const slice of slices) {
                    // OUT from old rack
                    allLogEntries.push({
                        tgl, waktu,
                        sku: item.nama_produk,
                        jumlah: slice.jumlah,
                        type: 'OUT',
                        gudang: 'TRANSFER',
                        rak: item.rak,
                        tgl_scan: slice.tgl_scan,
                        user_name: 'System (Susun Ulang)',
                        sub_rak: item.sub_rak || item.rak
                    });
                    
                    // IN to new rack
                    allLogEntries.push({
                        tgl, waktu,
                        sku: item.nama_produk,
                        jumlah: slice.jumlah,
                        type: 'IN',
                        gudang: 'TRANSFER',
                        rak: targetRack,
                        tgl_scan: slice.tgl_scan,
                        user_name: 'System (Susun Ulang)',
                        sub_rak: targetRack
                    });
                }

                // 2. Prepare stock updates (We'll update them later or rely on triggers if any, but since it's TRANSFER we must manually adjust stock_items)
                // Actually, let's just mark the newly created target rack item as is_verified
                stockUpdates.push({
                    item, targetRack, jumlah
                });
            }

            // Insert logs
            const { error: logError } = await DatabaseService.insertLogs(allLogEntries, writeMode);
            if (logError) throw logError;

            // Process stock_items (this can be complex because we need to decrement old and increment new)
            // To be safe and simple, we can rely on existing handles or just manually do it:
            for (const update of stockUpdates) {
                const { item, targetRack, jumlah } = update;
                
                // Decrement old
                if (jumlah === item.tersedia) {
                    await supabase.from('stock_items').update({ tersedia: 0, keluar: item.keluar + jumlah }).eq('id', item.id);
                } else {
                    await supabase.from('stock_items').update({ tersedia: item.tersedia - jumlah, keluar: item.keluar + jumlah }).eq('id', item.id);
                }

                // Increment or create new
                const { data: existingTarget } = await supabase.from('stock_items')
                    .select('*')
                    .eq('nama_produk', item.nama_produk)
                    .eq('rak', targetRack)
                    .maybeSingle();

                if (existingTarget) {
                    await supabase.from('stock_items')
                        .update({ 
                            tersedia: existingTarget.tersedia + jumlah, 
                            masuk: existingTarget.masuk + jumlah,
                            is_verified: true 
                        })
                        .eq('id', existingTarget.id);
                } else {
                    await supabase.from('stock_items').insert({
                        nama_produk: item.nama_produk,
                        sku: item.sku,
                        rak: targetRack,
                        sub_rak: targetRack,
                        satuan: item.satuan,
                        packing: item.packing,
                        stok_awal: 0,
                        masuk: jumlah,
                        keluar: 0,
                        tersedia: jumlah,
                        is_verified: true,
                        status: 'Aktif'
                    });
                }
            }

            showToast('Susunan rak berhasil disimpan secara permanen!', 'success');
            setDraftItems([]);
            setShowDraftModal(false);
            setIsAuditMode(false);
            if (lastScanned) fetchItems(lastScanned, true);
        } catch (error) {
            console.error('Error saving draft:', error);
            showToast('Gagal menyimpan susunan rak', 'error');
        } finally {
            setIsSavingDraft(false);
        }
    };
"""
    if "calculateExactStockByTglScan" not in code:
        code = code.replace("const handleMoveSubmit = async () => {", helper_code + "\n    const handleMoveSubmit = async () => {")

    # 3. Inject into handleMoveSubmit to support Draft Mode
    draft_submit_injection = """
        if (isAuditMode) {
            // Add to draft instead of moving directly
            const targetRackUpper = moveData.rak_tujuan.toUpperCase().trim();
            setDraftItems(prev => [...prev, { item: selectedMoveItem, targetRack: targetRackUpper, jumlah: moveData.jumlah_pindah as number }]);
            setShowMoveModal(false);
            showToast(`Dimasukkan ke draft pindah ke ${targetRackUpper}`, 'success');
            return;
        }
"""
    if "if (isAuditMode) {" not in code:
        code = code.replace("const rakTujuanUpper = moveData.rak_tujuan.toUpperCase().trim();", draft_submit_injection + "\n        const rakTujuanUpper = moveData.rak_tujuan.toUpperCase().trim();")


    # 4. Modify Top Bar UI for Audit Mode
    audit_button = """
                                    <Button
                                        variant={isAuditMode ? "default" : "outline"}
                                        onClick={() => setIsAuditMode(!isAuditMode)}
                                        className={`rounded-full px-4 flex items-center space-x-2 ${isAuditMode ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md' : 'text-indigo-600 border-indigo-600'}`}
                                    >
                                        <AlertTriangle size={18} />
                                        <span>{isAuditMode ? "Mode Susun Aktif" : "Susun Ulang Rak"}</span>
                                    </Button>
"""
    if "Mode Susun Aktif" not in code:
        code = code.replace('<Button\n                                        variant="outline"\n                                        onClick={fetchRackOptions}', audit_button + '\n                                    <Button\n                                        variant="outline"\n                                        onClick={fetchRackOptions}')

    # 5. Modify Table rows to show Verified Shield and Add to Draft button
    row_verified = """
                                                        {item.is_verified && (
                                                            <div className="flex items-center space-x-1 mt-1 bg-green-100 text-green-700 text-[10px] px-2 py-0.5 rounded-full w-fit font-bold border border-green-200">
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><polyline points="9 12 11 14 15 10"></polyline></svg>
                                                                <span>AKURAT</span>
                                                            </div>
                                                        )}
"""
    if "AKURAT" not in code:
        code = code.replace('</div>\n                                                    </div>\n                                                </div>', row_verified + '</div>\n                                                    </div>\n                                                </div>')

    # Modify Pindah button to use handleAddToDraft in audit mode
    if "onClick={() => {" not in code:
        pass # Will do manually if needed
    
    code = code.replace('onClick={() => {\n                                                                setSelectedMoveItem(item);\n                                                                setMoveData({ rak_tujuan: \'\', jumlah_pindah: item.tersedia });\n                                                                setShowMoveModal(true);\n                                                            }}',
    '''onClick={() => {
                                                                if (isAuditMode) {
                                                                    handleAddToDraft(item);
                                                                } else {
                                                                    setSelectedMoveItem(item);
                                                                    setMoveData({ rak_tujuan: '', jumlah_pindah: item.tersedia });
                                                                    setShowMoveModal(true);
                                                                }
                                                            }}''')
                                                            
    # 6. Add Draft Modal floating button
    draft_fab = """
            {isAuditMode && draftItems.length > 0 && (
                <div className="fixed bottom-6 right-6 z-40">
                    <Button 
                        className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-6 py-4 shadow-xl flex items-center space-x-3 text-lg font-bold animate-bounce"
                        onClick={() => setShowDraftModal(true)}
                    >
                        <Package size={24} />
                        <span>Draft Susunan ({draftItems.length})</span>
                    </Button>
                </div>
            )}
"""
    if "Draft Susunan" not in code:
        code = code.replace('{showMoveModal && selectedMoveItem && (', draft_fab + '\n            {showMoveModal && selectedMoveItem && (')


    # 7. Add Draft Modal UI
    draft_modal_ui = """
            {showDraftModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-indigo-50/50 rounded-t-3xl">
                            <div className="flex items-center space-x-3">
                                <div className="p-2 bg-indigo-100 rounded-xl text-indigo-600">
                                    <Package size={24} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900">Draft Susunan Rak</h3>
                                    <p className="text-sm text-gray-500 font-medium">Barang yang akan dipindah dan diverifikasi</p>
                                </div>
                            </div>
                            <button onClick={() => setShowDraftModal(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto flex-1 bg-gray-50/50">
                            {draftItems.length === 0 ? (
                                <div className="text-center py-10 text-gray-500">Draft kosong</div>
                            ) : (
                                <div className="space-y-3">
                                    {draftItems.map((draft, idx) => (
                                        <div key={idx} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center">
                                            <div>
                                                <p className="font-bold text-gray-900">{draft.item.nama_produk}</p>
                                                <div className="flex items-center space-x-2 text-sm text-gray-500 mt-1">
                                                    <span className="bg-gray-100 px-2 py-0.5 rounded font-bold">{draft.item.rak}</span>
                                                    <MoveRight size={14} />
                                                    <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-bold">{draft.targetRack}</span>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-bold text-blue-600 text-lg">{draft.jumlah} <span className="text-sm">{draft.item.satuan}</span></p>
                                                <button 
                                                    className="text-red-500 text-sm font-bold mt-1 hover:underline"
                                                    onClick={() => setDraftItems(prev => prev.filter((_, i) => i !== idx))}
                                                >
                                                    Hapus
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        
                        <div className="p-6 border-t border-gray-100 bg-white rounded-b-3xl flex justify-end space-x-3">
                            <Button variant="outline" onClick={() => setShowDraftModal(false)} className="rounded-xl font-bold">
                                Kembali
                            </Button>
                            <Button 
                                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold"
                                onClick={handleSaveDraftList}
                                disabled={isSavingDraft || draftItems.length === 0}
                            >
                                {isSavingDraft ? (
                                    <>
                                        <Loader className="animate-spin mr-2" size={18} />
                                        Menyimpan...
                                    </>
                                ) : (
                                    'Simpan Susunan (Permanen)'
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
"""
    if "Draft Susunan Rak" not in code:
        code = code.replace('{showMoveModal && selectedMoveItem && (', draft_modal_ui + '\n            {showMoveModal && selectedMoveItem && (')


    with open('src/components/CekRak.tsx', 'w', encoding='utf-8') as f:
        f.write(code)
    print("Patched CekRak.tsx successfully!")

if __name__ == '__main__':
    patch()
