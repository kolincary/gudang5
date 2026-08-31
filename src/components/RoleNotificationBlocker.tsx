import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { AlertTriangle, Minimize2, Maximize2 } from 'lucide-react';

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
                // If this is a new notification or changed notification, reset minimized state so user sees it full screen
                if (matchingNotif.id !== lastNotifIdRef.current) {
                    setIsMinimized(false);
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

    if (!activeNotification || !userRole || loading) return null;

    // Render Minimized Floating Widget
    if (isMinimized) {
        return (
            <div className="fixed bottom-5 right-5 z-[99999] animate-in slide-in-from-bottom-5 duration-300">
                <div 
                    onClick={() => setIsMinimized(false)}
                    className="bg-gradient-to-r from-red-600 to-rose-600 text-white p-3.5 sm:p-4 rounded-2xl shadow-2xl border border-red-400/40 flex items-center gap-3 cursor-pointer hover:shadow-red-500/30 hover:scale-[1.02] transition-all max-w-sm sm:max-w-md backdrop-blur-md"
                >
                    <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0 shadow-inner">
                        <AlertTriangle className="w-5 h-5 text-white animate-pulse" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded text-white">
                                Peringatan Aktif
                            </span>
                            <span className="w-2 h-2 rounded-full bg-yellow-300 animate-ping"></span>
                        </div>
                        <p className="text-xs sm:text-sm font-semibold text-white/95 truncate mt-0.5">
                            {activeNotification.message}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsMinimized(false);
                        }}
                        className="px-3 py-1.5 bg-white text-red-700 hover:bg-red-50 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md transition-all shrink-0 hover:scale-105 active:scale-95"
                        title="Buka Layar Penuh"
                    >
                        <Maximize2 className="w-3.5 h-3.5" />
                        <span>Buka</span>
                    </button>
                </div>
            </div>
        );
    }

    // Render Full-Screen Modal (with Minimize button)
    return (
        <div className="fixed inset-0 z-[99999] bg-black/90 backdrop-blur-md overflow-y-auto">
            <div className="min-h-full w-full flex items-center justify-center p-4 sm:p-6">
                <div className="relative bg-white rounded-3xl p-5 sm:p-8 max-w-2xl w-full text-center shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
                    
                    {/* Minimize button in top-right */}
                    <button
                        type="button"
                        onClick={() => setIsMinimized(true)}
                        className="absolute top-4 right-4 p-2.5 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-900 transition-all flex items-center gap-1.5 text-xs font-bold cursor-pointer group shadow-sm"
                        title="Minimize / Kecilkan Notifikasi"
                    >
                        <Minimize2 className="w-4 h-4 text-gray-500 group-hover:text-gray-800 transition-transform group-hover:scale-110" />
                        <span className="hidden sm:inline">Kecilkan</span>
                    </button>

                    <div className="flex-shrink-0">
                        <div className="w-20 h-20 sm:w-24 sm:h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6 animate-pulse">
                            <AlertTriangle className="w-10 h-10 sm:w-12 sm:h-12 text-red-600" />
                        </div>
                        
                        <h1 className="text-2xl sm:text-3xl font-black text-gray-900 mb-4 uppercase tracking-wide">
                            PERHATIAN SEGERA!
                        </h1>
                    </div>
                    
                    <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 text-left overflow-y-auto flex-1 overscroll-contain">
                        <p className="text-base sm:text-xl text-red-800 font-semibold whitespace-pre-wrap leading-relaxed">
                            {activeNotification.message}
                        </p>
                    </div>
                    
                    {/* Action area: Minimize button & status note */}
                    <div className="flex-shrink-0 flex flex-col gap-3">
                        <button
                            type="button"
                            onClick={() => setIsMinimized(true)}
                            className="w-full py-2.5 px-4 bg-gradient-to-r from-gray-100 to-gray-200 hover:from-gray-200 hover:to-gray-300 text-gray-800 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-sm active:scale-[0.99] cursor-pointer"
                        >
                            <Minimize2 className="w-4 h-4 text-gray-600" />
                            <span>Kecilkan Notifikasi (Minimize) & Lanjutkan Bekerja</span>
                        </button>

                        <div className="flex flex-col items-center justify-center gap-1 text-gray-500">
                            <div className="flex flex-col sm:flex-row items-center gap-2 text-center">
                                <div className="w-2 h-2 bg-red-500 rounded-full animate-ping hidden sm:block"></div>
                                <p className="font-medium text-xs sm:text-sm">Menunggu Admin menonaktifkan peringatan ini...</p>
                            </div>
                            <p className="text-[11px] sm:text-xs text-gray-400 text-center">
                                Anda dapat mengecilkan jendela ini kapan saja dan membukanya kembali lewat tombol di pojok bawah.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

