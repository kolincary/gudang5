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
        // 🔒 SECURITY: DevMode hanya aktif di development (npm run dev)
        if (import.meta.env.PROD) return null;
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
        // Safe timeout for loading state
        const loadTimeout = setTimeout(() => {
            if (loading) {
                console.warn('Auth session loading timed out, proceeding with current state...');
                setLoading(false);
            }
        }, 5000);

        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                logUserLogin(session.user);
                // Clean up URL if it contains auth tokens
                if (window.location.hash.includes('access_token=')) {
                    window.history.replaceState(null, '', window.location.pathname + window.location.search);
                }
            }
            setLoading(false);
            clearTimeout(loadTimeout);
        }).catch(err => {
            console.error('Session fetch error:', err);
            setLoading(false);
            clearTimeout(loadTimeout);
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (_event, session) => {
                setSession(session);
                setUser(session?.user ?? null);
                if (_event === 'SIGNED_IN' && session?.user) {
                    logUserLogin(session.user);
                    // Clean up URL on sign in
                    if (window.location.hash.includes('access_token=')) {
                        window.history.replaceState(null, '', window.location.pathname + window.location.search);
                    }
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
                        allPerms = permData.map(p => p.menu_path);
                    }
                    
                    // Merge role permissions with user-specific allowed_menus
                    allPerms = [...allPerms, ...allowedMenus];
                    
                    setUserPermissions([...new Set(allPerms)]);
                }
            } catch (err) {
                console.error('Error fetching role permissions:', err);
                setUserRole('staf_gudang');
                setUserPermissions([]);
            }
        };

        fetchRoleAndPermissions();
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
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin,
            },
        });
        if (error) {
            console.error('Error signing in with Google:', error);
        }
    };

    const signInAsDevMode = async (password: string): Promise<boolean> => {
        // 🔒 SECURITY: DevMode dinonaktifkan di production
        if (import.meta.env.PROD) {
            console.warn('DevMode tidak tersedia di production.');
            return false;
        }

        // Verify using pinValidator (checks Supabase app_pins)
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
