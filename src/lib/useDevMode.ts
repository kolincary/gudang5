import React from 'react';
import { useNavigate } from 'react-router-dom';

export const useDevMode = (_userName?: string | null, _userEmail?: string | null) => {
  // Default terhide secara default saat halaman dimuat
  const [isDevMode, setIsDevMode] = React.useState(false);
  const [keySequence, setKeySequence] = React.useState('');
  const navigate = useNavigate();

  React.useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      // Abaikan jika fokus di dalam input atau textarea
      const target = event.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

      // Abaikan jika menekan tombol modifier (Ctrl, Alt, Meta/Cmd)
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === 'Backspace') {
        setKeySequence((prev) => prev.slice(0, -1));
        return;
      }

      if (event.key.length > 1) return;
      
      setKeySequence((prev) => {
        const newSequence = (prev + event.key.toLowerCase()).slice(-25);
        
        if (newSequence.endsWith('devmode')) {
          const newDevMode = !isDevMode;
          setIsDevMode(newDevMode);
          localStorage.setItem('devmode', newDevMode.toString());
          window.dispatchEvent(new CustomEvent('devmode-toggle', { detail: { active: newDevMode } }));
          console.log(`Dev mode ${newDevMode ? 'enabled' : 'disabled'}`);
          return '';
        }

        if (newSequence.endsWith('opendatabaselogmenu@')) {
          navigate('/database-log', { state: { showHackerTerminal: true } });
          return '';
        }
        
        return newSequence;
      });
    };

    const handleDevModeEvent = (e: any) => {
      if (e?.detail?.active !== undefined) {
        setIsDevMode(e.detail.active);
      } else {
        setIsDevMode(localStorage.getItem('devmode') === 'true');
      }
    };
    window.addEventListener('storage', handleDevModeEvent);
    window.addEventListener('devmode-toggle', handleDevModeEvent);

    // Reset sequence after timeout
    const timeoutId = setTimeout(() => {
      setKeySequence('');
    }, 3000);

    window.addEventListener('keydown', handleKeyPress);

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
      window.removeEventListener('storage', handleDevModeEvent);
      window.removeEventListener('devmode-toggle', handleDevModeEvent);
      clearTimeout(timeoutId);
    };
  }, [keySequence, isDevMode, navigate]);

  return isDevMode;
};
