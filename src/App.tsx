import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { LoginPage } from './components/LoginPage';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { KonversiPCS } from './components/KonversiPCS';
import { InputBarangMasuk } from './components/InputBarangMasuk';
import { InputBarangKeluar } from './components/InputBarangKeluar';

import { UpdateLokasi } from './components/UpdateLokasi';
import { DataGudang } from './components/DataGudang';
import { RiwayatBarang } from './components/RiwayatBarang';
import { DatabaseLog } from './components/DatabaseLog';
import ImportDataExport from './components/ImportDataExport';
import { PindahDataBarang } from './components/PindahDataBarang';
import { NamaGudang } from './components/master-data/NamaGudang';
import { JenisBarang } from './components/master-data/JenisBarang';
import { Satuan } from './components/master-data/Satuan';
import { DataSKU } from './components/master-data/DataSKU';
import { LokasiRak } from './components/master-data/LokasiRak';
import { FixStockSync } from './components/FixStockSync';
import { UpdatePacking } from './components/UpdatePacking';
import { StokLantai3 } from './components/StokLantai3';
import { InputCancelFisik } from './components/InputCancelFisik';
import { DevRackUpdate } from './components/DevRackUpdate';
import { DevRackAutoFill } from './components/DevRackAutoFill';
import { AutoSyncSettings } from './components/AutoSyncSettings';
import { UpdateNotificationManager } from './components/UpdateNotificationManager';
import { UpdateNotificationPopup } from './components/UpdateNotificationPopup';
import { RackPrioritySettings } from './components/RackPrioritySettings';
import { StokMinus } from './components/StokMinus';
import { DataKarantina } from './components/DataKarantina';
import { TransferSync } from './components/TransferSync';
import { CekRak } from './components/CekRak';
import { UserManagement } from './components/UserManagement';
import { realtimeManager } from './lib/realtimeManager';
import { AppUpdateListener } from './components/AppUpdateListener';
import { DailyMonitoring } from './components/DailyMonitoring';
import { DailyQuestManager } from './components/DailyQuestManager';
import { DatabaseSettings } from './components/DatabaseSettings';
import { DevModeSettings } from './components/DevModeSettings';
import { RoleNotificationBlocker } from './components/RoleNotificationBlocker';
import { ManageRoleNotifications } from './components/ManageRoleNotifications';
import { startAutoFixTransferScheduler } from './services/autoFixTransferService';
function AuthenticatedApp() {
  const { user, loading } = useAuth();

  useEffect(() => {
    let cleanupScheduler: (() => void) | undefined;

    const initializeApp = async () => {
      try {
        await realtimeManager.initialize();
        cleanupScheduler = startAutoFixTransferScheduler();
      } catch (error) {
        console.error('Failed to initialize realtime manager:', error);
      }
    };

    if (user) {
      initializeApp();
    }

    return () => {
      realtimeManager.disconnect();
      if (cleanupScheduler) cleanupScheduler();
    };
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">Memuat...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <>
      <AppUpdateListener />
      <UpdateNotificationPopup />
      <RoleNotificationBlocker />
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/konversi-pcs" element={<KonversiPCS />} />
          <Route path="/input-masuk" element={<InputBarangMasuk />} />
          <Route path="/input-keluar" element={<InputBarangKeluar />} />
          <Route path="/monitoring-harian" element={<DailyMonitoring />} />
          <Route path="/stok-minus" element={<StokMinus />} />
          <Route path="/data-karantina" element={<DataKarantina />} />
          <Route path="/pindah-barang" element={<PindahDataBarang />} />
          <Route path="/data-gudang" element={<DataGudang />} />
          <Route path="/riwayat" element={<RiwayatBarang />} />
          <Route path="/update-lokasi" element={<UpdateLokasi />} />
          <Route path="/database-log" element={<DatabaseLog />} />
          <Route path="/import-data-export" element={<ImportDataExport />} />
          <Route path="/master-data/gudang" element={<NamaGudang />} />
          <Route path="/master-data/jenis-barang" element={<JenisBarang />} />
          <Route path="/master-data/satuan" element={<Satuan />} />
          <Route path="/master-data/sku" element={<DataSKU />} />
          <Route path="/master-data/lokasi-rak" element={<LokasiRak />} />
          <Route path="/fix-stock-sync" element={<FixStockSync />} />
          <Route path="/update-packing" element={<UpdatePacking />} />
          <Route path="/auto-sync" element={<AutoSyncSettings />} />
          <Route path="/stok-lantai-3" element={<StokLantai3 />} />
          <Route path="/input-cancel-fisik" element={<InputCancelFisik />} />
          <Route path="/dev-rack-update" element={<DevRackUpdate />} />
          <Route path="/dev-rack-autofill" element={<DevRackAutoFill />} />
          <Route path="/notification-manager" element={<UpdateNotificationManager />} />
          <Route path="/rack-priority-settings" element={<RackPrioritySettings />} />
          <Route path="/transfer-sync" element={<TransferSync />} />
          <Route path="/cek-rak" element={<CekRak />} />
          <Route path="/user-management" element={<UserManagement />} />
          <Route path="/daily-quest-manager" element={<DailyQuestManager />} />
          <Route path="/database-settings" element={<DatabaseSettings />} />
          <Route path="/dev-settings" element={<DevModeSettings />} />
          <Route path="/manage-role-notifications" element={<ManageRoleNotifications />} />
        </Routes>
      </Layout>
    </>
  );
}

import { DatabaseProvider } from './lib/DatabaseContext';

function App() {
  return (
    <Router>
      <AuthProvider>
        <DatabaseProvider>
          <AuthenticatedApp />
        </DatabaseProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;