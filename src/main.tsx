import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

import { doc, getDoc } from 'firebase/firestore';
import { db } from './lib/firebase';

// Pre-sync active Supabase URL & Key from Firestore on boot
const syncSupabaseFromFirestore = async () => {
  try {
    const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 1500));
    const fetchPromise = (async () => {
      const docRef = doc(db, 'stock-lt3', 'supabase_active_config');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data?.url && data?.anonKey) {
          localStorage.setItem('custom_supabase_url', data.url.trim());
          localStorage.setItem('custom_supabase_anon_key', data.anonKey.trim());
          console.log('✅ Active Supabase loaded from Firestore:', data.url.trim());
        }
      }
    })();
    await Promise.race([fetchPromise, timeoutPromise]);
  } catch (err) {
    console.warn('Boot Firestore Supabase sync skipped:', err);
  }
};

// Handle dynamic import/chunk loading errors gracefully (e.g. after a new deployment)
if (typeof window !== 'undefined') {
  // Listen for Vite's preload errors
  window.addEventListener('vite:preloadError', (event) => {
    console.warn('Vite preload error (ChunkLoadError) detected. Reloading page...', event);
    window.location.reload();
  });

  // Listen for general unhandled dynamic import errors
  window.addEventListener('error', (event) => {
    const errorMsg = event.message || '';
    if (
      errorMsg.includes('Dynamically imported module') ||
      errorMsg.includes('Failed to fetch dynamically imported module') ||
      errorMsg.includes('error loading dynamically imported module')
    ) {
      console.warn('Dynamic import error detected. Reloading page...');
      event.preventDefault();
      window.location.reload();
    }
  }, true);
}

// Start application after ensuring active Supabase config is loaded from Firestore
const initApp = async () => {
  await syncSupabaseFromFirestore();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
};

initApp();
