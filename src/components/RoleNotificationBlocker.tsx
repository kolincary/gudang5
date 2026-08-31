import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { BellRing, Minimize2, Maximize2 } from 'lucide-react';

interface ActiveNotification {
    id: string;
    message: string;
    target_role: string;
}

export function RoleNotificationBlocker() {
    const { userRole, user, loading } = useAuth();
    const [activeNotification, setActiveNotification] = useState<ActiveNotification | null>(null);
    const [isMinimized, setIsMinimized] = useState(false);
    const userRoleRef = useRef(userRole);
    const lastNotifIdRef = useRef<string | null>(null);

    // Keep ref updated to avoid stale closures in event listeners
    useEffect(() => {
        userRoleRef.current = userRole;
        if (user && !loading && userRole) {
            checkActiveNotifications();
        } else if (!userRole) {
            setActiveNotification(null);
        }
    }, [userRole, user, loading]);

    useEffect(() => {
        // Only run if user is logged in and role is resolved
        if (!user || loading || !userRole) return;

        checkActiveNotifications();

        const channelName = `role_notifs_${Math.random().toString(36).substring(7)}`;
        // Listen for changes in role_notifications table
        const channel = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'role_notifications' },
                () => {
                    checkActiveNotifications();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, userRole, loading]); // Only re-subscribe if user or role changes

    const checkActiveNotifications = async () => {
        try {
            const currentRole = (userRoleRef.current || userRole || '').trim().toLowerCase();
            if (!currentRole) {
                setActiveNotification(null);
                return;
            }

            // Fetch all active notifications
            const { data, error } = await supabase
                .from('role_notifications')
                .select('id, message, target_role')
                .eq('is_active', true)
                .order('created_at', { ascending: false });

            if (error) {
                if (error.code !== '42501' && error.code !== '401' && error.code !== 'PGRST301') {
                    console.error('Error fetching active role notifications:', error);
                }
                setActiveNotification(null);
                return;
            }

            if (!data || data.length === 0) {
                setActiveNotification(null);
                lastNotifIdRef.current = null;
                return;
            }

            // Filter in JS: only match if target_role is 'all' or matches user's exact role
            const matchingNotif = data.find(notif => {
                const target = (notif.target_role || '').trim().toLowerCase();
                return target === 'all' || target === currentRole;
            });

            if (matchingNotif) {
                const isSavedMinimized = localStorage.getItem(`minimized_notif_${matchingNotif.id}`) === 'true';
                if (matchingNotif.id !== lastNotifIdRef.current) {
                    setIsMinimized(isSavedMinimized);
                    lastNotifIdRef.current = matchingNotif.id;
                }
                setActiveNotification(matchingNotif);
            } else {
                setActiveNotification(null);
                lastNotifIdRef.current = null;
            }
        } catch (err) {
            console.error('Failed to check active role notifications:', err);
            setActiveNotification(null);
        }
    };

    const handleMinimize = () => {
        if (activeNotification) {
            localStorage.setItem(`minimized_notif_${activeNotification.id}`, 'true');
        }
        setIsMinimized(true);
    };

    const handleMaximize = () => {
        if (activeNotification) {
            localStorage.removeItem(`minimized_notif_${activeNotification.id}`);
        }
        setIsMinimized(false);
    };

    if (!activeNotification || !userRole || loading) return null;

    // Render Minimized: Slim Floating Header at Top-Right (leaves top-left hamburger menu completely accessible)
    if (isMinimized) {
        return (
            <div className="fixed top-3 right-3 sm:right-6 z-[99999] max-w-[calc(100vw-5.5rem)] sm:max-w-md pointer-events-auto animate-in slide-in-from-top-2 duration-200">
                <div 
                    onClick={handleMaximize}
                    className="bg-slate-900/95 hover:bg-slate-900 text-white pl-3 pr-1.5 py-1 rounded-full shadow-xl shadow-black/25 border border-slate-700/70 flex items-center gap-2 cursor-pointer backdrop-blur-md transition-all hover:scale-[1.01]"
                >
                    {/* Pulsing indicator tag */}
                    <div className="flex items-center gap-1.5 shrink-0">
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                        <span className="text-[10px] font-extrabold tracking-wider uppercase text-rose-300 bg-rose-500/20 px-1.5 py-0.5 rounded-full border border-rose-500/30">
                            Wajib
                        </span>
                    </div>

                    {/* Message Preview */}
                    <div className="flex-1 min-w-0 pr-1">
                        <p className="text-xs font-medium text-slate-200 truncate">
                            {activeNotification.message}
                        </p>
                    </div>

                    {/* Maximize Button */}
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleMaximize();
                        }}
                        className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-full text-xs font-bold flex items-center gap-1 transition-all shrink-0 hover:scale-105 active:scale-95 cursor-pointer"
                        title="Buka Layar Penuh"
                    >
                        <Maximize2 className="w-3 h-3 text-slate-300" />
                        <span>Buka</span>
                    </button>
                </div>
            </div>
        );
    }

    // Render Full-Screen Modal (Clean, Comfortable Colors, Single Minimize Button)
    return (
        <div className="fixed inset-0 z-[99999] bg-slate-950/75 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200">
            <div className="min-h-full w-full flex items-center justify-center p-4 sm:p-6">
                <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full text-center shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200 flex flex-col max-h-[88vh]">
                    
                    {/* Icon & Title */}
                    <div className="flex-shrink-0">
                        <div className="w-14 h-14 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-3.5 shadow-sm">
                            <BellRing className="w-7 h-7 animate-bounce" />
                        </div>
                        
                        <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight mb-1">
                            Pemberitahuan Wajib
                        </h2>
                        <p className="text-xs text-slate-500 font-medium mb-4">
                            Pesan instruksi dari Admin untuk tugas Anda
                        </p>
                    </div>
                    
                    {/* Message Box */}
                    <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 sm:p-5 mb-5 text-left overflow-y-auto flex-1 overscroll-contain">
                        <p className="text-sm sm:text-base text-slate-800 font-medium whitespace-pre-wrap leading-relaxed">
                            {activeNotification.message}
                        </p>
                    </div>
                    
                    {/* Action Area: Single Clear Minimize Button */}
                    <div className="flex-shrink-0 flex flex-col gap-2.5">
                        <button
                            type="button"
                            onClick={handleMinimize}
                            className="w-full py-3 px-5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-md shadow-slate-900/15 active:scale-[0.99] transition-all cursor-pointer"
                        >
                            <Minimize2 className="w-4 h-4 text-slate-300" />
                            <span>Kecilkan Notifikasi & Lanjutkan Bekerja</span>
                        </button>

                        <p className="text-[11px] text-slate-400 text-center">
                            Notifikasi akan mengambang di atas layar dan dapat dibuka kembali kapan saja.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}



