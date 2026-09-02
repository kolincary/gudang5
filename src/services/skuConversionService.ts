import { supabase } from '../lib/supabase';
import { notifyAppSettingsChange, subscribeAppSettingsChange } from '../lib/settingsSync';

export interface SKUConversion {
  id: string;
  sku_konversi: string;    // e.g. "BOOK-1PACK/CLBK-3501"
  sku_pcs: string;         // e.g. "BOOK-CLBK-3501/1PC"
  satuan_packing: string;  // e.g. "CTN/16PACK/12PCS"
  qty: number;             // e.g. 12
  created_at: string;
  updated_at: string;
}

const SETTINGS_KEY = 'sku_conversions';
const LOCAL_STORAGE_KEY = 'sku_conversions_cache';
const SYNC_EVENT_NAME = 'sku_conversions_updated';

// Sample initial data if database is empty
const INITIAL_DEMO_DATA: SKUConversion[] = [
  {
    id: 'conv-demo-1',
    sku_konversi: 'BOOK-1PACK/CLBK-3501',
    sku_pcs: 'BOOK-CLBK-3501/1PC',
    satuan_packing: 'CTN/16PACK/12PCS',
    qty: 12,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

export const skuConversionService = {
  /**
   * Get cached conversions immediately for 0ms latency
   */
  getCachedConversions(): SKUConversion[] {
    try {
      const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {
      console.error('Error reading conversions cache:', e);
    }
    return [];
  },

  /**
   * Save conversions to local storage
   */
  setCacheConversions(items: SKUConversion[]) {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.error('Error saving conversions cache:', e);
    }
  },

  /**
   * Notify all open tabs/components that conversions changed
   */
  broadcastChange() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(SYNC_EVENT_NAME));
      try {
        localStorage.setItem('sku_conversions_sync_time', Date.now().toString());
      } catch (e) {}
    }
    notifyAppSettingsChange({ key: SETTINGS_KEY });
  },

  /**
   * Subscribe to conversion updates
   */
  subscribe(callback: () => void): () => void {
    const handleLocal = () => callback();
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'sku_conversions_sync_time' || e.key === 'app_settings_sync_trigger') {
        callback();
      }
    };

    window.addEventListener(SYNC_EVENT_NAME, handleLocal);
    window.addEventListener('storage', handleStorage);
    const unsubAppSettings = subscribeAppSettingsChange(() => {
      this.fetchConversions().then(() => callback());
    });

    return () => {
      window.removeEventListener(SYNC_EVENT_NAME, handleLocal);
      window.removeEventListener('storage', handleStorage);
      unsubAppSettings();
    };
  },

  /**
   * Fetch all conversion records from Supabase app_settings (or localStorage fallback)
   */
  async fetchConversions(): Promise<SKUConversion[]> {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', SETTINGS_KEY)
        .maybeSingle();

      if (error) {
        console.error('Error fetching conversions from app_settings:', error);
        return this.getCachedConversions();
      }

      if (data && data.value !== undefined && data.value !== null) {
        let parsed: SKUConversion[] = [];
        try {
          parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        } catch (e) {
          console.error('Error parsing app_settings value for conversions:', e);
        }

        if (Array.isArray(parsed)) {
          this.setCacheConversions(parsed);
          return parsed;
        }
      }

      // If key is not found in database yet, check local cache
      const cached = this.getCachedConversions();
      return cached;
    } catch (error) {
      console.error('Error fetching conversions:', error);
      return this.getCachedConversions();
    }
  },

  /**
   * Persist full array to Supabase and cache
   */
  async saveAllConversions(items: SKUConversion[]): Promise<void> {
    this.setCacheConversions(items);

    try {
      const { error } = await supabase.from('app_settings').upsert({
        key: SETTINGS_KEY,
        value: JSON.stringify(items),
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });

      if (error) {
        console.error('Error upserting app_settings for sku_conversions:', error);
      }
    } catch (e) {
      console.error('Error saving conversions to database:', e);
    }

    this.broadcastChange();
  },

  /**
   * Add a new single conversion
   */
  async addConversion(item: {
    sku_konversi: string;
    sku_pcs: string;
    satuan_packing: string;
    qty: number;
  }): Promise<SKUConversion> {
    const now = new Date().toISOString();
    const newItem: SKUConversion = {
      id: `conv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      sku_konversi: item.sku_konversi.trim(),
      sku_pcs: item.sku_pcs.trim(),
      satuan_packing: item.satuan_packing.trim(),
      qty: Number(item.qty) || 1,
      created_at: now,
      updated_at: now
    };

    const current = this.getCachedConversions();
    // Remove duplicate if same sku_konversi already exists
    const filtered = current.filter(c => c.sku_konversi.toLowerCase().trim() !== newItem.sku_konversi.toLowerCase());
    const updated = [newItem, ...filtered];

    await this.saveAllConversions(updated);
    return newItem;
  },

  /**
   * Bulk insert conversions (e.g. from Excel / Paste)
   */
  async addBatchConversions(items: {
    sku_konversi: string;
    sku_pcs: string;
    satuan_packing: string;
    qty: number;
  }[]): Promise<SKUConversion[]> {
    const now = new Date().toISOString();
    const current = this.getCachedConversions();
    const existingMap = new Map<string, SKUConversion>();

    // Keep existing items in map
    current.forEach(c => existingMap.set(c.sku_konversi.toLowerCase().trim(), c));

    const newItems: SKUConversion[] = [];
    items.forEach((item, idx) => {
      const cleanKey = item.sku_konversi.toLowerCase().trim();
      const existing = existingMap.get(cleanKey);
      const convItem: SKUConversion = {
        id: existing ? existing.id : `conv-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
        sku_konversi: item.sku_konversi.trim(),
        sku_pcs: item.sku_pcs.trim(),
        satuan_packing: item.satuan_packing.trim(),
        qty: Number(item.qty) || 1,
        created_at: existing ? existing.created_at : now,
        updated_at: now
      };
      existingMap.set(cleanKey, convItem);
      newItems.push(convItem);
    });

    const fullList = Array.from(existingMap.values()).sort((a, b) => 
      (b.updated_at || '').localeCompare(a.updated_at || '')
    );

    await this.saveAllConversions(fullList);
    return newItems;
  },

  /**
   * Update an existing conversion
   */
  async updateConversion(id: string, updates: Partial<SKUConversion>): Promise<void> {
    const current = this.getCachedConversions();
    const updated = current.map(item => {
      if (item.id === id) {
        return {
          ...item,
          ...updates,
          updated_at: new Date().toISOString()
        };
      }
      return item;
    });

    await this.saveAllConversions(updated);
  },

  /**
   * Delete a conversion
   */
  async deleteConversion(id: string): Promise<void> {
    const current = this.getCachedConversions();
    const updated = current.filter(item => item.id !== id);
    await this.saveAllConversions(updated);
  },

  /**
   * Lookup conversion for a specific SKU (Case-insensitive)
   */
  findConversion(productName: string): SKUConversion | undefined {
    if (!productName) return undefined;
    const cleanName = productName.trim().toLowerCase();
    const list = this.getCachedConversions();
    return list.find(item => item.sku_konversi.trim().toLowerCase() === cleanName);
  }
};
