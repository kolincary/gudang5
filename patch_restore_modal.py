import os
import re

backup_path = r'c:\Users\jgilb\OneDrive\Dokumen\bolt new\2_gudang lantai 5\devmode\060726 gudang 5 scan sub rak\gudang 5 scan sub rak\src\components\RiwayatBarang.tsx'
current_path = r'src\components\RiwayatBarang.tsx'

with open(backup_path, 'r', encoding='utf-8') as f:
    backup_code = f.read()

with open(current_path, 'r', encoding='utf-8') as f:
    current_code = f.read()

# We need to extract the RakMismatchResult interface, states, and functions.
# The user wants to replace the current minimal Cek Saldo modal with the original Analisis Rak Beda one.
# Looking at the backup, there's `interface RakMismatchResult`.
match = re.search(r'interface RakMismatchResult.*?}', backup_code, re.DOTALL)
rak_mismatch_interface = match.group(0) if match else ''

# Extract states: rakMismatchResults, isRakMismatchAnalyzing, isRakMismatchFixing
states_regex = r'const \[rakMismatchResults.*?setActiveAnalysisTab.*?;\n'
match = re.search(states_regex, backup_code, re.DOTALL)
if not match:
    # Manual extraction
    states = """  const [rakMismatchResults, setRakMismatchResults] = useState<RakMismatchResult[]>([]);
  const [isRakMismatchAnalyzing, setIsRakMismatchAnalyzing] = useState(false);
  const [isRakMismatchFixing, setIsRakMismatchFixing] = useState(false);
  const [activeAnalysisTab, setActiveAnalysisTab] = useState<'balance' | 'mismatch'>('mismatch');
  const [analysisSearchTerm, setAnalysisSearchTerm] = useState('');"""
else:
    states = match.group(0)

# Extract handleAnalyzeRakMismatch
match = re.search(r'const handleAnalyzeRakMismatch = async \(.*?\};$', backup_code, re.DOTALL | re.MULTILINE)
handle_analyze_rak_mismatch = ''
# It might have blank lines after, let's use a robust approach
# Find "const handleAnalyzeRakMismatch =" and grab until "const handleFixRakMismatch ="
idx_start = backup_code.find('const handleAnalyzeRakMismatch =')
idx_end = backup_code.find('const handleFixRakMismatch =', idx_start)
if idx_start != -1 and idx_end != -1:
    handle_analyze_rak_mismatch = backup_code[idx_start:idx_end].strip()

# Extract handleFixRakMismatch
idx_start_fix = backup_code.find('const handleFixRakMismatch =')
idx_end_fix = backup_code.find('const copyTableToClipboard =', idx_start_fix)
if idx_start_fix != -1 and idx_end_fix != -1:
    handle_fix_rak_mismatch = backup_code[idx_start_fix:idx_end_fix].strip()

# Extract the Modal UI
idx_modal_start = backup_code.find('<Modal\n        isOpen={isAnalysisModalOpen}')
if idx_modal_start == -1:
    idx_modal_start = backup_code.find('<Modal \n        isOpen={isAnalysisModalOpen}')
if idx_modal_start == -1:
    idx_modal_start = backup_code.find('<Modal\n        isOpen={isAnalysisModalOpen}')

# The modal ends with </Modal>
idx_modal_end = backup_code.find('</Modal>', idx_modal_start) + len('</Modal>')
modal_ui = backup_code[idx_modal_start:idx_modal_end]

print("Interface found:", bool(rak_mismatch_interface))
print("Analyze fn found:", bool(handle_analyze_rak_mismatch))
print("Fix fn found:", bool(handle_fix_rak_mismatch))
print("Modal found:", bool(modal_ui))

# Now inject into current_code
# 1. Inject Interface
if rak_mismatch_interface not in current_code:
    current_code = current_code.replace('interface BalanceAnalysisResult {', rak_mismatch_interface + '\n\ninterface BalanceAnalysisResult {')

# 2. Inject States
if 'rakMismatchResults' not in current_code:
    current_code = current_code.replace('const [analysisSku, setAnalysisSku] = useState(\'\');', 'const [analysisSku, setAnalysisSku] = useState(\'\');\n' + states)

# 3. Inject Functions
if 'handleAnalyzeRakMismatch' not in current_code:
    # Inject before handleAnalyzeStockBalance
    current_code = current_code.replace('const handleAnalyzeStockBalance =', handle_analyze_rak_mismatch + '\n\n' + handle_fix_rak_mismatch + '\n\n  const handleAnalyzeStockBalance =')

# 4. Replace Modal
current_modal_start = current_code.find('<Modal \n        isOpen={isAnalysisModalOpen}')
if current_modal_start == -1:
    current_modal_start = current_code.find('<Modal\n        isOpen={isAnalysisModalOpen}')
current_modal_end = current_code.find('</Modal>', current_modal_start) + len('</Modal>')
current_modal_ui = current_code[current_modal_start:current_modal_end]

current_code = current_code.replace(current_modal_ui, modal_ui)

with open(current_path, 'w', encoding='utf-8') as f:
    f.write(current_code)

print("Patch completed.")
