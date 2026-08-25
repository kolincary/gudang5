with open(r'c:\Users\jgilb\OneDrive\Dokumen\bolt new\2_gudang lantai 5\devmode\gudang 5 scan sub rak\src\components\DatabaseLog.tsx', 'r', encoding='utf-8') as f:
    db_content = f.read()

start = db_content.find('Cari / Pilih SKU')
if start != -1:
    start_block = db_content.rfind('<div>', 0, start)
    end_block = db_content.find('</div>', start)
    # The div might be nested, let's just extract a reasonable chunk
    print('--- SKU DROPDOWN ---')
    print(db_content[start_block:start_block+500])

start_search = db_content.find('Cari dalam hasil (Rak, Tgl Scan)...')
if start_search != -1:
    start_block = db_content.rfind('<div className="relative">', 0, start_search)
    print('\n--- SEARCH BAR ---')
    print(db_content[start_block:start_block+800])
