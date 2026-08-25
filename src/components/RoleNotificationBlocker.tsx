import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { AlertTriangle } from 'lucide-react';

interface ActiveNotification {
    id: string;
    message: string;
    target_role: string;
}

export function RoleNotificationBlocker() {
    const { userRole, user, loading } = useAuth();
    const [activeNotification, setActiveNotification] = useState<ActiveNotification | null>(null);
    const userRoleRef = useRef(userRole);

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
                return;
            }

            // Filter in JS: only match if target_role is 'all' or matches user's exact role
            const matchingNotif = data.find(notif => {
                const target = (notif.target_role || '').trim().toLowerCase();
                return target === 'all' || target === currentRole;
            });

            if (matchingNotif) {
                setActiveNotification(matchingNotif);
            } else {
                setActiveNotification(null);
            }
        } catch (err) {
            console.error('Failed to check active role notifications:', err);
            setActiveNotification(null);
        }
    };

    if (!activeNotification || !userRole || loading) return null;

    // IF there is an active notification, render a full-screen blocker
    return (
        <div className="fixed inset-0 z-[99999] bg-black/90 backdrop-blur-md overflow-y-auto">
            <div className="min-h-full w-full flex items-center justify-center p-4 sm:p-6">
                <div className="bg-white rounded-3xl p-5 sm:p-8 max-w-2xl w-full text-center shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
                    <div className="flex-shrink-0">
                        <div className="w-20 h-20 sm:w-24 sm:h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6 animate-pulse">
                            <AlertTriangle className="w-10 h-10 sm:w-12 sm:h-12 text-red-600" />
                        </div>
                        
                        <h1 className="text-2xl sm:text-3xl font-black text-gray-900 mb-4 uppercase tracking-wide">
                            PERHATIAN SEGERA!
                        </h1>
                    </div>
                    
                    <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 sm:p-6 mb-4 sm:mb-8 text-left overflow-y-auto flex-1 overscroll-contain">
                        <p className="text-base sm:text-xl text-red-800 font-semibold whitespace-pre-wrap leading-relaxed">
                            {activeNotification.message}
                        </p>
                    </div>
                    
                    <div className="flex-shrink-0 flex flex-col items-center justify-center gap-2 text-gray-500">
                        <div className="flex flex-col sm:flex-row items-center gap-2 text-center">
                            <div className="w-2 h-2 bg-red-500 rounded-full animate-ping hidden sm:block"></div>
                            <p className="font-medium text-sm sm:text-base">Menunggu Admin menutup peringatan ini...</p>
                        </div>
                        <p className="text-xs sm:text-sm text-center">Sistem terkunci sampai perintah diselesaikan.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
