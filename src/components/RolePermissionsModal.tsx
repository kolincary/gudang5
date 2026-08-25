import React, { useEffect, useState } from 'react';
import { Shield, X, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { 
    navigationItems, 
    devNavigationItems, 
    masterDataItems, 
    monitoringItems, 
    additionalMenuItems 
} from '../lib/menuConfig';

interface RolePermissionsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function RolePermissionsModal({ isOpen, onClose }: RolePermissionsModalProps) {
    const [activeTab, setActiveTab] = useState<'staf_gudang' | 'staf_admin'>('staf_gudang');
    const [permissions, setPermissions] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const allMenuGroups = [
        { title: 'Navigasi Utama', items: navigationItems },
        { title: 'Master Data', items: masterDataItems },
        { title: 'Monitoring Stok', items: monitoringItems },
        { title: 'Tools & Alat Tambahan', items: additionalMenuItems },
        { title: 'Dev Mode (Debug)', items: devNavigationItems },
    ];

    useEffect(() => {
        if (!isOpen) return;
        const fetchPermissions = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('role_permissions')
                    .select('menu_path')
                    .eq('role', activeTab);
                
                if (error && error.code !== '42P01') throw error;
                
                if (data) {
                    setPermissions(data.map(p => p.menu_path));
                } else {
                    setPermissions([]);
                }
            } catch (err) {
                console.error('Failed to fetch permissions:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchPermissions();
    }, [isOpen, activeTab]);

    const handleToggle = (href: string) => {
        setPermissions(prev => 
            prev.includes(href) 
                ? prev.filter(p => p !== href)
                : [...prev, href]
        );
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // Delete all existing for this role
            await supabase.from('role_permissions').delete().eq('role', activeTab);
            
            // Insert new ones
            if (permissions.length > 0) {
                const inserts = permissions.map(p => ({
                    role: activeTab,
                    menu_path: p
                }));
                const { error } = await supabase.from('role_permissions').insert(inserts);
                if (error) throw error;
            }
            alert('Hak akses berhasil disimpan!');
        } catch (err: any) {
            alert('Gagal menyimpan: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4">
            <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden animate-in zoom-in-95 duration-300 relative flex flex-col max-h-[95vh]">
                
                <div className="bg-blue-600 text-white p-5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Shield className="h-6 w-6" />
                        <div>
                            <h2 className="text-lg font-black uppercase tracking-tight">Pengaturan Akses Role</h2>
                            <p className="text-xs font-medium text-blue-100">Pilih menu apa saja yang bisa diakses oleh setiap role.</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex border-b border-gray-200">
                    <button 
                        onClick={() => setActiveTab('staf_gudang')}
                        className={`flex-1 py-4 text-sm font-black uppercase tracking-wider transition-colors ${activeTab === 'staf_gudang' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        Staf Gudang
                    </button>
                    <button 
                        onClick={() => setActiveTab('staf_admin')}
                        className={`flex-1 py-4 text-sm font-black uppercase tracking-wider transition-colors ${activeTab === 'staf_admin' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        Staf Admin
                    </button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-gray-50">
                    {loading ? (
                        <div className="text-center py-10 text-gray-400 font-bold uppercase text-xs">Memuat data...</div>
                    ) : (
                        <div className="space-y-6">
                            {allMenuGroups.map((group, idx) => (
                                <div key={idx} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                                    <div className="bg-gray-100 px-4 py-3 font-black text-xs text-gray-600 uppercase tracking-wider border-b border-gray-200">
                                        {group.title}
                                    </div>
                                    <div className="divide-y divide-gray-100">
                                        {group.items.map((item) => {
                                            const isChecked = permissions.includes(item.href);
                                            return (
                                                <label key={item.href} className="flex items-center justify-between px-4 py-3 hover:bg-blue-50/30 cursor-pointer group">
                                                    <div className="flex items-center gap-3">
                                                        <item.icon className={`w-5 h-5 ${isChecked ? 'text-blue-600' : 'text-gray-400'}`} />
                                                        <span className={`text-sm font-bold ${isChecked ? 'text-gray-900' : 'text-gray-500'}`}>{item.name}</span>
                                                    </div>
                                                    <div className="relative inline-flex items-center cursor-pointer">
                                                        <input 
                                                            type="checkbox" 
                                                            className="sr-only peer" 
                                                            checked={isChecked}
                                                            onChange={() => handleToggle(item.href)}
                                                        />
                                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                                    </div>
                                                </label>
                                            )
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-gray-200 bg-white flex justify-end gap-3">
                    <button 
                        onClick={onClose}
                        className="px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                    >
                        Batal
                    </button>
                    <button 
                        onClick={handleSave}
                        disabled={saving || loading}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-black rounded-xl transition-colors flex items-center gap-2"
                    >
                        <Save className="w-4 h-4" />
                        {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
                    </button>
                </div>
            </div>
        </div>
    );
}
