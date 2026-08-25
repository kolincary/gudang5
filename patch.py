import sys

file_path = 'src/components/RiwayatBarang.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

target = '<button\n                onClick={exportDataStandard}'
if target not in content:
    target = '<button\r\n                onClick={exportDataStandard}'

new_button = '''<button\n                onClick={handleOpenRekap}\n                className="px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-black rounded-xl shadow-lg transition-all border border-orange-400/30 flex items-center gap-2 tracking-widest active:scale-95"\n              >\n                <FileText className="w-4 h-4" />\n                REKAP OUT HARI INI\n              </button>\n              <button\n                onClick={exportDataStandard}'''

if 'REKAP OUT HARI INI' not in content:
    content = content.replace(target, new_button)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Patched RiwayatBarang.tsx")
else:
    print("Already patched")
