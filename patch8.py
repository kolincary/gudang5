import sys
import re

file_path = 'src/components/RiwayatBarang.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

new_copy = '''  const handleCopyRekap = () => {
    if (rekapData.length === 0) {
      showToast('Tidak ada data untuk disalin', 'warning');
      return;
    }
    setIsCopyConfirmOpen(true);
  };

  const handleConfirmCopyAndClose = () => {
    const rows = rekapData.map(item => `${item.sku}\t0\t${item.jumlah}`);
    const textToCopy = rows.join('\n');
    
    navigator.clipboard.writeText(textToCopy).then(() => {
      showToast('Data berhasil disalin (tanpa header)!', 'success');
      const today = new Date().toISOString().split('T')[0];
      const now = new Date().toISOString();
      localStorage.setItem(`rekap_copied_${today}`, now);
      setIsCopyConfirmOpen(false);
      setIsRekapModalOpen(false);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
      showToast('Gagal menyalin data', 'error');
      setIsCopyConfirmOpen(false);
    });
  };'''

# regex replace
pattern = re.compile(r'  const handleCopyRekap = \(\) => \{.*?  \};', re.DOTALL)
content = pattern.sub(new_copy, content, count=1)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Patch 8 applied")
