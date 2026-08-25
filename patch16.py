import os

file_path = 'src/components/CekRak.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    code = f.read()

# Fix grouped logic
old_grouped = '''            const grouped = data?.reduce((acc: any[], curr) => {
                const existing = acc.find((x: any) => x.sku === curr.sku && x.rak === curr.rak && x.tgl_scan === curr.tgl_scan);
                if (existing) {
                    existing.tersedia += curr.tersedia;
                } else {
                    acc.push({ ...curr });
                }
                return acc;
            }, []) || [];'''
new_grouped = '''            const grouped = data?.reduce((acc: any[], curr) => {
                const existing = acc.find((x: any) => x.id === curr.id);
                if (existing) {
                    existing.tersedia += curr.tersedia;
                } else {
                    acc.push({ ...curr });
                }
                return acc;
            }, []) || [];'''
code = code.replace(old_grouped, new_grouped)

# Fix dropdown options format
old_options = '''setPullDropdownOptions(
                grouped.map((item: any) => `[${item.sku}] ${item.nama_produk} | RAK: ${item.rak} | STOK: ${item.tersedia} ${item.satuan} | TGL: ${item.tgl_scan}`)
            );'''
new_options = '''setPullDropdownOptions(
                grouped.map((item: any) => `[${item.id}] ${item.nama_produk} | RAK: ${item.rak} | STOK: ${item.tersedia} ${item.satuan}`)
            );'''
code = code.replace(old_options, new_options)

# Fix regex matcher
old_regex = '''const match = value.match(/^\[(.*?)\] (.*?) \\| RAK: (.*?) \\| STOK: (.*?) \\| TGL: (.*)$/);'''
new_regex = '''const match = value.match(/^\[(.*?)\] (.*?) \\| RAK: (.*?) \\| STOK: (.*?)$/);'''
code = code.replace(old_regex, new_regex)

# Fix match evaluation
old_match = '''        if (match) {
            const sku = match[1];
            const nama = match[2];
            const rakMatch = match[3];
            const tglMatch = match[5];
            
            if (sku && rakMatch && tglMatch) {
                // Cari data aslinya
                const item = allPullableItems.find(x => x.sku === sku && x.rak === rakMatch && x.tgl_scan === tglMatch);
                if (item) {
                    handleConfirmPull(item);
                }
            }
        }'''
new_match = '''        if (match) {
            const id = match[1];
            
            if (id) {
                // Cari data aslinya
                const item = allPullableItems.find(x => x.id === id);
                if (item) {
                    handleConfirmPull(item);
                }
            }
        }'''
code = code.replace(old_match, new_match)

# Also fix handleConfirmPull
old_pull = '''        try {
            const exactStock = await calculateStockForPullByTglScan(itemToPull.sku, itemToPull.rak, itemToPull.tgl_scan);
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
            fetchItems(lastScanned, false);'''
new_pull = '''        try {
            const exactStock = itemToPull.tersedia;
            if (exactStock <= 0) {
                setToast({ isOpen: true, message: 'Stok tidak tersedia di rak asal.', type: 'error' });
                return;
            }

            // 1. Catat log TRANSFER
            const { error: logError } = await supabase
                .from('database_log')
                .insert([{
                    tanggal: new Date().toISOString().split('T')[0],
                    waktu: new Date().toTimeString().split(' ')[0],
                    sku: itemToPull.nama_produk,
                    nama_produk: itemToPull.nama_produk,
                    kategori: itemToPull.kategori || '',
                    jumlah: exactStock,
                    satuan: itemToPull.satuan,
                    packing: itemToPull.packing || '',
                    rak: lastScanned,
                    tgl_scan: new Date().toISOString().split('T')[0],
                    type: 'TRANSFER',
                    user_name: 'System',
                    tipe_perubahan: 'Tarik Barang'
                }]);
            
            if (logError) throw logError;

            // 2. Insert ke rak baru
            const { error: insertError } = await supabase
                .from('stock_items')
                .insert([{
                    nama_produk: itemToPull.nama_produk,
                    satuan: itemToPull.satuan,
                    tersedia: exactStock,
                    stok_awal: exactStock,
                    masuk: 0,
                    keluar: 0,
                    kategori: itemToPull.kategori || '',
                    packing: itemToPull.packing || '',
                    rak: lastScanned,
                    is_verified: true
                }]);
            
            if (insertError) throw insertError;

            // 3. Set tersedia = 0 di rak lama
            await supabase
                .from('stock_items')
                .update({ tersedia: 0 })
                .eq('id', itemToPull.id);

            setToast({ isOpen: true, message: `Berhasil menarik ${exactStock} ${itemToPull.satuan} ${itemToPull.nama_produk}`, type: 'success' });
            
            // Hapus dari hasil dropdown agar tidak diklik dua kali
            setAllPullableItems(prev => prev.filter(x => x.id !== itemToPull.id));
            setPullDropdownOptions(prev => prev.filter(opt => !opt.startsWith(`[${itemToPull.id}]`)));
            
            // Refresh data rak ini
            fetchItems(lastScanned, false);'''
code = code.replace(old_pull, new_pull)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(code)

print('Done patching.')
