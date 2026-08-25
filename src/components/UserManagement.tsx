import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { Users, Mail, Clock, RefreshCw, Search, Shield, Settings } from 'lucide-react';
import { RolePermissionsModal } from './RolePermissionsModal';

interface AppUser {
    id: string;
    email: string;
    full_name: string;
    avatar_url: string;
    last_login: string;
    created_at: string;
    is_blocked: boolean;
    role: string;
    allowed_menus?: string[];
}

export function UserManagement() {
    const { userEmail: currentUserEmail } = useAuth();
    const [users, setUsers] = useState<AppUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'Semua' | 'Aktif' | 'Blokir'>('Semua');
    const [tableExists, setTableExists] = useState(true);
    const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);

    const fetchUsers = async () => {
        setLoading(true);
        setTableExists(true);
        try {
            const { data, error } = await supabase
                .from('app_users')
                .select('*')
                .order('last_login', { ascending: false });

            if (error) {
                if (error.code === '42P01') { // PostgreSQL table does not exist error
                    setTableExists(false);
                    setUsers([]);
                } else {
                    throw error;
                }
            } else {
                setUsers(data || []);
            }
        } catch (err) {
            console.error('Error fetching users:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const filteredUsers = users.filter(u => {
        const matchesSearch = u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              u.full_name?.toLowerCase().includes(searchQuery.toLowerCase());
                              
        let matchesStatus = true;
        if (statusFilter === 'Aktif') {
            matchesStatus = !u.is_blocked;
        } else if (statusFilter === 'Blokir') {
            matchesStatus = u.is_blocked;
        }
        
        return matchesSearch && matchesStatus;
    });

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return d.toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const handleToggleBlock = async (userId: string, currentStatus: boolean, userEmail: string) => {
        if (userEmail === currentUserEmail) {
            alert('Anda tidak bisa memblokir akun Anda sendiri.');
            return;
        }
        
        const action = currentStatus ? 'Membuka blokir' : 'Memblokir';
        if (!confirm(`Apakah Anda yakin ingin ${action} user ini (${userEmail})?`)) return;

        try {
            const { error } = await supabase
                .from('app_users')
                .update({ is_blocked: !currentStatus })
                .eq('id', userId);

            if (error) throw error;
            fetchUsers(); // Refresh
        } catch (err: any) {
            alert('Gagal mengupdate status: ' + err.message);
        }
    };

    const handleRoleChange = async (userId: string, newRole: string) => {
        try {
            const { error } = await supabase
                .from('app_users')
                .update({ role: newRole })
                .eq('id', userId);

            if (error) throw error;
            fetchUsers();
        } catch (err: any) {
            alert('Gagal mengubah role: ' + err.message);
        }
    };

    const handleDeleteUser = async (userId: string, targetEmail: string) => {
        if (targetEmail === currentUserEmail) {
            alert('Anda tidak bisa menghapus akun Anda sendiri.');
            return;
        }

        if (!confirm(`PERINGATAN: Apakah Anda yakin ingin MENGHAPUS profil user ini (${targetEmail})? Data riwayat user ini mungkin akan hilang.`)) return;

        try {
            const { error } = await supabase
                .from('app_users')
                .delete()
                .eq('id', userId);

            if (error) throw error;
            fetchUsers(); // Refresh
        } catch (err: any) {
            alert('Gagal menghapus user: ' + err.message);
        }
    };

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

    return (
        <div className="flex flex-col h-full bg-slate-50 relative min-h-screen">
            <RolePermissionsModal 
                isOpen={isRoleModalOpen} 
                onClose={() => setIsRoleModalOpen(false)} 
            />
            {/* Full-width aesthetic header */}
            <div className="absolute top-0 left-0 right-0 h-[310px] bg-gradient-to-br from-indigo-900 via-blue-900 to-blue-800 rounded-b-[55px] shadow-2xl overflow-hidden z-0">
                {/* Decorative elements */}
                <div className="absolute top-0 left-0 w-full h-full opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-repeat" />
                <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob" />
                <div className="absolute top-12 -left-24 w-80 h-80 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-2000" />
            </div>

            {/* Main Content Container */}
            <div className="relative z-10 flex-1 flex flex-col pt-10 px-4 md:px-6 lg:px-10 pb-10">
                {/* Modern Header Content */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 pb-8 border-b border-white/10 mt-16 xl:mt-6">
                    <div className="flex items-center gap-5">
                        <div className="relative group">
                            <div className="absolute -inset-1 bg-white/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition duration-500"></div>
                            <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center relative shadow-xl">
                                <Users className="h-8 w-8 text-white" />
                            </div>
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-white tracking-tight drop-shadow-xl mb-1">USER<span className="text-blue-200 font-light"> MANAGEMENT</span></h1>
                            <p className="text-blue-100 text-sm font-medium tracking-wide flex items-center gap-2 opacity-90 drop-shadow-md">
                                <Shield className="w-4 h-4" />
                                Daftar Akses Keamanan Sistem
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={() => setIsRoleModalOpen(true)}
                            className="h-12 px-5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl backdrop-blur-md transition-all flex items-center gap-2 border border-white/20 shadow-xl hover:scale-105 active:scale-95"
                        >
                            <Settings className="h-4.5 w-4.5" />
                            <span className="hidden sm:inline">Hak Akses Menu</span>
                        </button>
                        <button
                            onClick={fetchUsers}
                            disabled={loading}
                            className="h-12 px-6 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl backdrop-blur-md transition-all flex items-center gap-3 border border-white/20 shadow-xl hover:scale-105 active:scale-95 group"
                        >
                            <RefreshCw className={`h-4.5 w-4.5 ${loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
                            <span className="hidden sm:inline">Segarkan Data</span>
                        </button>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
                        <div className="p-3 bg-blue-50 rounded-xl">
                            <Users className="h-6 w-6 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-black text-gray-900">{users.length}</p>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Users</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
                        <div className="p-3 bg-emerald-50 rounded-xl">
                            <Shield className="h-6 w-6 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-black text-gray-900">{users.filter(u => {
                                const lastLogin = new Date(u.last_login);
                                const now = new Date();
                                return (now.getTime() - lastLogin.getTime()) < 24 * 60 * 60 * 1000;
                            }).length}</p>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Aktif 24 Jam</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
                        <div className="p-3 bg-amber-50 rounded-xl">
                            <Mail className="h-6 w-6 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-sm font-black text-gray-900 truncate max-w-[180px]">{currentUserEmail || 'Belum Login'}</p>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Login Saat Ini</p>
                        </div>
                    </div>
                </div>

                {/* Table or Alert */}
                {!tableExists ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">
                        <Shield className="h-12 w-12 text-amber-500 mx-auto mb-4 opacity-50" />
                        <h3 className="text-lg font-black text-amber-900 uppercase tracking-tight mb-2">Tabel User Belum Aktif</h3>
                        <p className="text-amber-800 text-sm font-medium max-w-md mx-auto leading-relaxed">
                            Database <code className="bg-amber-200/50 px-1.5 py-0.5 rounded text-amber-900 font-bold">app_users</code> tidak ditemukan.
                            Data user baru akan otomatis tercatat setelah sistem logging diaktifkan.
                        </p>
                        <div className="mt-6 p-4 bg-white/50 rounded-xl inline-block text-left border border-amber-200/50">
                            <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-2 px-1">Info Login Anda:</p>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-black text-sm shadow-md">
                                    {(currentUserEmail || '?')[0].toUpperCase()}
                                </div>
                                <div>
                                    <p className="text-sm font-black text-gray-900">{currentUserEmail}</p>
                                    <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest bg-blue-100 px-2 py-0.5 rounded-full">Aktif Sekarang</span>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Filters and Search */}
                        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
                            <div className="relative w-full sm:max-w-md">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Cari user berdasarkan email atau nama..."
                                    className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all shadow-sm"
                                />
                            </div>
                            <div className="w-full sm:w-auto flex items-center gap-3">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider hidden sm:inline">Filter:</span>
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value as any)}
                                    className="w-full sm:w-auto bg-white border border-gray-200 text-gray-700 text-sm font-bold rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm transition-all cursor-pointer"
                                >
                                    <option value="Semua">Semua Status</option>
                                    <option value="Aktif">Hanya Aktif</option>
                                    <option value="Blokir">Hanya Diblokir</option>
                                </select>
                            </div>
                        </div>

                        {/* Users Table */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 border-b border-gray-100">
                                        <tr>
                                            <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-wider">User</th>
                                            <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Email & Role</th>
                                            <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Login Terakhir</th>
                                            <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Pertama Kali</th>
                                            <th className="px-6 py-4 text-center text-xs font-black text-gray-500 uppercase tracking-wider">Akses Khusus</th>
                                            <th className="px-6 py-4 text-center text-xs font-black text-gray-500 uppercase tracking-wider">Status</th>
                                            <th className="px-6 py-4 text-right text-xs font-black text-gray-500 uppercase tracking-wider">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {loading ? (
                                            <tr>
                                                <td colSpan={7} className="px-6 py-12 text-center">
                                                    <RefreshCw className="h-8 w-8 animate-spin text-blue-400 mx-auto mb-3" />
                                                    <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Memuat data...</p>
                                                </td>
                                            </tr>
                                        ) : filteredUsers.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="px-6 py-12 text-center">
                                                    <Users className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                                                    <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Tidak ada user ditemukan</p>
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredUsers.map((user) => {
                                                const isActive = (new Date().getTime() - new Date(user.last_login).getTime()) < 24 * 60 * 60 * 1000;
                                                const isCurrentUser = user.email === currentUserEmail;
                                                return (
                                                    <tr key={user.id} className={`hover:bg-blue-50/50 transition-colors ${isCurrentUser ? 'bg-blue-50/30' : ''}`}>
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-3">
                                                                {user.avatar_url ? (
                                                                    <img
                                                                        src={user.avatar_url}
                                                                        alt={user.full_name}
                                                                        className="w-10 h-10 rounded-full border-2 border-white shadow-sm object-cover"
                                                                        referrerPolicy="no-referrer"
                                                                    />
                                                                ) : (
                                                                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-black text-sm">
                                                                        {(user.full_name || user.email || '?')[0].toUpperCase()}
                                                                    </div>
                                                                )}
                                                                <div>
                                                                    <p className="font-bold text-gray-900">{user.full_name || '-'}</p>
                                                                    {isCurrentUser && (
                                                                        <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest bg-blue-100 px-2 py-0.5 rounded-full">Anda</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="flex flex-col gap-1">
                                                                <span className="text-sm text-gray-700 font-medium">{user.email}</span>
                                                                <select 
                                                                    value={user.role || 'staf_gudang'}
                                                                    onChange={(e) => handleRoleChange(user.id, e.target.value)}
                                                                    className={`text-xs font-bold px-2 py-1 rounded-md outline-none border cursor-pointer w-max ${
                                                                        user.role === 'developer' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                                                        user.role === 'staf_admin' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                                        'bg-gray-50 text-gray-700 border-gray-200'
                                                                    }`}
                                                                >
                                                                    <option value="staf_gudang">Staf Gudang</option>
                                                                    <option value="staf_admin">Staf Admin</option>
                                                                    <option value="developer">Developer</option>
                                                                </select>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-2 text-gray-600">
                                                                <Clock className="h-3.5 w-3.5 text-gray-400" />
                                                                <span className="text-sm font-medium">{formatDate(user.last_login)}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <span className="text-sm text-gray-500 font-medium">{formatDate(user.created_at)}</span>
                                                        </td>
                                                        <td className="px-6 py-4 text-center">
                                                            <label className="flex items-center justify-center gap-2 cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={user.allowed_menus?.includes('bypass_pin_log') || false}
                                                                    onChange={(e) => handleToggleBypassPin(user.id, e.target.checked, user.allowed_menus)}
                                                                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                                                />
                                                                <span className="text-xs font-bold text-gray-700">Skip PIN Log</span>
                                                            </label>
                                                        </td>
                                                        <td className="px-6 py-4 text-center">
                                                            {user.is_blocked ? (
                                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-700 rounded-full text-[10px] font-black uppercase tracking-wider border border-red-100">
                                                                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                                                                    Diblokir
                                                                </span>
                                                            ) : isActive ? (
                                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-black uppercase tracking-wider border border-emerald-100">
                                                                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                                                                    Aktif
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-50 text-gray-500 rounded-full text-[10px] font-black uppercase tracking-wider border border-gray-100">
                                                                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                                                                    Offline
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4 text-right">
                                                            <div className="flex items-center justify-end gap-2">
                                                                <button
                                                                    onClick={() => handleToggleBlock(user.id, user.is_blocked || false, user.email)}
                                                                    disabled={isCurrentUser}
                                                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${isCurrentUser ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-400' : user.is_blocked ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200' : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'}`}
                                                                >
                                                                    {user.is_blocked ? 'Buka Blokir' : 'Blokir'}
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteUser(user.id, user.email)}
                                                                    disabled={isCurrentUser}
                                                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${isCurrentUser ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-400' : 'bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200'}`}
                                                                >
                                                                    Hapus
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
