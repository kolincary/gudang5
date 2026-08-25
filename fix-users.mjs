import fs from 'fs';

const filePath = 'src/components/UserManagement.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Interface
if (!content.includes('allowed_menus?: string[];')) {
  content = content.replace(
    '    is_blocked: boolean;\n    role: string;\n}',
    '    is_blocked: boolean;\n    role: string;\n    allowed_menus?: string[];\n}'
  );
}

// 2. toggle function
const toggleFunc = `
    const handleToggleBypassPin = async (userId: string, isChecked: boolean, currentMenus: string[] = []) => {
        try {
            const newMenus = isChecked 
                ? [...currentMenus, 'bypass_pin_log']
                : currentMenus.filter(m => m !== 'bypass_pin_log');
            
            const { error } = await supabase
                .from('app_users')
                .update({ allowed_menus: newMenus })
                .eq('id', userId);

            if (error) throw error;
            fetchUsers();
        } catch (err: any) {
            alert('Gagal mengupdate akses khusus: ' + err.message);
        }
    };
`;
if (!content.includes('handleToggleBypassPin')) {
  content = content.replace(
    '    const handleDeleteUser = async (userId: string, targetEmail: string) => {',
    toggleFunc + '\n    const handleDeleteUser = async (userId: string, targetEmail: string) => {'
  );
}

// 3. Header
if (!content.includes('>Akses Khusus<')) {
  content = content.replace(
    '<th className="px-6 py-4 text-center text-xs font-black text-gray-500 uppercase tracking-wider">Status</th>',
    '<th className="px-6 py-4 text-center text-xs font-black text-gray-500 uppercase tracking-wider">Akses Khusus</th>\n                                            <th className="px-6 py-4 text-center text-xs font-black text-gray-500 uppercase tracking-wider">Status</th>'
  );
}

// 4. Cell
const cellContent = `
                                                        <td className="px-6 py-4 text-center">
                                                            <label className="flex items-center justify-center gap-2 cursor-pointer">
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={user.allowed_menus?.includes('bypass_pin_log') || false}
                                                                    onChange={(e) => handleToggleBypassPin(user.id, e.target.checked, user.allowed_menus || [])}
                                                                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                                                                />
                                                                <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Skip PIN Log</span>
                                                            </label>
                                                        </td>`;

if (!content.includes('Skip PIN Log')) {
  content = content.replace(
    '                                                        <td className="px-6 py-4 text-center">\n                                                            {user.is_blocked ? (',
    cellContent + '\n                                                        <td className="px-6 py-4 text-center">\n                                                            {user.is_blocked ? ('
  );
}

fs.writeFileSync(filePath, content);
console.log('Fixed UserManagement.tsx');
