import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { realtimeManager } from '../lib/realtimeManager';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from './ui/Button';

// ----------------------------------------------------------------------------
// ⚠️ PENTING: UBAH ANGKA INI SETIAP KALI ANDA AKAN DEPLOY KE NETLIFY
// Contoh: Jika saat ini 1.0.0, berikutnya jadikan 1.0.1 sebelum git commit.
// ----------------------------------------------------------------------------
export const APP_VERSION = '1.2.8';

export const AppUpdateListener: React.FC = () => {
    const [needsUpdate, setNeedsUpdate] = useState(false);
    const [serverVersion, setServerVersion] = useState<string | null>(null);

    useEffect(() => {
        // 1. Cek versi saat pertama kali aplikasi dibuka
        checkVersion();

        // 2. Subscribe via mode Realtime Supabase (Kirim Sinyal)
        const subscriptionId = realtimeManager.subscribe('app_settings', (payload) => {
            // Jika ada baris yang berubah di tabel app_settings
            const newRecord = payload.new;
            if (newRecord && newRecord.key === 'app_version') {
                const newVersion = newRecord.value;
                // Jika versi di database BERBEDA dengan versi di kode lokal
                if (newVersion !== APP_VERSION) {
                    setServerVersion(newVersion);
                    setNeedsUpdate(true);
                }
            }
        });

        return () => {
            realtimeManager.unsubscribe(subscriptionId);
        };
    }, []);

    const checkVersion = async () => {
        try {
            const { data, error } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'app_version')
                .maybeSingle();

            if (!error && data) {
                if (data.value !== APP_VERSION) {
                    setServerVersion(data.value);
                    setNeedsUpdate(true);
                }
            }
        } catch (error) {
            console.error('Error checking app version:', error);
        }
    };

    // Jangan tampilkan apa-apa jika versi sama
    if (!needsUpdate) return null;

    // Jika butuh update, kunci layar seluruhnya (Popup paksa)
    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 max-w-md w-full mx-4 text-center animate-in zoom-in-95 duration-300 delay-100">
                <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-6">
                    <RefreshCw className="w-8 h-8 text-blue-600 animate-[spin_3s_linear_infinite]" />
                </div>

                <h2 className="text-2xl font-bold text-gray-900 mb-2">Sistem Telah Diperbarui!</h2>
                <p className="text-gray-600 mb-6 text-sm sm:text-base">
                    Aplikasi versi baru ({serverVersion ? `v${serverVersion}` : 'Terbaru'}) telah deploy. Anda memakai versi usang (v{APP_VERSION}).<br /><br />
                    Untuk mencegah error dan mendapatkan fitur terbaru, halaman harus dimuat ulang sekarang.
                </p>

                <div className="bg-amber-50 rounded-xl p-4 mb-6 flex items-start text-left gap-3 border border-amber-200">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs sm:text-sm text-amber-800 leading-relaxed font-medium">
                        Proses yang tertunda mungkin akan dibatalkan. Ini diperlukan demi keamanan sinkronisasi data gudang Anda.
                    </p>
                </div>

                <Button
                    onClick={() => window.location.reload()}
                    className="w-full bg-blue-600 hover:bg-blue-700 h-14 text-lg font-semibold shadow-lg shadow-blue-200 rounded-xl transition-all hover:scale-[1.02]"
                >
                    <RefreshCw className="w-5 h-5 mr-2" />
                    Muat Ulang Sekarang
                </Button>
            </div>
        </div>
    );
};
