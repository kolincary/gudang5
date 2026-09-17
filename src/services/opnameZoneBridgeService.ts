import { supabase } from '../lib/supabase';
import { notifyAppSettingsChange, subscribeAppSettingsChange } from '../lib/settingsSync';

export interface OpnameZoneSession {
    temp_rack: string;
    started_at: string;
    started_by: string;
    racks_range: string;
    active: boolean;
}

export interface ActiveOpnameZonesState {
    [prefix: string]: OpnameZoneSession;
}

const SETTINGS_KEY = 'active_opname_zones_session';
const LOCAL_STORAGE_KEY = 'active_opname_zones_cache';

// In-memory cache for fast synchronous access
let cachedZones: ActiveOpnameZonesState = {};
let isInitialized = false;
let listeners: Array<(zones: ActiveOpnameZonesState) => void> = [];

/**
 * Fetch and sync zones from Supabase app_settings
 */
const fetchLatestZonesFromSupabase = async (): Promise<ActiveOpnameZonesState> => {
    try {
        const { data, error } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', SETTINGS_KEY)
            .maybeSingle();

        if (!error && data && data.value) {
            const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
            cachedZones = parsed || {};
            try {
                localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cachedZones));
            } catch (e) {}
            notifyListeners();
        }
    } catch (err) {
        console.warn('Supabase app_settings fetch opname zones error:', err);
    }
    return cachedZones;
};

/**
 * Initialize cache from localStorage & Supabase app_settings
 */
export const initOpnameZoneBridgeService = async (): Promise<ActiveOpnameZonesState> => {
    if (isInitialized) return cachedZones;

    // 1. Read from localStorage
    try {
        const local = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (local) {
            cachedZones = JSON.parse(local);
        }
    } catch (e) {
        console.warn('Failed to parse opname zones from localStorage:', e);
    }

    // 2. Read from Supabase app_settings
    await fetchLatestZonesFromSupabase();

    // 3. Listen to real-time changes across tabs & devices via settingsSync
    subscribeAppSettingsChange(() => {
        fetchLatestZonesFromSupabase();
    });

    isInitialized = true;
    return cachedZones;
};

const notifyListeners = () => {
    listeners.forEach((fn) => {
        try {
            fn(cachedZones);
        } catch (e) {
            console.error('Error in opname zone change listener:', e);
        }
    });
};

/**
 * Subscribe to zone session changes across the app
 */
export const subscribeToOpnameZones = (callback: (zones: ActiveOpnameZonesState) => void): (() => void) => {
    listeners.push(callback);
    // Trigger immediately with current cached state
    callback(cachedZones);
    return () => {
        listeners = listeners.filter((l) => l !== callback);
    };
};

/**
 * Get current active opname zones
 */
export const getActiveOpnameZones = (): ActiveOpnameZonesState => {
    if (!isInitialized && typeof window !== 'undefined') {
        try {
            const local = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (local) cachedZones = JSON.parse(local);
        } catch (e) {}
    }
    return cachedZones;
};

/**
 * Extract prefix from rack name (e.g., 'A1' -> 'A', 'B-12' -> 'B', 'TEMP-A' -> 'TEMP-A')
 */
export const extractRackPrefix = (rackName?: string): string => {
    if (!rackName) return '';
    const clean = rackName.trim().toUpperCase();
    if (clean.startsWith('TEMP-') || clean.startsWith('TEMP')) return clean;
    const match = clean.match(/^([A-Z]+)/);
    return match ? match[1] : clean;
};

/**
 * Check if a prefix or rack belongs to an active Opname zone
 */
export const isOpnameZoneActive = (prefixOrRack: string): boolean => {
    const clean = (prefixOrRack || '').trim().toUpperCase();
    const prefix = clean.startsWith('TEMP') ? clean.replace('TEMP-', '').replace('TEMP', '') : extractRackPrefix(clean);
    const zones = getActiveOpnameZones();
    return !!(zones[prefix] && zones[prefix].active);
};

/**
 * Get the target TEMP rack for an active zone (e.g., 'A' -> 'TEMP-A')
 */
export const getTempRackForPrefix = (prefixOrRack: string): string | null => {
    const clean = (prefixOrRack || '').trim().toUpperCase();
    const prefix = clean.startsWith('TEMP') ? clean.replace('TEMP-', '').replace('TEMP', '') : extractRackPrefix(clean);
    const zones = getActiveOpnameZones();
    if (zones[prefix] && zones[prefix].active) {
        return zones[prefix].temp_rack || `TEMP-${prefix}`;
    }
    return null;
};

/**
 * Toggle (Activate/Deactivate) Opname Zone session
 */
export const toggleOpnameZoneSession = async (
    prefix: string,
    active: boolean,
    userEmail: string
): Promise<{ success: boolean; zones: ActiveOpnameZonesState }> => {
    const cleanPrefix = prefix.trim().toUpperCase();
    const current = Object.assign({}, getActiveOpnameZones());

    if (active) {
        current[cleanPrefix] = {
            temp_rack: `TEMP-${cleanPrefix}`,
            started_at: new Date().toISOString(),
            started_by: userEmail || 'system',
            racks_range: `${cleanPrefix}1-${cleanPrefix}999`,
            active: true
        };
    } else {
        if (current[cleanPrefix]) {
            current[cleanPrefix].active = false;
        }
    }

    cachedZones = current;
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(current));
    } catch (e) {}
    notifyListeners();

    try {
        // Upsert to Supabase app_settings
        const { error } = await supabase.from('app_settings').upsert({
            key: SETTINGS_KEY,
            value: current,
            updated_at: new Date().toISOString()
        }, { onConflict: 'key' });

        if (!error) {
            notifyAppSettingsChange({
                key: SETTINGS_KEY,
                value: current,
                timestamp: Date.now()
            });
        }
        return { success: !error, zones: current };
    } catch (err) {
        console.error('Error saving active opname zone session:', err);
        return { success: false, zones: current };
    }
};

/**
 * Helper to check if a SKU in a specific rack is verified in Stock Opname
 */
export const checkIfItemVerified = async (rack: string, sku: string): Promise<boolean> => {
    if (!rack || !sku) return false;
    const cleanRak = rack.trim().toUpperCase();
    if (cleanRak.startsWith('TEMP')) return false;

    try {
        // 1. Check database_log first (realtime multi-device audit log)
        const { data: vLogs, error: logErr } = await supabase
            .from('database_log')
            .select('gudang, created_at, id')
            .or(`rak.eq.${cleanRak},sub_rak.eq.${cleanRak}`)
            .ilike('sku', sku.trim())
            .in('gudang', ['VERIFY', 'UNVERIFY'])
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .limit(1);

        if (!logErr && vLogs && vLogs.length > 0) {
            return vLogs[0].gudang === 'VERIFY';
        }

        // 2. Fallback check stock_items is_verified column
        const { data: sItem, error: sErr } = await supabase
            .from('stock_items')
            .select('is_verified')
            .eq('rak', cleanRak)
            .ilike('nama_produk', sku.trim())
            .limit(1)
            .maybeSingle();

        if (!sErr && sItem && sItem.is_verified === true) {
            return true;
        }
    } catch (err) {
        console.warn('Error checking item verification status:', err);
    }
    return false;
};

/**
 * Smart Routing Helper for Outbound Deductions (InputBarangKeluar)
 * Resolves whether a deduction for a requested rack should be routed to a TEMP rack during active Opname.
 */
export interface OutRackResolution {
    routedRack: string;
    isBridge: boolean;
    originRack: string;
    tempRack?: string;
    zonePrefix?: string;
    explanation?: string;
}

export const resolveOutDeductionRack = (
    requestedRack: string,
    originStockAvailable: number,
    isOriginVerified: boolean
): OutRackResolution => {
    const cleanRequested = (requestedRack || '').trim().toUpperCase();

    // Case 1: Origin rack already has verified stock / finished Stock Opname
    if (isOriginVerified) {
        return {
            routedRack: cleanRequested,
            isBridge: false,
            originRack: cleanRequested,
            explanation: 'Sub-rak asal terverifikasi selesai (Validasi Normal)'
        };
    }

    // Case 2: Origin rack is already a TEMP rack
    if (cleanRequested.startsWith('TEMP')) {
        return {
            routedRack: cleanRequested,
            isBridge: false,
            originRack: cleanRequested,
            explanation: 'Pemotongan langsung pada rak transit'
        };
    }

    // Case 3: Check if origin rack's prefix is in an active Opname zone
    const prefix = extractRackPrefix(cleanRequested);
    const tempRack = getTempRackForPrefix(prefix);

    if (tempRack && isOpnameZoneActive(cleanRequested)) {
        return {
            routedRack: tempRack,
            isBridge: true,
            originRack: cleanRequested,
            tempRack: tempRack,
            zonePrefix: prefix,
            explanation: `Auto-Bridge: Dialihkan ke ${tempRack} (Zona ${prefix} sedang aktif Stock Opname)`
        };
    }

    // Default: Normal rack (zone is inactive/finished)
    return {
        routedRack: cleanRequested,
        isBridge: false,
        originRack: cleanRequested,
        explanation: 'Validasi Normal'
    };
};

