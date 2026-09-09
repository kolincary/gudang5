import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { ArrowRight, ShieldCheck, X } from 'lucide-react';
import downloadApkImg from '../assets/download-apk.png';

export function LoginPage() {
    const { signInWithGoogle, signInAsDevMode, loading } = useAuth();
    const [devValue, setDevValue] = useState('');
    const [showDevInput, setShowDevInput] = useState(false);
    const [showDevModal, setShowDevModal] = useState(false);
    const [devPassword, setDevPassword] = useState('');
    const [devError, setDevError] = useState('');
    const [isDevLoading, setIsDevLoading] = useState(false);
    const devInputRef = useRef<HTMLInputElement>(null);

    // Global listener for physical keyboards (Desktop)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key.length === 1 && !showDevModal) {
                setDevValue(prev => {
                    const newVal = prev + e.key.toLowerCase();
                    if (newVal.includes('devmode')) {
                        setShowDevModal(true);
                        return '';
                    }
                    return newVal.slice(-10);
                });
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showDevModal]);

    const handleDevChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setDevValue(val);
        if (val.toLowerCase().includes('devmode')) {
            setShowDevModal(true);
        }
    };

    const handleDevSubmit = async () => {
        setIsDevLoading(true);
        setDevError('');
        const success = await signInAsDevMode(devPassword);
        setIsDevLoading(false);
        if (!success) {
            setDevError('Password salah.');
        } else {
            setShowDevModal(false);
        }
    };

    const handleTriggerDev = () => {
        setShowDevInput(true);
        setTimeout(() => devInputRef.current?.focus(), 50);
    };



    return (
        <div className="min-h-[100dvh] h-[100dvh] bg-gradient-to-br from-slate-50 to-blue-50 lg:bg-white flex flex-col lg:flex-row font-sans overflow-hidden relative">

            {/* Hidden Dev Mode Input Trigger (Can trigger by typing or focusing) */}
            <input
                id="devmode-hidden-trigger"
                name="devmode-hidden-trigger"
                ref={devInputRef}
                type="text"
                className={`absolute opacity-0 z-[-1] pointer-events-none ${showDevInput ? 'h-full w-full bottom-0 left-0' : 'h-0 w-0'}`}
                value={devValue}
                onChange={handleDevChange}
                autoCapitalize="none"
                autoComplete="off"
                spellCheck="false"
            />

            {/* DevMode Password Modal */}
            {showDevModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl relative border border-gray-100">
                        <button 
                            onClick={() => { setShowDevModal(false); setDevPassword(''); setDevError(''); }}
                            className="absolute top-5 right-5 text-gray-400 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 p-2 rounded-full transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-3 bg-red-50 text-red-600 rounded-2xl">
                                <ShieldCheck className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-black text-gray-900 tracking-tight">DevMode Access</h3>
                        </div>
                        <p className="text-sm text-gray-500 mb-6 font-medium">Authentication required. Please enter the administrator password to continue.</p>
                        
                        <div className="space-y-4">
                            <div>
                                <input
                                    id="devmode-admin-password"
                                    name="devmode-password"
                                    type="password"
                                    value={devPassword}
                                    onChange={(e) => { setDevPassword(e.target.value); setDevError(''); }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handleDevSubmit();
                                        }
                                    }}
                                    className={`w-full px-5 py-4 rounded-2xl border ${devError ? 'border-red-300 focus:ring-red-500 bg-red-50/30' : 'border-gray-200 focus:ring-blue-500 bg-gray-50'} focus:outline-none focus:ring-2 transition-all font-medium`}
                                    placeholder="Password"
                                    autoFocus
                                />
                                {devError && <p className="text-xs text-red-500 mt-2 ml-1 font-bold">{devError}</p>}
                            </div>
                            
                            <button
                                onClick={handleDevSubmit}
                                disabled={isDevLoading}
                                className={`w-full py-4 ${isDevLoading ? 'bg-gray-600' : 'bg-gray-900 hover:bg-black'} text-white rounded-2xl font-black tracking-wide transition-all active:scale-95 shadow-lg shadow-gray-900/20`}
                            >
                                {isDevLoading ? 'Verifying...' : 'Access System'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ----------------- MOBILE LAYOUT (Top Section) ----------------- */}
            {/* ----------------- MOBILE LAYOUT (Full Screen Background) ----------------- */}
            <div className="lg:hidden absolute inset-0 z-0 bg-[#2B60DF]" onClick={handleTriggerDev}>
                <img
                    src="/login-bg2.png"
                    alt="Gudang Kalindo Mobile Background"
                    className="w-full h-full object-cover object-center"
                    onError={(e) => {
                        (e.target as HTMLImageElement).src = '/login-bg.webp';
                    }}
                />
                {/* Stylish gradient overlay at the bottom to blend with the card */}
                <div className="absolute inset-x-0 bottom-0 h-[65vh] bg-gradient-to-t from-black/60 via-black/20 to-transparent"></div>
            </div>

            {/* Mobile Header Text */}
            <div className="lg:hidden flex flex-col items-center pt-10 px-6 relative z-10 w-full" onClick={handleTriggerDev}>
                <h1 className="text-[36px] font-black tracking-tight text-center text-white drop-shadow-2xl" style={{ textShadow: '0 4px 20px rgba(0,0,0,0.6)' }}>
                    Gudang <span className="text-blue-300">Kalindo</span>
                </h1>
                <p className="text-blue-100 text-[14px] mt-1.5 font-bold text-center drop-shadow-xl" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.8)' }}>
                    Sistem Manajemen Gudang Lantai 5
                </p>
            </div>


            {/* ----------------- DESKTOP LAYOUT (Left Side Split) ----------------- */}
            {/* Based on Image 3 reference: Full height beautiful illustration */}
            <div className="hidden lg:flex w-[45%] xl:w-1/2 bg-[#2B60DF] relative flex-col justify-between items-center overflow-hidden shadow-2xl z-20" onClick={handleTriggerDev}>

                {/* Full screen background image replacing the whole left side */}
                <img
                    src="/login-bg.webp"
                    alt="Warehouse Login"
                    className="absolute inset-0 w-full h-full object-cover object-center"
                    onError={(e) => {
                        // Fallback if image not found
                        (e.target as HTMLImageElement).style.display = 'none';
                    }}
                />

                {/* Dark gradient overlay at the bottom so the white text is readable */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#11244e]/90 via-[#11244e]/30 to-transparent"></div>

                {/* Text stays at the bottom */}
                <div className="relative z-10 text-center mt-auto p-12 w-full pb-16">
                    <h1 className="text-4xl xl:text-5xl font-black text-white tracking-tight mb-4 drop-shadow-xl">
                        Gudang <span className="text-blue-300">Kalindo</span>
                    </h1>
                    <p className="text-blue-100 text-lg max-w-sm mx-auto font-medium leading-relaxed drop-shadow-md">
                        Sistem Manajemen Gudang Lantai 5
                    </p>
                </div>
            </div>


            {/* ----------------- LOGIN FORM (Right Side Desktop / Bottom Area Mobile) ----------------- */}
            <div className="w-full lg:w-[55%] xl:w-1/2 flex flex-1 lg:flex-none items-end lg:items-center justify-center p-4 sm:p-6 lg:p-12 relative z-20 flex-shrink-0">

                {/* Mobile Floating Card Wrapper */}
                <div className="w-full max-w-[420px] bg-white/95 backdrop-blur-2xl lg:bg-transparent rounded-3xl lg:rounded-none shadow-[0_10px_50px_rgba(0,0,0,0.35)] lg:shadow-none border border-white/60 lg:border-none px-6 py-8 sm:p-10 lg:p-0 transition-all flex flex-col justify-center mb-4 lg:mb-0 relative overflow-hidden">

                    {/* Glassmorphism reflection strictly for mobile */}
                    <div className="lg:hidden absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none rounded-3xl"></div>

                    <div className="relative z-10">

                        <div className="mb-8 text-center lg:text-left">
                            <div className="hidden lg:inline-flex items-center gap-2 px-4 py-1.5 bg-blue-50 rounded-full border border-blue-100 mb-6">
                                <ShieldCheck className="h-4 w-4 text-blue-600" />
                                <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">Secure Access</span>
                            </div>

                            <h2 className="text-2xl lg:text-3xl font-black text-gray-900 mb-3 tracking-tight">Welcome Back</h2>
                            <p className="text-sm lg:text-base text-gray-500 font-medium">Please sign in to access your workspace</p>
                        </div>

                        {/* Google Sign In Button */}
                        <div className="space-y-4">
                            <button
                                onClick={async () => {
                                    // Defensive: check if we already have a session but it's not detected
                                    const { data } = await supabase.auth.getSession();
                                    if (data?.session) {
                                        window.location.reload();
                                        return;
                                    }
                                    signInWithGoogle();
                                }}
                                disabled={loading}
                                className="w-full flex items-center h-14 bg-[#1a73e8] hover:bg-[#1557b0] text-white rounded-2xl transition-all duration-300 transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg pl-1.5 pr-6 group"
                            >
                                {/* Google Icon Circle */}
                                <div className="w-11 h-11 bg-white rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm group-hover:scale-95 transition-transform">
                                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                    </svg>
                                </div>
                                <span className="flex-1 text-center font-bold text-[15px] tracking-wide">
                                    {loading ? 'Memuat...' : 'Login dengan Google'}
                                </span>
                                <ArrowRight className="w-5 h-5 text-blue-200 opacity-0 group-hover:opacity-100 group-hover:-translate-x-1 transition-all" />
                            </button>

                            {loading && (
                                <button
                                    onClick={() => window.location.reload()}
                                    className="w-full py-2 text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline"
                                >
                                    Login stuck? Klik untuk Segarkan
                                </button>
                            )}
                        </div>

                        {/* Download APK Section (Hidden as requested) */}
                        <div className="mt-6 flex-col items-center justify-center p-3.5 bg-slate-50 lg:bg-slate-50/60 rounded-2xl border border-slate-100/80 hidden">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Unduh Aplikasi Android</span>
                            <a
                                href="https://drive.google.com/file/d/1wiOBlgqyQ6uf4p1HyN0jPtTM2WkHNV0u/view?usp=sharing"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="transition-all hover:scale-[1.05] active:scale-[0.95] duration-200 block shadow-md hover:shadow-lg rounded-2xl overflow-hidden"
                            >
                                <img
                                    src={downloadApkImg}
                                    alt="Download Android APK"
                                    className="h-14 sm:h-16 w-auto object-contain"
                                />
                            </a>
                        </div>

                        {/* Divider */}
                        <div className="flex items-center gap-4 mt-6 mb-6">
                            <div className="flex-1 h-px bg-gray-100"></div>
                            <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">SECURE SYSTEM</span>
                            <div className="flex-1 h-px bg-gray-100"></div>
                        </div>

                        {/* Disclaimer */}
                        <p className="text-[11px] text-gray-400 text-center leading-relaxed font-medium">
                            By signing in, you agree to the Internal Warehouse Safety Protocols<br className="hidden lg:block" /> and Data Privacy Policy.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
