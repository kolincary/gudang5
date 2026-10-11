import { supabase } from '../lib/supabase';
import { DatabaseLogEntry } from '../components/DatabaseLog';

export type MatchItemStatus =
  | 'EXACT_MATCH'
  | 'EXACT_QTY_DIFF_RAK'
  | 'FIFO_MATCH'
  | 'PROTECTED_PRE_TRANSFER'
  | 'TRANSFER_INTERNAL'
  | 'DEFICIT_UNMATCHED'
  | 'IN_ANCHOR';

export interface MatchedScanDateItem {
  id: string;
  tgl: string;
  waktu: string;
  sku: string;
  jumlah: number;
  type: 'IN' | 'OUT' | 'MOVE';
  gudang: string;
  rak: string;
  sub_rak?: string;
  newRak: string;
  newSubRak?: string;
  oldTglScan: string;
  newTglScan: string;
  status: MatchItemStatus;
  statusLabel: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  matchReason: string;
  isChanged: boolean;
  isRakChanged: boolean;
  isTglScanChanged: boolean;
  matchedInRef?: {
    id: string;
    tgl: string;
    waktu: string;
    rak: string;
    tgl_scan: string;
  };
}

export interface ScanDateMatchOptions {
  strictSameRak?: boolean; // default: true (hanya cocokkan OUT dengan IN di rak yang sama)
  targetRak?: string;       // optional: filter rak tertentu, default '' (semua rak)
}

export interface ScanDateMatchSummary {
  sku: string;
  strictSameRak: boolean;
  targetRak?: string;
  availableRaks: string[];
  totalInQty: number;
  totalOutQty: number;
  netBalance: number;
  totalRows: number;
  totalInRows: number;
  totalOutRows: number;
  hasTransfer: boolean;
  transferCount: number;
  transferDate?: string;
  transferTime?: string;
  totalOutCleared: number;
  totalChanged: number;
  totalRakChanged: number;
  totalTglScanChanged: number;
  exactMatchCount: number;
  fifoMatchCount: number;
  protectedPreTransferCount: number;
  unmatchedDeficitCount: number;
  unmatchedDeficitQty: number;
}

export interface ScanDateMatchResult {
  summary: ScanDateMatchSummary;
  items: MatchedScanDateItem[];
}

// --- HELPER DATES & TIMES ---
export const normalizeDate = (dateStr?: string): string => {
  if (!dateStr) return '';
  let clean = dateStr.trim();
  if (clean.includes(' ') || clean.includes('T')) {
    clean = clean.split(/[ T]/)[0];
  }
  if (/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.test(clean)) {
    const m = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  if (/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.test(clean)) {
    const m = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (m) {
      let d = m[1];
      let mo = m[2];
      const y = m[3];
      if (parseInt(mo) > 12 && parseInt(d) <= 12) [d, mo] = [mo, d];
      return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }
  return clean;
};

export const normalizeTime = (timeStr?: string): string => {
  if (!timeStr) return '00:00:00';
  const clean = timeStr.trim().replace(/\./g, ':');
  const parts = clean.split(':');
  const h = (parts[0] || '00').padStart(2, '0');
  const m = (parts[1] || '00').padStart(2, '0');
  const s = (parts[2] || '00').padStart(2, '0');
  return `${h}:${m}:${s}`;
};

export const toTimestamp = (dateStr?: string, timeStr?: string): number => {
  const normD = normalizeDate(dateStr) || '1970-01-01';
  const normT = normalizeTime(timeStr) || '00:00:00';
  const ts = new Date(`${normD}T${normT}`).getTime();
  return isNaN(ts) ? 0 : ts;
};

/**
 * Menghitung selisih jarak kronologis antara nota OUT dan nota IN.
 * Prioritas utama: OUT yang terjadi setelah tanggal nota IN (selisih positif).
 * Jika ada OUT yang terjadi sebelum IN (anomali input nota), diberi penalti bobot.
 */
export const getChronologicalDistance = (outTs: number, inTs: number): number => {
  const diff = outTs - inTs;
  if (diff >= 0) {
    return diff;
  }
  // Terjadi sebelum IN: beri bobot penalti wajar (30 hari = 2.592.000.000 ms) agar OUT setelah IN didahulukan,
  // namun tetap mempertahankan kedekatan kronologis jika tanggalnya memang dekat
  return Math.abs(diff) + 30 * 24 * 3600 * 1000;
};

const normalizeRak = (rak?: string): string => {
  return (rak || '').trim().toUpperCase().replace(/\./g, '');
};

// --- CORE ANALYSIS & MATCHING ENGINE ---
export function analyzeAndMatchScanDates(
  logs: DatabaseLogEntry[],
  targetSku: string,
  options: ScanDateMatchOptions = {}
): ScanDateMatchResult {
  const strictSameRak = options.strictSameRak !== false; // default true
  const targetRakFilter = (options.targetRak || '').trim().toUpperCase();

  const normTargetSku = targetSku.trim().toUpperCase();
  const allSkuLogs = logs.filter(l => (l.sku || '').trim().toUpperCase() === normTargetSku);

  // Kumpulkan semua rak unik yang dimiliki oleh SKU ini
  const availableRaks = Array.from(
    new Set(
      allSkuLogs
        .map(l => (l.rak || '').trim().toUpperCase())
        .filter(Boolean)
    )
  ).sort();

  // Jika ada filter rak tertentu, batasi log hanya untuk rak tersebut
  const skuLogs =
    targetRakFilter && targetRakFilter !== 'ALL'
      ? allSkuLogs.filter(l => normalizeRak(l.rak) === normalizeRak(targetRakFilter))
      : allSkuLogs;

  // 1. Deteksi Log Transfer
  const isTransferLog = (l: DatabaseLogEntry): boolean =>
    (l.gudang || '').toUpperCase().includes('TRANSFER');

  const transferLogs = skuLogs.filter(isTransferLog);
  const hasTransfer = transferLogs.length > 0;

  // Temukan waktu transfer paling awal (atau titik waktu transfer)
  let earliestTransferTs = Infinity;
  let transferDateStr = '';
  let transferTimeStr = '';

  if (hasTransfer) {
    transferLogs.forEach(tl => {
      const ts = toTimestamp(tl.tgl, tl.waktu);
      if (ts < earliestTransferTs) {
        earliestTransferTs = ts;
        transferDateStr = normalizeDate(tl.tgl);
        transferTimeStr = normalizeTime(tl.waktu);
      }
    });
  }

  // 2. Kumpulkan Inflow Buckets (Supply IN)
  interface InflowBucket {
    id: string;
    tgl: string;
    waktu: string;
    targetTglScan: string;
    rak: string;
    sub_rak: string;
    totalCapacity: number;
    remainingCapacity: number;
    timestamp: number;
    rawEntry: DatabaseLogEntry;
  }

  const inBuckets: InflowBucket[] = [];
  let totalInQty = 0;
  let totalInRows = 0;

  skuLogs.forEach(log => {
    if (log.type === 'IN') {
      const qty = Number(log.jumlah) || 0;
      totalInQty += qty;
      totalInRows++;
      const targetTglScan = normalizeDate(log.tgl_scan) || normalizeDate(log.tgl);
      inBuckets.push({
        id: log.id,
        tgl: normalizeDate(log.tgl),
        waktu: normalizeTime(log.waktu),
        targetTglScan,
        rak: log.rak || '',
        sub_rak: log.sub_rak || '',
        totalCapacity: qty,
        remainingCapacity: qty,
        timestamp: toTimestamp(log.tgl, log.waktu),
        rawEntry: log
      });
    }
  });

  // Urutkan bucket IN secara kronologis (dari nota paling awal)
  inBuckets.sort((a, b) => a.timestamp - b.timestamp);

  // 3. Pisahkan Transaksi OUT
  interface OutCandidate {
    id: string;
    tgl: string;
    waktu: string;
    sku: string;
    jumlah: number;
    gudang: string;
    rak: string;
    sub_rak?: string;
    oldTglScan: string;
    timestamp: number;
    isTransferInternal: boolean;
    isPreTransfer: boolean;
    isAssigned: boolean;
    newTglScan: string;
    newRak: string;
    newSubRak?: string;
    status: MatchItemStatus;
    statusLabel: string;
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
    matchReason: string;
    matchedInRef?: {
      id: string;
      tgl: string;
      waktu: string;
      rak: string;
      tgl_scan: string;
    };
    rawEntry: DatabaseLogEntry;
  }

  const outCandidates: OutCandidate[] = [];
  let totalOutQty = 0;
  let totalOutRows = 0;
  let protectedPreTransferCount = 0;

  skuLogs.forEach(log => {
    if (log.type === 'OUT') {
      const qty = Number(log.jumlah) || 0;
      totalOutQty += qty;
      totalOutRows++;

      const outTs = toTimestamp(log.tgl, log.waktu);
      const isInternalTransfer = isTransferLog(log);
      const isPreTransfer = hasTransfer && !isInternalTransfer && outTs < earliestTransferTs;

      if (isPreTransfer) {
        protectedPreTransferCount++;
      }

      outCandidates.push({
        id: log.id,
        tgl: normalizeDate(log.tgl),
        waktu: normalizeTime(log.waktu),
        sku: log.sku,
        jumlah: qty,
        gudang: log.gudang || '',
        rak: log.rak || '',
        sub_rak: log.sub_rak || log.rak || '',
        oldTglScan: normalizeDate(log.tgl_scan),
        timestamp: outTs,
        isTransferInternal: isInternalTransfer,
        isPreTransfer,
        isAssigned: isInternalTransfer || isPreTransfer, // sudah ter-kunci jika transfer atau pra-transfer
        newTglScan: normalizeDate(log.tgl_scan), // default sama dengan lama jika terkunci
        newRak: log.rak || '',
        newSubRak: log.sub_rak || log.rak || '',
        status: isInternalTransfer
          ? 'TRANSFER_INTERNAL'
          : isPreTransfer
          ? 'PROTECTED_PRE_TRANSFER'
          : 'DEFICIT_UNMATCHED',
        statusLabel: isInternalTransfer
          ? 'Transfer Internal'
          : isPreTransfer
          ? 'Tetap (Pra-Transfer)'
          : 'Menunggu Klop',
        badgeBg: isInternalTransfer ? 'bg-indigo-100' : isPreTransfer ? 'bg-slate-100' : 'bg-amber-100',
        badgeText: isInternalTransfer ? 'text-indigo-800' : isPreTransfer ? 'text-slate-700' : 'text-amber-800',
        badgeBorder: isInternalTransfer ? 'border-indigo-300' : isPreTransfer ? 'border-slate-300' : 'border-amber-300',
        matchReason: isInternalTransfer
          ? 'Transaksi pemindahan internal gudang TRANSFER'
          : isPreTransfer
          ? `Terjadi sebelum tanggal transfer (${transferDateStr})`
          : '',
        rawEntry: log
      });
    }
  });

  // Jumlah OUT yang dikosongkan dan siap dipasangkan
  const candidatesToMatch = outCandidates.filter(c => !c.isAssigned);
  const totalOutCleared = candidatesToMatch.length;

  // Proteksi: Potong kapasitas inBuckets untuk transaksi OUT yang sudah terkunci (pra-transfer / transfer internal)
  // agar bucket tersebut tidak dianggap surplus dan tidak dipasangkan ganda dengan OUT lain
  outCandidates.forEach(cand => {
    if (cand.isAssigned && cand.oldTglScan) {
      const matchBucket = inBuckets.find(
        b =>
          normalizeRak(b.rak) === normalizeRak(cand.rak) &&
          b.targetTglScan === cand.oldTglScan &&
          b.remainingCapacity > 0
      );
      if (matchBucket) {
        matchBucket.remainingCapacity = Math.max(0, matchBucket.remainingCapacity - cand.jumlah);
      }
    }
  });

  let exactMatchCount = 0;
  let fifoMatchCount = 0;

  // Helper untuk memeriksa bucket terdekat di rak yang sama bagi seorang kandidat OUT
  const getClosestSameRakBucket = (cand: OutCandidate) => {
    const buckets = inBuckets.filter(
      b => normalizeRak(b.rak) === normalizeRak(cand.rak) && b.remainingCapacity > 0
    );
    if (buckets.length === 0) return null;
    buckets.sort(
      (a, b) =>
        getChronologicalDistance(cand.timestamp, a.timestamp) -
        getChronologicalDistance(cand.timestamp, b.timestamp)
    );
    return buckets[0];
  };

  // --- FASE 0: MATCHING IDENTIK SKU & QTY (PRIORITAS NOMOR 1 MUTLAK) ---
  // Cari pasangan 1-ke-1 yang memiliki SKU dan QTY sama persis (misal IN 1 vs OUT 1, IN 24 vs OUT 24),
  // mengutamakan kedekatan waktu nota (timestamp) bahkan jika rak / tgl_scan saat ini berbeda
  // akibat salah input atau redistribusi sebelumnya.
  for (const bucket of inBuckets) {
    if (bucket.remainingCapacity <= 0) continue;

    // Ambil semua kandidat OUT belum teralokasi dengan Qty sama persis dengan kapasitas bucket IN
    const exactQtyMatches = candidatesToMatch.filter(
      c => !c.isAssigned && c.jumlah === bucket.remainingCapacity
    );

    if (exactQtyMatches.length > 0) {
      exactQtyMatches.sort((a, b) => {
        const aSameRak = normalizeRak(a.rak) === normalizeRak(bucket.rak) ? 0 : 1;
        const bSameRak = normalizeRak(b.rak) === normalizeRak(bucket.rak) ? 0 : 1;
        const distA = getChronologicalDistance(a.timestamp, bucket.timestamp);
        const distB = getChronologicalDistance(b.timestamp, bucket.timestamp);

        // Jika salah satu raknya sama dan rentang waktunya dalam batas wajar (< 30 hari), utamakan yang sama rak
        if (aSameRak !== bSameRak) {
          const aDays = distA / (24 * 3600 * 1000);
          const bDays = distB / (24 * 3600 * 1000);
          if (aDays < 30 && bDays > 30) return -1;
          if (bDays < 30 && aDays > 30) return 1;
        }

        return distA - distB;
      });

      const bestMatch = exactQtyMatches[0];
      const isDiffRak = normalizeRak(bestMatch.rak) !== normalizeRak(bucket.rak);

      bestMatch.isAssigned = true;
      bestMatch.newTglScan = bucket.targetTglScan;
      bestMatch.newRak = bucket.rak;
      bestMatch.newSubRak = bucket.sub_rak || bucket.rak;
      bestMatch.status = isDiffRak ? 'EXACT_QTY_DIFF_RAK' : 'EXACT_MATCH';
      bestMatch.statusLabel = isDiffRak ? '🎯 Klop Pas (Kembalikan ke Rak IN)' : '🎯 Klop Pas (Sama Rak)';
      bestMatch.badgeBg = isDiffRak ? 'bg-teal-100' : 'bg-emerald-100';
      bestMatch.badgeText = isDiffRak ? 'text-teal-800' : 'text-emerald-800';
      bestMatch.badgeBorder = isDiffRak ? 'border-teal-300' : 'border-emerald-300';
      bestMatch.matchReason = isDiffRak
        ? `Klop Pas Qty ${bestMatch.jumlah} pcs (Dikembalikan ke Rak ${bucket.rak} sesuai nota IN ${bucket.tgl})`
        : `Klop Pas Qty ${bestMatch.jumlah} pcs di rak ${bestMatch.rak} (Nota Terdekat vs IN ${bucket.tgl})`;
      bestMatch.matchedInRef = {
        id: bucket.id,
        tgl: bucket.tgl,
        waktu: bucket.waktu,
        rak: bucket.rak,
        tgl_scan: bucket.targetTglScan
      };

      bucket.remainingCapacity -= bestMatch.jumlah;
      exactMatchCount++;
    }
  }

  // --- FASE 1: MATCHING SAMA RAK (PRIORITAS SISA) ---
  // Pass 1A: Exact Quantity & Sama Rak (Nota Terdekat)
  for (const bucket of inBuckets) {
    if (bucket.remainingCapacity <= 0) continue;

    const exactMatches = candidatesToMatch.filter(
      c =>
        !c.isAssigned &&
        c.jumlah === bucket.remainingCapacity &&
        normalizeRak(c.rak) === normalizeRak(bucket.rak)
    );

    if (exactMatches.length > 0) {
      exactMatches.sort((a, b) => {
        // Prioritaskan kandidat yang bucket terdekatnya memang bucket ini
        const aClosest = getClosestSameRakBucket(a);
        const bClosest = getClosestSameRakBucket(b);
        const aIsThis = aClosest?.id === bucket.id ? 0 : 1;
        const bIsThis = bClosest?.id === bucket.id ? 0 : 1;
        if (aIsThis !== bIsThis) return aIsThis - bIsThis;

        return getChronologicalDistance(a.timestamp, bucket.timestamp) - getChronologicalDistance(b.timestamp, bucket.timestamp);
      });

      const bestMatch = exactMatches[0];
      bestMatch.isAssigned = true;
      bestMatch.newTglScan = bucket.targetTglScan;
      bestMatch.newRak = bucket.rak;
      bestMatch.newSubRak = bucket.sub_rak || bucket.rak;
      bestMatch.status = 'EXACT_MATCH';
      bestMatch.statusLabel = '🎯 Klop Pas (Sama Rak)';
      bestMatch.badgeBg = 'bg-emerald-100';
      bestMatch.badgeText = 'text-emerald-800';
      bestMatch.badgeBorder = 'border-emerald-300';
      bestMatch.matchReason = `Klop Pas Qty ${bestMatch.jumlah} pcs di rak ${bestMatch.rak} (Nota Terdekat vs IN ${bucket.tgl})`;
      bestMatch.matchedInRef = {
        id: bucket.id,
        tgl: bucket.tgl,
        waktu: bucket.waktu,
        rak: bucket.rak,
        tgl_scan: bucket.targetTglScan
      };

      bucket.remainingCapacity -= bestMatch.jumlah;
      exactMatchCount++;
    }
  }

  // Pass 1B: FIFO Partial Sama Rak (jika kuota IN belum habis dan masih ada OUT di rak yang sama)
  for (const bucket of inBuckets) {
    if (bucket.remainingCapacity <= 0) continue;

    while (bucket.remainingCapacity > 0) {
      const sameRakMatches = candidatesToMatch.filter(
        c =>
          !c.isAssigned &&
          c.jumlah <= bucket.remainingCapacity &&
          normalizeRak(c.rak) === normalizeRak(bucket.rak)
      );

      if (sameRakMatches.length === 0) break;

      sameRakMatches.sort((a, b) => {
        const aClosest = getClosestSameRakBucket(a);
        const bClosest = getClosestSameRakBucket(b);
        const aIsThis = aClosest?.id === bucket.id ? 0 : 1;
        const bIsThis = bClosest?.id === bucket.id ? 0 : 1;
        if (aIsThis !== bIsThis) return aIsThis - bIsThis;

        return getChronologicalDistance(a.timestamp, bucket.timestamp) - getChronologicalDistance(b.timestamp, bucket.timestamp);
      });

      const bestCandidate = sameRakMatches[0];
      bestCandidate.isAssigned = true;
      bestCandidate.newTglScan = bucket.targetTglScan;
      bestCandidate.newRak = bucket.rak;
      bestCandidate.newSubRak = bucket.sub_rak || bucket.rak;
      bestCandidate.status = 'FIFO_MATCH';
      bestCandidate.statusLabel = '⚡ FIFO (Sama Rak)';
      bestCandidate.badgeBg = 'bg-sky-100';
      bestCandidate.badgeText = 'text-sky-800';
      bestCandidate.badgeBorder = 'border-sky-300';
      bestCandidate.matchReason = `Alokasi Kuota IN ${bucket.tgl} (${bestCandidate.jumlah} pcs di rak ${bestCandidate.rak}, sisa kuota IN: ${bucket.remainingCapacity - bestCandidate.jumlah})`;
      bestCandidate.matchedInRef = {
        id: bucket.id,
        tgl: bucket.tgl,
        waktu: bucket.waktu,
        rak: bucket.rak,
        tgl_scan: bucket.targetTglScan
      };

      bucket.remainingCapacity -= bestCandidate.jumlah;
      fifoMatchCount++;
    }
  }

  // --- FASE 2: MATCHING BEDA RAK (CROSS-RAK ALOKASI) ---
  // Hanya dijalankan jika strictSameRak dimatikan (false), setelah seluruh kandidat rak sama dipasangkan
  if (!strictSameRak) {
    // Pass 2A: Exact Quantity Beda Rak (Nota Terdekat)
    for (const bucket of inBuckets) {
      if (bucket.remainingCapacity <= 0) continue;

      const exactQtyMatches = candidatesToMatch.filter(
        c => !c.isAssigned && c.jumlah === bucket.remainingCapacity
      );

      if (exactQtyMatches.length > 0) {
        exactQtyMatches.sort((a, b) => {
          return getChronologicalDistance(a.timestamp, bucket.timestamp) - getChronologicalDistance(b.timestamp, bucket.timestamp);
        });

        const bestMatch = exactQtyMatches[0];
        bestMatch.isAssigned = true;
        bestMatch.newTglScan = bucket.targetTglScan;
        bestMatch.newRak = bucket.rak;
        bestMatch.newSubRak = bucket.sub_rak || bucket.rak;
        bestMatch.status = 'EXACT_QTY_DIFF_RAK';
        bestMatch.statusLabel = '🎯 Klop Pas (Beda Rak)';
        bestMatch.badgeBg = 'bg-teal-100';
        bestMatch.badgeText = 'text-teal-800';
        bestMatch.badgeBorder = 'border-teal-300';
        bestMatch.matchReason = `Klop Pas Qty ${bestMatch.jumlah} pcs (Pindah Rak: ${bestMatch.rak || '-'} ➔ ${bucket.rak}, vs IN ${bucket.tgl})`;
        bestMatch.matchedInRef = {
          id: bucket.id,
          tgl: bucket.tgl,
          waktu: bucket.waktu,
          rak: bucket.rak,
          tgl_scan: bucket.targetTglScan
        };

        bucket.remainingCapacity -= bestMatch.jumlah;
        exactMatchCount++;
      }
    }

    // Pass 2B: FIFO Partial Beda Rak (Nota Terdekat)
    for (const bucket of inBuckets) {
      if (bucket.remainingCapacity <= 0) continue;

      while (bucket.remainingCapacity > 0) {
        const availableCandidates = candidatesToMatch.filter(
          c => !c.isAssigned && c.jumlah <= bucket.remainingCapacity
        );

        if (availableCandidates.length === 0) break;

        availableCandidates.sort((a, b) => {
          return getChronologicalDistance(a.timestamp, bucket.timestamp) - getChronologicalDistance(b.timestamp, bucket.timestamp);
        });

        const bestCandidate = availableCandidates[0];
        bestCandidate.isAssigned = true;
        bestCandidate.newTglScan = bucket.targetTglScan;
        bestCandidate.newRak = bucket.rak;
        bestCandidate.newSubRak = bucket.sub_rak || bucket.rak;
        bestCandidate.status = 'FIFO_MATCH';
        bestCandidate.statusLabel = '⚡ FIFO (Beda Rak)';
        bestCandidate.badgeBg = 'bg-cyan-100';
        bestCandidate.badgeText = 'text-cyan-800';
        bestCandidate.badgeBorder = 'border-cyan-300';
        bestCandidate.matchReason = `Alokasi Kuota IN ${bucket.tgl} (${bestCandidate.jumlah} pcs, Pindah Rak: ${bestCandidate.rak || '-'} ➔ ${bucket.rak})`;
        bestCandidate.matchedInRef = {
          id: bucket.id,
          tgl: bucket.tgl,
          waktu: bucket.waktu,
          rak: bucket.rak,
          tgl_scan: bucket.targetTglScan
        };

        bucket.remainingCapacity -= bestCandidate.jumlah;
        fifoMatchCount++;
      }
    }
  }

  // --- PASS 3: SISA OUT YANG TIDAK MENDAPATKAN KUOTA (DEFISIT) ---
  let unmatchedDeficitCount = 0;
  let unmatchedDeficitQty = 0;

  candidatesToMatch.forEach(c => {
    if (!c.isAssigned) {
      c.newTglScan = ''; // Dikosongkan karena tidak ada stok masuk yang menutup
      c.newRak = c.rak;  // Tetap di rak asal (tidak diubah)
      c.newSubRak = c.sub_rak || c.rak;
      c.status = 'DEFICIT_UNMATCHED';
      c.statusLabel = strictSameRak ? `⚠️ Defisit di Rak ${c.rak || '-'}` : '⚠️ Defisit / Sisa';
      c.badgeBg = 'bg-rose-100';
      c.badgeText = 'text-rose-800';
      c.badgeBorder = 'border-rose-300';
      c.matchReason = strictSameRak
        ? `Stok IN di rak ${c.rak || '-'} habis/kurang (Mode Wajib Sama Rak Aktif, tidak dicomot dari rak lain)`
        : 'Stok IN habis (Defisit / tidak ada kuota masuk tersisa untuk menutup)';
      unmatchedDeficitCount++;
      unmatchedDeficitQty += c.jumlah;
    }
  });

  // Gabungkan seluruh item (IN dan OUT) untuk preview lengkap
  const previewItems: MatchedScanDateItem[] = [];

  // 1. Masukkan baris IN sebagai jangkar kuota (IN_ANCHOR)
  inBuckets.forEach(b => {
    previewItems.push({
      id: b.id,
      tgl: b.tgl,
      waktu: b.waktu,
      sku: b.rawEntry.sku,
      jumlah: b.totalCapacity,
      type: 'IN',
      gudang: b.rawEntry.gudang || '',
      rak: b.rak,
      sub_rak: b.sub_rak,
      newRak: b.rak,
      newSubRak: b.sub_rak,
      oldTglScan: normalizeDate(b.rawEntry.tgl_scan),
      newTglScan: b.targetTglScan,
      status: 'IN_ANCHOR',
      statusLabel: '📦 IN (Barang Masuk)',
      badgeBg: 'bg-emerald-100',
      badgeText: 'text-emerald-800',
      badgeBorder: 'border-emerald-300',
      matchReason: `Jangkar Kuota Masuk (Total: ${b.totalCapacity} pcs, Terpakai: ${b.totalCapacity - b.remainingCapacity} pcs, Sisa Kuota: ${b.remainingCapacity} pcs)`,
      isChanged: false,
      isRakChanged: false,
      isTglScanChanged: false
    });
  });

  // 2. Masukkan seluruh baris OUT
  outCandidates.forEach(o => {
    const isTglScanChanged = normalizeDate(o.oldTglScan) !== normalizeDate(o.newTglScan);
    const isRakChanged = normalizeRak(o.rak) !== normalizeRak(o.newRak) || (Boolean(o.newSubRak) && normalizeRak(o.sub_rak) !== normalizeRak(o.newSubRak));
    const isChanged = isTglScanChanged || isRakChanged;

    previewItems.push({
      id: o.id,
      tgl: o.tgl,
      waktu: o.waktu,
      sku: o.sku,
      jumlah: o.jumlah,
      type: 'OUT',
      gudang: o.gudang,
      rak: o.rak,
      sub_rak: o.sub_rak,
      newRak: o.newRak || o.rak,
      newSubRak: o.newSubRak || o.sub_rak,
      oldTglScan: o.oldTglScan,
      newTglScan: o.newTglScan,
      status: o.status,
      statusLabel: o.statusLabel,
      badgeBg: o.badgeBg,
      badgeText: o.badgeText,
      badgeBorder: o.badgeBorder,
      matchReason: o.matchReason,
      isChanged,
      isRakChanged,
      isTglScanChanged,
      matchedInRef: o.matchedInRef
    });
  });

  // Urutkan preview berdasarkan tanggal & waktu nota asli (kronologis keseluruhan)
  previewItems.sort((a, b) => {
    const tsA = toTimestamp(a.tgl, a.waktu);
    const tsB = toTimestamp(b.tgl, b.waktu);
    if (tsA !== tsB) return tsA - tsB;
    // Jika waktu sama, dahulukan IN sebelum OUT
    if (a.type !== b.type) return a.type === 'IN' ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  const totalChanged = previewItems.filter(i => i.isChanged).length;
  const totalRakChanged = previewItems.filter(i => i.isRakChanged).length;
  const totalTglScanChanged = previewItems.filter(i => i.isTglScanChanged).length;
  const netBalance = totalInQty - totalOutQty;

  const summary: ScanDateMatchSummary = {
    sku: targetSku,
    strictSameRak,
    targetRak: targetRakFilter || undefined,
    availableRaks,
    totalInQty,
    totalOutQty,
    netBalance,
    totalRows: previewItems.length,
    totalInRows,
    totalOutRows,
    hasTransfer,
    transferCount: transferLogs.length,
    transferDate: transferDateStr,
    transferTime: transferTimeStr,
    totalOutCleared,
    totalChanged,
    totalRakChanged,
    totalTglScanChanged,
    exactMatchCount,
    fifoMatchCount,
    protectedPreTransferCount,
    unmatchedDeficitCount,
    unmatchedDeficitQty
  };

  return { summary, items: previewItems };
}

// --- BATCH DATABASE UPDATE EXECUTION ---
export async function executeBatchScanDateUpdates(
  itemsToUpdate: MatchedScanDateItem[],
  onProgress?: (current: number, total: number, percent: number) => void
): Promise<{ successCount: number; errorCount: number; errors: any[] }> {
  const changedItems = itemsToUpdate.filter(i => i.type === 'OUT' && i.isChanged);
  const total = changedItems.length;

  if (total === 0) {
    return { successCount: 0, errorCount: 0, errors: [] };
  }

  let successCount = 0;
  let errorCount = 0;
  const errors: any[] = [];
  const batchSize = 50;

  for (let i = 0; i < total; i += batchSize) {
    const batch = changedItems.slice(i, i + batchSize);
    const todayStr = new Date().toISOString().slice(0, 10);

    // Update secara paralel dalam 1 batch
    await Promise.all(
      batch.map(async item => {
        try {
          const updatePayload: Record<string, any> = {
            tgl_scan: item.newTglScan || null,
            rak: item.newRak || item.rak,
            sub_rak: item.newSubRak || item.newRak || item.rak,
            log_update_user: `DEVMODE: Klop Tgl Scan & Rak OUT (${todayStr})`
          };

          const { error } = await supabase
            .from('database_log')
            .update(updatePayload)
            .eq('id', item.id);

          if (error) {
            errorCount++;
            errors.push({ id: item.id, error });
          } else {
            successCount++;
          }
        } catch (err) {
          errorCount++;
          errors.push({ id: item.id, error: err });
        }
      })
    );

    const current = Math.min(i + batchSize, total);
    const percent = Math.round((current / total) * 100);
    if (onProgress) {
      onProgress(current, total, percent);
    }
  }

  return { successCount, errorCount, errors };
}
