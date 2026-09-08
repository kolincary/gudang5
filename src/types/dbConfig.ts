export type DatabaseStatus = 'active' | 'read_only_full' | 'standby' | 'disabled';
export type ReadStrategy = 'active_first' | 'federated_all' | 'parallel_search';

export interface DatabaseInstance {
  id: string;                    // Contoh: "supabase_db_1", "supabase_db_2"
  name: string;                  // Label: "Gudang DB Utama 2024", "Gudang DB Cadangan 1"
  url: string;                   // URL Supabase: https://xxxx.supabase.co
  anonKey: string;               // Public Anon Key
  serviceRoleKey?: string;       // (Opsional/Backend only)
  status: DatabaseStatus;
  isActiveForWrite: boolean;     // true hanya untuk 1 DB yang sedang dipakai menulis
  isReadOnly: boolean;           // true jika kuota penuh, hanya boleh SELECT/READ
  
  // Monitoring Kuota & Batas
  capacityLimitMB?: number;      // Batas Free Tier Supabase (~500MB)
  currentUsageMB?: number;       // Pemakaian saat ini
  maxRowCount?: number;          // Contoh: 500000 baris
  currentRowCount?: number;      // Jumlah baris terdeteksi saat ini
  lastCheckedAt?: string;        // ISO Timestamp pengecekan terakhir
  
  priority: number;              // Urutan switch (1, 2, 3...)
  createdAt: string;
}

export interface MultiDbConfig {
  activeWriteDbId: string;       // ID DB yang aktif untuk operasi INSERT/UPDATE
  autoSwitchEnabled: boolean;    // Otomatis pindah jika mendekati penuh
  switchThresholdPercent: number;// Contoh: 90 (Jika terpakai >= 90%, switch ke DB berikutnya)
  readStrategy: ReadStrategy;    // 'active_first' | 'federated_all'
  databases: DatabaseInstance[]; // Daftar seluruh instance Supabase
}

export interface SupabaseBroadcastConfig {
  url: string;
  anonKey: string;
  refId?: string;
  name?: string;
  broadcastAt: string;
  version: number;
  message?: string;
}

export interface ParsedConnectionUri {
  username: string;
  host: string;
  port: string;
  database: string;
  refId: string;
  original: string;
}

export interface GeneratedPgCommands {
  cleanUpCmd: string;
  backupCmd: string;
  restoreCmd: string;
  grantPermissionsCmd: string;
}
