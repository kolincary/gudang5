import os

backup_path = r'c:\Users\jgilb\OneDrive\Dokumen\bolt new\2_gudang lantai 5\devmode\060726 gudang 5 scan sub rak\gudang 5 scan sub rak\src\components\RiwayatBarang.tsx'
current_path = r'src\components\RiwayatBarang.tsx'

with open(backup_path, 'r', encoding='utf-8') as f:
    backup_code = f.read()

idx_start = backup_code.find('const refreshData = useCallback(() => {')
idx_end = backup_code.find('const handleBarangInputChange = useCallback((value: string) => {', idx_start)

missing_code = backup_code[idx_start:idx_end]

with open(current_path, 'r', encoding='utf-8') as f:
    current_code = f.read()

if 'const refreshData =' not in current_code:
    current_code = current_code.replace('const handleOpenRekap = async () => {', missing_code + '\n\n  const handleOpenRekap = async () => {')
    with open(current_path, 'w', encoding='utf-8') as f:
        f.write(current_code)
    print('Restored refreshData')
else:
    print('Already exists')
