import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ClipboardList, Plus, Trash2, Shield, Calendar, CheckCircle2, Clock } from 'lucide-react';

export function DailyQuestManager() {
    const [quests, setQuests] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [formUser, setFormUser] = useState('');
    const [formSku, setFormSku] = useState('');
    const [formSystemStock, setFormSystemStock] = useState('');
    const [excludedUsers, setExcludedUsers] = useState<string[]>([]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Get Quests
            const { data: qData } = await supabase
                .from('daily_quests')
                .select('*')
                .order('created_at', { ascending: false });
            
            // Get Users
            const { data: uData } = await supabase
                .from('app_users')
                .select('email, full_name')
                .eq('is_blocked', false)
                .order('email', { ascending: true });

            if (qData) setQuests(qData);
            if (uData) setUsers(uData);
        } catch (err) {
            console.error('Error fetching data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleAddQuest = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formUser || !formSku || formSystemStock === '') return;
        try {
            if (formUser === 'ALL') {
                // Assign to all users except excluded ones
                const targetUsers = users.filter(u => !excludedUsers.includes(u.email));
                if (targetUsers.length === 0) {
                    alert('Tidak ada user yang tersisa untuk ditugaskan!');
                    return;
                }
                const inserts = targetUsers.map(u => ({
                    user_email: u.email,
                    target_sku: formSku,
                    system_stock: Number(formSystemStock)
                }));
                const { error } = await supabase.from('daily_quests').insert(inserts);
                if (error) throw error;
            } else {
                // Assign to single user
                const { error } = await supabase.from('daily_quests').insert({
                    user_email: formUser,
                    target_sku: formSku,
                    system_stock: Number(formSystemStock)
                });
                if (error) {
                    if (error.code === '23505') {
                        alert('User ini sudah ditugaskan quest untuk SKU tersebut hari ini!');
                        return;
                    }
                    throw error;
                }
            }

            setFormUser('');
            setFormSku('');
            setFormSystemStock('');
            setExcludedUsers([]);
            fetchData();
            alert('Quest berhasil ditambahkan!');
        } catch (err: any) {
            alert('Gagal menambah quest: ' + err.message);
        }
    };

    // Auto fetch stock based on SKU
    useEffect(() => {
        const fetchStock = async () => {
            if (!formSku || formSku.trim() === '') return;
            const sku = formSku.trim().toUpperCase();
            
            try {
                // 1. Get stok_awal from stock_items
                const { data: stockData, error: stockErr } = await supabase
                    .from('stock_items')
                    .select('stok_awal')
                    .eq('nama_produk', sku)
                    .eq('status', 'Aktif');
                
                if (stockErr) throw stockErr;
                
                const totalStokAwal = (stockData || []).reduce((sum, item) => sum + (Number(item.stok_awal) || 0), 0);

                // 2. Get IN/OUT logs from database_log
                const { data: logData, error: logErr } = await supabase
                    .from('database_log')
                    .select('type, jumlah')
                    .eq('sku', sku)
                    .in('type', ['IN', 'OUT']);
                
                if (logErr) throw logErr;

                let masuk = 0;
                let keluar = 0;
                (logData || []).forEach(log => {
                    if (log.type === 'IN') masuk += Number(log.jumlah) || 0;
                    if (log.type === 'OUT') keluar += Number(log.jumlah) || 0;
                });

                const totalQty = totalStokAwal + masuk - keluar;
                setFormSystemStock(totalQty.toString());
            } catch (err) {
                console.error('Failed to fetch system stock', err);
            }
        };

        const timer = setTimeout(() => {
            fetchStock();
        }, 800); // 800ms debounce

        return () => clearTimeout(timer);
    }, [formSku]);

    const handleDelete = async (id: string) => {
        if (!confirm('Hapus quest ini?')) return;
        try {
            const { error } = await supabase.from('daily_quests').delete().eq('id', id);
            if (error) throw error;
            fetchData();
        } catch (err: any) {
            alert('Gagal menghapus: ' + err.message);
        }
    };

    const handleDeleteAll = async () => {
        if (!confirm('PERINGATAN: Apakah Anda yakin ingin MENGHAPUS SEMUA riwayat quest? Tindakan ini tidak dapat dibatalkan!')) return;
        try {
            // Delete all records where ID is not null (which means all records)
            const { error } = await supabase.from('daily_quests').delete().not('id', 'is', null);
            if (error) throw error;
            fetchData();
            alert('Semua quest berhasil dihapus!');
        } catch (err: any) {
            alert('Gagal menghapus semua quest: ' + err.message);
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 relative min-h-screen">
            <div className="absolute top-0 left-0 right-0 h-[280px] bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-800 rounded-b-[55px] shadow-2xl z-0 overflow-hidden">
                 <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] bg-repeat" />
            </div>

            <div className="relative z-10 flex flex-col pt-10 px-4 md:px-6 lg:px-10 pb-10">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 pb-8 border-b border-white/10 mt-16 xl:mt-6">
                    <div className="flex items-center gap-5">
                        <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center relative shadow-xl">
                            <ClipboardList className="h-8 w-8 text-white" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-white tracking-tight drop-shadow-xl mb-1">QUEST<span className="text-purple-300 font-light"> HARIAN</span></h1>
                            <p className="text-indigo-100 text-sm font-medium tracking-wide flex items-center gap-2">
                                <Shield className="w-4 h-4" /> DevMode Stock Opname Manager
                            </p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Form Input */}
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden lg:col-span-1 h-fit">
                        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4">
                            <h2 className="text-white font-black uppercase tracking-wider text-sm flex items-center gap-2">
                                <Plus className="w-4 h-4" /> Buat Quest Baru
                            </h2>
                        </div>
                        <div className="p-5">
                            <form onSubmit={handleAddQuest} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">User (Staf Gudang)</label>
                                    <select 
                                        required
                                        value={formUser}
                                        onChange={e => setFormUser(e.target.value)}
                                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500"
                                    >
                                        <option value="">-- Pilih User --</option>
                                        <option value="ALL" className="font-bold text-purple-700">⭐ Semua User (Staf Gudang)</option>
                                        {users.map(u => (
                                            <option key={u.email} value={u.email}>{u.full_name || u.email}</option>
                                        ))}
                                    </select>
                                </div>
                                
                                {formUser === 'ALL' && (
                                    <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 animate-in fade-in slide-in-from-top-2">
                                        <label className="block text-xs font-bold text-purple-800 uppercase mb-2">
                                            Kecualikan User Berikut (Opsional):
                                        </label>
                                        <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                                            {users.map(u => (
                                                <label key={u.email} className="flex items-center gap-2 text-sm cursor-pointer p-1.5 hover:bg-purple-100/50 rounded-lg transition-colors">
                                                    <input 
                                                        type="checkbox"
                                                        checked={excludedUsers.includes(u.email)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setExcludedUsers(prev => [...prev, u.email]);
                                                            } else {
                                                                setExcludedUsers(prev => prev.filter(email => email !== u.email));
                                                            }
                                                        }}
                                                        className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                                                    />
                                                    <span className={`${excludedUsers.includes(u.email) ? 'text-gray-400 line-through' : 'text-gray-700 font-medium'}`}>
                                                        {u.full_name || u.email}
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Target SKU</label>
                                    <input 
                                        required
                                        type="text"
                                        value={formSku}
                                        onChange={e => setFormSku(e.target.value.toUpperCase())}
                                        placeholder="Ketik SKU Barang..."
                                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 font-bold"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Stok Sistem Saat Ini</label>
                                    <input 
                                        required
                                        type="number"
                                        value={formSystemStock}
                                        onChange={e => setFormSystemStock(e.target.value)}
                                        placeholder="Berdasarkan data aplikasi..."
                                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500"
                                    />
                                </div>
                                <button 
                                    type="submit"
                                    className="w-full mt-2 py-3 bg-purple-600 hover:bg-purple-700 text-white font-black text-sm uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95"
                                >
                                    Assign Quest
                                </button>
                            </form>
                        </div>
                    </div>

                    {/* Table List */}
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden lg:col-span-2">
                        <div className="bg-gray-50 p-4 border-b border-gray-100 flex items-center justify-between">
                            <h2 className="text-gray-700 font-black uppercase tracking-wider text-sm flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-gray-400" /> Riwayat Quest
                            </h2>
                            <div className="flex gap-2">
                                <button 
                                    onClick={handleDeleteAll} 
                                    disabled={quests.length === 0}
                                    className="text-xs font-bold text-rose-600 hover:bg-rose-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Hapus Semua
                                </button>
                                <button onClick={fetchData} className="text-xs font-bold text-purple-600 hover:bg-purple-50 px-3 py-1.5 rounded-lg transition-colors">
                                    Refresh
                                </button>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-gray-500 uppercase bg-gray-50/50 border-b border-gray-100 font-black">
                                    <tr>
                                        <th className="px-5 py-4">User</th>
                                        <th className="px-5 py-4">Target SKU</th>
                                        <th className="px-5 py-4 text-center">Sys Stock</th>
                                        <th className="px-5 py-4 text-center">Fisik Stock</th>
                                        <th className="px-5 py-4 text-center">Status</th>
                                        <th className="px-5 py-4">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {loading ? (
                                        <tr><td colSpan={6} className="text-center py-10 text-gray-400 font-bold uppercase text-xs">Memuat data...</td></tr>
                                    ) : quests.length === 0 ? (
                                        <tr><td colSpan={6} className="text-center py-10 text-gray-400 font-bold uppercase text-xs">Belum ada data quest</td></tr>
                                    ) : (
                                        quests.map((q) => {
                                            const isPending = q.status === 'PENDING';
                                            const isMatch = !isPending && Number(q.physical_stock) === Number(q.system_stock);
                                            return (
                                                <tr key={q.id} className="hover:bg-blue-50/30 transition-colors">
                                                    <td className="px-5 py-4 font-bold text-gray-900">{q.user_email}</td>
                                                    <td className="px-5 py-4 font-black text-purple-700">{q.target_sku}</td>
                                                    <td className="px-5 py-4 text-center font-mono font-bold text-gray-600">{q.system_stock}</td>
                                                    <td className="px-5 py-4 text-center">
                                                        {isPending ? (
                                                            <span className="text-gray-300">-</span>
                                                        ) : (
                                                            <span className={`font-mono font-black ${isMatch ? 'text-emerald-600' : 'text-rose-600 bg-rose-50 px-2 py-0.5 rounded'}`}>
                                                                {q.physical_stock}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-5 py-4 text-center">
                                                        {isPending ? (
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full text-[10px] font-black uppercase">
                                                                <Clock className="w-3 h-3" /> Pending
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-black uppercase">
                                                                <CheckCircle2 className="w-3 h-3" /> Selesai
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-5 py-4">
                                                        <button 
                                                            onClick={() => handleDelete(q.id)}
                                                            className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                                            title="Hapus Quest"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
