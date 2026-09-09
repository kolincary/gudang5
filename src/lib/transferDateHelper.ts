import { supabase } from './supabase';

export interface OriginalReceiptDateResult {
  tgl: string;
  tgl_scan: string;
  waktu: string;
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
  const now = new Date();
  const todayTgl = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const nowWaktu = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/:/g, '.');

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
