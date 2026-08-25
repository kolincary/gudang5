import React from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl' | 'full';
  padding?: string;
  headerVariant?: 'default' | 'premium';
  icon?: React.ReactNode;
  fullHeight?: boolean;
  overflowVisible?: boolean;
}

export function Modal({ 
  isOpen, 
  onClose, 
  title, 
  subtitle,
  children, 
  size = 'lg', 
  padding = 'p-6',
  headerVariant = 'default',
  icon,
  fullHeight = false,
  overflowVisible = false
}: ModalProps) {
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Full-screen modal (Pilih Lokasi Rak) — completely separate layout
  if (size === 'full') {
    return (
      <div className="fixed inset-0 z-[9999]">
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative flex flex-col w-full h-full bg-white z-10">
          {/* Full-screen header */}
          <div className="sticky top-0 z-20 flex items-center justify-between p-4 px-6 bg-blue-600 text-white flex-shrink-0">
            <h3 className="text-xl font-black uppercase tracking-tight">{title}</h3>
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-all">
              <X className="h-6 w-6" />
            </button>
          </div>
          {/* Full-screen scrollable content */}
          <div className="flex-1 overflow-y-auto">
            {children}
          </div>
        </div>
      </div>
    );
  }

  const sizeClasses: Record<string, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-4xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
    '6xl': 'max-w-6xl',
    '7xl': 'max-w-7xl',
    full: 'max-w-none'
  };

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Centering wrapper — always vertically + horizontally centered */}
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Modal card */}
        <div className={cn(
          'relative flex flex-col bg-white text-left shadow-2xl transform transition-all w-full rounded-3xl',
          !overflowVisible && 'overflow-hidden',
          fullHeight ? 'max-h-[90vh]' : 'max-h-[85vh]',
          sizeClasses[size]
        )}>
          {/* Header — premium variant */}
          {headerVariant === 'premium' ? (
            <div className="flex items-center gap-3 p-5 pb-4 bg-white border-b border-gray-100 flex-shrink-0">
              {icon && (
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
                  {icon}
                </div>
              )}
              <div className="flex-1">
                <h3 className="text-lg font-black text-gray-900 tracking-tight">{title}</h3>
                {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
              </div>
              <button 
                onClick={onClose} 
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
              >
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
          ) : (
            /* Header — default/blue variant */
            <div className="flex items-center justify-between p-4 px-6 bg-blue-600 text-white flex-shrink-0">
              <h3 className="text-xl font-black uppercase tracking-tight">{title}</h3>
              <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-all">
                <X className="h-6 w-6" />
              </button>
            </div>
          )}

          {/* Scrollable body */}
          <div className={cn(overflowVisible ? "overflow-visible flex-1" : "overflow-y-auto flex-1", padding)}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}