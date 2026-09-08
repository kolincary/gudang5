import {
  LayoutDashboard,
  Package,
  PackageOpen,
  History,
  MapPin,
  Database,
  ArrowRightLeft,
  Database as DatabaseIcon,
  PackageCheck,
  Building,
  Settings,
  Bell,
  Building2,
  Package2,
  Scale,
  Tag,
  AlertTriangle,
  ShieldAlert,
  QrCode,
  Users,
  Activity,
  Ban,
  Upload,
  Boxes
} from 'lucide-react';

export const navigationItems = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Konversi PCS', href: '/konversi-pcs', icon: Boxes },
  { name: 'Stok Lantai 3', href: '/stok-lantai-3', icon: Building },
  { name: 'Monitoring Harian', href: '/monitoring-harian', icon: Activity },
  { name: 'Input Barang Masuk', href: '/input-masuk', icon: Package },
  { name: 'Input Barang Keluar', href: '/input-keluar', icon: PackageOpen },
  { name: 'Pindah Data Barang', href: '/pindah-barang', icon: ArrowRightLeft },
  { name: 'Data Gudang', href: '/data-gudang', icon: Database },
  { name: 'Riwayat Barang', href: '/riwayat', icon: History },
  { name: 'Update Lokasi', href: '/update-lokasi', icon: MapPin },
  { name: 'Database Log', href: '/database-log', icon: Database },
];

export const devNavigationItems = [
  { name: 'Supabase DB Config', href: '/db-config', icon: DatabaseIcon },
  { name: 'Import Data Closing', href: '/import-data-export', icon: Upload },
  { name: 'Transfer Sync Manager', href: '/transfer-sync', icon: ArrowRightLeft },
  { name: 'Perbaiki Sinkronisasi Stok', href: '/fix-stock-sync', icon: DatabaseIcon },
  { name: 'Update Packing', href: '/update-packing', icon: PackageCheck },
  { name: 'Auto-Sync Pengaturan', href: '/auto-sync', icon: Settings },
  { name: 'Dev: Update Rak Khusus', href: '/dev-rack-update', icon: Settings },
  { name: 'DevMode Settings', href: '/dev-settings', icon: Settings },
  { name: 'Kelola Notifikasi Update', href: '/notification-manager', icon: Bell },
  { name: 'Pengaturan Prioritas Rak', href: '/rack-priority-settings', icon: Settings },
  { name: 'User Management', href: '/user-management', icon: Users },
  { name: 'Pengaturan Quest Harian', href: '/daily-quest-manager', icon: ShieldAlert },
  { name: 'Pengaturan Database', href: '/database-settings', icon: DatabaseIcon },
];

export const masterDataItems = [
  { name: 'Nama Gudang', href: '/master-data/gudang', icon: Building2 },
  { name: 'Jenis Barang', href: '/master-data/jenis-barang', icon: Package2 },
  { name: 'Satuan', href: '/master-data/satuan', icon: Scale },
  { name: 'Data SKU', href: '/master-data/sku', icon: Tag },
  { name: 'Lokasi Rak', href: '/master-data/lokasi-rak', icon: MapPin },
];

export const monitoringItems = [
  { name: 'Stok Minus', href: '/stok-minus', icon: AlertTriangle },
  { name: 'Data Karantina', href: '/data-karantina', icon: ShieldAlert },
];

export const additionalMenuItems = [
  { name: 'Cek Rak', href: '/cek-rak', icon: QrCode },
];
