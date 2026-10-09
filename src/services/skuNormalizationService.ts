import { supabase } from '../lib/supabase';

// In-memory cache for master products map (case-insensitive key -> exact Master SKU name)
let cachedMasterMap: Map<string, string> | null = null;
let lastCacheFetchTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch and return a Map of all Master SKUs from the 'products' table.
 * Key: lowercase trimmed SKU
 * Value: exact case Master SKU
 */
export async function getMasterProductsMap(forceRefresh = false): Promise<Map<string, string>> {
  const now = Date.now();
  if (!forceRefresh && cachedMasterMap && now - lastCacheFetchTime < CACHE_TTL_MS) {
    return cachedMasterMap;
  }

  const batchSize = 1000;
  const map = new Map<string, string>();
  let from = 0;

  try {
    while (true) {
      const { data, error } = await supabase
        .from('products')
        .select('nama')
        .range(from, from + batchSize - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;

      for (const p of data) {
        if (p.nama) {
          const trimmed = p.nama.trim();
          map.set(trimmed.toLowerCase(), trimmed);
        }
      }

      if (data.length < batchSize) break;
      from += batchSize;
    }

    cachedMasterMap = map;
    lastCacheFetchTime = now;
    return map;
  } catch (err) {
    console.warn('[skuNormalizationService] Failed to fetch products map:', err);
    return cachedMasterMap || new Map();
  }
}

/**
 * Synchronously normalize a SKU string against the provided master map.
 * Also handles suffixes like " (LANTAI 4)" or " (LANTAI 2)".
 */
export function normalizeSkuSync(rawSku: string, masterMap: Map<string, string>): string {
  if (!rawSku) return rawSku;
  const clean = rawSku.trim();
  const lower = clean.toLowerCase();

  // 1. Direct match
  if (masterMap.has(lower)) {
    return masterMap.get(lower)!;
  }

  // 2. Match with suffix (e.g. "(LANTAI 4)")
  const suffixMatch = clean.match(/^(.*?)\s*(\([^\)]+\))\s*$/);
  if (suffixMatch) {
    const baseLower = suffixMatch[1].trim().toLowerCase();
    const suffix = suffixMatch[2].trim();
    if (masterMap.has(baseLower)) {
      return `${masterMap.get(baseLower)} ${suffix}`;
    }
  }

  return clean;
}

/**
 * Normalize a SKU string asynchronously using the cached or freshly fetched master map.
 */
export async function normalizeSku(rawSku: string): Promise<string> {
  const masterMap = await getMasterProductsMap();
  return normalizeSkuSync(rawSku, masterMap);
}
