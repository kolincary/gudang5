import fs from 'fs';

const filePath = 'src/components/UserManagement.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Update AppUser interface to include allowed_menus
if (!content.includes('allowed_menus?: string[]')) {
  content = content.replace(
    'role: string;',
    'role: string;\n    allowed_menus?: string[];'
  );
}

// 2. Add handleToggleBypassPin function
const toggleFunction = `
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
    'const handleDeleteUser = async',
    toggleFunction + '\n    const handleDeleteUser = async'
  );
}

// 3. Add UI column for Skip PIN Log
if (!content.includes('>Akses Khusus<')) {
  content = content.replace(
    '<th className="px-6 py-4 text-center text-xs font-black text-gray-500 uppercase tracking-wider">Status</th>',
    '<th className="px-6 py-4 text-center text-xs font-black text-gray-500 uppercase tracking-wider">Akses Khusus</th>\n                                            <th className="px-6 py-4 text-center text-xs font-black text-gray-500 uppercase tracking-wider">Status</th>'
  );
}

// 4. Add checkbox cell
const toggleCell = `
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
    '<td className="px-6 py-4 text-center">\n                                                            {user.is_blocked ? (',
    toggleCell + '\n                                                        <td className="px-6 py-4 text-center">\n                                                            {user.is_blocked ? ('
  );
}

// Also fix colSpan in loading and empty states from 6 to 7
content = content.replace(/colSpan=\{6\}/g, 'colSpan={7}');

fs.writeFileSync(filePath, content);
console.log('UserManagement updated');
