import { supabase } from './supabase';

const SETTINGS_CHANNEL_NAME = 'global-app-settings-sync';
let broadcastChannel: BroadcastChannel | null = null;
try {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        broadcastChannel = new BroadcastChannel('app_settings_broadcast_channel');
    }
} catch (e) {
    console.warn('BroadcastChannel not supported:', e);
}

/**
 * Notifies all listeners (local window, all open browser tabs, and all connected devices via Supabase WebSocket)
 * that an app_settings value has been updated.
 */
export const notifyAppSettingsChange = async (payload?: any) => {
    // 1. Dispatch local window event (instant 0ms in same window)
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('app_settings_local_change', { detail: payload }));
        // 2. Trigger localStorage change event for other tabs in same browser
        try {
            localStorage.setItem('app_settings_sync_trigger', Date.now().toString());
        } catch (e) {
            // ignore localStorage quota errors
        }
    }

    // 3. Modern BroadcastChannel API for cross-tab communication
    try {
        broadcastChannel?.postMessage({ type: 'APP_SETTINGS_UPDATED', timestamp: Date.now(), payload });
    } catch (e) {
        console.warn('BroadcastChannel postMessage error:', e);
    }

    // 4. Supabase Realtime WebSocket broadcast (cross-device & cross-network)
    try {
        const channel = supabase.channel(SETTINGS_CHANNEL_NAME);
        await channel.send({
            type: 'broadcast',
            event: 'app_settings_changed',
            payload: { timestamp: Date.now(), ...payload }
        });
    } catch (e) {
        console.warn('Supabase broadcast send error:', e);
    }
};

/**
 * Subscribes to all possible real-time notification vectors for app_settings changes:
 * - Local custom event
 * - LocalStorage storage event
 * - BroadcastChannel API
 * - Supabase Realtime WebSocket broadcast & postgres_changes
 * - Window focus / visibility change
 * - Fast background polling (every 3 seconds when tab is active)
 */
export const subscribeAppSettingsChange = (callback: () => void): (() => void) => {
    // 1. Local custom event
    const handleLocalEvent = () => callback();
    window.addEventListener('app_settings_local_change', handleLocalEvent);

    // 2. Storage event for other tabs
    const handleStorage = (e: StorageEvent) => {
        if (e.key === 'app_settings_sync_trigger') {
            callback();
        }
    };
    window.addEventListener('storage', handleStorage);

    // 3. BroadcastChannel
    const handleBroadcast = () => callback();
    if (broadcastChannel) {
        broadcastChannel.onmessage = handleBroadcast;
    }

    // 4. Window focus / visibilitychange
    const handleFocus = () => callback();
    window.addEventListener('focus', handleFocus);
    const handleVisibility = () => {
        if (document.visibilityState === 'visible') callback();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // 5. Supabase Realtime WebSocket Broadcast & Postgres Changes
    const supabaseChannel = supabase
        .channel(SETTINGS_CHANNEL_NAME)
        .on('broadcast', { event: 'app_settings_changed' }, () => {
            callback();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, () => {
            callback();
        })
        .subscribe();

    // 6. Polling backup (every 3 seconds when active)
    const pollInterval = setInterval(() => {
        if (document.visibilityState === 'visible') {
            callback();
        }
    }, 3000);

    return () => {
        window.removeEventListener('app_settings_local_change', handleLocalEvent);
        window.removeEventListener('storage', handleStorage);
        window.removeEventListener('focus', handleFocus);
        document.removeEventListener('visibilitychange', handleVisibility);
        clearInterval(pollInterval);
        supabase.removeChannel(supabaseChannel);
    };
};
