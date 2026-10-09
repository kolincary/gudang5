import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl' | '8xl' | 'full';
  className?: string;
  hideHeader?: boolean;
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
  className,
  hideHeader = false,
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
  if (typeof document === 'undefined') return null;

  // Full-screen modal (Pilih Lokasi Rak) — completely separate layout
  if (size === 'full') {
    return createPortal(
      <div className="fixed inset-0 z-[99999]">
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
      </div>,
      document.body
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
    '7xl': 'w-full max-w-7xl',
    '8xl': 'w-full max-w-[1536px]',
    full: 'max-w-none'
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Centering wrapper — always vertically + horizontally centered */}
      <div className="flex min-h-full items-center justify-center p-3 sm:p-4">
        {/* Modal card */}
        <div className={cn(
          'relative flex flex-col bg-white text-left shadow-2xl transform transition-all w-full rounded-3xl my-auto',
          !overflowVisible && 'overflow-hidden',
          fullHeight ? 'max-h-[92vh]' : 'max-h-[88vh]',
          sizeClasses[size] || 'max-w-lg',
          className
        )}>
          {/* Header */}
          {!hideHeader && Boolean(title || headerVariant === 'premium') && (
            headerVariant === 'premium' ? (
              <div className="flex items-center gap-3 p-4 sm:p-5 pb-4 bg-white border-b border-gray-100 flex-shrink-0">
                {icon && (
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md flex-shrink-0">
                    {icon}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-base sm:text-lg font-black text-gray-900 tracking-tight truncate">{title}</h3>
                  {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
                </div>
                <button 
                  onClick={onClose} 
                  className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors flex-shrink-0 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            ) : (
              /* Header — default/blue variant */
              <div className="flex items-center justify-between p-4 px-6 bg-blue-600 text-white flex-shrink-0">
                <h3 className="text-lg sm:text-xl font-black uppercase tracking-tight truncate">{title}</h3>
                <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-all cursor-pointer">
                  <X className="h-6 w-6" />
                </button>
              </div>
            )
          )}

          {/* Scrollable body */}
          <div className={cn(overflowVisible ? "overflow-visible flex-1 min-h-0" : "overflow-y-auto flex-1 min-h-0", padding)}>
            {children}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}