import React from 'react';
import { useNavigate } from 'react-router-dom';

export const useDevMode = (userName?: string | null, userEmail?: string | null) => {
  const [isDevMode, setIsDevMode] = React.useState(() => {
    return localStorage.getItem('devmode') === 'true';
  });
  const [keySequence, setKeySequence] = React.useState('');
  const navigate = useNavigate();

  React.useEffect(() => {
    // Auto-enable for Dev Mode Admin
    if (userName?.toLowerCase().includes('dev mode') || userEmail?.toLowerCase().includes('devmode')) {
      if (localStorage.getItem('devmode') !== 'true') {
        localStorage.setItem('devmode', 'true');
        setIsDevMode(true);
      }
    }
  }, [userName, userEmail]);

  React.useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key.length > 1) return;
      
      setKeySequence((prev) => {
        const newSequence = (prev + event.key.toLowerCase()).slice(-25);
        
        if (newSequence.endsWith('devmode')) {
          const newDevMode = !isDevMode;
          setIsDevMode(newDevMode);
          localStorage.setItem('devmode', newDevMode.toString());
          window.dispatchEvent(new Event('devmode-toggle'));
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

    const handleDevModeEvent = () => {
      setIsDevMode(localStorage.getItem('devmode') === 'true');
    };
    window.addEventListener('storage', handleDevModeEvent);
    window.addEventListener('devmode-toggle', handleDevModeEvent);

    // Reset sequence after timeout
    const timeoutId = setTimeout(() => {
      setKeySequence('');
    }, 2000);

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
