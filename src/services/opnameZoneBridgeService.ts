import { supabase } from '../lib/supabase';
import { notifyAppSettingsChange, subscribeAppSettingsChange } from '../lib/settingsSync';

export interface OpnameZoneSession {
    temp_rack: string;
    started_at: string;
    started_by: string;
    racks_range: string;
    active: boolean;
    items_moved?: number;
    origin_racks?: string[];
    batch_started_at?: string;
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
            } catch (e) { }
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
        } catch (e) { }
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
    } catch (e) { }
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
    if (isOriginVerified && originStockAvailable > 0) {
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

    if (tempRack && originStockAvailable <= 0) {
        return {
            routedRack: tempRack,
            isBridge: true,
            originRack: cleanRequested,
            tempRack: tempRack,
            zonePrefix: prefix,
            explanation: `Auto-Bridge: Stok dialihkan ke ${tempRack} karena Zona ${prefix} sedang dalam sesi Stock Opname`
        };
    }

    // Default: Normal rack
    return {
        routedRack: cleanRequested,
        isBridge: false,
        originRack: cleanRequested
    };
};

// =====================================================================
// BATCH MIGRATION: Move stock_items from prefix racks to TEMP rack
// =====================================================================

export interface BatchMoveProgress {
    total: number;
    moved: number;
    errors: string[];
    originRacks: string[];
}

/**
 * Batch-move all stock_items from racks matching a prefix (e.g., A1-A999) to TEMP-{prefix}.
 * Creates MOVE log entries in database_log for traceability.
 * Processes in batches of 50 to avoid timeouts.
 * 
 * @param prefix - The rack prefix (e.g., 'A')
 * @param userEmail - Who initiated the batch
 * @param onProgress - Optional callback for progress updates
 * @returns BatchMoveProgress with counts and any errors
 */
export const batchMoveToTemp = async (
    prefix: string,
    userEmail: string,
    onProgress?: (progress: BatchMoveProgress) => void
): Promise<BatchMoveProgress> => {
    const cleanPrefix = prefix.trim().toUpperCase();
    const tempRack = `TEMP-${cleanPrefix}`;
    const progress: BatchMoveProgress = { total: 0, moved: 0, errors: [], originRacks: [] };

    try {
        // 1. Fetch all stock_items in racks starting with this prefix that have stock > 0
        //    Use ilike pattern: A% but NOT TEMP-A%
        const { data: items, error: fetchErr } = await supabase
            .from('stock_items')
            .select('id, nama_produk, rak, sub_rak, tersedia, packing, satuan')
            .ilike('rak', `${cleanPrefix}%`)
            .not('rak', 'ilike', 'TEMP%')
            .gt('tersedia', 0);

        if (fetchErr) {
            progress.errors.push(`Fetch error: ${fetchErr.message}`);
            return progress;
        }

        if (!items || items.length === 0) {
            return progress; // Nothing to move
        }

        progress.total = items.length;
        const uniqueRacks = new Set<string>();
        const BATCH_SIZE = 50;
        const now = new Date();

        // 2. Process in batches
        for (let i = 0; i < items.length; i += BATCH_SIZE) {
            const batch = items.slice(i, i + BATCH_SIZE);

            // 2a. Create MOVE log entries for each item in this batch
            const logEntries = batch.map((item, idx) => {
                const originRak = (item.rak || '').trim();
                uniqueRacks.add(originRak);
                const createdAt = new Date(now.getTime() + i + idx).toISOString();
                return {
                    sku: item.nama_produk,
                    nama_barang: item.nama_produk,
                    packing: item.packing || '',
                    rak: tempRack,
                    sub_rak: tempRack,
                    rak_asal: originRak,
                    sub_rak_asal: item.sub_rak || originRak,
                    rak_tujuan: tempRack,
                    sub_rak_tujuan: tempRack,
                    jumlah: item.tersedia,
                    type: 'MOVE',
                    tgl: now.toISOString().split('T')[0],
                    waktu: now.toTimeString().split(' ')[0],
                    tgl_scan: now.toISOString().split('T')[0],
                    user_name: `System (Batch SO ${cleanPrefix})`,
                    gudang: 'STOCK_OPNAME_BATCH',
                    keterangan: `Batch Stock Opname: ${originRak} → ${tempRack}`,
                    created_at: createdAt
                };
            });

            // 2b. Insert MOVE logs
            const { error: logErr } = await supabase
                .from('database_log')
                .insert(logEntries);

            if (logErr) {
                progress.errors.push(`Log insert batch ${Math.floor(i / BATCH_SIZE) + 1}: ${logErr.message}`);
                // Continue anyway — we still try to update stock_items
            }

            // 2c. Update each stock_item's rak to TEMP
            for (const item of batch) {
                const { error: updateErr } = await supabase
                    .from('stock_items')
                    .update({
                        rak: tempRack,
                        sub_rak: tempRack,
                        updated_at: now.toISOString()
                    })
                    .eq('id', item.id);

                if (updateErr) {
                    progress.errors.push(`Update item ${item.nama_produk} (${item.rak}): ${updateErr.message}`);
                } else {
                    progress.moved++;
                }
            }

            // 2d. Report progress
            if (onProgress) {
                progress.originRacks = Array.from(uniqueRacks);
                onProgress({ ...progress });
            }
        }

        progress.originRacks = Array.from(uniqueRacks);
        return progress;

    } catch (err: any) {
        progress.errors.push(`Unexpected error: ${err.message || 'Unknown'}`);
        return progress;
    }
};

// =====================================================================
// SMART AUTO-FILL: Resolve rak for barcode scan during active Opname
// =====================================================================

export interface BarcodeScanRakResolution {
    /** Rak yang harus diisi di kolom Scan Barcode Rak (tempat potong stok) */
    resolvedRak: string;
    /** Rak asal sebelum dipindah ke TEMP (untuk info user) */
    originRak: string | null;
    /** Apakah resolusi ini karena sesi opname aktif */
    isOpnameBridge: boolean;
    /** Prefix zona yang aktif */
    zonePrefix: string | null;
    /** Penjelasan untuk UI */
    explanation: string | null;
    /** Tanggal scan yang digunakan */
    tglScanUsed: string;
}

/**
 * Smart resolver for Scan Barcode Rak auto-fill in InputBarangKeluar.
 * 
 * Flow:
 * 1. Check if any opname zone is active
 * 2. If active, search stock_items in TEMP-{prefix} for matching SKU
 * 3. Look up database_log MOVE records to find origin rack + match tgl_scan
 * 4. Return the appropriate rack (TEMP if data still there, origin if already pulled back)
 * 
 * @param sku - Product SKU from barcode
 * @param tglScan - Date extracted from barcode (YYYY-MM-DD)
 * @param uniqueCode - Optional unique code from barcode
 * @returns Resolution with rack, origin info, and explanation
 */
export const resolveRakForBarcodeScan = async (
    sku: string,
    tglScan: string,
    uniqueCode?: string
): Promise<BarcodeScanRakResolution | null> => {
    const cleanSku = (sku || '').trim();
    const cleanTglScan = (tglScan || '').trim();
    if (!cleanSku) return null;

    const zones = getActiveOpnameZones();
    const activeZones = Object.entries(zones).filter(([_, s]) => s && s.active);

    if (activeZones.length === 0) {
        // No active opname session — return null to let caller use default logic
        return null;
    }

    // For each active zone, check if SKU exists in the corresponding TEMP rack
    for (const [zonePrefix, session] of activeZones) {
        const tempRack = session.temp_rack || `TEMP-${zonePrefix}`;

        // Step 1: Check stock_items in TEMP rack for this SKU
        const { data: tempItems, error: tempErr } = await supabase
            .from('stock_items')
            .select('id, nama_produk, rak, tersedia')
            .ilike('nama_produk', cleanSku)
            .ilike('rak', tempRack)
            .gt('tersedia', 0)
            .limit(1);

        if (tempErr || !tempItems || tempItems.length === 0) {
            // SKU not found in this TEMP rack — check if it was already pulled back to origin racks
            const { data: originItems } = await supabase
                .from('stock_items')
                .select('id, nama_produk, rak, tersedia')
                .ilike('nama_produk', cleanSku)
                .ilike('rak', `${zonePrefix}%`)
                .not('rak', 'ilike', 'TEMP%')
                .gt('tersedia', 0)
                .limit(1);

            if (originItems && originItems.length > 0) {
                // Already pulled back to origin rack
                return {
                    resolvedRak: originItems[0].rak,
                    originRak: originItems[0].rak,
                    isOpnameBridge: true,
                    zonePrefix,
                    explanation: `✅ Barang sudah kembali ke rak ${originItems[0].rak} (Stock Opname Zona ${zonePrefix})`,
                    tglScanUsed: cleanTglScan
                };
            }
            continue; // Try next active zone
        }

        // Step 2: SKU found in TEMP rack — look up MOVE log to find origin rack and opname transfer date
        let originRak: string | null = null;
        let transferTglScan: string | null = null;

        // Query MOVE logs for this SKU into tempRack
        const { data: moveLogs } = await supabase
            .from('database_log')
            .select('rak_asal, rak_tujuan, tgl_scan, tgl, created_at')
            .ilike('sku', cleanSku)
            .eq('type', 'MOVE')
            .ilike('rak_tujuan', tempRack)
            .order('created_at', { ascending: false })
            .limit(10);

        if (moveLogs && moveLogs.length > 0) {
            originRak = moveLogs[0].rak_asal || null;
            transferTglScan = moveLogs[0].tgl_scan || moveLogs[0].tgl || null;
        }

        // Fallback to session started_at date or today
        if (!transferTglScan) {
            if (session.started_at) {
                transferTglScan = session.started_at.split('T')[0];
            } else {
                transferTglScan = new Date().toISOString().split('T')[0];
            }
        }

        // If no originRak found from MOVE, try to get origin from previous IN logs in zone racks
        if (!originRak) {
            const { data: inLogs } = await supabase
                .from('database_log')
                .select('rak')
                .ilike('sku', cleanSku)
                .eq('type', 'IN')
                .ilike('rak', `${zonePrefix}%`)
                .not('rak', 'ilike', 'TEMP%')
                .order('created_at', { ascending: false })
                .limit(1);

            if (inLogs && inLogs.length > 0) {
                originRak = inLogs[0].rak || null;
            }
        }

        // Return: potong dari TEMP dengan tgl_scan real-time transfer opname
        const effectiveTglScan = transferTglScan || cleanTglScan;
        return {
            resolvedRak: tempRack,
            originRak,
            isOpnameBridge: true,
            zonePrefix,
            explanation: originRak
                ? `⚡ Stock Opname Zona ${zonePrefix} aktif — Data di ${tempRack} (asal rak ${originRak})`
                : `⚡ Stock Opname Zona ${zonePrefix} aktif — Data di ${tempRack}`,
            tglScanUsed: effectiveTglScan
        };
    }

    // No match found in any active zone
    return null;
};

/**
 * Get the transfer date (tgl_scan) of an SKU in a TEMP rack during active opname
 */
export const getTempRackTransferDate = async (sku: string, tempRack: string): Promise<string> => {
    const today = new Date().toISOString().split('T')[0];
    try {
        const { data, error } = await supabase
            .from('database_log')
            .select('tgl_scan, tgl')
            .ilike('sku', sku.trim())
            .eq('type', 'MOVE')
            .ilike('rak_tujuan', tempRack.trim())
            .order('created_at', { ascending: false })
            .limit(1);

        if (!error && data && data.length > 0) {
            return data[0].tgl_scan || data[0].tgl || today;
        }
    } catch (e) {
        console.warn('Error fetching temp rack transfer date:', e);
    }
    return today;
};

/**
 * Get the origin rack for an item before it was moved to TEMP during batch Stock Opname.
 * Looks up database_log MOVE records with gudang='STOCK_OPNAME_BATCH'.
 */
export const getOpnameOriginRack = async (
    sku: string,
    tempRack: string
): Promise<string | null> => {
    try {
        const { data, error } = await supabase
            .from('database_log')
            .select('rak_asal')
            .ilike('sku', sku.trim())
            .eq('type', 'MOVE')
            .eq('gudang', 'STOCK_OPNAME_BATCH')
            .ilike('rak_tujuan', tempRack.trim())
            .order('created_at', { ascending: false })
            .limit(1);

        if (!error && data && data.length > 0) {
            return data[0].rak_asal || null;
        }
    } catch (err) {
        console.warn('Error looking up opname origin rack:', err);
    }
    return null;
};

/**
 * Count remaining items in a TEMP rack (for warning before deactivating zone)
 */
export const countRemainingTempItems = async (
    prefix: string
): Promise<{ count: number; totalStock: number }> => {
    const tempRack = `TEMP-${prefix.trim().toUpperCase()}`;
    try {
        const { data, error } = await supabase
            .from('stock_items')
            .select('tersedia')
            .ilike('rak', tempRack)
            .gt('tersedia', 0);

        if (!error && data) {
            return {
                count: data.length,
                totalStock: data.reduce((sum, item) => sum + (Number(item.tersedia) || 0), 0)
            };
        }
    } catch (err) {
        console.warn('Error counting remaining TEMP items:', err);
    }
    return { count: 0, totalStock: 0 };
};
