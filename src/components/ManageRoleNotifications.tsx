import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { AlertCircle, Plus, Trash2, CheckCircle, XCircle, Users } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

interface RoleNotification {
    id: string;
    message: string;
    target_role: string;
    is_active: boolean;
    created_at: string;
    created_by: string;
}

export function ManageRoleNotifications() {
    const { userEmail } = useAuth();
    const [notifications, setNotifications] = useState<RoleNotification[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Form state
    const [newMessage, setNewMessage] = useState('');
    const [targetRole, setTargetRole] = useState('staf_gudang');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const availableRoles = [
        { id: 'all', label: 'Semua Role (All)' },
        { id: 'staf_gudang', label: 'Staf Gudang' },
        { id: 'leader', label: 'Leader' },
        { id: 'admin', label: 'Admin' },
        { id: 'developer', label: 'Developer' }
    ];

    useEffect(() => {
        fetchNotifications();

        const channel = supabase
            .channel('role_notifications_changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'role_notifications' },
                () => {
                    fetchNotifications();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchNotifications = async () => {
        try {
            const { data, error } = await supabase
                .from('role_notifications')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setNotifications(data || []);
        } catch (err) {
            console.error('Error fetching notifications:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateNotification = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim()) return;

        setIsSubmitting(true);
        try {
            const { data, error } = await supabase
                .from('role_notifications')
                .insert({
                    message: newMessage.trim(),
                    target_role: targetRole,
                    is_active: true,
                    created_by: userEmail
                })
                .select('*')
                .single();

            if (error) throw error;
            if (data) {
                setNotifications(prev => [data, ...prev.filter(n => n.id !== data.id)]);
            } else {
                fetchNotifications();
            }
            setNewMessage('');
        } catch (err) {
            console.error('Error creating notification:', err);
            alert('Gagal membuat notifikasi');
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleStatus = async (id: string, currentStatus: boolean) => {
        // Optimistic UI update for immediate button state toggle without waiting for network/refresh
        setNotifications(prev =>
            prev.map(n => (n.id === id ? { ...n, is_active: !currentStatus } : n))
        );

        try {
            const { error } = await supabase
                .from('role_notifications')
                .update({ is_active: !currentStatus })
                .eq('id', id);

            if (error) {
                // Revert on error
                setNotifications(prev =>
                    prev.map(n => (n.id === id ? { ...n, is_active: currentStatus } : n))
                );
                throw error;
            }
        } catch (err) {
            console.error('Error toggling status:', err);
            alert('Gagal mengubah status');
        }
    };

    const deleteNotification = async (id: string) => {
        if (!confirm('Yakin ingin menghapus notifikasi ini?')) return;
        const previous = [...notifications];
        // Optimistic UI delete
        setNotifications(prev => prev.filter(n => n.id !== id));

        try {
            const { error } = await supabase
                .from('role_notifications')
                .delete()
                .eq('id', id);

            if (error) {
                setNotifications(previous);
                throw error;
            }
        } catch (err) {
            console.error('Error deleting notification:', err);
            alert('Gagal menghapus notifikasi');
        }
    };

    if (loading) {
        return (
            <div className="p-6 max-w-4xl mx-auto flex justify-center">
                <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-red-100 text-red-600 rounded-xl">
                    <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Kelola Notifikasi Wajib (Blocking)</h1>
                    <p className="text-gray-500 text-sm">Buat notifikasi yang tidak bisa ditutup oleh user sampai admin mematikannya.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Form Buat Notifikasi */}
                <div className="lg:col-span-1">
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-4 border-b border-gray-100 bg-gray-50">
                            <h2 className="font-semibold text-gray-800">Buat Peringatan Baru</h2>
                        </div>
                        <form onSubmit={handleCreateNotification} className="p-4 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Pesan / Perintah
                                </label>
                                <textarea
                                    required
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    placeholder="Contoh: Tolong ambil barcode yang sudah dicetak sekarang juga!"
                                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 min-h-[100px] resize-none"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Target Role
                                </label>
                                <div className="space-y-2">
                                    {availableRoles.map(role => (
                                        <label key={role.id} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-gray-50 border border-transparent has-[:checked]:border-red-200 has-[:checked]:bg-red-50">
                                            <input
                                                type="radio"
                                                name="targetRole"
                                                value={role.id}
                                                checked={targetRole === role.id}
                                                onChange={(e) => setTargetRole(e.target.value)}
                                                className="text-red-500 focus:ring-red-500"
                                            />
                                            <span className="text-sm font-medium text-gray-700">{role.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isSubmitting || !newMessage.trim()}
                                className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl font-medium transition-colors disabled:opacity-50"
                            >
                                <Plus className="w-5 h-5" />
                                {isSubmitting ? 'Membuat...' : 'Buat Notifikasi & Aktifkan'}
                            </button>
                        </form>
                    </div>
                </div>

                {/* List Notifikasi */}
                <div className="lg:col-span-2">
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-4 border-b border-gray-100 bg-gray-50">
                            <h2 className="font-semibold text-gray-800">Daftar Notifikasi</h2>
                        </div>
                        <div className="divide-y divide-gray-100">
                            {notifications.length === 0 ? (
                                <div className="p-8 text-center text-gray-400">
                                    Belum ada notifikasi yang dibuat
                                </div>
                            ) : (
                                notifications.map(notif => (
                                    <div key={notif.id} className={`p-4 transition-colors ${notif.is_active ? 'bg-red-50/50' : 'hover:bg-gray-50'}`}>
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                                                        notif.target_role === 'all' ? 'bg-purple-100 text-purple-700' :
                                                        notif.target_role === 'staf_gudang' ? 'bg-blue-100 text-blue-700' :
                                                        'bg-gray-100 text-gray-700'
                                                    }`}>
                                                        Target: {notif.target_role.toUpperCase()}
                                                    </span>
                                                    <span className="text-xs text-gray-500">
                                                        Oleh: {notif.created_by}
                                                    </span>
                                                </div>
                                                <p className="text-gray-800 font-medium whitespace-pre-wrap">{notif.message}</p>
                                                <div className="text-xs text-gray-400 mt-2">
                                                    Dibuat: {new Date(notif.created_at).toLocaleString('id-ID')}
                                                </div>
                                            </div>
                                            
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                <button
                                                    onClick={() => toggleStatus(notif.id, notif.is_active)}
                                                    className={`px-3 py-1.5 rounded-lg font-medium text-sm flex items-center gap-1 transition-colors ${
                                                        notif.is_active 
                                                            ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                                                            : 'bg-green-100 text-green-700 hover:bg-green-200'
                                                    }`}
                                                >
                                                    {notif.is_active ? (
                                                        <><XCircle className="w-4 h-4" /> Matikan</>
                                                    ) : (
                                                        <><CheckCircle className="w-4 h-4" /> Hidupkan</>
                                                    )}
                                                </button>
                                                <button
                                                    onClick={() => deleteNotification(notif.id)}
                                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Hapus permanen"
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
