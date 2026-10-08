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
 * Searches for the true original supplier receipt (type='IN')
 * for a given SKU. Prioritizes matching rack if provided, then orders by newest created_at.
 * 
 * Returns pure original tgl, tgl_scan, and waktu.
 */
export async function getOriginalReceiptDate(
  sku?: string,
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
    const cleanRack = (currentRack || '').trim();

    // 1. Prioritas 1: Log masuk supplier asli (type='IN' dan gudang!='TRANSFER') di rak saat ini
    if (cleanRack) {
      const { data: supplierLogs, error: supErr } = await supabase
        .from('database_log')
        .select('tgl, tgl_scan, waktu, rak, created_at')
        .ilike('sku', cleanSku)
        .ilike('rak', cleanRack)
        .eq('type', 'IN')
        .neq('gudang', 'TRANSFER')
        .order('created_at', { ascending: false })
        .limit(10);

      if (!supErr && supplierLogs && supplierLogs.length > 0) {
        const chosen = supplierLogs[0];
        return {
          tgl: chosen.tgl || todayTgl,
          tgl_scan: chosen.tgl_scan || chosen.tgl || todayTgl,
          waktu: chosen.waktu || nowWaktu
        };
      }

      // 2. Prioritas 2: Log IN apa pun di rak ini (misal hasil transfer masuk sebelumnya, pertahankan tgl nota asalnya)
      const { data: anyRackInLogs, error: anyRackErr } = await supabase
        .from('database_log')
        .select('tgl, tgl_scan, waktu, rak, created_at')
        .ilike('sku', cleanSku)
        .ilike('rak', cleanRack)
        .eq('type', 'IN')
        .order('created_at', { ascending: false })
        .limit(10);

      if (!anyRackErr && anyRackInLogs && anyRackInLogs.length > 0) {
        const chosen = anyRackInLogs[0];
        return {
          tgl: chosen.tgl || todayTgl,
          tgl_scan: chosen.tgl_scan || chosen.tgl || todayTgl,
          waktu: chosen.waktu || nowWaktu
        };
      }
    }

    // 3. Prioritas 3: Log masuk supplier asli di rak mana pun untuk SKU ini
    const { data: globalSupplierLogs, error: globErr } = await supabase
      .from('database_log')
      .select('tgl, tgl_scan, waktu, rak, created_at')
      .ilike('sku', cleanSku)
      .eq('type', 'IN')
      .neq('gudang', 'TRANSFER')
      .order('created_at', { ascending: false })
      .limit(10);

    if (!globErr && globalSupplierLogs && globalSupplierLogs.length > 0) {
      const chosen = globalSupplierLogs[0];
      return {
        tgl: chosen.tgl || todayTgl,
        tgl_scan: chosen.tgl_scan || chosen.tgl || todayTgl,
        waktu: chosen.waktu || nowWaktu
      };
    }

    // 4. Prioritas 4: Log IN terbaru apa pun untuk SKU ini
    const { data: anyInLogs, error: anyErr } = await supabase
      .from('database_log')
      .select('tgl, tgl_scan, waktu, rak, created_at')
      .ilike('sku', cleanSku)
      .eq('type', 'IN')
      .order('created_at', { ascending: false })
      .limit(5);

    if (!anyErr && anyInLogs && anyInLogs.length > 0) {
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
 * it retrieves the latest transit receipt date (from Real-Time transfer into TEMP).
 * Otherwise, falls back to original supplier receipt date.
 */
export async function getTransitOrOriginalReceiptDate(
  sku?: string,
  sourceRack?: string
): Promise<OriginalReceiptDateResult> {
  const cleanRack = (sourceRack || '').trim().toUpperCase();

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

  return getOriginalReceiptDate(sku, sourceRack);
}


