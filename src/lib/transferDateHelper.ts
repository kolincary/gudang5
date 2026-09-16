import { supabase } from './supabase';

export interface OriginalReceiptDateResult {
  tgl: string;
  tgl_scan: string;
  waktu: string;
}

export interface RealtimeDateTimeResult {
  todayTgl: string;
  nowWaktu: string;
  isoString: string;
  timestamp: number;
}

/**
 * Returns 100% deterministic, zero-padded local date and time strings.
 * Avoids any browser/OS locale inconsistencies (e.g., colons vs dots or AM/PM).
 */
export function getRealtimeDateTime(customDate?: Date): RealtimeDateTimeResult {
  const d = customDate || new Date();
  const pad = (n: number) => String(n).padStart(2, '0');

  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const date = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());

  return {
    todayTgl: `${year}-${month}-${date}`,
    nowWaktu: `${hours}.${minutes}.${seconds}`,
    isoString: d.toISOString(),
    timestamp: d.getTime()
  };
}

/**
 * Searches for the true original supplier receipt (type='IN' and gudang!='TRANSFER')
 * for a given SKU. Prioritizes matching rack if provided, then orders by newest created_at.
 * 
 * Returns pure original tgl, tgl_scan, and waktu without any minute additions or alterations.
 */
export async function getOriginalReceiptDate(
  sku: string,
  currentRack?: string
): Promise<OriginalReceiptDateResult> {
  const { todayTgl, nowWaktu } = getRealtimeDateTime();

  const fallback: OriginalReceiptDateResult = {
    tgl: todayTgl,
    tgl_scan: todayTgl,
    waktu: nowWaktu
  };

  const cleanSku = (sku || '').trim();
  if (!cleanSku) return fallback;

  try {
    // 1. First attempt: Look for genuine supplier receipts (type = 'IN' and gudang != 'TRANSFER')
    const { data: supplierLogs, error: supplierError } = await supabase
      .from('database_log')
      .select('tgl, tgl_scan, waktu, rak, created_at')
      .ilike('sku', cleanSku)
      .eq('type', 'IN')
      .neq('gudang', 'TRANSFER')
      .order('created_at', { ascending: false })
      .limit(50);

    if (supplierError) {
      console.warn('Error fetching supplier receipt in getOriginalReceiptDate:', supplierError);
    }

    if (supplierLogs && supplierLogs.length > 0) {
      // Prioritize matching rack if available
      let chosen = supplierLogs[0];
      if (currentRack) {
        const cleanRack = currentRack.trim().toLowerCase();
        const rackMatched = supplierLogs.find(l => l.rak && l.rak.trim().toLowerCase() === cleanRack);
        if (rackMatched) {
          chosen = rackMatched;
        }
      }

      const tgl = chosen.tgl || todayTgl;
      const tgl_scan = chosen.tgl_scan || chosen.tgl || todayTgl;
      const waktu = chosen.waktu || nowWaktu;

      return { tgl, tgl_scan, waktu };
    }

    // 2. Fallback attempt: If no direct supplier IN log found, search for any oldest IN log
    const { data: anyInLogs } = await supabase
      .from('database_log')
      .select('tgl, tgl_scan, waktu, rak, created_at')
      .ilike('sku', cleanSku)
      .eq('type', 'IN')
      .order('created_at', { ascending: true })
      .limit(10);

    if (anyInLogs && anyInLogs.length > 0) {
      const chosen = anyInLogs[0];
      return {
        tgl: chosen.tgl || todayTgl,
        tgl_scan: chosen.tgl_scan || chosen.tgl || todayTgl,
        waktu: chosen.waktu || nowWaktu
      };
    }
  } catch (err) {
    console.error('Exception in getOriginalReceiptDate:', err);
  }

  return fallback;
}

/**
 * Smart lookup: If the source rack is a temporary transit rack (TEMP-*),
 * it retrieves the latest transit receipt date (from Real-Time transfer into TEMP)
 * to prevent reverting back to ancient supplier dates during Stock Opname pulls.
 * Otherwise, falls back to original supplier receipt date.
 */
export async function getTransitOrOriginalReceiptDate(
  sku: string,
  sourceRack?: string
): Promise<OriginalReceiptDateResult> {
  const cleanRack = (sourceRack || '').trim().toUpperCase();

  // If source is a TEMP transit rack, check the latest IN log into that TEMP rack
  if (cleanRack.startsWith('TEMP')) {
    const cleanSku = (sku || '').trim();
    if (cleanSku) {
      try {
        const { data: tempInLogs } = await supabase
          .from('database_log')
          .select('tgl, tgl_scan, waktu, rak, created_at')
          .ilike('sku', cleanSku)
          .ilike('rak', cleanRack)
          .eq('type', 'IN')
          .order('created_at', { ascending: false })
          .limit(1);

        if (tempInLogs && tempInLogs.length > 0) {
          const log = tempInLogs[0];
          const { todayTgl, nowWaktu } = getRealtimeDateTime();
          return {
            tgl: log.tgl || todayTgl,
            tgl_scan: log.tgl_scan || log.tgl || todayTgl,
            waktu: log.waktu || nowWaktu
          };
        }
      } catch (e) {
        console.warn('Error fetching TEMP in log in getTransitOrOriginalReceiptDate:', e);
      }
    }
  }

  // Fallback to standard supplier receipt date
  return getOriginalReceiptDate(sku, sourceRack);
}

