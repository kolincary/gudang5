import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, X, Search, ArrowLeft } from 'lucide-react';
import { createPortal } from 'react-dom';

export interface CustomDropdownProps {
    value: string;
    onChange: (event: { target: { value: string } }) => void;
    options: string[];
    placeholder?: string;
    className?: string;
    isInTable?: boolean;
    loading?: boolean;
    disabled?: boolean;
    showClearButton?: boolean;
    onOptionSelect?: () => void;
    forceUppercase?: boolean;
}

export function CustomDropdown({ value, onChange, options, placeholder, className, isInTable = false, loading = false, disabled = false, showClearButton = false, onOptionSelect, forceUppercase = false }: CustomDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    // ... rest of state remain the same until return
    const [highlightedIndex, setHighlightedIndex] = useState(0);

    // ... (existing refs)

    // ... (existing helper functions)

    const handleOptionSelect = (option: string, moveToNextRow = false) => {
        onChange({ target: { value: option } });
        setIsOpen(false);

        if (onOptionSelect) {
            onOptionSelect();
        }

        if (moveToNextRow) {
            setTimeout(() => {
                const currentInput = inputRef.current;
                if (currentInput) {
                    const currentRow = currentInput.closest('tr');
                    const nextRow = currentRow?.nextElementSibling as HTMLTableRowElement;
                    if (nextRow) {
                        const currentCell = currentInput.closest('td');
                        const currentCellIndex = Array.from(currentRow?.children || []).indexOf(currentCell as HTMLTableCellElement);
                        const nextRowCells = Array.from(nextRow.children);
                        const nextCell = nextRowCells[currentCellIndex] as HTMLTableCellElement;
                        const sameColumnInput = nextCell?.querySelector('input') as HTMLInputElement;
                        if (sameColumnInput) {
                            sameColumnInput.focus();
                            if (sameColumnInput.type === 'text') {
                                sameColumnInput.select();
                            }
                        }
                    }
                }
            }, 50);
        }
    };
    const dropdownRef = useRef<HTMLDivElement>(null);
    const portalRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const mobileSearchRef = useRef<HTMLInputElement>(null);
    const optionRefs = useRef<(HTMLDivElement | null)[]>([]);
    const [dropdownPosition, setDropdownPosition] = useState<'bottom' | 'top'>('bottom');
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

    const filteredOptions = React.useMemo(() => {
        if (!value) return options;
        const lowerValue = value.toLowerCase();
        return options.filter(option =>
            option.toLowerCase().includes(lowerValue)
        );
    }, [value, options]);

    useEffect(() => {
        setHighlightedIndex(0);
    }, [filteredOptions]);

    // Prevent auto-focus on mobile search input when overlay opens
    useEffect(() => {
        if (isOpen && !isInTable && mobileSearchRef.current) {
            // Blur the mobile search input to prevent keyboard from auto-showing
            setTimeout(() => {
                mobileSearchRef.current?.blur();
                // Also blur any focused element in the document
                if (document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                }
            }, 10);
        }
    }, [isOpen, isInTable]);

    useEffect(() => {
        if (isOpen && optionRefs.current[highlightedIndex] && filteredOptions.length > 0) {
            optionRefs.current[highlightedIndex]?.scrollIntoView({
                behavior: 'instant',
                block: 'nearest'
            });
        }
    }, [highlightedIndex, isOpen]);

    const calculatePosition = () => {
        if (dropdownRef.current && inputRef.current) {
            const rect = inputRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            const dropdownHeight = Math.min(200, filteredOptions.length * 36);

            if (isInTable) {
                const style: React.CSSProperties = {
                    position: 'fixed',
                    left: rect.left,
                    top: rect.bottom + 4,
                    width: rect.width,
                    zIndex: 9999,
                    maxHeight: '200px'
                };

                if (spaceBelow < dropdownHeight + 10 && spaceAbove > dropdownHeight + 10) {
                    style.top = 'unset';
                    style.bottom = window.innerHeight - rect.top + 4;
                    setDropdownPosition('top');
                } else {
                    setDropdownPosition('bottom');
                }

                setDropdownStyle(style);
            } else {
                setDropdownStyle({});
                if (spaceBelow < 150 && spaceAbove > 150) {
                    setDropdownPosition('top');
                } else {
                    setDropdownPosition('bottom');
                }
            }
        }
    };

    const handleFocus = () => {
        if (loading || disabled) return;
        setIsOpen(true);
        setHighlightedIndex(0);
        calculatePosition();
    };



    const handleClearClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();
        onChange({ target: { value: '' } });
        setIsOpen(false);
        if (inputRef.current) {
            inputRef.current.focus();
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = forceUppercase ? e.target.value.toUpperCase() : e.target.value;
        onChange({ target: { value: newValue } });
        if (!isOpen && !loading) {
            setIsOpen(true);
            setHighlightedIndex(0);
            calculatePosition();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (loading || disabled) return;

        if (!isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                setIsOpen(true);
                setHighlightedIndex(0);
                calculatePosition();
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex(prev => {
                    const nextIndex = prev < filteredOptions.length - 1 ? prev + 1 : 0;
                    return nextIndex;
                });
                break;

            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex(prev => {
                    const nextIndex = prev > 0 ? prev - 1 : filteredOptions.length - 1;
                    return nextIndex;
                });
                break;

            case 'Enter':
                e.preventDefault();
                if (filteredOptions[highlightedIndex]) {
                    handleOptionSelect(filteredOptions[highlightedIndex], true);
                }
                else if (value.trim() !== '') {
                    setIsOpen(false);
                    // Standard enter behavior closure
                }
                break;

            case 'Tab':
                if (filteredOptions[highlightedIndex]) {
                    handleOptionSelect(filteredOptions[highlightedIndex], false);
                }
                break;

            case 'Escape':
                e.preventDefault();
                setIsOpen(false);
                break;
        }
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (dropdownRef.current && !dropdownRef.current.contains(target)) {
                if (portalRef.current && portalRef.current.contains(target)) {
                    return; // Ignore clicks inside the full-screen portal
                }
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    useEffect(() => {
        const handleResizeOrScroll = () => {
            if (isOpen) {
                calculatePosition();
            }
        };

        window.addEventListener('resize', handleResizeOrScroll);
        window.addEventListener('scroll', handleResizeOrScroll, true);
        return () => {
            window.removeEventListener('resize', handleResizeOrScroll);
            window.removeEventListener('scroll', handleResizeOrScroll, true);
        };
    }, [isOpen]);

    useEffect(() => {
        optionRefs.current = optionRefs.current.slice(0, filteredOptions.length);
    }, [filteredOptions.length]);

    const showButton = showClearButton && value.trim() !== '' && !disabled;

    const handleInputClick = () => {
        if (!isOpen && !loading && !disabled) {
            setIsOpen(true);
            setHighlightedIndex(0);
            calculatePosition();
        }
    };

    return (
        <div ref={dropdownRef} className={`relative w-full ${disabled ? 'opacity-[0.85]' : ''}`}>
            <div className="relative">
                <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    onChange={handleInputChange}
                    onFocus={handleFocus}
                    onClick={handleInputClick}
                    onKeyDown={handleKeyDown}
                    className={`w-full px-2 py-3 pr-${showButton ? '14' : '8'} border rounded text-sm focus:outline-none focus:ring-2 ${className} ${loading ? 'opacity-50 cursor-wait' : ''} ${disabled ? 'bg-gray-100/50 cursor-not-allowed pointer-events-none text-gray-500' : 'bg-white'}`}
                    placeholder={loading ? 'Memuat data...' : placeholder}
                    autoComplete="off"
                    disabled={loading || disabled}
                />
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center space-x-1 pointer-events-none">
                    {showButton && (
                        <button
                            onClick={handleClearClick}
                            className="text-gray-500 hover:text-gray-700 pointer-events-auto p-1"
                            aria-label="Hapus input"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                    {loading ? (
                        <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full ml-1"></div>
                    ) : !disabled && (
                        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''} pointer-events-auto`} />
                    )}
                </div>
            </div>

            {isOpen && !loading && (
                <>
                    {/* Desktop Dropdown */}
                    <div
                        className={`hidden md:block bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent 
                            ${isInTable
                                ? ''
                                : `absolute left-0 right-0 z-[100] max-h-72 ${dropdownPosition === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'}`
                            }`}
                        style={isInTable ? { ...dropdownStyle, maxHeight: '240px', overflowY: 'auto' } : { zIndex: 9999 }}
                    >
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((option, index) => (
                                <div
                                    ref={el => optionRefs.current[index] = el}
                                    key={index}
                                    onClick={() => handleOptionSelect(option, false)}
                                    className={`px-4 py-3 text-sm cursor-pointer border-b border-slate-100 last:border-b-0 transition-colors font-medium ${index === highlightedIndex
                                        ? 'bg-blue-600 text-white font-bold'
                                        : 'hover:bg-blue-50 hover:text-blue-700 text-slate-800'
                                        }`}
                                >
                                    {option}
                                </div>
                            ))
                        ) : (
                            <div className="px-4 py-3 text-sm text-slate-400 italic text-center">
                                Tidak ada data yang cocok
                            </div>
                        )}
                    </div>

                    {/* Mobile Fullscreen Overlay - Portalled to Body */}
                    {!isInTable && createPortal(
                        <div ref={portalRef} className="fixed inset-0 z-[10000] bg-white lg:hidden flex flex-col animate-in fade-in zoom-in-95 duration-200 font-sans">
                            {/* Mobile Header */}
                            <div className="flex items-center gap-2 p-4 border-b border-gray-200 shadow-md bg-white z-10 pt-safe-top">
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="p-2 -ml-2 text-gray-600 hover:text-gray-900 active:bg-gray-100 rounded-full flex flex-col items-center"
                                >
                                    <ArrowLeft className="h-6 w-6" />
                                </button>
                                <div className="flex-1 relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                                    <input
                                        ref={mobileSearchRef}
                                        type="text"
                                        autoFocus={false}
                                        value={value}
                                        onChange={handleInputChange}
                                        className="w-full pl-9 pr-8 py-3 bg-white border border-gray-300 rounded-full text-base focus:ring-2 focus:ring-blue-500 shadow-sm"
                                        placeholder="Ketuk untuk mencari..."
                                    />
                                    {value && (
                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                onChange({ target: { value: '' } });
                                            }}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Mobile List */}
                            <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-gray-50">
                                {filteredOptions.length > 0 ? (
                                    filteredOptions.map((option, index) => (
                                        <div
                                            key={index}
                                            onClick={() => handleOptionSelect(option, false)}
                                            className="px-4 py-3 bg-white rounded-lg border border-gray-200 shadow-sm active:bg-blue-50 active:border-blue-300 flex items-center justify-between"
                                        >
                                            <span className="font-medium text-gray-900">{option}</span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-10 text-gray-500">
                                        <Search className="h-10 w-10 text-gray-300 mb-2" />
                                        <p>Tidak ada data ditemukan</p>
                                    </div>
                                )}
                            </div>
                        </div>,
                        document.body
                    )}
                </>
            )}
        </div>
    );
}
