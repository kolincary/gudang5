import { supabase } from '../lib/supabase';

export interface BrokenChainLink {
  id: string;
  sku: string;
  type: 'IN' | 'OUT';
  gudang: string;
  currentRak: string;
  currentSubRak?: string;
  correctRak: string;
  correctSubRak: string;
  jumlah: number;
  tgl: string;
  tgl_scan: string;
  waktu: string;
  created_at: string;
  user?: string;
  issueType: 'TRANSFER_SOURCE_MISMATCH' | 'OUT_DESTINATION_MISMATCH' | 'TRANSFER_SELF_LOOP';
  issueDescription: string;
  batchInfo: {
    receiptId?: string;
    receiptRak?: string;
    receiptDate?: string;
    receiptTime?: string;
    totalReceiptQty?: number;
  };
}

export interface ChainAuditSummary {
  totalScanned: number;
  totalBatches: number;
  brokenTransfers: BrokenChainLink[];
  brokenNonTransferOuts: BrokenChainLink[];
}

/**
 * Normalizes SKU strings for reliable map keys
 */
const norm = (str?: string) => (str || '').trim().toUpperCase();

/**
 * Audits transfer chains and related OUT entries for a given SKU (or all SKUs if empty).
 * Checks whether the physical chain of racks makes sense:
 * 1. An item cannot OUT from a rack where it never arrived.
 * 2. If an item was transferred into Rack B, subsequent transfers of that item must originate from Rack B.
 * 3. Outward sale/deduction (non-transfer OUT) should come from the rack where items currently reside.
 */
export async function auditTransferChains(targetSku?: string): Promise<ChainAuditSummary> {
  const cleanSku = (targetSku || '').trim();

  // 1. Fetch relevant TRANSFER logs
  let transferQuery = supabase
    .from('database_log')
    .select('id, sku, type, gudang, rak, sub_rak, jumlah, tgl, tgl_scan, waktu, created_at, user_name')
    .eq('gudang', 'TRANSFER')
    .order('created_at', { ascending: true });

  if (cleanSku) {
    transferQuery = transferQuery.ilike('sku', `%${cleanSku}%`);
  } else {
    transferQuery = transferQuery.limit(5000);
  }

  const { data: transferLogs, error: transferError } = await transferQuery;
  if (transferError) {
    console.error('Error loading transfer logs for chain audit:', transferError);
    throw transferError;
  }

  if (!transferLogs || transferLogs.length === 0) {
    return {
      totalScanned: 0,
      totalBatches: 0,
      brokenTransfers: [],
      brokenNonTransferOuts: []
    };
  }

  // 2. Extract unique SKUs
  const skusToAudit = cleanSku 
    ? [cleanSku] 
    : Array.from(new Set(transferLogs.map(t => norm(t.sku)).filter(Boolean)));

  // 3. Fetch all Supplier Receipts (type='IN' and gudang!='TRANSFER') for these SKUs
  const supplierReceiptsBySku = new Map<string, any[]>();
  const nonTransferOutsBySku = new Map<string, any[]>();
  const skuChunkSize = 40;

  for (let i = 0; i < skusToAudit.length; i += skuChunkSize) {
    const chunk = skusToAudit.slice(i, i + skuChunkSize);

    // Fetch Supplier INs
    let inQuery = supabase
      .from('database_log')
      .select('id, sku, type, gudang, rak, sub_rak, jumlah, tgl, tgl_scan, waktu, created_at')
      .eq('type', 'IN')
      .neq('gudang', 'TRANSFER')
      .order('created_at', { ascending: true });

    if (cleanSku && skusToAudit.length === 1) {
      inQuery = inQuery.ilike('sku', `%${cleanSku}%`);
    } else {
      inQuery = inQuery.in('sku', chunk);
    }

    const { data: inData, error: inErr } = await inQuery;
    if (inErr) console.warn('Error fetching inData in chain audit:', inErr);
    if (inData) {
      inData.forEach(item => {
        const k = norm(item.sku);
        if (!supplierReceiptsBySku.has(k)) supplierReceiptsBySku.set(k, []);
        supplierReceiptsBySku.get(k)!.push(item);
      });
    }

    // Fetch non-transfer OUTs (potong barang biasa)
    let outQuery = supabase
      .from('database_log')
      .select('id, sku, type, gudang, rak, sub_rak, jumlah, tgl, tgl_scan, waktu, created_at, user_name')
      .eq('type', 'OUT')
      .neq('gudang', 'TRANSFER')
      .order('created_at', { ascending: true });

    if (cleanSku && skusToAudit.length === 1) {
      outQuery = outQuery.ilike('sku', `%${cleanSku}%`);
    } else {
      outQuery = outQuery.in('sku', chunk);
    }

    const { data: outData, error: outErr } = await outQuery;
    if (outErr) console.warn('Error fetching outData in chain audit:', outErr);
    if (outData) {
      outData.forEach(item => {
        const k = norm(item.sku);
        if (!nonTransferOutsBySku.has(k)) nonTransferOutsBySku.set(k, []);
        nonTransferOutsBySku.get(k)!.push(item);
      });
    }
  }

  // 4. Group transfers by SKU and Nota Batch
  // Each transfer row has tgl, waktu, and tgl_scan linking it to an incoming receipt
  const brokenTransfers: BrokenChainLink[] = [];
  const brokenNonTransferOuts: BrokenChainLink[] = [];
  let totalBatches = 0;

  // Group transfer logs by SKU
  const transfersBySku = new Map<string, any[]>();
  transferLogs.forEach(row => {
    const k = norm(row.sku);
    if (!transfersBySku.has(k)) transfersBySku.set(k, []);
    transfersBySku.get(k)!.push(row);
  });

  for (const [skuKey, skuTransfers] of transfersBySku.entries()) {
    const receipts = supplierReceiptsBySku.get(skuKey) || [];
    const outs = nonTransferOutsBySku.get(skuKey) || [];

    // Group transfers by batch key (tgl + waktu, or tgl_scan)
    const batches = new Map<string, any[]>();
    skuTransfers.forEach(t => {
      const batchKey = `${(t.tgl_scan || t.tgl || '').trim()}|${(t.waktu || '').trim()}`;
      if (!batches.has(batchKey)) batches.set(batchKey, []);
      batches.get(batchKey)!.push(t);
    });

    totalBatches += batches.size;

    for (const [batchKey, rows] of batches.entries()) {
      // Find matching supplier receipt for this batch
      const [batchDate, batchWaktu] = batchKey.split('|');
      let matchingReceipt = receipts.find(r => 
        (r.tgl === batchDate || r.tgl_scan === batchDate) && 
        (!batchWaktu || !r.waktu || r.waktu.trim() === batchWaktu.trim())
      );

      if (!matchingReceipt && receipts.length > 0) {
        // Fallback: match by date
        matchingReceipt = receipts.find(r => r.tgl === batchDate || r.tgl_scan === batchDate);
      }
      if (!matchingReceipt && receipts.length > 0) {
        // Fallback: newest receipt before first transfer
        const firstTransferTime = new Date(rows[0].created_at || 0).getTime();
        for (let ri = receipts.length - 1; ri >= 0; ri--) {
          if (new Date(receipts[ri].created_at || 0).getTime() <= firstTransferTime + 60000) {
            matchingReceipt = receipts[ri];
            break;
          }
        }
      }

      const initialRak = norm(matchingReceipt?.rak || rows[0]?.rak || '');
      const initialQty = Number(matchingReceipt?.jumlah || 0);

      // Pair transfers into OUT & IN pairs
      // Sort rows by created_at ascending
      rows.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());

      const outRows = rows.filter(r => (r.type || '').toUpperCase() === 'OUT');
      const inRows = rows.filter(r => (r.type || '').toUpperCase() === 'IN');

      // Trace rack stocks in this chain
      // activeRacks tracks how many units are currently in each rack for this batch
      const activeRacks = new Map<string, number>();
      if (initialRak) {
        activeRacks.set(initialRak, initialQty > 0 ? initialQty : 999999);
      }

      let lastDestinationRak = initialRak;

      // Pair up sequentially: OUT[k] moves items to IN[k]
      const pairCount = Math.min(outRows.length, inRows.length);
      for (let p = 0; p < pairCount; p++) {
        const outRow = outRows[p];
        const inRow = inRows[p];

        const outRak = norm(outRow.rak);
        const inRak = norm(inRow.rak);
        const qty = Number(outRow.jumlah || 0);

        // Check if outRak has items available in this batch
        const availableInCurrent = activeRacks.get(outRak) || 0;

        if (availableInCurrent >= qty && outRak !== inRak) {
          // Valid transfer link!
          activeRacks.set(outRak, availableInCurrent - qty);
          activeRacks.set(inRak, (activeRacks.get(inRak) || 0) + qty);
          lastDestinationRak = inRak;
        } else if (outRak === inRak) {
          // Self-loop transfer (A -> A)
          brokenTransfers.push({
            id: outRow.id,
            sku: outRow.sku,
            type: 'OUT',
            gudang: outRow.gudang,
            currentRak: outRow.rak,
            currentSubRak: outRow.sub_rak,
            correctRak: lastDestinationRak || initialRak,
            correctSubRak: lastDestinationRak || initialRak,
            jumlah: qty,
            tgl: outRow.tgl,
            tgl_scan: outRow.tgl_scan,
            waktu: outRow.waktu,
            created_at: outRow.created_at,
            user: outRow.user_name || outRow.user,
            issueType: 'TRANSFER_SELF_LOOP',
            issueDescription: `Transfer ke rak yang sama (${outRow.rak} -> ${inRow.rak}). Seharusnya asal rak dari ${lastDestinationRak || initialRak}`,
            batchInfo: {
              receiptId: matchingReceipt?.id,
              receiptRak: matchingReceipt?.rak,
              receiptDate: matchingReceipt?.tgl,
              receiptTime: matchingReceipt?.waktu,
              totalReceiptQty: initialQty
            }
          });
          lastDestinationRak = inRak;
        } else {
          // BROKEN LINK: outRak does NOT have stock in this batch!
          // Find the rack that currently holds the stock
          let suggestedRak = lastDestinationRak;
          if (!suggestedRak || (activeRacks.get(suggestedRak) || 0) < qty) {
            // Find rack with maximum available stock in this batch
            let maxStock = 0;
            for (const [r, s] of activeRacks.entries()) {
              if (s > maxStock) {
                maxStock = s;
                suggestedRak = r;
              }
            }
          }

          if (!suggestedRak) suggestedRak = initialRak || outRak;

          brokenTransfers.push({
            id: outRow.id,
            sku: outRow.sku,
            type: 'OUT',
            gudang: outRow.gudang,
            currentRak: outRow.rak,
            currentSubRak: outRow.sub_rak,
            correctRak: suggestedRak,
            correctSubRak: suggestedRak,
            jumlah: qty,
            tgl: outRow.tgl,
            tgl_scan: outRow.tgl_scan,
            waktu: outRow.waktu,
            created_at: outRow.created_at,
            user: outRow.user_name || outRow.user,
            issueType: 'TRANSFER_SOURCE_MISMATCH',
            issueDescription: `Rak asal transfer terdata (${outRow.rak}) tidak sesuai riwayat alur barang. Seharusnya OUT dari rak ${suggestedRak} menuju ${inRow.rak}.`,
            batchInfo: {
              receiptId: matchingReceipt?.id,
              receiptRak: matchingReceipt?.rak,
              receiptDate: matchingReceipt?.tgl,
              receiptTime: matchingReceipt?.waktu,
              totalReceiptQty: initialQty
            }
          });

          // Apply transfer logically from suggestedRak to inRak
          const curSuggStock = activeRacks.get(suggestedRak) || 0;
          activeRacks.set(suggestedRak, Math.max(0, curSuggStock - qty));
          activeRacks.set(inRak, (activeRacks.get(inRak) || 0) + qty);
          lastDestinationRak = inRak;
        }
      }

      // Check remaining unpaired outRows (if any)
      if (outRows.length > pairCount) {
        for (let p = pairCount; p < outRows.length; p++) {
          const outRow = outRows[p];
          const outRak = norm(outRow.rak);
          if (outRak !== lastDestinationRak) {
            brokenTransfers.push({
              id: outRow.id,
              sku: outRow.sku,
              type: 'OUT',
              gudang: outRow.gudang,
              currentRak: outRow.rak,
              currentSubRak: outRow.sub_rak,
              correctRak: lastDestinationRak,
              correctSubRak: lastDestinationRak,
              jumlah: Number(outRow.jumlah || 0),
              tgl: outRow.tgl,
              tgl_scan: outRow.tgl_scan,
              waktu: outRow.waktu,
              created_at: outRow.created_at,
              user: outRow.user_name || outRow.user,
              issueType: 'TRANSFER_SOURCE_MISMATCH',
              issueDescription: `Transfer OUT gantung terdata dari rak ${outRow.rak}. Seharusnya dari rak tujuan terakhir ${lastDestinationRak}.`,
              batchInfo: {
                receiptId: matchingReceipt?.id,
                receiptRak: matchingReceipt?.rak,
                receiptDate: matchingReceipt?.tgl,
                receiptTime: matchingReceipt?.waktu,
                totalReceiptQty: initialQty
              }
            });
          }
        }
      }

      // 5. Check non-transfer OUT logs matching this batch
      // OUT logs that have matching tgl_scan or (tgl + waktu)
      const matchingOuts = outs.filter(o => 
        (o.tgl_scan === batchDate || o.tgl === batchDate) &&
        (!batchWaktu || !o.waktu || o.waktu.trim() === batchWaktu.trim() || o.tgl_scan === batchDate)
      );

      matchingOuts.forEach(outLog => {
        const outRak = norm(outLog.rak);
        const qty = Number(outLog.jumlah || 0);
        const avail = activeRacks.get(outRak) || 0;

        // If the OUT log was cut from a rack that had 0 stock from this batch, but goods were moved elsewhere
        if (avail < qty && lastDestinationRak && lastDestinationRak !== outRak && (activeRacks.get(lastDestinationRak) || 0) >= qty) {
          brokenNonTransferOuts.push({
            id: outLog.id,
            sku: outLog.sku,
            type: 'OUT',
            gudang: outLog.gudang,
            currentRak: outLog.rak,
            currentSubRak: outLog.sub_rak,
            correctRak: lastDestinationRak,
            correctSubRak: lastDestinationRak,
            jumlah: qty,
            tgl: outLog.tgl,
            tgl_scan: outLog.tgl_scan,
            waktu: outLog.waktu,
            created_at: outLog.created_at,
            user: outLog.user_name || outLog.user,
            issueType: 'OUT_DESTINATION_MISMATCH',
            issueDescription: `Barang telah ditransfer ke rak ${lastDestinationRak}, namun pemotongan logistik (OUT) masih tercatat di rak ${outLog.rak}.`,
            batchInfo: {
              receiptId: matchingReceipt?.id,
              receiptRak: matchingReceipt?.rak,
              receiptDate: matchingReceipt?.tgl,
              receiptTime: matchingReceipt?.waktu,
              totalReceiptQty: initialQty
            }
          });
          activeRacks.set(lastDestinationRak, Math.max(0, (activeRacks.get(lastDestinationRak) || 0) - qty));
        } else if (avail >= qty) {
          activeRacks.set(outRak, avail - qty);
        }
      });
    }
  }

  return {
    totalScanned: transferLogs.length,
    totalBatches,
    brokenTransfers,
    brokenNonTransferOuts
  };
}

/**
 * Batch updates database_log to fix broken chain links (both transfer OUT and non-transfer OUT)
 */
export async function fixTransferChainLinks(
  linksToFix: BrokenChainLink[]
): Promise<{ successCount: number; errorCount: number; errors: any[] }> {
  if (!linksToFix || linksToFix.length === 0) {
    return { successCount: 0, errorCount: 0, errors: [] };
  }

  let successCount = 0;
  let errorCount = 0;
  const errors: any[] = [];
  const batchSize = 50;

  // Group by correctRak & correctSubRak to minimize calls
  const groups = new Map<string, { rak: string; sub_rak: string; ids: string[] }>();
  linksToFix.forEach(link => {
    const key = `${link.correctRak}|||${link.correctSubRak}`;
    if (!groups.has(key)) {
      groups.set(key, { rak: link.correctRak, sub_rak: link.correctSubRak, ids: [] });
    }
    groups.get(key)!.ids.push(link.id);
  });

  for (const group of groups.values()) {
    for (let i = 0; i < group.ids.length; i += batchSize) {
      const chunkIds = group.ids.slice(i, i + batchSize);
      const updatePayload: any = {
        rak: group.rak,
        sub_rak: group.sub_rak,
        log_update_user: 'DEVMODE: Fix Transfer Chain'
      };

      const { error } = await supabase
        .from('database_log')
        .update(updatePayload)
        .in('id', chunkIds);

      if (error) {
        console.error('Error updating broken chain links batch:', error);
        errorCount += chunkIds.length;
        errors.push(error);
      } else {
        successCount += chunkIds.length;
      }
    }
  }

  return { successCount, errorCount, errors };
}
