import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
