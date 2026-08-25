import sys
import re

file_path = 'src/components/RiwayatBarang.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

target = "onClick={() => window.open('/stok-lantai-3', '_blank')}"
new_val = "onClick={() => alert('Fungsi Cek Saldo sedang diperbaiki, mohon instruksikan saya aksi apa yang seharusnya terjadi saat tombol ini diklik.')}"

content = content.replace(target, new_val)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Patch 6 applied")
