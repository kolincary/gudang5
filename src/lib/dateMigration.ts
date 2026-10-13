import { supabase } from './supabase';

/**
 * Standardizes a date string to YYYY-MM-DD format.
 * Handles: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, YYYY/MM/DD
 */
export const standardizeDate = (dateStr: string): string | null => {
    if (!dateStr) return null;

    const cleanStr = dateStr.trim();

    // Format 1: YYYY-MM-DD (Already correct?)
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) {
        return cleanStr;
    }

    // Format 2: DD/MM/YYYY or DD-MM-YYYY
    // Regex matches: 1-2 digits, separator, 1-2 digits, separator, 4 digits
    const ddmmyyyyMatch = cleanStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (ddmmyyyyMatch) {
        const day = ddmmyyyyMatch[1].padStart(2, '0');
        const month = ddmmyyyyMatch[2].padStart(2, '0');
        const year = ddmmyyyyMatch[3];
        return `${year}-${month}-${day}`;
    }

    // Format 3: YYYY/MM/DD
    const yyyymmddMatch = cleanStr.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (yyyymmddMatch) {
        const year = yyyymmddMatch[1];
        const month = yyyymmddMatch[2].padStart(2, '0');
        const day = yyyymmddMatch[3].padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    return null;
};

export const runDateMigration = async (onProgress: (current: number, total: number) => void) => {
    console.log('Starting Date Migration (tgl & tgl_scan)...');

    const { count, error: countError } = await supabase
        .from('database_log')
        .select('*', { count: 'exact', head: true });

    if (countError) throw countError;
    const total = count || 0;
    console.log(`Total rows to check: ${total}`);

    const pageSize = 1000;
    let processed = 0;
    let updatedCount = 0;

    for (let from = 0; from < total; from += pageSize) {
        const { data: batch, error } = await supabase
            .from('database_log')
            .select('id, tgl, tgl_scan')
            .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!batch) continue;

        const updates = [];

        for (const item of batch) {
            const updateObj: any = { id: item.id };
            let needsUpdate = false;

            if (item.tgl) {
                const standardizedTgl = standardizeDate(item.tgl);
                if (standardizedTgl && standardizedTgl !== item.tgl) {
                    updateObj.tgl = standardizedTgl;
                    needsUpdate = true;
                }
            }

            if (item.tgl_scan) {
                const standardizedTglScan = standardizeDate(item.tgl_scan);
                if (standardizedTglScan && standardizedTglScan !== item.tgl_scan) {
                    updateObj.tgl_scan = standardizedTglScan;
                    needsUpdate = true;
                }
            }

            if (needsUpdate) {
                updates.push(updateObj);
            }
        }

        if (updates.length > 0) {
            const updateChunks = chunkArray(updates, 20);
            for (const chunk of updateChunks) {
                await Promise.all(chunk.map(update => {
                    const { id, ...data } = update;
                    return supabase
                        .from('database_log')
                        .update(data)
                        .eq('id', id);
                }));
                updatedCount += chunk.length;
            }
        }

        processed += batch.length;
        onProgress(processed, total);
    }

    console.log(`Migration complete. Updated ${updatedCount} rows.`);
    return updatedCount;
};

/**
 * Repairs tgl_scan for IN transactions where tgl_scan was incorrectly set by migration/bulk import.
 * It will sync tgl_scan with tgl for affected records.
 */
export const runScanDateRepair = async (
    onProgress: (current: number, total: number) => void,
    targetSku?: string
) => {
    const cleanSku = (targetSku || '').trim();
    console.log(`Starting Scan Date Repair (IN transactions)${cleanSku ? ` for SKU: ${cleanSku}` : ' for ALL SKUs'}...`);

    // 1. Fetch only problematic IN entries (filtered by SKU if specified)
    let countQuery = supabase
        .from('database_log')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'IN');

    if (cleanSku) {
        countQuery = countQuery.ilike('sku', cleanSku);
    }

    const { count, error: countError } = await countQuery;

    if (countError) throw countError;
    const total = count || 0;
    console.log(`Total IN rows to analyze: ${total}`);

    const pageSize = 1000;
    let processed = 0;
    let repairedCount = 0;

    for (let from = 0; from < total; from += pageSize) {
        let batchQuery = supabase
            .from('database_log')
            .select('id, tgl, tgl_scan')
            .eq('type', 'IN');

        if (cleanSku) {
            batchQuery = batchQuery.ilike('sku', cleanSku);
        }

        const { data: batch, error } = await batchQuery.range(from, from + pageSize - 1);

        if (error) throw error;
        if (!batch) continue;

        const updates = [];

        for (const item of batch) {
            if (!item.tgl) continue;

            const targetTgl = standardizeDate(item.tgl) || item.tgl;
            const currentTglScan = item.tgl_scan ? (standardizeDate(item.tgl_scan) || item.tgl_scan) : null;

            // Logic: If tgl_scan is missing, or it doesn't match the standardized tgl, 
            // and it looks like a migration date (e.g., mismatching the transaction date)
            // For IN transactions, tgl_scan should ideally match tgl if inserted via standard tools
            // but the user specifically mentioned migration issues.

            // If they are different, we sync them if it's an IN transaction that was migrated.
            // We'll also standardize the tgl_scan regardless.

            if (currentTglScan !== targetTgl) {
                updates.push({
                    id: item.id,
                    tgl_scan: targetTgl
                });
            } else if (item.tgl_scan !== currentTglScan) {
                // Just a standardization fix
                updates.push({
                    id: item.id,
                    tgl_scan: currentTglScan
                });
            }
        }

        if (updates.length > 0) {
            const updateChunks = chunkArray(updates, 20);
            for (const chunk of updateChunks) {
                await Promise.all(chunk.map(update =>
                    supabase
                        .from('database_log')
                        .update({ tgl_scan: update.tgl_scan })
                        .eq('id', update.id)
                ));
                repairedCount += chunk.length;
            }
        }

        processed += batch.length;
        onProgress(processed, total);
    }

    console.log(`Repair complete. Repaired ${repairedCount} rows.`);
    return repairedCount;
};

function chunkArray<T>(array: T[], size: number): T[][] {
    const result = [];
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }
    return result;
}
