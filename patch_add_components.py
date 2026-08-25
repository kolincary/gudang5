import re

backup_path = r'c:\Users\jgilb\OneDrive\Dokumen\bolt new\2_gudang lantai 5\devmode\060726 gudang 5 scan sub rak\gudang 5 scan sub rak\src\components\RiwayatBarang.tsx'
current_path = r'c:\Users\jgilb\OneDrive\Dokumen\bolt new\2_gudang lantai 5\devmode\gudang 5 scan sub rak\src\components\RiwayatBarang.tsx'

with open(backup_path, 'r', encoding='utf-8') as f:
    backup = f.read()

# Extract everything from line 2639 (RedistributionPreviewModal) to end of file
marker = 'function RedistributionPreviewModal({ isOpen, onClose, moves, isProcessing, onConfirm }: {'
idx = backup.find(marker)
if idx == -1:
    print('ERROR: Could not find RedistributionPreviewModal in backup')
    exit(1)

missing_block = backup[idx:].rstrip()
print(f'Extracted {len(missing_block)} chars of missing components')

with open(current_path, 'r', encoding='utf-8') as f:
    current = f.read()

# Check none of these already exist
for name in ['function RedistributionPreviewModal', 'function FilterDropdown', 'function EditDropdown']:
    if name in current:
        print(f'WARNING: {name} already exists in current file, aborting')
        exit(1)

# Append after the closing brace of RiwayatBarang function
# The file ends with: } (closing of export function RiwayatBarang)
# We need to append the missing components after it
current = current.rstrip() + '\n\n' + missing_block + '\n'

with open(current_path, 'w', encoding='utf-8') as f:
    f.write(current)

print('Successfully appended RedistributionPreviewModal, FilterDropdown, EditDropdown')
