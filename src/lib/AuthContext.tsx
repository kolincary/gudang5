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
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [userRole, setUserRole] = useState<string>(() => localStorage.getItem('cached_user_role') || '');
    const [userPermissions, setUserPermissions] = useState<string[]>([]);

    useEffect(() => {
        let isInitialized = false;
        const loadTimeout = setTimeout(() => {
            if (!isInitialized) {
                console.warn('Auth session loading timed out, proceeding with current state...');
                setLoading(false);
            }
        }, 3000);

        const initAuth = async () => {
            try {
                if (typeof window !== 'undefined') {
                    const searchParams = new URLSearchParams(window.location.search);
                    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));

                    // 1. Detect OAuth redirect errors
                    const errorDesc = searchParams.get('error_description') || searchParams.get('error') || hashParams.get('error_description') || hashParams.get('error');
                    if (errorDesc) {
                        console.error('OAuth Error detected:', errorDesc);
                        const cleanMsg = decodeURIComponent(errorDesc.replace(/\+/g, ' '));
                        alert('Login Google dibatalkan atau bermasalah: ' + cleanMsg);
                        window.history.replaceState(null, '', window.location.pathname);
                        isInitialized = true;
                        clearTimeout(loadTimeout);
                        setLoading(false);
                        return;
                    }

                    // 2. PKCE Authorization Code (?code=...)
                    const code = searchParams.get('code');
                    if (code) {
                        window.history.replaceState(null, '', window.location.pathname);
                        console.log('🔑 Supabase PKCE OAuth code detected, exchanging for session...');
                        try {
                            const { data: codeData, error: codeError } = await supabase.auth.exchangeCodeForSession(code);
                            if (codeError) {
                                console.warn('PKCE code exchange notice:', codeError.message);
                            } else if (codeData?.session) {
                                setSession(codeData.session);
                                setUser(codeData.session.user ?? null);
                                if (codeData.session.user) {
                                    logUserLogin(codeData.session.user);
                                }
                                isInitialized = true;
                                clearTimeout(loadTimeout);
                                setLoading(false);
                                return;
                            }
                        } catch (codeEx) {
                            console.warn('PKCE exchange error (may already be handled):', codeEx);
                        }
                    }

                    // 3. Implicit token in hash (#access_token=...)
                    const accessToken = hashParams.get('access_token');
                    const refreshToken = hashParams.get('refresh_token');
                    if (accessToken) {
                        window.history.replaceState(null, '', window.location.pathname);
                        console.log('🔑 Supabase Implicit OAuth token detected, setting session explicitly...');
                        try {
                            const { data: hashData, error: hashError } = await supabase.auth.setSession({
                                access_token: accessToken,
                                refresh_token: refreshToken || '',
                            });
                            if (hashError) {
                                console.warn('Hash session notice:', hashError.message);
                            } else if (hashData?.session) {
                                setSession(hashData.session);
                                setUser(hashData.session.user ?? null);
                                if (hashData.session.user) {
                                    logUserLogin(hashData.session.user);
                                }
                                isInitialized = true;
                                clearTimeout(loadTimeout);
                                setLoading(false);
                                return;
                            }
                        } catch (hashEx) {
                            console.warn('Hash setSession error:', hashEx);
                        }
                    }
                }

                // 4. Standard session fetch from persistent storage
                const { data: { session }, error } = await supabase.auth.getSession();
                if (error) {
                    console.error('Session fetch error:', error);
                }
                if (session?.user) {
                    setSession(session);
                    setUser(session.user);
                    logUserLogin(session.user);
                }
            } catch (err) {
                console.error('Session fetch exception:', err);
            } finally {
                isInitialized = true;
                clearTimeout(loadTimeout);
                setLoading(false);
            }
        };

        initAuth();

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                console.log('🔄 Auth state changed:', event, session?.user?.email);
                if (session?.user) {
                    setSession(session);
                    setUser(session.user);
                    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
                        logUserLogin(session.user);
                    }
                } else if (event === 'SIGNED_OUT') {
                    setSession(null);
                    setUser(null);
                }
                setLoading(false);
            }
        );

        return () => subscription.unsubscribe();
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
                    setUserPermissions(['*', ...allowedMenus]);
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
                    
                    setUserPermissions([...new Set(allPerms)]);
                }
            } catch (err) {
                console.error('Error fetching role permissions:', err);
                setUserRole('staf_gudang');
                setUserPermissions([]);
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
