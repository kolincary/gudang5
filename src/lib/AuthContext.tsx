import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { verifyPin } from './pinValidator';
import type { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
    user: User | null;
    session: Session | null;
    loading: boolean;
    signInWithGoogle: () => Promise<void>;
    signInAsDevMode: (password: string) => Promise<boolean>;
    signOut: () => Promise<void>;
    userEmail: string;
    userName: string;
    userAvatar: string;
    userRole: string;
    userPermissions: string[];
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [mockUser, setMockUser] = useState<User | null>(() => {
        const stored = localStorage.getItem('dev_mock_user');
        return stored === 'true' ? {
            id: 'dev-mode-1234',
            email: 'devmode',
            app_metadata: {},
            user_metadata: { full_name: 'Dev Mode Admin' },
            aud: 'authenticated',
            created_at: new Date().toISOString()
        } as User : null;
    });
    const isDevMock = typeof window !== 'undefined' && (
        localStorage.getItem('dev_mock_user') === 'true' || 
        localStorage.getItem('devmode') === 'true'
    );

    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [userRole, setUserRole] = useState<string>(() => {
        if (isDevMock) return 'developer';
        return localStorage.getItem('cached_user_role') || '';
    });
    const [userPermissions, setUserPermissions] = useState<string[]>(() => {
        if (isDevMock) return ['*'];
        try {
            const cached = localStorage.getItem('cached_user_permissions');
            if (cached) return JSON.parse(cached);
        } catch (e) {}
        return [];
    });

    useEffect(() => {
        let isMounted = true;

        if (typeof window !== 'undefined') {
            const searchParams = new URLSearchParams(window.location.search);
            const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));

            // 1. Detect OAuth redirect errors (e.g. user cancelled or provider error)
            const errorDesc = searchParams.get('error_description') || searchParams.get('error') || hashParams.get('error_description') || hashParams.get('error');
            if (errorDesc) {
                console.error('OAuth Error detected:', errorDesc);
                const cleanMsg = decodeURIComponent(errorDesc.replace(/\+/g, ' '));
                alert('Login Google dibatalkan atau bermasalah: ' + cleanMsg);
                window.history.replaceState(null, '', window.location.pathname);
                setLoading(false);
                return;
            }
        }

        const hasAuthParamsInUrl = typeof window !== 'undefined' && (
            window.location.search.includes('code=') || 
            window.location.hash.includes('access_token=')
        );

        if (hasAuthParamsInUrl) {
            console.log('🔑 Supabase OAuth redirect detected, resolving authentication session...');
        }

        // Safety fallback timeout (longer if resolving OAuth redirect)
        const loadTimeout = setTimeout(() => {
            if (isMounted) {
                console.warn('Auth session loading safety timeout reached, stopping spinner...');
                setLoading(false);
            }
        }, hasAuthParamsInUrl ? 8000 : 3000);

        // 2. Register onAuthStateChange FIRST so no auth events are missed
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, newSession) => {
                console.log('🔄 Auth state changed:', event, newSession?.user?.email);
                if (!isMounted) return;

                if (newSession?.user) {
                    setSession(newSession);
                    setUser(newSession.user);
                    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
                        logUserLogin(newSession.user);
                    }
                    if (typeof window !== 'undefined' && (window.location.search.includes('code=') || window.location.hash.includes('access_token='))) {
                        window.history.replaceState(null, '', window.location.pathname);
                    }
                    clearTimeout(loadTimeout);
                    setLoading(false);
                } else if (event === 'SIGNED_OUT') {
                    clearTimeout(loadTimeout);
                    setSession(null);
                    setUser(null);
                    setLoading(false);
                } else if (event === 'INITIAL_SESSION' && !hasAuthParamsInUrl) {
                    clearTimeout(loadTimeout);
                    setLoading(false);
                }
            }
        );

        // 3. Check for existing session or handle implicit tokens
        const initAuth = async () => {
            try {
                if (typeof window !== 'undefined' && window.location.hash.includes('access_token=')) {
                    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
                    const accessToken = hashParams.get('access_token');
                    const refreshToken = hashParams.get('refresh_token');
                    if (accessToken) {
                        console.log('🔑 Supabase Implicit OAuth token detected, setting session...');
                        const { data: hashData, error: hashError } = await supabase.auth.setSession({
                            access_token: accessToken,
                            refresh_token: refreshToken || '',
                        });
                        if (hashData?.session && isMounted) {
                            setSession(hashData.session);
                            setUser(hashData.session.user ?? null);
                            if (hashData.session.user) logUserLogin(hashData.session.user);
                            window.history.replaceState(null, '', window.location.pathname);
                            clearTimeout(loadTimeout);
                            setLoading(false);
                            return;
                        }
                        if (hashError) {
                            console.warn('Implicit session notice:', hashError.message);
                        }
                    }
                }

                // Normal session check from persistent storage
                const { data: { session: currentSession }, error } = await supabase.auth.getSession();
                if (error) {
                    console.error('Session fetch error:', error);
                }
                if (currentSession?.user && isMounted) {
                    setSession(currentSession);
                    setUser(currentSession.user);
                    logUserLogin(currentSession.user);
                    if (typeof window !== 'undefined' && (window.location.search.includes('code=') || window.location.hash.includes('access_token='))) {
                        window.history.replaceState(null, '', window.location.pathname);
                    }
                    clearTimeout(loadTimeout);
                    setLoading(false);
                } else if (!hasAuthParamsInUrl && isMounted) {
                    setLoading(false);
                }
            } catch (err) {
                console.error('Session init exception:', err);
                if (isMounted) setLoading(false);
            }
        };

        initAuth();

        return () => {
            isMounted = false;
            clearTimeout(loadTimeout);
            subscription.unsubscribe();
        };
    }, []);

    // Effect to load role and permissions
    useEffect(() => {
        const effectiveUser = mockUser || user;
        if (!effectiveUser) {
            setUserRole('');
            localStorage.removeItem('cached_user_role');
            setUserPermissions([]);
            return;
        }

        const fetchRoleAndPermissions = async () => {
            try {
                let currentRole = localStorage.getItem('cached_user_role') || '';
                let allowedMenus: string[] = [];
                
                // DevMode logic
                if (effectiveUser.email === 'devmode') {
                    currentRole = 'developer';
                } else {
                    // Fetch role and allowed_menus from app_users
                    const { data: userData, error: userError } = await supabase
                        .from('app_users')
                        .select('role, allowed_menus')
                        .eq('email', effectiveUser.email)
                        .maybeSingle();

                    if (userError) throw userError;
                    if (userData?.role) currentRole = userData.role;
                    if (userData?.allowed_menus) allowedMenus = userData.allowed_menus;
                }

                setUserRole(currentRole);
                if (currentRole) {
                    localStorage.setItem('cached_user_role', currentRole);
                }

                if (currentRole === 'developer') {
                    // Developer gets access to everything by default (UI will bypass checks)
                    // We also merge with any specific user permissions like bypass_pin_log
                    const devPerms = ['*', ...allowedMenus];
                    setUserPermissions(devPerms);
                    try { localStorage.setItem('cached_user_permissions', JSON.stringify(devPerms)); } catch (e) {}
                } else {
                    // Fetch permissions for the role
                    const { data: permData, error: permError } = await supabase
                        .from('role_permissions')
                        .select('menu_path')
                        .eq('role', currentRole);

                    if (permError && permError.code !== '42P01') throw permError;
                    
                    let allPerms: string[] = [];
                    if (permData) {
                        // Normalize any legacy '/cek-rak-2' -> '/stock-opname'
                        allPerms = permData.map(p => p.menu_path === '/cek-rak-2' ? '/stock-opname' : p.menu_path);
                    }
                    
                    // Merge role permissions with user-specific allowed_menus
                    const normalizedAllowed = (allowedMenus || []).map(m => m === '/cek-rak-2' ? '/stock-opname' : m);
                    allPerms = [...allPerms, ...normalizedAllowed];
                    
                    const finalPerms = [...new Set(allPerms)];
                    setUserPermissions(finalPerms);
                    try { localStorage.setItem('cached_user_permissions', JSON.stringify(finalPerms)); } catch (e) {}
                }
            } catch (err) {
                console.error('Error fetching role permissions:', err);
                setUserRole('staf_gudang');
                const fallback = ['/'];
                setUserPermissions(fallback);
                try { localStorage.setItem('cached_user_permissions', JSON.stringify(fallback)); } catch (e) {}
            }
        };

        fetchRoleAndPermissions();

        const handlePermUpdate = () => {
            fetchRoleAndPermissions();
        };

        window.addEventListener('role-permissions-updated', handlePermUpdate);

        // Supabase Realtime subscription on role_permissions and app_users tables + broadcast
        const channel = supabase.channel('realtime_role_permissions_sync')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'role_permissions' }, () => {
                fetchRoleAndPermissions();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'app_users' }, () => {
                fetchRoleAndPermissions();
            })
            .on('broadcast', { event: 'permissions_changed' }, () => {
                fetchRoleAndPermissions();
            })
            .subscribe();

        return () => {
            window.removeEventListener('role-permissions-updated', handlePermUpdate);
            supabase.removeChannel(channel);
        };
    }, [user, mockUser]);

    const logUserLogin = async (user: User) => {
        try {
            const userData = {
                id: user.id,
                email: user.email,
                full_name: user.user_metadata?.full_name || user.user_metadata?.name || '',
                avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || '',
                last_login: new Date().toISOString(),
            };

            // Check if user already exists by email
            const { data: existing } = await supabase
                .from('app_users')
                .select('id, is_blocked')
                .eq('email', user.email)
                .maybeSingle();

            if (existing?.is_blocked) {
                alert('Akses Ditolak: Akun Anda telah diblokir dari sistem.');
                await supabase.auth.signOut();
                localStorage.clear();
                sessionStorage.clear();
                window.location.href = '/';
                return;
            }

            if (existing) {
                // User exists — update by email (handles project migration where id changed)
                const { error } = await supabase
                    .from('app_users')
                    .update({
                        id: user.id,
                        full_name: userData.full_name,
                        avatar_url: userData.avatar_url,
                        last_login: userData.last_login,
                    })
                    .eq('email', user.email);

                if (error) console.error('Error updating user login:', error);
            } else {
                // New user — insert
                const { error } = await supabase
                    .from('app_users')
                    .insert(userData);

                if (error) console.error('Error inserting user login:', error);
            }
        } catch (err) {
            console.error('Error in logUserLogin:', err);
        }
    };

    const signInWithGoogle = async () => {
        try {
            const redirectUrl = window.location.origin + window.location.pathname;
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: redirectUrl,
                    queryParams: {
                        access_type: 'offline',
                        prompt: 'select_account',
                    },
                },
            });
            if (error) {
                console.error('Error signing in with Google:', error);
                alert('Gagal membuka login Google: ' + error.message);
            }
        } catch (err: any) {
            console.error('Exception in signInWithGoogle:', err);
            alert('Terjadi kesalahan saat membuka Google Login: ' + (err?.message || err));
        }
    };

    const signInAsDevMode = async (password: string): Promise<boolean> => {
        // Verify using pinValidator (checks Supabase app_pins or 8888 fallback)
        const isValid = await verifyPin(password);
        if (!isValid) {
            return false;
        }

        const devUser = {
            id: 'dev-mode-1234',
            email: 'devmode',
            app_metadata: {},
            user_metadata: { full_name: 'Dev Mode Admin' },
            aud: 'authenticated',
            created_at: new Date().toISOString()
        } as User;
        
        localStorage.setItem('dev_mock_user', 'true');
        localStorage.setItem('devmode', 'true');
        setMockUser(devUser);
        return true;
    };

    const signOut = async () => {
        try {
            if (mockUser) {
                setMockUser(null);
                localStorage.clear(); // Clear all for safety
                window.location.href = '/';
                return;
            }

            // Standard Supabase logout
            await supabase.auth.signOut();

            // Force hard clear
            localStorage.clear();
            sessionStorage.clear();

            // Hard redirect to login to clear all states
            window.location.href = '/';
        } catch (err) {
            console.error('Sign-out failed, forcing reload:', err);
            localStorage.clear();
            window.location.href = '/';
        }
    };

    const effectiveUser = mockUser || user;
    const userEmail = effectiveUser?.email || '';
    const userName = effectiveUser?.user_metadata?.full_name || effectiveUser?.user_metadata?.name || userEmail;
    const userAvatar = effectiveUser?.user_metadata?.avatar_url || effectiveUser?.user_metadata?.picture || '';

    return (
        <AuthContext.Provider value={{
            user: effectiveUser,
            session,
            loading: loading && !mockUser,
            signInWithGoogle,
            signInAsDevMode,
            signOut,
            userEmail,
            userName,
            userAvatar,
            userRole,
            userPermissions,
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
