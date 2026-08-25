import sys

file_path = 'src/components/RiwayatBarang.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix Lucide import
if 'Calculator' not in content:
    content = content.replace('Copy } from \'lucide-react\';', 'Copy, Calculator } from \'lucide-react\';')

# Add CEK SALDO button
target_btn = '''              <button
                onClick={handleOpenRekap}'''
new_btn = '''              <button
                onClick={() => window.open('/stok-lantai-3', '_blank')}
                className="px-5 py-2.5 bg-teal-600 hover:bg-teal-500 text-white text-[10px] font-black rounded-xl shadow-lg transition-all border border-teal-400/30 flex items-center gap-2 tracking-widest active:scale-95"
              >
                <Calculator className="w-4 h-4" />
                CEK SALDO
              </button>
              <button
                onClick={handleOpenRekap}'''
if 'CEK SALDO' not in content:
    content = content.replace(target_btn, new_btn)

# Fix Modal Size
target_modal = '<Modal isOpen={isRekapModalOpen} onClose={() => setIsRekapModalOpen(false)} title="Rekap Barang Keluar Hari Ini" size="lg">'
new_modal = '<Modal isOpen={isRekapModalOpen} onClose={() => setIsRekapModalOpen(false)} title="Rekap Barang Keluar Hari Ini" size="5xl">'
content = content.replace(target_modal, new_modal)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Patch 4 applied.")
