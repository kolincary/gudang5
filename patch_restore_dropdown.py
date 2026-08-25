import os

backup_path = r'c:\Users\jgilb\OneDrive\Dokumen\bolt new\2_gudang lantai 5\devmode\060726 gudang 5 scan sub rak\gudang 5 scan sub rak\src\components\RiwayatBarang.tsx'
current_path = r'src\components\RiwayatBarang.tsx'

with open(backup_path, 'r', encoding='utf-8') as f:
    backup_code = f.read()

with open(current_path, 'r', encoding='utf-8') as f:
    current_code = f.read()

idx = backup_code.find('interface FilterDropdownProps')
idx_end = backup_code.find('export default RiwayatBarang;', idx)
extra_code = backup_code[idx:idx_end]

if 'interface FilterDropdownProps' not in current_code:
    current_code = current_code.replace('export default RiwayatBarang;', extra_code + '\nexport default RiwayatBarang;')
    with open(current_path, 'w', encoding='utf-8') as f:
        f.write(current_code)
    print('Appended FilterDropdown etc.')
else:
    print('Already exists')
