import os

backup_path = r'c:\Users\jgilb\OneDrive\Dokumen\bolt new\2_gudang lantai 5\devmode\060726 gudang 5 scan sub rak\gudang 5 scan sub rak\src\components\RiwayatBarang.tsx'
current_path = r'src\components\RiwayatBarang.tsx'

with open(backup_path, 'r', encoding='utf-8') as f:
    backup_code = f.read()

with open(current_path, 'r', encoding='utf-8') as f:
    current_code = f.read()

# Interface
idx_iface = backup_code.find('interface RakMismatchResult')
idx_iface_end = backup_code.find('}', idx_iface) + 1
rak_iface = backup_code[idx_iface:idx_iface_end]

# States
idx_states = backup_code.find('const [rakMismatchResults')
idx_states_end = backup_code.find(';', backup_code.find('const [analysisSearchTerm', idx_states)) + 1
states = backup_code[idx_states:idx_states_end]

# Functions
idx_fn = backup_code.find('const handleAnalyzeRakMismatch')
idx_fn_end = backup_code.find('const handleRunMigration')
functions = backup_code[idx_fn:idx_fn_end]

# Modal
idx_modal = backup_code.find('<Modal\n        isOpen={isAnalysisModalOpen}')
if idx_modal == -1:
    idx_modal = backup_code.find('<Modal \n        isOpen={isAnalysisModalOpen}')
if idx_modal == -1:
    idx_modal = backup_code.find('<Modal\n        isOpen={isAnalysisModalOpen}')
    if idx_modal == -1:
        idx_modal = backup_code.find('isOpen={isAnalysisModalOpen}')
        idx_modal = backup_code.rfind('<Modal', 0, idx_modal)

idx_modal_end = backup_code.find('</Modal>', idx_modal) + 8
# Also grab RedistributionPreviewModal if it exists right after
idx_redis = backup_code.find('<RedistributionPreviewModal', idx_modal_end)
if idx_redis != -1 and idx_redis - idx_modal_end < 50:
    idx_modal_end = backup_code.find('/>', idx_redis) + 2

modal_ui = backup_code[idx_modal:idx_modal_end]

print('Interface size:', len(rak_iface))
print('States size:', len(states))
print('Functions size:', len(functions))
print('Modal size:', len(modal_ui))

# Inject into current code
if 'interface RakMismatchResult' not in current_code:
    current_code = current_code.replace('interface BalanceAnalysisResult {', rak_iface + '\n\ninterface BalanceAnalysisResult {')

if 'rakMismatchResults' not in current_code:
    current_code = current_code.replace('const [analysisSku, setAnalysisSku] = useState(\'\');', 'const [analysisSku, setAnalysisSku] = useState(\'\');\n' + states)

if 'handleAnalyzeRakMismatch' not in current_code:
    # We want to replace the current handleAnalyzeStockBalance with ALL the functions
    idx_cur_fn = current_code.find('const handleAnalyzeStockBalance')
    idx_cur_fn_end = current_code.find('// --- Konstanta', idx_cur_fn)
    if idx_cur_fn_end == -1:
        idx_cur_fn_end = current_code.find('const handleOpenRekap', idx_cur_fn)
    if idx_cur_fn_end == -1:
        idx_cur_fn_end = current_code.find('const isDateValid', idx_cur_fn)
    current_code = current_code[:idx_cur_fn] + functions + current_code[idx_cur_fn_end:]

# Replace current modal
idx_cur_modal = current_code.find('isOpen={isAnalysisModalOpen}')
idx_cur_modal = current_code.rfind('<Modal', 0, idx_cur_modal)
idx_cur_modal_end = current_code.find('</Modal>', idx_cur_modal) + 8

current_code = current_code[:idx_cur_modal] + modal_ui + current_code[idx_cur_modal_end:]

with open(current_path, 'w', encoding='utf-8') as f:
    f.write(current_code)

print('Done')
