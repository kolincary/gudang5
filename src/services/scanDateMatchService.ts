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

/**
 * Memastikan tanggal input transaksi OUT berada di tanggal yang sama atau setelah tanggal input IN.
 * Contoh: Data IN diinput tanggal 2026-10-03 berarti cari tanggal OUT yang sama atau diatasnya (2026-10-03, 2026-10-04, 2026-10-05, dst).
 * Transaksi OUT yang diinput sebelum tanggal IN (misal 2026-02-25 < 2026-10-03) TIDAK BOLEH dipasangkan.
 */
export const isOutDateEligibleForIn = (outDateStr?: string, inDateStr?: string): boolean => {
  const normOut = normalizeDate(outDateStr);
  const normIn = normalizeDate(inDateStr);
  if (!normOut || !normIn) return true; // jika salah satu tidak memiliki tanggal, jangan diblokir
  return normOut >= normIn;
};

const normalizeRak = (rak?: string): string => {
  return (rak || '').trim().toUpperCase().replace(/\./g, '');
};

/**
 * Rak yang dilarang untuk dilakukan penyesuaian/perpindahan rak:
 * ECER-O, ECER-M, ECER-N, LANTAI 4, LANTAI 2, BLOK-I, TRANSFER
 */
export const isForbiddenRackAdjustment = (rak?: string): boolean => {
  if (!rak) return false;
  const clean = (rak || '').trim().toUpperCase().replace(/\s+/g, ' ');
  const compact = clean.replace(/[\s\-_\.]+/g, '');

  if (
    compact === 'ECERM' || compact.startsWith('ECERM') || compact === 'CERM' || compact.startsWith('CERM') ||
    compact === 'ECERN' || compact.startsWith('ECERN') || compact === 'CERN' || compact.startsWith('CERN') ||
    compact === 'ECERO' || compact.startsWith('ECERO') || compact === 'CERO' || compact.startsWith('CERO')
  ) {
    return true;
  }

  if (
    compact === 'LANTAI2' || compact.startsWith('LANTAI2') || compact === 'LT2' || compact.startsWith('LT2') ||
    compact === 'LANTAI4' || compact.startsWith('LANTAI4') || compact === 'LT4' || compact.startsWith('LT4')
  ) {
    return true;
  }

  if (
    compact === 'BLOKI' || compact.startsWith('BLOKI') || compact === 'BLOK1' || compact.startsWith('BLOK1')
  ) {
    return true;
  }

  if (compact.includes('TRANSFER')) {
    return true;
  }

  const forbidden = ['ECER-O', 'ECER-M', 'ECER-N', 'LANTAI 4', 'LT4', 'LANTAI 2', 'LT2', 'BLOK-I', 'TRANSFER'];
  return forbidden.some(f => clean === f || clean.includes(f));
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
      b => normalizeRak(b.rak) === normalizeRak(cand.rak) &&
           b.remainingCapacity > 0 &&
           isOutDateEligibleForIn(cand.tgl, b.tgl)
    );
    if (buckets.length === 0) return null;
    buckets.sort(
      (a, b) =>
        getChronologicalDistance(cand.timestamp, a.timestamp) -
        getChronologicalDistance(cand.timestamp, b.timestamp)
    );
    return buckets[0];
  };

  // --- TAHAP 1: SAME-DAY EXACT QTY MATCH (Tgl Input Sama, SKU Sama, Qty Sama) ---
  // Contoh: IN 2026-06-24 (1 pc, Rak UTAMA) & OUT 2026-06-24 (1 pc, Rak G14)
  // Pasangan ini harus dipasangkan terlebih dahulu agar tidak diserobot oleh batch IN lama!
  for (const bucket of inBuckets) {
    if (bucket.remainingCapacity <= 0) continue;

    const exactSameDayCandidates = candidatesToMatch.filter(
      c => !c.isAssigned &&
           normalizeDate(c.tgl) === normalizeDate(bucket.tgl) &&
           c.jumlah === bucket.remainingCapacity &&
           !isForbiddenRackAdjustment(c.rak)
    );

    if (exactSameDayCandidates.length > 0) {
      exactSameDayCandidates.sort((a, b) => Math.abs(a.timestamp - bucket.timestamp) - Math.abs(b.timestamp - bucket.timestamp));
      const bestCandidate = exactSameDayCandidates[0];
      const isSameRak = normalizeRak(bestCandidate.rak) === normalizeRak(bucket.rak);

      bestCandidate.isAssigned = true;
      bestCandidate.newTglScan = bucket.targetTglScan;
      if (!isForbiddenRackAdjustment(bucket.rak) && !isForbiddenRackAdjustment(bestCandidate.rak)) {
        bestCandidate.newRak = bucket.rak;
        bestCandidate.newSubRak = bucket.sub_rak || bucket.rak;
      } else {
        bestCandidate.newRak = bestCandidate.rak;
        bestCandidate.newSubRak = bestCandidate.sub_rak || bestCandidate.rak;
      }
      bestCandidate.status = isSameRak ? 'EXACT_MATCH' : 'EXACT_QTY_DIFF_RAK';
      bestCandidate.statusLabel = isSameRak ? '🎯 Klop Pas (Sama Rak & Hari)' : '⚡ Klop Pas (Hari Sama, Sesuaikan Rak)';
      bestCandidate.badgeBg = isSameRak ? 'bg-emerald-100' : 'bg-teal-100';
      bestCandidate.badgeText = isSameRak ? 'text-emerald-800' : 'text-teal-800';
      bestCandidate.badgeBorder = isSameRak ? 'border-emerald-300' : 'border-teal-300';
      bestCandidate.matchReason = `Tanggal input sama (${bucket.tgl}) dan Qty pas ${bestCandidate.jumlah} pcs dengan nota masuk ${bucket.rak}`;
      bestCandidate.matchedInRef = {
        id: bucket.id,
        tgl: bucket.tgl,
        waktu: bucket.waktu,
        rak: bucket.rak,
        tgl_scan: bucket.targetTglScan
      };
      bucket.remainingCapacity -= bestCandidate.jumlah;
      exactMatchCount++;
    }
  }

  // --- TAHAP 2: MATCHING FIFO KRONOLOGIS TERDEKAT (FIFO PROXIMITY) ---
  for (const bucket of inBuckets) {
    if (bucket.remainingCapacity <= 0) continue;

    while (bucket.remainingCapacity > 0) {
      const eligibleCandidates = candidatesToMatch.filter(
        c =>
          !c.isAssigned &&
          c.jumlah <= bucket.remainingCapacity &&
          (strictSameRak ? normalizeRak(c.rak) === normalizeRak(bucket.rak) : true) &&
          isOutDateEligibleForIn(c.tgl, bucket.tgl)
      );

      if (eligibleCandidates.length === 0) break;

      eligibleCandidates.sort((a, b) => {
        const distA = a.timestamp - bucket.timestamp;
        const distB = b.timestamp - bucket.timestamp;
        const daysA = distA / (24 * 3600 * 1000);
        const daysB = distB / (24 * 3600 * 1000);

        // 1. Proximity Window: Jika salah satu dekat (<= 35 hari) dan yang lain jauh (> 35 hari), dahulukan yang dekat
        if (daysA <= 35 && daysB > 35) return -1;
        if (daysB <= 35 && daysA > 35) return 1;

        // 2. Same Input Date preference: jika tanggal input sama persis, dahulukan
        const aSameDate = normalizeDate(a.tgl) === normalizeDate(bucket.tgl) ? 0 : 1;
        const bSameDate = normalizeDate(b.tgl) === normalizeDate(bucket.tgl) ? 0 : 1;
        if (aSameDate !== bSameDate) return aSameDate - bSameDate;

        // 3. Jika rentang waktu mirip (selisih < 14 hari), dahulukan rak yang sama
        const aIsSame = normalizeRak(a.rak) === normalizeRak(bucket.rak) ? 0 : 1;
        const bIsSame = normalizeRak(b.rak) === normalizeRak(bucket.rak) ? 0 : 1;
        if (aIsSame !== bIsSame && Math.abs(daysA - daysB) < 14) {
          return aIsSame - bIsSame;
        }

        return distA - distB;
      });

      const bestCandidate = eligibleCandidates[0];
      const isSameRak = normalizeRak(bestCandidate.rak) === normalizeRak(bucket.rak);
      const isExact = bestCandidate.jumlah === bucket.remainingCapacity;

      bestCandidate.isAssigned = true;
      bestCandidate.newTglScan = bucket.targetTglScan;
      if (!isForbiddenRackAdjustment(bucket.rak) && !isForbiddenRackAdjustment(bestCandidate.rak)) {
        bestCandidate.newRak = bucket.rak;
        bestCandidate.newSubRak = bucket.sub_rak || bucket.rak;
      } else {
        bestCandidate.newRak = bestCandidate.rak;
        bestCandidate.newSubRak = bestCandidate.sub_rak || bestCandidate.rak;
      }
      bestCandidate.status = isSameRak
        ? (isExact ? 'EXACT_MATCH' : 'FIFO_MATCH')
        : (isExact ? 'EXACT_QTY_DIFF_RAK' : 'FIFO_MATCH');
      bestCandidate.statusLabel = isSameRak
        ? (isExact ? '🎯 Klop Pas (Sama Rak)' : '⚡ FIFO (Sama Rak)')
        : (isExact ? '🎯 Klop Pas (Beda Rak)' : '⚡ FIFO (Beda Rak)');
      bestCandidate.badgeBg = isSameRak
        ? (isExact ? 'bg-emerald-100' : 'bg-sky-100')
        : (isExact ? 'bg-teal-100' : 'bg-cyan-100');
      bestCandidate.badgeText = isSameRak
        ? (isExact ? 'text-emerald-800' : 'text-sky-800')
        : (isExact ? 'text-teal-800' : 'text-cyan-800');
      bestCandidate.badgeBorder = isSameRak
        ? (isExact ? 'border-emerald-300' : 'border-sky-300')
        : (isExact ? 'border-teal-300' : 'border-cyan-300');
      bestCandidate.matchReason = isSameRak
        ? (isExact
            ? `Klop Pas Qty ${bestCandidate.jumlah} pcs di rak ${bestCandidate.rak} (Nota Terdekat vs IN ${bucket.tgl})`
            : `Alokasi Kuota IN ${bucket.tgl} (${bestCandidate.jumlah} pcs di rak ${bestCandidate.rak}, sisa kuota IN: ${bucket.remainingCapacity - bestCandidate.jumlah})`)
        : (isExact
            ? `Klop Pas Qty ${bestCandidate.jumlah} pcs (Pindah Rak: ${bestCandidate.rak || '-'} ➔ ${bucket.rak}, vs IN ${bucket.tgl})`
            : `Alokasi Kuota IN ${bucket.tgl} (${bestCandidate.jumlah} pcs, Pindah Rak: ${bestCandidate.rak || '-'} ➔ ${bucket.rak})`);

      bestCandidate.matchedInRef = {
        id: bucket.id,
        tgl: bucket.tgl,
        waktu: bucket.waktu,
        rak: bucket.rak,
        tgl_scan: bucket.targetTglScan
      };

      bucket.remainingCapacity -= bestCandidate.jumlah;
      if (isExact) {
        exactMatchCount++;
      } else {
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
