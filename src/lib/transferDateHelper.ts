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
 * Always returns current realtime date & time for all transfer operations.
 * Disabled automatic backdating to ancient supplier receipt dates.
 */
export async function getOriginalReceiptDate(
  sku?: string,
  currentRack?: string
): Promise<OriginalReceiptDateResult> {
  const { todayTgl, nowWaktu } = getRealtimeDateTime();
  return {
    tgl: todayTgl,
    tgl_scan: todayTgl,
    waktu: nowWaktu
  };
}

/**
 * Always returns current realtime date & time for all transfer operations.
 * Disabled automatic backdating to ancient supplier receipt dates.
 */
export async function getTransitOrOriginalReceiptDate(
  sku?: string,
  sourceRack?: string
): Promise<OriginalReceiptDateResult> {
  const { todayTgl, nowWaktu } = getRealtimeDateTime();
  return {
    tgl: todayTgl,
    tgl_scan: todayTgl,
    waktu: nowWaktu
  };
}


