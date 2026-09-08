import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { doc, getDoc, setDoc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { 
  DatabaseInstance, 
  MultiDbConfig, 
  SupabaseBroadcastConfig, 
  ParsedConnectionUri, 
  GeneratedPgCommands 
} from '../types/dbConfig';

const STORAGE_KEY_MULTI_DB = 'multi_db_config_v1';
const STORAGE_KEY_ACTIVE_URL = 'custom_supabase_url';
const STORAGE_KEY_ACTIVE_KEY = 'custom_supabase_anon_key';
const FIRESTORE_CONFIG_DOC = 'supabase_active_config';

// Default config from .env
const DEFAULT_ENV_URL = import.meta.env.VITE_SUPABASE_URL || '';
const DEFAULT_ENV_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export class MultiDbManager {
  private static instance: MultiDbManager;
  private clientPool: Map<string, SupabaseClient> = new Map();
  private multiConfig: MultiDbConfig;

  private constructor() {
    this.multiConfig = this.loadConfig();
    this.initPool();
  }

  public static getInstance(): MultiDbManager {
    if (!MultiDbManager.instance) {
      MultiDbManager.instance = new MultiDbManager();
    }
    return MultiDbManager.instance;
  }

  // Load config from localStorage or initialize with defaults
  public loadConfig(): MultiDbConfig {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_MULTI_DB);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to parse stored multi DB config:', e);
    }

    const activeUrl = localStorage.getItem(STORAGE_KEY_ACTIVE_URL) || DEFAULT_ENV_URL;
    const activeKey = localStorage.getItem(STORAGE_KEY_ACTIVE_KEY) || DEFAULT_ENV_KEY;
    const refId = this.extractRefIdFromUrl(activeUrl) || 'default_db';

    const defaultConfig: MultiDbConfig = {
      activeWriteDbId: 'db_primary',
      autoSwitchEnabled: true,
      switchThresholdPercent: 90,
      readStrategy: 'active_first',
      databases: [
        {
          id: 'db_primary',
          name: `Supabase Utama (${refId})`,
          url: activeUrl,
          anonKey: activeKey,
          status: 'active',
          isActiveForWrite: true,
          isReadOnly: false,
          capacityLimitMB: 500,
          currentUsageMB: 0,
          maxRowCount: 500000,
          currentRowCount: 0,
          priority: 1,
          createdAt: new Date().toISOString()
        }
      ]
    };

    return defaultConfig;
  }

  public saveConfig(config: MultiDbConfig): void {
    this.multiConfig = config;
    try {
      localStorage.setItem(STORAGE_KEY_MULTI_DB, JSON.stringify(config));
      const activeDb = this.getActiveDb();
      if (activeDb) {
        localStorage.setItem(STORAGE_KEY_ACTIVE_URL, activeDb.url);
        localStorage.setItem(STORAGE_KEY_ACTIVE_KEY, activeDb.anonKey);
      }
    } catch (e) {
      console.error('Failed to save multi DB config to localStorage:', e);
    }
    this.initPool();
  }

  private initPool(): void {
    this.clientPool.clear();
    this.multiConfig.databases.forEach(dbItem => {
      if (dbItem.url && dbItem.anonKey && dbItem.status !== 'disabled') {
        const client = createClient(dbItem.url, dbItem.anonKey, {
          db: { schema: 'public' },
          auth: { 
            persistSession: true, 
            autoRefreshToken: true,
            storageKey: `sb_pool_${dbItem.id}` 
          },
          global: { headers: { 'x-client-pool-id': dbItem.id } }
        });
        this.clientPool.set(dbItem.id, client);
      }
    });
  }

  public getActiveDb(): DatabaseInstance | undefined {
    const active = this.multiConfig.databases.find(d => d.id === this.multiConfig.activeWriteDbId) ||
                   this.multiConfig.databases.find(d => d.isActiveForWrite) ||
                   this.multiConfig.databases[0];
    return active;
  }

  public getActiveConfig(): { url: string; anonKey: string; refId: string } {
    const activeUrl = localStorage.getItem(STORAGE_KEY_ACTIVE_URL) || this.getActiveDb()?.url || DEFAULT_ENV_URL;
    const activeKey = localStorage.getItem(STORAGE_KEY_ACTIVE_KEY) || this.getActiveDb()?.anonKey || DEFAULT_ENV_KEY;
    const refId = this.extractRefIdFromUrl(activeUrl) || 'active';
    return { url: activeUrl, anonKey: activeKey, refId };
  }

  public getWriteClient(): SupabaseClient {
    const activeDb = this.getActiveDb();
    if (activeDb && this.clientPool.has(activeDb.id)) {
      return this.clientPool.get(activeDb.id)!;
    }
    const { url, anonKey } = this.getActiveConfig();
    return createClient(url, anonKey, {
      db: { schema: 'public' },
      auth: { persistSession: true, autoRefreshToken: true }
    });
  }

  public getReadClients(): { instance: DatabaseInstance; client: SupabaseClient }[] {
    const results: { instance: DatabaseInstance; client: SupabaseClient }[] = [];
    const sorted = [...this.multiConfig.databases].sort((a, b) => a.priority - b.priority);

    for (const dbItem of sorted) {
      if (dbItem.status !== 'disabled' && this.clientPool.has(dbItem.id)) {
        results.push({
          instance: dbItem,
          client: this.clientPool.get(dbItem.id)!
        });
      }
    }

    if (results.length === 0) {
      const active = this.getWriteClient();
      const current = this.getActiveDb() || {
        id: 'fallback',
        name: 'Default Database',
        url: DEFAULT_ENV_URL,
        anonKey: DEFAULT_ENV_KEY,
        status: 'active',
        isActiveForWrite: true,
        isReadOnly: false,
        priority: 1,
        createdAt: new Date().toISOString()
      };
      results.push({ instance: current, client: active });
    }

    return results;
  }

  public async findItemAcrossDatabases(skuOrBarcode: string): Promise<any | null> {
    const term = skuOrBarcode.trim();
    if (!term) return null;

    const readClients = this.getReadClients();

    for (const { client, instance } of readClients) {
      try {
        const { data, error } = await client
          .from('products')
          .select('*')
          .or(`sku_code.ilike.${term},nama.ilike.%${term}%`)
          .limit(1)
          .maybeSingle();

        if (!error && data) {
          return { ...data, _sourceDatabaseId: instance.id, _sourceDatabaseName: instance.name };
        }
      } catch (err) {
        console.warn(`Error querying database ${instance.id} for item:`, err);
      }
    }

    return null;
  }

  public async fetchTotalRowCount(): Promise<number> {
    try {
      const client = this.getWriteClient();
      const [logsRes, stockRes, prodRes] = await Promise.all([
        client.from('database_log').select('id', { count: 'exact', head: true }),
        client.from('stock_items').select('id', { count: 'exact', head: true }),
        client.from('products').select('id', { count: 'exact', head: true })
      ]);

      const total = (logsRes.count || 0) + (stockRes.count || 0) + (prodRes.count || 0);
      return total;
    } catch (err) {
      console.warn('Failed to fetch exact row count from Supabase:', err);
      return 0;
    }
  }

  public async testConnection(url: string, anonKey: string): Promise<{ success: boolean; message: string; rowCounts?: { products: number; logs: number } }> {
    try {
      if (!url || !anonKey) {
        return { success: false, message: 'URL dan Anon Key tidak boleh kosong.' };
      }

      const tempClient = createClient(url.trim(), anonKey.trim(), {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storageKey: `sb_test_ping_${Date.now()}`
        }
      });

      const startTime = performance.now();
      const [productsRes, logsRes] = await Promise.all([
        tempClient.from('products').select('id', { count: 'exact', head: true }),
        tempClient.from('database_log').select('id', { count: 'exact', head: true })
      ]);

      const duration = (performance.now() - startTime).toFixed(0);

      if (productsRes.error && productsRes.error.code === '42P01') {
        return {
          success: true,
          message: `Koneksi Berhasil (${duration}ms), namun tabel belum diinisialisasi (Skema kosong). Silakan jalankan Master SQL Schema.`
        };
      }

      if (productsRes.error && (productsRes.error.code === 'PGRST301' || productsRes.error.message?.includes('JWT'))) {
        return {
          success: false,
          message: `Koneksi Ditolak: Anon Key tidak valid atau salah untuk project ini.`
        };
      }

      return {
        success: true,
        message: `Koneksi Supabase Aktif & Valid! (${duration}ms) - Terhubung dengan lancar.`,
        rowCounts: {
          products: productsRes.count || 0,
          logs: logsRes.count || 0
        }
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Gagal terhubung ke Supabase: ${error?.message || 'Network / CORS error'}`
      };
    }
  }

  public async broadcastConfigToFirestore(payload: {
    url: string;
    anonKey: string;
    name?: string;
    message?: string;
  }): Promise<{ success: boolean; message: string }> {
    try {
      const refId = this.extractRefIdFromUrl(payload.url);
      const dataToSave: SupabaseBroadcastConfig = {
        url: payload.url.trim(),
        anonKey: payload.anonKey.trim(),
        refId,
        name: payload.name || `Supabase Target (${refId})`,
        broadcastAt: new Date().toISOString(),
        version: Date.now(),
        message: payload.message || 'Peralihan database baru oleh Administrator'
      };

      // 1. Perbarui localStorage lokal terlebih dahulu agar switch langsung aktif
      localStorage.setItem(STORAGE_KEY_ACTIVE_URL, dataToSave.url);
      localStorage.setItem(STORAGE_KEY_ACTIVE_KEY, dataToSave.anonKey);

      // 2. Simpan di Firestore untuk siaran real-time ke semua user
      try {
        const configDocRef = doc(db, 'system_config', FIRESTORE_CONFIG_DOC);
        await setDoc(configDocRef, dataToSave, { merge: true });

        const appSettingsRef = doc(db, 'app_settings', 'supabase_config');
        await setDoc(appSettingsRef, dataToSave, { merge: true });
      } catch (fsErr) {
        console.warn('Warning: Firestore broadcast encountered an issue, but local switch is active:', fsErr);
      }

      // Perbarui database instances list
      const currentConfig = this.loadConfig();
      let exists = false;
      const updatedDbs = currentConfig.databases.map(d => {
        if (d.url.trim() === dataToSave.url.trim()) {
          exists = true;
          return { ...d, status: 'active' as const, isActiveForWrite: true, anonKey: dataToSave.anonKey };
        }
        return { ...d, isActiveForWrite: false, status: (d.status === 'active' ? 'read_only_full' : d.status) as any };
      });

      if (!exists) {
        updatedDbs.unshift({
          id: `supabase_${refId || Date.now()}`,
          name: dataToSave.name || `Supabase Target (${refId})`,
          url: dataToSave.url,
          anonKey: dataToSave.anonKey,
          status: 'active',
          isActiveForWrite: true,
          isReadOnly: false,
          priority: 1,
          createdAt: new Date().toISOString()
        });
      }

      this.saveConfig({
        ...currentConfig,
        activeWriteDbId: updatedDbs[0].id,
        databases: updatedDbs
      });

      return {
        success: true,
        message: 'Konfigurasi Supabase berhasil diterapkan dan disiarkan real-time ke seluruh user via Firestore!'
      };
    } catch (error: any) {
      console.error('Failed to broadcast config to Firestore:', error);
      return {
        success: false,
        message: `Gagal menyiarkan ke Firestore: ${error?.message || 'Unknown error'}`
      };
    }
  }

  public listenToConfigChanges(onUpdate: (config: SupabaseBroadcastConfig) => void): Unsubscribe {
    const configDocRef = doc(db, 'system_config', FIRESTORE_CONFIG_DOC);
    return onSnapshot(configDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as SupabaseBroadcastConfig;
        if (data && data.url && data.anonKey) {
          onUpdate(data);
        }
      }
    }, (error) => {
      console.warn('Firestore Supabase config listener error:', error);
    });
  }

  public extractRefIdFromUrl(url: string): string {
    if (!url) return '';
    try {
      const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
      if (match && match[1]) {
        return match[1];
      }
      const hostMatch = url.match(/postgres\.([^:@]+)/);
      if (hostMatch && hostMatch[1]) {
        return hostMatch[1];
      }
    } catch (e) {
      // ignore
    }
    return '';
  }

  public parseConnectionUri(uriString: string): ParsedConnectionUri {
    const cleanUri = (uriString || '').trim();
    if (!cleanUri) {
      return {
        username: 'postgres',
        host: 'aws-0-ap-southeast-1.pooler.supabase.com',
        port: '5432',
        database: 'postgres',
        refId: '',
        original: ''
      };
    }

    try {
      // Example: postgresql://postgres.nufulqrtpzfiqghsxsze:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
      const regex = /^(?:postgresql|postgres):\/\/([^:]+)(?::([^@]*))?@([^:/]+)(?::(\d+))?(?:\/([^?]+))?/;
      const match = cleanUri.match(regex);

      if (match) {
        const rawUsername = match[1] || 'postgres';
        const rawHost = match[3] || 'aws-0-ap-southeast-1.pooler.supabase.com';
        const rawPort = match[4] || '5432';
        const rawDb = match[5] || 'postgres';

        let refId = '';
        if (rawUsername.includes('.')) {
          refId = rawUsername.split('.')[1];
        } else if (rawHost.includes('.')) {
          const parts = rawHost.split('.');
          if (parts.length > 2 && parts[0] === 'db') {
            refId = parts[1];
          }
        }

        return {
          username: rawUsername,
          host: rawHost,
          port: rawPort,
          database: rawDb,
          refId: refId || '',
          original: cleanUri
        };
      }
    } catch (e) {
      console.warn('Error parsing URI:', e);
    }

    return {
      username: 'postgres',
      host: 'aws-0-ap-southeast-1.pooler.supabase.com',
      port: '5432',
      database: 'postgres',
      refId: '',
      original: cleanUri
    };
  }

  public generatePgCommands(
    sumberUri: string,
    sumberPwd: string,
    targetUri: string,
    targetPwd: string
  ): GeneratedPgCommands {
    const src = this.parseConnectionUri(sumberUri);
    const tgt = this.parseConnectionUri(targetUri);

    const sPassword = sumberPwd ? sumberPwd.trim() : '[PASSWORD-DB-SUMBER]';
    const tPassword = targetPwd ? targetPwd.trim() : '[PASSWORD-DB-TARGET]';

    const cleanUpCmd = `set PGPASSWORD=${tPassword}
psql --host=${tgt.host} --port=${tgt.port} --username=${tgt.username} --dbname=${tgt.database} -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"`;

    const backupCmd = `set PGPASSWORD=${sPassword}
pg_dump --no-owner --no-privileges --quote-all-identifiers --host=${src.host} --port=${src.port} --username=${src.username} --dbname=${src.database} --schema=public --file=full_backup_sumber_to_target.sql`;

    const restoreCmd = `set PGPASSWORD=${tPassword}
psql --host=${tgt.host} --port=${tgt.port} --username=${tgt.username} --dbname=${tgt.database} --file=full_backup_sumber_to_target.sql`;

    const grantPermissionsCmd = `set PGPASSWORD=${tPassword}
psql --host=${tgt.host} --port=${tgt.port} --username=${tgt.username} --dbname=${tgt.database} -c "GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role; NOTIFY pgrst, 'reload schema';"`;

    return {
      cleanUpCmd,
      backupCmd,
      restoreCmd,
      grantPermissionsCmd
    };
  }

  public getMasterSqlSchema(): string {
    return `-- =========================================================================
-- MASTER SQL SCHEMA GUDANG 5 (COMPLETE SUITE V5)
-- Dihasilkan otomatis untuk Inisialisasi Database Supabase Baru
-- =========================================================================

-- 1. Enable Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Master Products Table
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_barang TEXT,
    sku_code TEXT,
    nama TEXT NOT NULL,
    satuan TEXT DEFAULT 'PCS',
    product_type_id TEXT,
    status TEXT DEFAULT 'Aktif',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Stock Items Table
CREATE TABLE IF NOT EXISTS public.stock_items (
    id TEXT PRIMARY KEY,
    id_barang TEXT,
    nama_produk TEXT NOT NULL,
    packing TEXT,
    rak TEXT NOT NULL,
    sub_rak TEXT,
    satuan TEXT DEFAULT 'PCS',
    stok_awal NUMERIC DEFAULT 0,
    masuk NUMERIC DEFAULT 0,
    keluar NUMERIC DEFAULT 0,
    tersedia NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'Aktif',
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Database Log (Inbound, Outbound, Move, Stock Opname)
CREATE TABLE IF NOT EXISTS public.database_log (
    id BIGSERIAL PRIMARY KEY,
    sku TEXT NOT NULL,
    nama_barang TEXT,
    packing TEXT,
    rak TEXT,
    sub_rak TEXT,
    rak_asal TEXT,
    rak_tujuan TEXT,
    sub_rak_asal TEXT,
    sub_rak_tujuan TEXT,
    jumlah NUMERIC NOT NULL DEFAULT 0,
    type TEXT NOT NULL, -- IN, OUT, MOVE, ADJUSTMENT
    tgl TEXT,
    waktu TEXT,
    tgl_scan TEXT,
    tgl_normalized DATE,
    user_name TEXT,
    gudang TEXT DEFAULT 'Gudang 5',
    keterangan TEXT,
    is_adjustment BOOLEAN DEFAULT false,
    transfer_pair_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Stok Lantai 3 System
CREATE TABLE IF NOT EXISTS public.stok_lantai3 (
    id TEXT PRIMARY KEY,
    nama_produk TEXT NOT NULL,
    qty NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.transaksi_lantai3 (
    id TEXT PRIMARY KEY, -- Format: {id_produk}_{YYYY-MM}
    id_produk TEXT NOT NULL,
    nama_produk TEXT NOT NULL,
    periode TEXT NOT NULL, -- YYYY-MM
    total_in NUMERIC DEFAULT 0,
    total_out NUMERIC DEFAULT 0,
    harian JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. App Users & Roles Management
CREATE TABLE IF NOT EXISTS public.app_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'staf_gudang',
    allowed_menus TEXT[] DEFAULT '{}',
    is_blocked BOOLEAN DEFAULT false,
    last_login TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
    id BIGSERIAL PRIMARY KEY,
    role TEXT NOT NULL,
    menu_path TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(role, menu_path)
);

CREATE TABLE IF NOT EXISTS public.role_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_blocking BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. App Settings & Utilities
CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.rack_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    warehouse_id TEXT,
    auto_fill_scanner BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.dev_rack_priorities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rack_name TEXT NOT NULL UNIQUE,
    priority INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sku_conversions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku_konversi TEXT NOT NULL UNIQUE,
    sku_pcs TEXT NOT NULL,
    qty NUMERIC DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.auto_sync_logs (
    id BIGSERIAL PRIMARY KEY,
    status TEXT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. High-Performance Indexes
CREATE INDEX IF NOT EXISTS idx_database_log_sku ON public.database_log(sku);
CREATE INDEX IF NOT EXISTS idx_database_log_rak ON public.database_log(rak);
CREATE INDEX IF NOT EXISTS idx_database_log_type ON public.database_log(type);
CREATE INDEX IF NOT EXISTS idx_database_log_tgl_norm ON public.database_log(tgl_normalized DESC);
CREATE INDEX IF NOT EXISTS idx_database_log_created_at ON public.database_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_items_nama ON public.stock_items(nama_produk);
CREATE INDEX IF NOT EXISTS idx_stock_items_rak ON public.stock_items(rak);
CREATE INDEX IF NOT EXISTS idx_stock_items_status ON public.stock_items(status);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku_code);
CREATE INDEX IF NOT EXISTS idx_products_nama ON public.products(nama);

-- 9. Permissions & Security (Grant all for anon & authenticated)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- 10. Reload PostgREST Schema Cache
NOTIFY pgrst, 'reload schema';
`;
  }
}

export const multiDbManager = MultiDbManager.getInstance();
