import sys

file_path = 'src/components/RiwayatBarang.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

target = '  const [filters, setFilters] = useState({'
new_states = '''  const [isRekapModalOpen, setIsRekapModalOpen] = useState(false);
  const [rekapData, setRekapData] = useState<{sku: string, jumlah: number}[]>([]);
  const [isRekapLoading, setIsRekapLoading] = useState(false);
  const [filters, setFilters] = useState({'''

if 'const [isRekapModalOpen' not in content:
    content = content.replace(target, new_states)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Patched RiwayatBarang.tsx states 3")
else:
    print("Already patched states 3")
