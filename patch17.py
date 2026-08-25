import os

file_path = 'src/components/CekRak.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    code = f.read()

# Replace the value="" binding in CustomDropdown
old_dropdown = '''<CustomDropdown
                                        value=""
                                        onChange={(e) => handlePullDropdownSelect(e.target.value)}'''
new_dropdown = '''<CustomDropdown
                                        value={pullSearchTerm}
                                        onChange={(e) => {
                                            setPullSearchTerm(e.target.value);
                                            handlePullDropdownSelect(e.target.value);
                                        }}'''
code = code.replace(old_dropdown, new_dropdown)

# Since we open the modal with possibly empty pullSearchTerm, let's also clear it when opening
old_open_modal = '''setShowPullModal(true);'''
new_open_modal = '''setPullSearchTerm('');
                                    setShowPullModal(true);'''
code = code.replace(old_open_modal, new_open_modal)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(code)

print("Done patching.")
