import sys

file_path = 'src/components/RiwayatBarang.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

confirm_modal = '''
      <Modal isOpen={isCopyConfirmOpen} onClose={() => setIsCopyConfirmOpen(false)} title="Konfirmasi Salin Data" size="md">
        <div className="p-6">
          <p className="text-gray-700 mb-6">
            Apakah Anda yakin ingin menyalin data ini? <br/><br/>
            <span className="text-red-600 font-medium">PENTING:</span> Setelah disalin, data ini tidak akan tampil lagi di halaman rekap ini. Rekap berikutnya hanya akan menampilkan data pemotongan <strong>terbaru</strong> sejak penyalinan terakhir.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setIsCopyConfirmOpen(false)}>Batal</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleConfirmCopyAndClose}>
              Ya, Salin & Tutup
            </Button>
          </div>
        </div>
      </Modal>
'''

# Find the last closing tags of the component
target = '''      {/* Bottom Spacer for Mobile Sticky Bar */}
      <div className="h-24 lg:hidden"></div>
    </div>
  );
}'''

new_code = f'''      {{/* Bottom Spacer for Mobile Sticky Bar */}}
      <div className="h-24 lg:hidden"></div>
{confirm_modal}
    </div>
  );
}}'''

if 'Apakah Anda yakin ingin menyalin data ini' not in content:
    content = content.replace(target, new_code)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Patch 7 applied")
else:
    print("Modal is already present")
