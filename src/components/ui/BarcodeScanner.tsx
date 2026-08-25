import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, RefreshCw, ScanLine, Zap } from 'lucide-react';

interface BarcodeScannerProps {
    onScan: (decodedText: string) => void;
    onClose: () => void;
    title?: string;
}

export function BarcodeScanner({ onScan, onClose, title }: BarcodeScannerProps) {
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const [error, setError] = useState<string>('');
    const [errorDetail, setErrorDetail] = useState<string>('');
    const [scanLineY, setScanLineY] = useState(0);
    const [isRetrying, setIsRetrying] = useState(false);
    const [lastScanned, setLastScanned] = useState<string>('');
    const mountedRef = useRef(true);
    const startAttemptedRef = useRef(false);
    // Use a ref to always have the latest onScan callback
    const onScanRef = useRef(onScan);
    onScanRef.current = onScan;

    // Animated scan line
    useEffect(() => {
        const interval = setInterval(() => {
            setScanLineY(prev => (prev >= 100 ? 0 : prev + 0.5));
        }, 20);
        return () => clearInterval(interval);
    }, []);

    const stopAndCleanScanner = async () => {
        if (scannerRef.current) {
            try {
                const state = scannerRef.current.getState();
                // State 2 = SCANNING, State 3 = PAUSED
                if (state === 2 || state === 3) {
                    await scannerRef.current.stop();
                }
                scannerRef.current.clear();
            } catch (err) {
                console.warn('Scanner cleanup warning:', err);
            }
            scannerRef.current = null;
        }
    };

    const handleScanSuccess = useCallback((text: string) => {
        console.log('[BarcodeScanner] Decoded:', text);
        setLastScanned(text);
        onScanRef.current(text);
    }, []);

    const startScanner = async () => {
        if (!mountedRef.current) return;

        // Prevent concurrent start attempts
        if (startAttemptedRef.current) return;
        startAttemptedRef.current = true;

        setError('');
        setErrorDetail('');

        try {
            await stopAndCleanScanner();
            if (!mountedRef.current) return;

            const scanner = new Html5Qrcode('reader-fullscreen', {
                verbose: false,
                formatsToSupport: [
                    Html5QrcodeSupportedFormats.QR_CODE,
                    Html5QrcodeSupportedFormats.CODE_128,
                    Html5QrcodeSupportedFormats.EAN_13,
                    Html5QrcodeSupportedFormats.EAN_8,
                    Html5QrcodeSupportedFormats.CODE_39,
                    Html5QrcodeSupportedFormats.UPC_A,
                    Html5QrcodeSupportedFormats.UPC_E,
                    Html5QrcodeSupportedFormats.CODABAR
                ]
            });
            scannerRef.current = scanner;

            const scanConfig: any = {
                fps: 15,
                qrbox: function (viewfinderWidth: number, viewfinderHeight: number) {
                    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                    // Use a wider rectangle for better barcode detection
                    const boxWidth = Math.max(250, Math.floor(minEdge * 0.85));
                    const boxHeight = Math.max(150, Math.floor(minEdge * 0.55));
                    return {
                        width: boxWidth,
                        height: boxHeight
                    };
                },
                disableFlip: false,
                aspectRatio: undefined
            };

            let started = false;
            let cameras: any[] = [];

            // Step 1: Use native method to get cameras. This automatically triggers permissions.
            try {
                cameras = await Html5Qrcode.getCameras();
                console.log("[BarcodeScanner] Found cameras:", cameras);
            } catch (camErr: any) {
                console.warn("[BarcodeScanner] getCameras failed or permission denied:", camErr);
            }

            if (!mountedRef.current) return;

            // Step 2: If we successfully mapped cameras with specific IDs
            if (cameras && cameras.length > 0) {
                // Determine target camera by labels
                const backCamera = cameras.find(c =>
                    c.label.toLowerCase().includes('back') ||
                    c.label.toLowerCase().includes('rear') ||
                    c.label.toLowerCase().includes('environment') ||
                    c.label.toLowerCase().includes('belakang')
                );

                const targetCameras = [];
                if (backCamera) targetCameras.push(backCamera);

                // Add the last camera (often back camera on phones if label is missing) 
                // and the first camera (often front or default)
                if (cameras.length > 1) {
                    if (!backCamera) targetCameras.push(cameras[cameras.length - 1]);
                    targetCameras.push(cameras[0]);
                } else if (!backCamera) {
                    targetCameras.push(cameras[0]);
                }

                // Deduplicate Array
                const uniqueCameras = Array.from(new Set(targetCameras.map(c => c.id)))
                    .map(id => targetCameras.find(c => c.id === id)!);

                // Try starting with explicit IDs
                for (const cam of uniqueCameras) {
                    if (!mountedRef.current) return;
                    try {
                        console.log(`[BarcodeScanner] Attempting explicit ID: ${cam.label || cam.id}`);
                        await scanner.start(cam.id, scanConfig, handleScanSuccess, () => { });
                        console.log("[BarcodeScanner] Success with explicit ID!");
                        started = true;
                        break;
                    } catch (e) {
                        console.warn(`[BarcodeScanner] Failed explicit ID ${cam.id}:`, e);
                        await stopAndCleanScanner();
                        // Re-create scanner for next attempt
                        if (mountedRef.current) {
                            const newScanner = new Html5Qrcode('reader-fullscreen', {
                                verbose: false,
                                formatsToSupport: [
                                    Html5QrcodeSupportedFormats.QR_CODE,
                                    Html5QrcodeSupportedFormats.CODE_128,
                                    Html5QrcodeSupportedFormats.EAN_13,
                                    Html5QrcodeSupportedFormats.EAN_8,
                                    Html5QrcodeSupportedFormats.CODE_39,
                                    Html5QrcodeSupportedFormats.UPC_A,
                                    Html5QrcodeSupportedFormats.UPC_E,
                                    Html5QrcodeSupportedFormats.CODABAR
                                ]
                            });
                            scannerRef.current = newScanner;
                        }
                    }
                }
            }

            // Step 3: Fallback using facingMode object if exact ID attempts failed or getCameras failed
            if (!started && mountedRef.current) {
                const fallbackStrategies = [
                    { facingMode: 'environment' },
                    { facingMode: 'user' }
                ];

                for (const strategy of fallbackStrategies) {
                    if (!mountedRef.current) return;
                    try {
                        // Re-initialize a fresh scanner since errors can corrupt the instance state
                        await stopAndCleanScanner();
                        const fallbackScanner = new Html5Qrcode('reader-fullscreen');
                        scannerRef.current = fallbackScanner;

                        console.log(`[BarcodeScanner] Attempting fallback strategy: ${JSON.stringify(strategy)}`);
                        await fallbackScanner.start(strategy, scanConfig, handleScanSuccess, () => { });
                        console.log("[BarcodeScanner] Success with fallback strategy!");
                        started = true;
                        break;
                    } catch (err: any) {
                        console.warn(`[BarcodeScanner] Failed fallback strategy ${JSON.stringify(strategy)}:`, err?.message || err);
                    }
                }
            }

            if (!started) {
                throw new Error('Tidak ada strategi kamera yang berhasil.');
            }

        } catch (err: any) {
            console.error('[BarcodeScanner] Fatal Init Error:', err);
            if (mountedRef.current) {
                const message = err?.message || err?.name || '';

                if (message.includes('NotAllowedError') || message.includes('Permission')) {
                    setError('Izin akses kamera ditolak.');
                    setErrorDetail('Harap izinkan akses kamera pada pengaturan browser/perangkat Anda, lalu coba lagi.');
                } else if (message.includes('NotReadableError') || message.includes('TrackStartError')) {
                    setError('Kamera sedang digunakan.');
                    setErrorDetail('Aplikasi lain sepertinya sedang menggunakan kamera.\nHarap tutup aplikasi/tab kamera lain dan coba lagi.');
                } else {
                    setError('Kamera tidak dapat dimulai.');
                    setErrorDetail(`Detail: ${message}\n\nPeriksa apakah browser Anda memiliki izin penuh, atau coba refresh halaman.`);
                }
            }
        } finally {
            startAttemptedRef.current = false;
        }
    };

    useEffect(() => {
        mountedRef.current = true;
        // Give the DOM a tiny fraction of a second to render the div container
        setTimeout(() => {
            startScanner();
        }, 150);

        return () => {
            mountedRef.current = false;
            stopAndCleanScanner();
        };
    }, []);

    const handleRetry = async () => {
        setIsRetrying(true);
        setError('');
        setErrorDetail('');
        await stopAndCleanScanner();

        // Small delay to ensure complete cleanup of hardware lock
        setTimeout(async () => {
            await startScanner();
            setIsRetrying(false);
        }, 600);
    };

    const displayTitle = title || 'Arahkan barcode ke area scan';

    return (
        <div className="fixed inset-0 z-[10001] bg-black">
            {/* Camera feed - fills entire screen */}
            {/* Hide all html5-qrcode library built-in UI elements (ugly gray borders) */}
            <div
                id="reader-fullscreen"
                className="absolute inset-0 w-full h-full [&>video]:object-cover [&>video]:w-full [&>video]:h-full"
                style={{
                    // Hide library's built-in scan region border
                }}
            />

            {/* CSS to hide the library's ugly default UI */}
            <style>{`
                #reader-fullscreen > div:not(:first-child) { display: none !important; }
                #reader-fullscreen img { display: none !important; }
                #reader-fullscreen__scan_region { border: none !important; }
                #reader-fullscreen__scan_region > br { display: none !important; }
                #reader-fullscreen__scan_region > img { display: none !important; }
                #reader-fullscreen__dashboard_section { display: none !important; }
                #reader-fullscreen video {
                    object-fit: cover !important;
                    width: 100% !important;
                    height: 100% !important;
                }
                /* Hide shaded region borders from library */
                #qr-shaded-region { border: none !important; }
                [id*="qr-shaded"] { border: none !important; }
            `}</style>

            {/* Top bar with title */}
            <div
                className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/80 via-black/40 to-transparent"
                style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}
            >
                <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="p-1.5 bg-cyan-500/20 rounded-lg border border-cyan-400/30">
                            <ScanLine className="h-4 w-4 text-cyan-400" />
                        </div>
                        <p className="text-white text-sm font-semibold tracking-wide truncate">
                            {displayTitle}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="ml-3 w-10 h-10 rounded-full bg-white/10 backdrop-blur-xl flex items-center justify-center text-white hover:bg-white/20 transition-all active:scale-90 shadow-lg border border-white/20"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>
            </div>

            {/* Scan Region Overlay */}
            <div className="absolute inset-0 z-[5] pointer-events-none flex items-center justify-center">
                {/* Darkened edges */}
                <div className="absolute inset-0 bg-black/50" />

                {/* Clear center box — wider for barcode scan */}
                <div className="relative w-[85vw] max-w-[380px] h-[55vw] max-h-[240px] mx-auto">
                    {/* Cut out the center - using box-shadow trick */}
                    <div
                        className="absolute inset-0"
                        style={{
                            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.50)',
                            borderRadius: '20px'
                        }}
                    />

                    {/* Glow behind frame */}
                    <div
                        className="absolute -inset-1 rounded-[22px] opacity-40"
                        style={{
                            boxShadow: '0 0 30px 8px rgba(34, 211, 238, 0.35), inset 0 0 30px 8px rgba(34, 211, 238, 0.15)'
                        }}
                    />

                    {/* Corner brackets — premium style */}
                    <div className="absolute -top-[2px] -left-[2px] w-10 h-10 border-t-[3px] border-l-[3px] border-cyan-400 rounded-tl-2xl" style={{ filter: 'drop-shadow(0 0 6px rgba(34,211,238,0.6))' }} />
                    <div className="absolute -top-[2px] -right-[2px] w-10 h-10 border-t-[3px] border-r-[3px] border-cyan-400 rounded-tr-2xl" style={{ filter: 'drop-shadow(0 0 6px rgba(34,211,238,0.6))' }} />
                    <div className="absolute -bottom-[2px] -left-[2px] w-10 h-10 border-b-[3px] border-l-[3px] border-cyan-400 rounded-bl-2xl" style={{ filter: 'drop-shadow(0 0 6px rgba(34,211,238,0.6))' }} />
                    <div className="absolute -bottom-[2px] -right-[2px] w-10 h-10 border-b-[3px] border-r-[3px] border-cyan-400 rounded-br-2xl" style={{ filter: 'drop-shadow(0 0 6px rgba(34,211,238,0.6))' }} />

                    {/* Animated scan line with glowing effect */}
                    <div
                        className="absolute left-3 right-3 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent transition-none"
                        style={{
                            top: `${scanLineY}%`,
                            opacity: scanLineY > 5 && scanLineY < 95 ? 0.9 : 0,
                            boxShadow: '0 0 20px 6px rgba(34, 211, 238, 0.45)'
                        }}
                    />
                </div>
            </div>

            {/* Bottom hint bar */}
            <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent pb-8 pt-16">
                <div className="flex flex-col items-center gap-3 px-6">
                    {lastScanned && (
                        <div className="flex items-center gap-2 bg-emerald-500/20 border border-emerald-400/30 rounded-xl px-4 py-2 backdrop-blur-md">
                            <Zap className="h-4 w-4 text-emerald-400" />
                            <span className="text-emerald-300 text-xs font-medium truncate max-w-[200px]">
                                Terakhir: {lastScanned}
                            </span>
                        </div>
                    )}
                    <p className="text-white/50 text-xs font-medium tracking-wider text-center">
                        Posisikan barcode di dalam bingkai cyan
                    </p>
                </div>
            </div>

            {/* Error overlay */}
            {error && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/90 p-6 backdrop-blur-sm">
                    <div className="text-center w-full max-w-sm">
                        <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(239,68,68,0.2)]">
                            <X className="h-10 w-10 text-red-400" />
                        </div>
                        <h3 className="text-red-400 font-black text-xl mb-3 tracking-tight">{error}</h3>
                        {errorDetail && (
                            <p className="text-white/70 text-sm mb-8 whitespace-pre-line text-left bg-white/5 rounded-2xl p-5 border border-white/10 leading-relaxed">
                                {errorDetail}
                            </p>
                        )}
                        <div className="flex gap-4 justify-center">
                            <button
                                onClick={handleRetry}
                                disabled={isRetrying}
                                className="px-6 py-4 flex-1 bg-gradient-to-r from-blue-500 to-blue-600 rounded-2xl text-white font-bold active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-blue-500/30"
                            >
                                <RefreshCw className={`h-5 w-5 ${isRetrying ? 'animate-spin' : ''}`} />
                                {isRetrying ? 'Mencoba...' : 'Coba Lagi'}
                            </button>
                            <button
                                onClick={onClose}
                                className="px-6 py-4 flex-1 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl text-white font-bold active:scale-95 transition-all shadow-lg"
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
