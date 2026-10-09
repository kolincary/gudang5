import React, { useState, useEffect, useMemo, useDeferredValue, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { supabase } from '../lib/supabase';
import { Toast } from './ui/Toast';
import { useAuth } from '../lib/AuthContext';
import { useDevMode } from '../lib/useDevMode';
import { cn } from '../lib/utils';
import {
  Search,
  X,
  RefreshCw,
  Filter,
  CheckSquare,
  Square,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CheckCircle2,
  XCircle,
  Layers,
  Sparkles,
  SlidersHorizontal,
  Check,
  ShieldAlert,
  Box,
  Warehouse,
  LayoutGrid,
  MapPin,
  ChevronDown
} from 'lucide-react';

interface ProductRackItem {
  id: string;
  nama_produk: string;
  rak: string;
  is_excluded: boolean;
}

interface StockItem {
  nama_produk: string;
  rak: string;
}

const BATCH_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const;

export const SPECIAL_EXACT_RACKS = [
  'BLOK-I',
  'ECER-M',
  'ECER-N',
  'ECER-O',
  'LANTAI 2',
  'LANTAI 4',
];

// Racks strictly monitored in Modal SKU Multi-Rak:
// Only UTAMA, ECER-O, ECER-M, ECER-N, LANTAI 4, LANTAI 2 (Excluding sub-rak A1-L999, Lorong, and BLOK-I)
export const MULTI_RACK_TARGET_RACKS = [
  'UTAMA',
  'ECER-O',
  'ECER-M',
  'ECER-N',
  'LANTAI 4',
  'LANTAI 2',
] as const;

export const getCanonicalMultiRackName = (rak: string): string => {
  if (!rak) return '';
  const clean = rak.trim().toUpperCase();
  if (clean === 'UTAMA') return 'UTAMA';
  if (clean === 'ECER-O') return 'ECER-O';
  if (clean === 'ECER-M') return 'ECER-M';
  if (clean === 'ECER-N') return 'ECER-N';
  if (clean === 'LANTAI 4' || clean.replace(/[-_]/g, ' ') === 'LANTAI 4' || clean === 'LT4' || clean === 'LANTAI4') return 'LANTAI 4';
  if (clean === 'LANTAI 2' || clean.replace(/[-_]/g, ' ') === 'LANTAI 2' || clean === 'LT2' || clean === 'LANTAI2') return 'LANTAI 2';
  return clean;
};

export const isAllowedMultiRack = (rak: string): boolean => {
  const canonical = getCanonicalMultiRackName(rak);
  return (MULTI_RACK_TARGET_RACKS as readonly string[]).includes(canonical);
};

export const getRackFilterKey = (rak: string): string => {
  if (!rak) return 'LAINNYA';
  const clean = rak.trim().toUpperCase();

  // 1. Yang diminta tetap sama persis:
  if (clean === 'ECER-O') return 'ECER-O';
  if (clean === 'ECER-M') return 'ECER-M';
  if (clean === 'ECER-N') return 'ECER-N';
  if (clean.replace(/[-_]/g, ' ') === 'LANTAI 4' || clean === 'LT4' || clean === 'LANTAI4') return 'LANTAI 4';
  if (clean.replace(/[-_]/g, ' ') === 'LANTAI 2' || clean === 'LT2' || clean === 'LANTAI2') return 'LANTAI 2';
  if (clean === 'BLOK-I' || clean === 'BLOK I') return 'BLOK-I';

  // 2. Sub-rak A1 - A999 sampai L1 - L999:
  const batchMatch = clean.match(/^([A-L])\s*[-_.]?\s*\d+$/i);
  if (batchMatch) {
    return `BATCH-${batchMatch[1].toUpperCase()}`;
  }

  // Jika ada huruf lain misal M1-M999 dll:
  const otherLetterMatch = clean.match(/^([A-Z])\s*[-_.]?\s*\d+$/i);
  if (otherLetterMatch) {
    return `BATCH-${otherLetterMatch[1].toUpperCase()}`;
  }

  return clean;
};

export const checkMatchRack = (itemRak: string, filterValue: string): boolean => {
  if (!filterValue || filterValue === 'ALL') return true;
  if (!itemRak) return false;

  const cleanItem = itemRak.trim().toUpperCase();
  const cleanFilter = filterValue.trim().toUpperCase();

  // If filter is a batch like BATCH-A, BATCH-B, ..., BATCH-L
  if (cleanFilter.startsWith('BATCH-')) {
    const letter = cleanFilter.replace('BATCH-', '');
    const match = cleanItem.match(/^([A-Z])\s*[-_.]?\s*\d+$/i);
    return match ? match[1].toUpperCase() === letter : false;
  }

  // Exact special racks
  if (cleanFilter === 'LANTAI 4') {
    return cleanItem.replace(/[-_]/g, ' ') === 'LANTAI 4' || cleanItem === 'LT4' || cleanItem === 'LANTAI4';
  }
  if (cleanFilter === 'LANTAI 2') {
    return cleanItem.replace(/[-_]/g, ' ') === 'LANTAI 2' || cleanItem === 'LT2' || cleanItem === 'LANTAI2';
  }
  if (cleanFilter === 'BLOK-I') {
    return cleanItem === 'BLOK-I' || cleanItem === 'BLOK I';
  }
  if (cleanFilter === 'ECER-O') return cleanItem === 'ECER-O';
  if (cleanFilter === 'ECER-M') return cleanItem === 'ECER-M';
  if (cleanFilter === 'ECER-N') return cleanItem === 'ECER-N';

  // Other exact match (e.g. sub-rak specific or other special rack)
  return cleanItem === cleanFilter;
};

export function RackPrioritySettings() {
  const { userRole, userName, userEmail } = useAuth();
  const isDevMode = useDevMode(userName, userEmail);

  // Akses HANYA saat devmode aktif (default terhide)
  const isAuthorized = Boolean(isDevMode || userEmail === 'devmode');

  const [productRacks, setProductRacks] = useState<ProductRackItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [rackFilter, setRackFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [uniqueRacks, setUniqueRacks] = useState<string[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Multi-Rak Preview Modal States
  const [isMultiRakModalOpen, setIsMultiRakModalOpen] = useState(false);
  const [multiRakSearch, setMultiRakSearch] = useState('');
  const [multiRakStatusFilter, setMultiRakStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [multiRakRackFilter, setMultiRakRackFilter] = useState<string>('ALL');
  const [multiRakOtherRackFilter, setMultiRakOtherRackFilter] = useState<string>('ALL');
  const [multiRakSelected, setMultiRakSelected] = useState<Set<string>>(new Set());
  const [multiRakCurrentPage, setMultiRakCurrentPage] = useState(1);
  const [multiRakPageSize, setMultiRakPageSize] = useState<number>(50);

  // Dropdown filter state & smart positioning
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [dropdownSearch, setDropdownSearch] = useState('');
  const [openDirection, setOpenDirection] = useState<'down' | 'up'>('down');
  const [dropdownMaxHeight, setDropdownMaxHeight] = useState<number>(360);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(100);

  // Deferred search term for lag-free typing
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const calculateDropdownPosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 16;
    const spaceAbove = rect.top - 16;
    const targetHeight = 360;

    if (spaceBelow < 260 && spaceAbove > spaceBelow) {
      setOpenDirection('up');
      setDropdownMaxHeight(Math.max(180, Math.min(targetHeight, spaceAbove)));
    } else {
      setOpenDirection('down');
      setDropdownMaxHeight(Math.max(180, Math.min(targetHeight, spaceBelow)));
    }
  };

  const handleToggleDropdown = () => {
    if (!isDropdownOpen) {
      calculateDropdownPosition();
      setIsDropdownOpen(true);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setIsDropdownOpen(false);
    }
  };

  const handleSelectRack = (val: string) => {
    setRackFilter(val);
    setIsDropdownOpen(false);
    setDropdownSearch('');
    setCurrentPage(1);
  };

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen]);

  // Recalculate dropdown direction on resize or scroll
  useEffect(() => {
    if (!isDropdownOpen) return;
    calculateDropdownPosition();
    const handleScrollOrResize = () => calculateDropdownPosition();
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isDropdownOpen]);

  const fetchAllStockData = async () => {
    let allData: StockItem[] = [];
    let from = 0;
    const pageSizeChunk = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('stock_items')
        .select('nama_produk, rak')
        .eq('status', 'Aktif')
        .not('rak', 'is', null)
        .not('rak', 'eq', '')
        .order('nama_produk', { ascending: true })
        .order('rak', { ascending: true })
        .range(from, from + pageSizeChunk - 1);

      if (error) throw error;

      if (data && data.length > 0) {
        allData = [...allData, ...data];
        from += pageSizeChunk;
        hasMore = data.length === pageSizeChunk;
      } else {
        hasMore = false;
      }
    }

    return allData;
  };

  const fetchAllExclusionData = async () => {
    let allData: any[] = [];
    let from = 0;
    const pageSizeChunk = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('product_rack_exclusions')
        .select('*')
        .range(from, from + pageSizeChunk - 1);

      if (error) throw error;

      if (data && data.length > 0) {
        allData = [...allData, ...data];
        from += pageSizeChunk;
        hasMore = data.length === pageSizeChunk;
      } else {
        hasMore = false;
      }
    }

    return allData;
  };

  const fetchAllRackLocations = async () => {
    let allData: string[] = [];
    let from = 0;
    const pageSizeChunk = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('rack_locations')
        .select('nama')
        .order('nama', { ascending: true })
        .range(from, from + pageSizeChunk - 1);

      if (error) throw error;

      if (data && data.length > 0) {
        allData = [...allData, ...data.map((item: any) => item.nama)];
        from += pageSizeChunk;
        hasMore = data.length === pageSizeChunk;
      } else {
        hasMore = false;
      }
    }

    return allData;
  };

  const loadData = async () => {
    if (!isAuthorized) return;
    try {
      setLoading(true);

      const [stockData, exclusionData, rackLocationsData] = await Promise.all([
        fetchAllStockData(),
        fetchAllExclusionData(),
        fetchAllRackLocations()
      ]);

      const uniqueProductRacks = new Map<string, StockItem>();
      stockData.forEach((item: StockItem) => {
        const key = `${item.nama_produk}|${item.rak}`;
        if (!uniqueProductRacks.has(key)) {
          uniqueProductRacks.set(key, item);
        }
      });

      setUniqueRacks(rackLocationsData);

      const exclusionMap = new Map<string, boolean>();
      exclusionData.forEach((item: any) => {
        const key = `${item.nama_produk}|${item.rak}`;
        exclusionMap.set(key, item.is_excluded);
      });

      const productRackItems: ProductRackItem[] = [];
      uniqueProductRacks.forEach((item, key) => {
        productRackItems.push({
          id: key,
          nama_produk: item.nama_produk,
          rak: item.rak,
          is_excluded: exclusionMap.get(key) || false
        });
      });

      setProductRacks(productRackItems);
    } catch (error) {
      console.error('Error loading data:', error);
      showToast('Gagal memuat data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [isAuthorized]);

  // Compute Batch Counts & Categories
  const { batchCounts, distinctSubRacks, extraSpecialRacks } = useMemo(() => {
    const counts: Record<string, number> = {};
    const subRacksSet = new Set<string>();
    const extraSet = new Set<string>();

    productRacks.forEach(item => {
      const rak = item.rak ? item.rak.trim() : '';
      if (!rak) return;
      const key = getRackFilterKey(rak);
      counts[key] = (counts[key] || 0) + 1;
      subRacksSet.add(rak);

      // Check if extra special rack (not batch A-L and not in SPECIAL_EXACT_RACKS)
      const clean = rak.toUpperCase();
      if (!SPECIAL_EXACT_RACKS.includes(clean) && !clean.match(/^[A-L]\s*[-_.]?\s*\d+$/i)) {
        extraSet.add(clean);
      }
    });

    return {
      batchCounts: counts,
      distinctSubRacks: Array.from(subRacksSet).sort(),
      extraSpecialRacks: Array.from(extraSet).sort()
    };
  }, [productRacks]);

  // Compute Options for custom dropdown based on typing
  const dropdownOptions = useMemo(() => {
    const q = dropdownSearch.trim().toLowerCase();

    // 1. Batch Options (A - L)
    const batches = BATCH_LETTERS.map(letter => {
      const key = `BATCH-${letter}`;
      const label = `Batch Rak ${letter}`;
      const desc = `${letter}1 - ${letter}999`;
      const count = batchCounts[key] || 0;
      return { key, label, desc, count, isBatch: true };
    }).filter(b => {
      if (!q) return true;
      return b.label.toLowerCase().includes(q) || b.desc.toLowerCase().includes(q) || b.key.toLowerCase().includes(q);
    });

    // 2. Special Zone Options (ECER-O, ECER-M, ECER-N, LANTAI 4, LANTAI 2, BLOK-I + others)
    const specialsList = [...SPECIAL_EXACT_RACKS, ...extraSpecialRacks.filter(r => !SPECIAL_EXACT_RACKS.includes(r))];
    const specials = specialsList.map(key => {
      const count = batchCounts[key] || 0;
      return { key, label: key, desc: 'Zona Khusus', count, isBatch: false };
    }).filter(s => {
      if (!q) return true;
      return s.label.toLowerCase().includes(q);
    });

    // 3. Sub-rak matching if search is typed (e.g. user typed "L25" or "A12")
    const subRacks = q ? distinctSubRacks.filter(r => {
      const lower = r.toLowerCase();
      if (specialsList.some(s => s.toLowerCase() === lower)) return false;
      return lower.includes(q);
    }).slice(0, 30).map(r => ({
      key: r,
      label: r,
      desc: 'Sub-Rak Spesifik',
      count: batchCounts[r] || 0,
      isSubRack: true
    })) : [];

    return { batches, specials, subRacks };
  }, [dropdownSearch, batchCounts, distinctSubRacks, extraSpecialRacks]);

  // Overall stats
  const stats = useMemo(() => {
    let active = 0;
    let inactive = 0;
    productRacks.forEach(item => {
      if (item.is_excluded) inactive++;
      else active++;
    });
    return { total: productRacks.length, active, inactive };
  }, [productRacks]);

  // Compute multi-rack SKUs strictly for target priority zones:
  // UTAMA, ECER-O, ECER-M, ECER-N, LANTAI 4, LANTAI 2
  // (Excludes sub-rak A1-L999, Lorong 1 s/d Lorong Utama, dan BLOK-I)
  const { multiRackItems, multiSkuCount } = useMemo(() => {
    const map = new Map<string, ProductRackItem[]>();
    productRacks.forEach(item => {
      if (!item.rak || !isAllowedMultiRack(item.rak)) {
        return;
      }
      const key = item.nama_produk.trim().toUpperCase();
      if (!key) return;
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    });

    const multiList: (ProductRackItem & { totalRacksForSku: number; allRacksList: string[] })[] = [];
    let skuCount = 0;

    const sortedKeys = Array.from(map.keys()).sort();
    sortedKeys.forEach(key => {
      const group = map.get(key)!;
      const distinctRacks = Array.from(new Set(group.map(g => getCanonicalMultiRackName(g.rak))));
      if (distinctRacks.length > 1) {
        skuCount++;
        // Sort group by rack name for sequential clarity
        group.sort((a, b) => a.rak.localeCompare(b.rak));
        group.forEach(g => {
          multiList.push({
            ...g,
            totalRacksForSku: distinctRacks.length,
            allRacksList: distinctRacks
          });
        });
      }
    });

    return { multiRackItems: multiList, multiSkuCount: skuCount };
  }, [productRacks]);

  // Available target racks with counts in multi-rak dataset
  const multiRakAvailableRacks = useMemo(() => {
    const counts: Record<string, number> = {};
    multiRackItems.forEach(item => {
      const canonical = getCanonicalMultiRackName(item.rak);
      counts[canonical] = (counts[canonical] || 0) + 1;
    });
    return MULTI_RACK_TARGET_RACKS.map(r => ({
      rack: r,
      count: counts[r] || 0
    })).filter(r => r.count > 0);
  }, [multiRackItems]);

  // Filtered & Paginated Multi-Rak modal data
  const filteredMultiRakData = useMemo(() => {
    const q = multiRakSearch.trim().toLowerCase();
    return multiRackItems.filter(item => {
      const matchSearch = !q ||
        item.nama_produk.toLowerCase().includes(q) ||
        item.rak.toLowerCase().includes(q);

      const matchStatus =
        multiRakStatusFilter === 'ALL' ||
        (multiRakStatusFilter === 'ACTIVE' && !item.is_excluded) ||
        (multiRakStatusFilter === 'INACTIVE' && item.is_excluded);

      const itemCanonicalRak = getCanonicalMultiRackName(item.rak);
      const matchRack =
        multiRakRackFilter === 'ALL' ||
        itemCanonicalRak === multiRakRackFilter;

      const matchOtherRack =
        multiRakOtherRackFilter === 'ALL' ||
        (item.allRacksList && item.allRacksList.some(r => getCanonicalMultiRackName(r) === multiRakOtherRackFilter && getCanonicalMultiRackName(r) !== itemCanonicalRak));

      return matchSearch && matchStatus && matchRack && matchOtherRack;
    });
  }, [multiRackItems, multiRakSearch, multiRakStatusFilter, multiRakRackFilter, multiRakOtherRackFilter]);

  // Reset modal pagination when filters change
  useEffect(() => {
    setMultiRakCurrentPage(1);
  }, [multiRakSearch, multiRakStatusFilter, multiRakRackFilter, multiRakOtherRackFilter, multiRakPageSize]);

  const multiRakTotalPages = Math.max(1, Math.ceil(filteredMultiRakData.length / multiRakPageSize));
  const validMultiRakCurrentPage = Math.min(Math.max(1, multiRakCurrentPage), multiRakTotalPages);

  const paginatedMultiRakData = useMemo(() => {
    const start = (validMultiRakCurrentPage - 1) * multiRakPageSize;
    return filteredMultiRakData.slice(start, start + multiRakPageSize);
  }, [filteredMultiRakData, validMultiRakCurrentPage, multiRakPageSize]);

  const isAllMultiPageSelected = useMemo(() => {
    if (paginatedMultiRakData.length === 0) return false;
    return paginatedMultiRakData.every(item => multiRakSelected.has(item.id));
  }, [paginatedMultiRakData, multiRakSelected]);

  const handleToggleSelectMultiPage = () => {
    const next = new Set(multiRakSelected);
    if (isAllMultiPageSelected) {
      paginatedMultiRakData.forEach(item => next.delete(item.id));
    } else {
      paginatedMultiRakData.forEach(item => next.add(item.id));
    }
    setMultiRakSelected(next);
  };

  const handleSelectAllFilteredMulti = () => {
    const next = new Set(multiRakSelected);
    filteredMultiRakData.forEach(item => next.add(item.id));
    setMultiRakSelected(next);
  };

  const handleClearMultiSelection = () => {
    setMultiRakSelected(new Set());
  };

  const handleSelectMultiItem = (id: string) => {
    const next = new Set(multiRakSelected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setMultiRakSelected(next);
  };

  const handleToggleExclusionForMulti = async (enable: boolean) => {
    if (multiRakSelected.size === 0) {
      showToast('Pilih item terlebih dahulu', 'info');
      return;
    }

    const selectedIdsList = Array.from(multiRakSelected);
    const updates: { nama_produk: string; rak: string; is_excluded: boolean }[] = [];

    selectedIdsList.forEach(id => {
      const item = productRacks.find(p => p.id === id);
      if (item) {
        updates.push({
          nama_produk: item.nama_produk,
          rak: item.rak,
          is_excluded: enable
        });
      }
    });

    if (updates.length === 0) return;

    try {
      setSaving(true);
      // Optimistic update
      setProductRacks(prev =>
        prev.map(p => (multiRakSelected.has(p.id) ? { ...p, is_excluded: enable } : p))
      );

      const CHUNK_SIZE = 100;
      for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
        const chunk = updates.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase
          .from('product_rack_exclusions')
          .upsert(chunk, { onConflict: 'nama_produk,rak' });
        if (error) throw error;
      }

      showToast(
        `Berhasil ${enable ? 'menonaktifkan' : 'mengaktifkan'} ${updates.length} item multi-rak`,
        'success'
      );
      setMultiRakSelected(new Set());
    } catch (error) {
      console.error('Error updating exclusions in modal:', error);
      showToast('Gagal menyimpan perubahan', 'error');
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  // Single-row Dedup: Prioritize this rack as the ONLY active one for this SKU
  const handleSingleDedupPrioritize = async (item: ProductRackItem) => {
    const normSku = item.nama_produk.trim().toUpperCase();
    const targetRack = item.rak.trim().toUpperCase();

    // Optimistic update
    setProductRacks(prev =>
      prev.map(p => {
        if (p.nama_produk.trim().toUpperCase() === normSku) {
          return {
            ...p,
            is_excluded: p.rak.trim().toUpperCase() !== targetRack
          };
        }
        return p;
      })
    );

    try {
      setSaving(true);
      const updates: { nama_produk: string; rak: string; is_excluded: boolean }[] = [];
      productRacks.forEach(p => {
        if (p.nama_produk.trim().toUpperCase() === normSku) {
          updates.push({
            nama_produk: p.nama_produk,
            rak: p.rak,
            is_excluded: p.rak.trim().toUpperCase() !== targetRack
          });
        }
      });

      const { error } = await supabase
        .from('product_rack_exclusions')
        .upsert(updates, { onConflict: 'nama_produk,rak' });

      if (error) throw error;

      showToast(
        `SKU "${item.nama_produk}" kini hanya aktif di rak "${item.rak}". Lokasi rak lainnya otomatis dinonaktifkan.`,
        'success'
      );
    } catch (error) {
      console.error('Error prioritizing single item:', error);
      showToast('Gagal memprioritaskan rak', 'error');
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  // Bulk Dedup Prioritize: For each selected item, make its rack the only active one and deactivate others for that SKU
  const handleBulkDedupPrioritize = async () => {
    if (multiRakSelected.size === 0) {
      showToast('Pilih item terlebih dahulu', 'info');
      return;
    }

    const selectedItemsList = productRacks.filter(p => multiRakSelected.has(p.id));

    // Map: SKU -> chosen rack to keep active
    const skuToChosenRack = new Map<string, string>();
    selectedItemsList.forEach(item => {
      const normSku = item.nama_produk.trim().toUpperCase();
      if (!skuToChosenRack.has(normSku)) {
        skuToChosenRack.set(normSku, item.rak);
      }
    });

    const updates: { nama_produk: string; rak: string; is_excluded: boolean }[] = [];
    productRacks.forEach(p => {
      const normSku = p.nama_produk.trim().toUpperCase();
      if (skuToChosenRack.has(normSku)) {
        const chosenRack = skuToChosenRack.get(normSku);
        const shouldBeExcluded = p.rak.trim().toUpperCase() !== chosenRack?.trim().toUpperCase();
        updates.push({
          nama_produk: p.nama_produk,
          rak: p.rak,
          is_excluded: shouldBeExcluded
        });
      }
    });

    if (updates.length === 0) return;

    try {
      setSaving(true);
      // Optimistic update
      setProductRacks(prev =>
        prev.map(p => {
          const normSku = p.nama_produk.trim().toUpperCase();
          if (skuToChosenRack.has(normSku)) {
            const chosenRack = skuToChosenRack.get(normSku);
            return {
              ...p,
              is_excluded: p.rak.trim().toUpperCase() !== chosenRack?.trim().toUpperCase()
            };
          }
          return p;
        })
      );

      const CHUNK_SIZE = 100;
      for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
        const chunk = updates.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase
          .from('product_rack_exclusions')
          .upsert(chunk, { onConflict: 'nama_produk,rak' });
        if (error) throw error;
      }

      showToast(
        `Berhasil! ${skuToChosenRack.size} SKU kini hanya aktif di 1 lokasi rak (lokasi rak lainnya otomatis dinonaktifkan).`,
        'success'
      );
      setMultiRakSelected(new Set());
    } catch (error) {
      console.error('Error in bulk dedup prioritize:', error);
      showToast('Gagal memproses prioritas massal', 'error');
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  // Selected Rack Label display on trigger button
  const selectedLabel = useMemo(() => {
    if (!rackFilter || rackFilter === 'ALL') {
      return `Semua Rak (${stats.total.toLocaleString()})`;
    }
    if (rackFilter.startsWith('BATCH-')) {
      const letter = rackFilter.replace('BATCH-', '');
      const count = batchCounts[rackFilter] || 0;
      return `Batch Rak ${letter} (${count.toLocaleString()})`;
    }
    const count = batchCounts[rackFilter] || 0;
    return `${rackFilter} (${count.toLocaleString()})`;
  }, [rackFilter, stats.total, batchCounts]);

  // Filtered dataset
  const filteredData = useMemo(() => {
    const term = deferredSearchTerm.trim().toLowerCase();
    return productRacks.filter(item => {
      const matchSearch = !term ||
        item.nama_produk.toLowerCase().includes(term) ||
        item.rak.toLowerCase().includes(term);

      const matchRack = checkMatchRack(item.rak, rackFilter);

      const matchStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && !item.is_excluded) ||
        (statusFilter === 'INACTIVE' && item.is_excluded);

      return matchSearch && matchRack && matchStatus;
    });
  }, [productRacks, deferredSearchTerm, rackFilter, statusFilter]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearchTerm, rackFilter, statusFilter, pageSize]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedData = useMemo(() => {
    const startIndex = (validCurrentPage - 1) * pageSize;
    return filteredData.slice(startIndex, startIndex + pageSize);
  }, [filteredData, validCurrentPage, pageSize]);

  // Selection helpers
  const isAllPageSelected = useMemo(() => {
    if (paginatedData.length === 0) return false;
    return paginatedData.every(item => selectedItems.has(item.id));
  }, [paginatedData, selectedItems]);

  const isAllFilteredSelected = useMemo(() => {
    if (filteredData.length === 0) return false;
    return filteredData.every(item => selectedItems.has(item.id));
  }, [filteredData, selectedItems]);

  const handleToggleSelectPage = () => {
    const newSelected = new Set(selectedItems);
    if (isAllPageSelected) {
      paginatedData.forEach(item => newSelected.delete(item.id));
    } else {
      paginatedData.forEach(item => newSelected.add(item.id));
    }
    setSelectedItems(newSelected);
  };

  const handleSelectAllFiltered = () => {
    const newSelected = new Set(selectedItems);
    filteredData.forEach(item => newSelected.add(item.id));
    setSelectedItems(newSelected);
  };

  const handleClearSelection = () => {
    setSelectedItems(new Set());
  };

  const handleSelectItem = (id: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
  };

  // Fast single-row toggle
  const handleSingleToggle = async (item: ProductRackItem) => {
    const targetExcluded = !item.is_excluded;

    // Optimistic UI update
    setProductRacks(prev =>
      prev.map(p => (p.id === item.id ? { ...p, is_excluded: targetExcluded } : p))
    );

    try {
      const { error } = await supabase
        .from('product_rack_exclusions')
        .upsert({
          nama_produk: item.nama_produk,
          rak: item.rak,
          is_excluded: targetExcluded
        }, {
          onConflict: 'nama_produk,rak'
        });

      if (error) throw error;

      showToast(
        `${item.nama_produk} (${item.rak}) ${targetExcluded ? 'dinonaktifkan' : 'diaktifkan'}`,
        'success'
      );
    } catch (error) {
      console.error('Error updating exclusion:', error);
      // Revert optimistic update
      setProductRacks(prev =>
        prev.map(p => (p.id === item.id ? { ...p, is_excluded: item.is_excluded } : p))
      );
      showToast('Gagal menyimpan perubahan', 'error');
    }
  };

  // Fast batch toggle with chunking & optimistic update
  const handleToggleExclusion = async (enable: boolean) => {
    if (selectedItems.size === 0) {
      showToast('Pilih item terlebih dahulu', 'info');
      return;
    }

    const selectedIdsList = Array.from(selectedItems);
    const updates: { nama_produk: string; rak: string; is_excluded: boolean }[] = [];

    selectedIdsList.forEach(id => {
      const item = productRacks.find(p => p.id === id);
      if (item) {
        updates.push({
          nama_produk: item.nama_produk,
          rak: item.rak,
          is_excluded: enable
        });
      }
    });

    if (updates.length === 0) return;

    try {
      setSaving(true);

      // Optimistic update
      setProductRacks(prev =>
        prev.map(p => (selectedItems.has(p.id) ? { ...p, is_excluded: enable } : p))
      );

      // Batch in chunks of 100 for maximum speed and safety
      const CHUNK_SIZE = 100;
      for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
        const chunk = updates.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase
          .from('product_rack_exclusions')
          .upsert(chunk, { onConflict: 'nama_produk,rak' });

        if (error) throw error;
      }

      showToast(
        `Berhasil ${enable ? 'menonaktifkan' : 'mengaktifkan'} ${updates.length} item`,
        'success'
      );

      setSelectedItems(new Set());
    } catch (error) {
      console.error('Error updating exclusions:', error);
      showToast('Gagal menyimpan perubahan', 'error');
      // Reload on error to restore true state
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  // Guard: Unauthorized View when DevMode is inactive
  if (!isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <div className="w-20 h-20 rounded-3xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-500 mb-6 shadow-xl shadow-amber-500/10">
          <ShieldAlert className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">Mode Dev Diperlukan</h2>
        <p className="text-gray-500 max-w-md text-sm mb-6 leading-relaxed">
          Menu <span className="font-bold text-gray-800">Prioritas Rak</span> hanya dapat diakses saat mode pengembang aktif. Ketik kata kunci <span className="font-mono font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">devmode</span> di mana saja pada keyboard untuk memunculkannya.
        </p>
        <Link to="/" className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-md transition-all active:scale-95">
          Kembali ke Dashboard
        </Link>
      </div>
    );
  }

  return (
    <>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* ======================================================== */}
      {/* PREMIUM RESPONSIVE HEADER BANNER (Like Input Barang Masuk) */}
      {/* ======================================================== */}
      <div className="flex flex-col mb-8 lg:mb-10">
        <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 pt-[80px] lg:pt-0 lg:h-[310px] pb-[40px] lg:pb-0 px-6 lg:px-12 rounded-b-[40px] lg:rounded-b-[55px] shadow-2xl shadow-blue-900/20 relative overflow-hidden transition-all duration-500 flex flex-col justify-center">

          {/* Decorative Background Icon */}
          <div className="absolute -top-6 -right-6 text-white opacity-5 pointer-events-none">
            <SlidersHorizontal className="w-64 h-64 lg:w-96 lg:h-96" />
          </div>

          {/* Decorative Floating Shapes */}
          <div className="absolute top-10 right-10 w-32 h-32 bg-white/10 rounded-full blur-3xl animate-pulse pointer-events-none"></div>
          <div className="absolute top-24 left-1/4 w-16 h-16 bg-white/5 border border-white/10 rounded-2xl rotate-[35deg] backdrop-blur-sm hidden lg:block pointer-events-none"></div>
          <div className="absolute bottom-10 right-1/3 w-12 h-12 bg-white/10 rounded-full border border-white/20 hidden lg:block pointer-events-none"></div>
          <div className="absolute top-1/2 right-20 w-16 h-16 bg-blue-400/20 rounded-3xl -rotate-12 blur-xl hidden lg:block pointer-events-none"></div>

          {/* Text & Header Action Content */}
          <div className="relative z-10 w-full flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 lg:gap-6 uppercase">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 mb-2 lg:mb-3 opacity-90">
                <div className="w-8 h-[2px] bg-white rounded-full"></div>
                <span className="text-[10px] lg:text-[12px] font-black tracking-[0.3em] text-white">Logistics V5</span>
              </div>
              <h1 className="text-[32px] lg:text-[52px] font-black text-white tracking-tight leading-[1.1] mb-2 uppercase">
                Prioritas <span className="text-blue-200">Rak</span>
              </h1>
              <div className="text-blue-100/90 font-medium text-[13px] lg:text-[17px] leading-relaxed max-w-[90%] normal-case">
                {loading ? (
                  <span className="animate-pulse flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" /> Memuat sinkronisasi pemetaan rak...
                  </span>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                    </span>
                    <span className="font-black text-white">Digital System</span> - Konfigurasi Auto-Select & Pengecualian Rak SKU
                  </div>
                )}
              </div>
            </div>

            {/* Desktop / Mobile Action Buttons in Header */}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => {
                  setIsMultiRakModalOpen(true);
                  setMultiRakSearch('');
                  setMultiRakStatusFilter('ALL');
                  setMultiRakRackFilter('ALL');
                  setMultiRakOtherRackFilter('ALL');
                  setMultiRakCurrentPage(1);
                  setMultiRakSelected(new Set());
                }}
                disabled={loading || saving}
                className="h-11 px-5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-black rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20 border border-white/20"
                title="Tampilkan semua SKU yang terdaftar di lebih dari 1 lokasi rak"
              >
                <Layers className="h-4 w-4 text-white" />
                <span className="text-[11px] uppercase tracking-wider whitespace-nowrap">
                  SKU Multi-Rak ({multiSkuCount} SKU)
                </span>
              </Button>

              <Button
                onClick={loadData}
                disabled={loading || saving}
                className="h-11 px-5 bg-white/95 hover:bg-white text-blue-700 font-bold rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 shadow-md border border-white/20"
              >
                <RefreshCw className={cn("h-4 w-4 text-blue-700", loading && "animate-spin")} />
                <span className="text-[11px] uppercase tracking-wider whitespace-nowrap">Refresh Data</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="space-y-6 lg:space-y-8 lg:px-10 pb-12">

        {/* ======================================================== */}
        {/* STATS CARDS GRID (Input Barang Masuk Aesthetic) */}
        {/* ======================================================== */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Item */}
          <div className="bg-white rounded-[20px] border-l-4 border-l-blue-500 border-t border-r border-b border-gray-100/80 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-4 px-5 flex items-center justify-between relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Box className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">Total Mapping</span>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-2xl font-black text-gray-800 leading-none">{stats.total.toLocaleString()}</span>
                </div>
              </div>
            </div>
            <div className="relative z-10 hidden sm:flex flex-col items-end gap-1">
              <span className="text-[9px] font-black tracking-widest uppercase px-2 py-0.5 bg-blue-50 text-blue-600 rounded-md border border-blue-100">SKU - Rak</span>
            </div>
          </div>

          {/* Aktif Auto-Select */}
          <div className="bg-white rounded-[20px] border-l-4 border-l-emerald-500 border-t border-r border-b border-gray-100/80 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-4 px-5 flex items-center justify-between relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">Aktif (Auto)</span>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-2xl font-black text-emerald-600 leading-none">{stats.active.toLocaleString()}</span>
                </div>
              </div>
            </div>
            <div className="relative z-10 hidden sm:flex flex-col items-end gap-1">
              <span className="text-[9px] font-black tracking-widest uppercase px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-100">Dipilih Otomatis</span>
            </div>
          </div>

          {/* Nonaktif / Dikecualikan */}
          <div className="bg-white rounded-[20px] border-l-4 border-l-rose-500 border-t border-r border-b border-gray-100/80 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-4 px-5 flex items-center justify-between relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-rose-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-500 to-red-600 text-white flex items-center justify-center shadow-lg shadow-rose-500/20">
                <XCircle className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">Dikecualikan</span>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-2xl font-black text-rose-600 leading-none">{stats.inactive.toLocaleString()}</span>
                </div>
              </div>
            </div>
            <div className="relative z-10 hidden sm:flex flex-col items-end gap-1">
              <span className="text-[9px] font-black tracking-widest uppercase px-2 py-0.5 bg-rose-50 text-rose-700 rounded-md border border-rose-100">Diabaikan Auto</span>
            </div>
          </div>

          {/* Item Terpilih */}
          <div className="bg-white rounded-[20px] border-l-4 border-l-amber-500 border-t border-r border-b border-gray-100/80 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-4 px-5 flex items-center justify-between relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-amber-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-yellow-600 text-white flex items-center justify-center shadow-lg shadow-amber-500/20">
                <CheckSquare className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">Item Dipilih</span>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-2xl font-black text-amber-600 leading-none">{selectedItems.size.toLocaleString()}</span>
                </div>
              </div>
            </div>
            <div className="relative z-10 hidden sm:flex flex-col items-end gap-1">
              <span className="text-[9px] font-black tracking-widest uppercase px-2 py-0.5 bg-amber-50 text-amber-800 rounded-md border border-amber-100">Batch Aksi</span>
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* SEARCH, FILTER & BATCH ACTION TOOLBAR */}
        {/* ======================================================== */}
        <div className="bg-white p-4 lg:p-5 rounded-[24px] border border-gray-100 shadow-[0_2px_15px_-5px_rgba(0,0,0,0.05)] space-y-4">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            
            {/* Search Input & Dropdowns */}
            <div className="flex flex-wrap items-center gap-3 flex-1">
              {/* Search Box */}
              <div className="relative flex-1 min-w-[220px]">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-9 py-2.5 text-sm bg-gray-50/50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium transition-all"
                  placeholder="Cari SKU / nama produk / rak..."
                />
                <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* ======================================================== */}
              {/* CUSTOM SEARCHABLE RESPONSIVE RACK DROPDOWN (BATCH RAK) */}
              {/* ======================================================== */}
              <div className="relative min-w-[220px] max-w-full sm:max-w-xs" ref={dropdownRef}>
                <button
                  type="button"
                  ref={buttonRef}
                  onClick={handleToggleDropdown}
                  className={cn(
                    "w-full px-3.5 py-2.5 text-sm rounded-xl font-medium flex items-center justify-between gap-2 transition-all border outline-none",
                    rackFilter
                      ? "bg-blue-50/90 border-blue-300 text-blue-900 font-bold shadow-xs ring-2 ring-blue-500/10"
                      : "bg-gray-50/50 hover:bg-gray-100/70 border-gray-200 text-gray-700 hover:border-gray-300"
                  )}
                  title="Pilih filter rak atau batch rak"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Warehouse className={cn("h-4 w-4 shrink-0", rackFilter ? "text-blue-600" : "text-gray-400")} />
                    <span className="truncate text-xs font-bold">{selectedLabel}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {rackFilter && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectRack('');
                        }}
                        className="p-1 hover:bg-blue-200/60 rounded-lg text-blue-600 cursor-pointer transition-colors"
                        title="Reset filter rak"
                      >
                        <X className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <ChevronDown className={cn("h-4 w-4 text-gray-400 transition-transform duration-200", isDropdownOpen && "rotate-180")} />
                  </div>
                </button>

                {/* Floating Responsive Dropdown Popover (Desktop View) */}
                {isDropdownOpen && (
                  <div
                    className={cn(
                      "hidden sm:flex flex-col absolute left-0 z-50 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 ring-1 ring-black/5 overflow-hidden transition-all duration-150",
                      openDirection === 'up'
                        ? "bottom-full mb-2 origin-bottom animate-in fade-in slide-in-from-bottom-2"
                        : "top-full mt-2 origin-top animate-in fade-in slide-in-from-top-2"
                    )}
                    style={{ maxHeight: `${dropdownMaxHeight}px` }}
                  >
                    {/* Search box inside dropdown */}
                    <div className="p-2.5 border-b border-gray-100 bg-gray-50/70 sticky top-0 z-10">
                      <div className="relative">
                        <input
                          ref={searchInputRef}
                          type="text"
                          value={dropdownSearch}
                          onChange={(e) => setDropdownSearch(e.target.value)}
                          placeholder="Ketik cari rak / batch (A, L25, LANTAI)..."
                          className="w-full pl-8 pr-7 py-2 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium transition-all"
                        />
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                        {dropdownSearch && (
                          <button
                            type="button"
                            onClick={() => setDropdownSearch('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Scrollable List of Batches & Special Racks */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-3 scrollbar-thin scrollbar-thumb-gray-200">
                      {/* Option: Semua Rak */}
                      <div>
                        <button
                          type="button"
                          onClick={() => handleSelectRack('')}
                          className={cn(
                            "w-full px-3 py-2 text-left text-xs rounded-xl flex items-center justify-between transition-colors",
                            !rackFilter
                              ? "bg-blue-600 text-white font-bold shadow-xs"
                              : "hover:bg-blue-50 text-gray-700"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <Layers className={cn("h-4 w-4", !rackFilter ? "text-white" : "text-gray-400")} />
                            <span>Semua Lokasi Rak</span>
                          </div>
                          <span className={cn(
                            "px-2 py-0.5 rounded-md text-[10px] font-bold font-mono",
                            !rackFilter ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"
                          )}>
                            {stats.total.toLocaleString()}
                          </span>
                        </button>
                      </div>

                      {/* Group: BATCH SUB-RAK (A1-A999, B1-B999, ... L1-L999) */}
                      {dropdownOptions.batches.length > 0 && (
                        <div>
                          <div className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                            <Warehouse className="h-3 w-3 text-blue-500" />
                            <span>Batch Sub-Rak (A - L)</span>
                          </div>
                          <div className="space-y-1 mt-1">
                            {dropdownOptions.batches.map(item => {
                              const isSelected = rackFilter === item.key;
                              return (
                                <button
                                  key={item.key}
                                  type="button"
                                  onClick={() => handleSelectRack(item.key)}
                                  className={cn(
                                    "w-full px-3 py-2 text-left text-xs rounded-xl flex items-center justify-between transition-colors",
                                    isSelected
                                      ? "bg-blue-600 text-white font-bold shadow-xs"
                                      : "hover:bg-blue-50 text-gray-700"
                                  )}
                                >
                                  <div className="flex flex-col">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-bold">{item.label}</span>
                                      {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                                    </div>
                                    <span className={cn("text-[10px]", isSelected ? "text-blue-100" : "text-gray-400")}>
                                      {item.desc}
                                    </span>
                                  </div>
                                  <span className={cn(
                                    "px-2 py-0.5 rounded-md text-[10px] font-bold font-mono",
                                    isSelected ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"
                                  )}>
                                    {item.count.toLocaleString()} item
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Group: AREA & RAK KHUSUS (ECER-O, ECER-M, ECER-N, LANTAI 4, LANTAI 2, BLOK-I) */}
                      {dropdownOptions.specials.length > 0 && (
                        <div>
                          <div className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                            <MapPin className="h-3 w-3 text-amber-500" />
                            <span>Area & Rak Khusus</span>
                          </div>
                          <div className="space-y-1 mt-1">
                            {dropdownOptions.specials.map(item => {
                              const isSelected = rackFilter === item.key;
                              return (
                                <button
                                  key={item.key}
                                  type="button"
                                  onClick={() => handleSelectRack(item.key)}
                                  className={cn(
                                    "w-full px-3 py-2 text-left text-xs rounded-xl flex items-center justify-between transition-colors",
                                    isSelected
                                      ? "bg-blue-600 text-white font-bold shadow-xs"
                                      : "hover:bg-blue-50 text-gray-700"
                                  )}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold font-mono">{item.label}</span>
                                    {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                                  </div>
                                  <span className={cn(
                                    "px-2 py-0.5 rounded-md text-[10px] font-bold font-mono",
                                    isSelected ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"
                                  )}>
                                    {item.count.toLocaleString()} item
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Group: SUB-RAK SPESIFIK (Tampil jika user mengetik kode spesifik seperti A15, L25) */}
                      {dropdownOptions.subRacks.length > 0 && (
                        <div>
                          <div className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                            <Search className="h-3 w-3 text-blue-500" />
                            <span>Sub-Rak Spesifik</span>
                          </div>
                          <div className="space-y-1 mt-1">
                            {dropdownOptions.subRacks.map(item => {
                              const isSelected = rackFilter === item.key;
                              return (
                                <button
                                  key={item.key}
                                  type="button"
                                  onClick={() => handleSelectRack(item.key)}
                                  className={cn(
                                    "w-full px-3 py-2 text-left text-xs rounded-xl flex items-center justify-between transition-colors",
                                    isSelected
                                      ? "bg-blue-600 text-white font-bold shadow-xs"
                                      : "hover:bg-blue-50 text-gray-700"
                                  )}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-gray-900">{item.label}</span>
                                    {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                                  </div>
                                  <span className={cn(
                                    "px-2 py-0.5 rounded-md text-[10px] font-bold font-mono",
                                    isSelected ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"
                                  )}>
                                    {item.count.toLocaleString()} item
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {dropdownOptions.batches.length === 0 && dropdownOptions.specials.length === 0 && dropdownOptions.subRacks.length === 0 && (
                        <div className="py-6 text-center text-xs text-gray-400">
                          Tidak ditemukan rak yang cocok
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Mobile Bottom-Sheet Modal View */}
                {isDropdownOpen && (
                  <div className="fixed inset-0 z-[100] bg-gray-950/60 backdrop-blur-xs flex items-end sm:hidden animate-in fade-in duration-200">
                    <div className="bg-white w-full rounded-t-[28px] max-h-[85vh] p-4 flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-200">
                      {/* Drag Handle & Header */}
                      <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3"></div>
                      <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                        <div>
                          <h3 className="text-base font-black text-gray-900">Pilih Filter Rak</h3>
                          <p className="text-[11px] text-gray-500">Pilih batch sub-rak A-L atau area khusus</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsDropdownOpen(false)}
                          className="p-2 hover:bg-gray-100 rounded-full text-gray-500"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </div>

                      {/* Search Input Mobile */}
                      <div className="my-3 relative">
                        <input
                          type="text"
                          value={dropdownSearch}
                          onChange={(e) => setDropdownSearch(e.target.value)}
                          placeholder="Ketik cari rak / batch..."
                          className="w-full pl-9 pr-8 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                        />
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        {dropdownSearch && (
                          <button
                            type="button"
                            onClick={() => setDropdownSearch('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 p-1"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      {/* Scrollable list mobile */}
                      <div className="flex-1 overflow-y-auto space-y-3 pb-6">
                        <button
                          type="button"
                          onClick={() => handleSelectRack('')}
                          className={cn(
                            "w-full p-3 text-left rounded-xl flex items-center justify-between",
                            !rackFilter ? "bg-blue-600 text-white font-bold" : "bg-gray-50 text-gray-800"
                          )}
                        >
                          <span className="text-sm">Semua Lokasi Rak</span>
                          <span className="text-xs font-mono">{stats.total.toLocaleString()}</span>
                        </button>

                        {/* Batches Mobile */}
                        {dropdownOptions.batches.length > 0 && (
                          <div className="space-y-1.5">
                            <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Batch Sub-Rak (A - L)</span>
                            {dropdownOptions.batches.map(item => (
                              <button
                                key={item.key}
                                type="button"
                                onClick={() => handleSelectRack(item.key)}
                                className={cn(
                                  "w-full p-3 text-left rounded-xl flex items-center justify-between",
                                  rackFilter === item.key ? "bg-blue-600 text-white font-bold" : "bg-gray-50 text-gray-800"
                                )}
                              >
                                <div>
                                  <div className="text-sm font-bold">{item.label}</div>
                                  <div className="text-xs opacity-75">{item.desc}</div>
                                </div>
                                <span className="text-xs font-mono">{item.count.toLocaleString()} item</span>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Specials Mobile */}
                        {dropdownOptions.specials.length > 0 && (
                          <div className="space-y-1.5">
                            <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Area & Rak Khusus</span>
                            {dropdownOptions.specials.map(item => (
                              <button
                                key={item.key}
                                type="button"
                                onClick={() => handleSelectRack(item.key)}
                                className={cn(
                                  "w-full p-3 text-left rounded-xl flex items-center justify-between",
                                  rackFilter === item.key ? "bg-blue-600 text-white font-bold" : "bg-gray-50 text-gray-800"
                                )}
                              >
                                <span className="text-sm font-bold font-mono">{item.label}</span>
                                <span className="text-xs font-mono">{item.count.toLocaleString()} item</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Status Filter Buttons */}
              <div className="flex rounded-xl border border-gray-200 p-1 bg-gray-50/70">
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    statusFilter === 'ALL'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Semua ({filteredData.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('ACTIVE')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    statusFilter === 'ACTIVE'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-gray-600 hover:text-emerald-700'
                  }`}
                >
                  Aktif
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('INACTIVE')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    statusFilter === 'INACTIVE'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-gray-600 hover:text-rose-700'
                  }`}
                >
                  Nonaktif
                </button>
              </div>
            </div>

            {/* Batch Action Buttons */}
            <div className="flex items-center gap-2.5 shrink-0">
              <Button
                onClick={() => handleToggleExclusion(true)}
                disabled={selectedItems.size === 0 || saving}
                className="h-10 px-4 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-sm transition-all active:scale-95 disabled:opacity-40"
              >
                <XCircle className="h-4 w-4" />
                <span>Nonaktifkan ({selectedItems.size})</span>
              </Button>
              <Button
                onClick={() => handleToggleExclusion(false)}
                disabled={selectedItems.size === 0 || saving}
                className="h-10 px-4 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-sm transition-all active:scale-95 disabled:opacity-40"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Aktifkan ({selectedItems.size})</span>
              </Button>
            </div>
          </div>

          {/* Selection Banner Info */}
          {selectedItems.size > 0 && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-blue-900 shadow-xs">
              <div className="flex items-center gap-2 font-bold">
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping"></span>
                <span>{selectedItems.size} item terpilih</span>
                {!isAllFilteredSelected && filteredData.length > selectedItems.size && (
                  <button
                    onClick={handleSelectAllFiltered}
                    className="text-blue-700 hover:text-blue-900 underline font-extrabold ml-2"
                  >
                    Pilih semua {filteredData.length.toLocaleString()} hasil filter
                  </button>
                )}
              </div>
              <button
                onClick={handleClearSelection}
                className="text-rose-600 hover:text-rose-800 font-bold hover:underline"
              >
                Batalkan Pilihan
              </button>
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* MAIN DATA TABLE CARD */}
        {/* ======================================================== */}
        <div className="bg-white rounded-[24px] lg:rounded-[32px] border border-gray-100 shadow-[0_4px_25px_-5px_rgba(0,0,0,0.05)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 text-white text-xs uppercase tracking-wider font-bold">
                  <th className="px-4 py-4 text-center w-14 border-r border-blue-500/50">
                    <button
                      type="button"
                      onClick={handleToggleSelectPage}
                      title={isAllPageSelected ? "Hapus centang halaman ini" : "Centang semua halaman ini"}
                      className="text-white hover:text-blue-200 p-0.5 rounded transition-colors inline-flex items-center justify-center active:scale-90"
                    >
                      {isAllPageSelected ? (
                        <CheckSquare className="h-5 w-5" />
                      ) : (
                        <Square className="h-5 w-5" />
                      )}
                    </button>
                  </th>
                  <th className="px-5 py-4 text-left border-r border-blue-500/50">Nama Produk / SKU</th>
                  <th className="px-5 py-4 text-center w-40 border-r border-blue-500/50">Lokasi Rak</th>
                  <th className="px-5 py-4 text-center w-44 border-r border-blue-500/50">Status Auto-Select</th>
                  <th className="px-5 py-4 text-center w-36">Aksi Cepat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {paginatedData.map((item, index) => {
                  const isSelected = selectedItems.has(item.id);
                  const isExcluded = item.is_excluded;

                  return (
                    <tr
                      key={item.id}
                      className={cn(
                        "transition-colors",
                        isSelected
                          ? "bg-blue-50/80 hover:bg-blue-100/70"
                          : isExcluded
                            ? "bg-rose-50/25 hover:bg-rose-50/60"
                            : index % 2 === 0
                              ? "bg-white hover:bg-blue-50/40"
                              : "bg-gray-50/30 hover:bg-blue-50/40"
                      )}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-3 text-center border-r border-gray-100">
                        <button
                          type="button"
                          onClick={() => handleSelectItem(item.id)}
                          className="text-blue-600 hover:text-blue-800 p-0.5 rounded transition-colors inline-flex items-center justify-center active:scale-90"
                        >
                          {isSelected ? (
                            <CheckSquare className="h-5 w-5 text-blue-600" />
                          ) : (
                            <Square className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                          )}
                        </button>
                      </td>

                      {/* Nama Produk / SKU */}
                      <td className="px-5 py-3 border-r border-gray-100">
                        <span className="font-mono font-bold text-gray-900 text-sm block">
                          {item.nama_produk}
                        </span>
                      </td>

                      {/* Lokasi Rak */}
                      <td className="px-5 py-3 text-center border-r border-gray-100">
                        <span className="inline-block px-3.5 py-1 bg-blue-50 text-blue-700 rounded-lg font-black text-xs font-mono border border-blue-200/80 shadow-2xs">
                          {item.rak}
                        </span>
                      </td>

                      {/* Status Auto-Select */}
                      <td className="px-5 py-3 text-center border-r border-gray-100">
                        {isExcluded ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-50 text-rose-700 rounded-full text-xs font-black border border-rose-200 shadow-2xs">
                            <XCircle className="h-3.5 w-3.5 text-rose-600" />
                            NONAKTIF
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-black border border-emerald-200 shadow-2xs">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            AKTIF
                          </span>
                        )}
                      </td>

                      {/* Aksi Cepat Single Toggle */}
                      <td className="px-5 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleSingleToggle(item)}
                          disabled={saving}
                          className={cn(
                            "px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all border shadow-2xs active:scale-95 disabled:opacity-50",
                            isExcluded
                              ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300"
                              : "bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-300"
                          )}
                        >
                          {isExcluded ? 'Aktifkan' : 'Nonaktifkan'}
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {paginatedData.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-16 text-center text-gray-500">
                      <div className="max-w-xs mx-auto space-y-2.5">
                        <div className="w-12 h-12 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mx-auto text-gray-400">
                          <Filter className="h-6 w-6" />
                        </div>
                        <p className="font-bold text-gray-700">Tidak ada data yang cocok</p>
                        <p className="text-xs text-gray-400">
                          Coba sesuaikan kata kunci pencarian atau ubah filter lokasi rak dan status.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ======================================================== */}
        {/* PAGINATION & FOOTER CONTROLS */}
        {/* ======================================================== */}
        <div className="bg-white p-4 px-6 rounded-[20px] border border-gray-100 shadow-[0_2px_15px_-5px_rgba(0,0,0,0.05)] flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
          {/* Record Info */}
          <div className="text-gray-600 font-medium">
            Menampilkan{' '}
            <span className="font-bold text-gray-900">
              {filteredData.length === 0 ? 0 : (validCurrentPage - 1) * pageSize + 1}
            </span>
            {' - '}
            <span className="font-bold text-gray-900">
              {Math.min(validCurrentPage * pageSize, filteredData.length)}
            </span>{' '}
            dari <span className="font-bold text-gray-900">{filteredData.length.toLocaleString()}</span> data
            {productRacks.length !== filteredData.length && (
              <span className="text-gray-400 ml-1">
                (difilter dari {productRacks.length.toLocaleString()} total)
              </span>
            )}
          </div>

          {/* Page Size & Navigation Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Per Page Selector */}
            <div className="flex items-center gap-2 text-gray-700 font-medium">
              <span>Per halaman:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="border border-gray-200 rounded-lg px-2.5 py-1.5 bg-gray-50/50 focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold text-xs cursor-pointer"
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
                <option value={500}>500</option>
              </select>
            </div>

            {/* Pagination Button Controls */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={validCurrentPage <= 1}
                className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none transition-all active:scale-95"
                title="Halaman Pertama"
              >
                <ChevronsLeft className="h-4 w-4 text-gray-600" />
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={validCurrentPage <= 1}
                className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none transition-all active:scale-95"
                title="Halaman Sebelumnya"
              >
                <ChevronLeft className="h-4 w-4 text-gray-600" />
              </button>

              <span className="px-3.5 py-1.5 font-bold text-gray-800 bg-gray-50 border border-gray-200 rounded-lg text-xs">
                Hal {validCurrentPage} / {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={validCurrentPage >= totalPages}
                className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none transition-all active:scale-95"
                title="Halaman Selanjutnya"
              >
                <ChevronRight className="h-4 w-4 text-gray-600" />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={validCurrentPage >= totalPages}
                className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none transition-all active:scale-95"
                title="Halaman Terakhir"
              >
                <ChevronsRight className="h-4 w-4 text-gray-600" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* MODAL PREVIEW SKU MULTI-RAK (SKU di Beberapa Rak Berbeda) */}
      {/* ======================================================== */}
      <Modal
        isOpen={isMultiRakModalOpen}
        onClose={() => setIsMultiRakModalOpen(false)}
        title="Deteksi SKU di Berbagai Lokasi Rak"
        subtitle={`Total ${multiSkuCount} SKU terdaftar di lebih dari 1 lokasi rak terpantau (${multiRackItems.length} baris pemetaan). Hanya mencakup rak: UTAMA, ECER-O, ECER-M, ECER-N, LANTAI 4, LANTAI 2.`}
        size="6xl"
        icon={<Layers className="w-5 h-5 text-white" />}
        headerVariant="premium"
      >
        <div className="space-y-4">
          {/* Information Pill Banner */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-2.5 bg-blue-50/90 border border-blue-200/90 rounded-2xl text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-black text-blue-900 flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                <MapPin className="w-3.5 h-3.5 text-blue-600" />
                <span>Rak Terpantau:</span>
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {MULTI_RACK_TARGET_RACKS.map(r => (
                  <span key={r} className="px-2.5 py-0.5 bg-white text-blue-800 font-black font-mono text-[11px] rounded-lg border border-blue-200 shadow-2xs">
                    {r}
                  </span>
                ))}
              </div>
            </div>
            <div className="text-[11px] font-bold text-gray-500 italic">
              *Sub-rak A1 s/d L999, Lorong, dan Blok-I dikecualikan dari deteksi
            </div>
          </div>

          {/* Top Filter & Settings Bar */}
          <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3 bg-gray-50/80 p-3.5 rounded-2xl border border-gray-100">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={multiRakSearch}
                onChange={(e) => {
                  setMultiRakSearch(e.target.value);
                  setMultiRakCurrentPage(1);
                }}
                placeholder="Cari SKU atau nama rak..."
                className="w-full pl-9 pr-8 py-2 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
              />
              {multiRakSearch && (
                <button
                  onClick={() => {
                    setMultiRakSearch('');
                    setMultiRakCurrentPage(1);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Dropdown 1: Lokasi Rak Baris */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-gray-500 whitespace-nowrap">Filter Rak:</span>
              <select
                value={multiRakRackFilter}
                onChange={(e) => {
                  setMultiRakRackFilter(e.target.value);
                  setMultiRakCurrentPage(1);
                }}
                className={`px-2.5 py-1.5 text-xs rounded-xl font-bold outline-none focus:ring-2 focus:ring-blue-500/20 border transition-all ${
                  multiRakRackFilter !== 'ALL'
                    ? 'bg-blue-50 text-blue-800 border-blue-300 ring-1 ring-blue-200'
                    : 'bg-white text-gray-800 border-gray-200'
                }`}
              >
                <option value="ALL">Semua Rak ({multiRackItems.length})</option>
                {multiRakAvailableRacks.map(r => (
                  <option key={r.rack} value={r.rack}>
                    {r.rack} ({r.count})
                  </option>
                ))}
              </select>
            </div>

            {/* Filter Dropdown 2: Juga Ada di Rak (Pasangan) */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-gray-500 whitespace-nowrap">Juga Ada di:</span>
              <select
                value={multiRakOtherRackFilter}
                onChange={(e) => {
                  setMultiRakOtherRackFilter(e.target.value);
                  setMultiRakCurrentPage(1);
                }}
                className={`px-2.5 py-1.5 text-xs rounded-xl font-bold outline-none focus:ring-2 focus:ring-blue-500/20 border transition-all ${
                  multiRakOtherRackFilter !== 'ALL'
                    ? 'bg-amber-50 text-amber-800 border-amber-300 ring-1 ring-amber-200'
                    : 'bg-white text-gray-800 border-gray-200'
                }`}
              >
                <option value="ALL">Semua Pasangan</option>
                {MULTI_RACK_TARGET_RACKS.map(r => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-gray-200">
              <button
                type="button"
                onClick={() => { setMultiRakStatusFilter('ALL'); setMultiRakCurrentPage(1); }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${multiRakStatusFilter === 'ALL' ? 'bg-blue-600 text-white shadow-xs' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => { setMultiRakStatusFilter('ACTIVE'); setMultiRakCurrentPage(1); }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${multiRakStatusFilter === 'ACTIVE' ? 'bg-emerald-600 text-white shadow-xs' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                Aktif
              </button>
              <button
                type="button"
                onClick={() => { setMultiRakStatusFilter('INACTIVE'); setMultiRakCurrentPage(1); }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${multiRakStatusFilter === 'INACTIVE' ? 'bg-rose-600 text-white shadow-xs' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                Nonaktif
              </button>
            </div>

            {/* Reset Filter Button if any filter active */}
            {(multiRakRackFilter !== 'ALL' || multiRakOtherRackFilter !== 'ALL' || multiRakStatusFilter !== 'ALL' || multiRakSearch) && (
              <button
                type="button"
                onClick={() => {
                  setMultiRakSearch('');
                  setMultiRakRackFilter('ALL');
                  setMultiRakOtherRackFilter('ALL');
                  setMultiRakStatusFilter('ALL');
                  setMultiRakCurrentPage(1);
                }}
                className="px-2.5 py-1.5 text-xs font-bold text-gray-500 hover:text-gray-800 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors whitespace-nowrap"
                title="Reset semua filter modal"
              >
                Reset Filter
              </button>
            )}

            {/* Page Size Selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-gray-500 whitespace-nowrap">Baris:</span>
              <select
                value={multiRakPageSize}
                onChange={(e) => {
                  setMultiRakPageSize(Number(e.target.value));
                  setMultiRakCurrentPage(1);
                }}
                className="px-2 py-1.5 text-xs bg-white border border-gray-200 rounded-xl font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </div>
          </div>

          {/* Action Toolbar for Selection */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleToggleSelectMultiPage}
                className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-xs font-bold text-gray-700 flex items-center gap-1.5 shadow-2xs transition-all active:scale-95"
              >
                {isAllMultiPageSelected ? <CheckSquare className="w-3.5 h-3.5 text-blue-600" /> : <Square className="w-3.5 h-3.5 text-gray-400" />}
                <span>{isAllMultiPageSelected ? 'Batal Pilih Hal Ini' : 'Pilih Semua Hal Ini'}</span>
              </button>
              {filteredMultiRakData.length > paginatedMultiRakData.length && (
                <button
                  type="button"
                  onClick={handleSelectAllFilteredMulti}
                  className="px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-xs font-bold text-blue-700 shadow-2xs transition-all active:scale-95"
                >
                  Pilih Semua Hasil Filter ({filteredMultiRakData.length})
                </button>
              )}
              {multiRakSelected.size > 0 && (
                <button
                  type="button"
                  onClick={handleClearMultiSelection}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-gray-500 hover:text-gray-700"
                >
                  Reset ({multiRakSelected.size})
                </button>
              )}
            </div>

            {/* Batch Activate / Deactivate / Dedup Buttons */}
            {multiRakSelected.size > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-black text-amber-700 bg-amber-50 px-2.5 py-1.5 rounded-lg border border-amber-200">
                  {multiRakSelected.size} dipilih
                </span>

                {/* Tombol Dedup Massal: Jadikan Rak Terpilih Satu-satunya Aktif */}
                <button
                  type="button"
                  onClick={handleBulkDedupPrioritize}
                  disabled={saving}
                  className="px-3.5 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-black shadow-sm flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                  title="Jadikan rak yang dipilih sebagai satu-satunya lokasi aktif untuk SKU tersebut, dan otomatis nonaktifkan semua lokasi rak lainnya"
                >
                  <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                  <span>Prioritaskan Rak Terpilih (Dedup Massal)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleExclusionForMulti(false)}
                  disabled={saving}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                  title="Aktifkan semua item yang dipilih"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Aktifkan Terpilih</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleExclusionForMulti(true)}
                  disabled={saving}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black shadow-sm flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                  title="Nonaktifkan semua item yang dipilih"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Nonaktifkan Terpilih</span>
                </button>
              </div>
            )}
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-2xs max-h-[55vh] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-gray-50/90 sticky top-0 z-10 border-b border-gray-200">
                <tr>
                  <th className="w-10 px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={isAllMultiPageSelected}
                      onChange={handleToggleSelectMultiPage}
                      className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                  </th>
                  <th className="w-12 px-2 py-3 text-center font-black text-gray-500">NO</th>
                  <th className="px-4 py-3 font-black text-gray-700 uppercase">SKU / NAMA PRODUK</th>
                  <th className="px-4 py-3 font-black text-gray-700 uppercase">LOKASI RAK</th>
                  <th className="px-4 py-3 font-black text-gray-700 uppercase text-center">STATUS PRIORITAS</th>
                  <th className="px-4 py-3 font-black text-gray-700 uppercase text-center">AKSI CEPAT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedMultiRakData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-gray-400 font-bold">
                      Tidak ada data SKU multi-rak yang sesuai dengan filter
                    </td>
                  </tr>
                ) : (
                  paginatedMultiRakData.map((item, idx) => {
                    const rowNumber = (validMultiRakCurrentPage - 1) * multiRakPageSize + idx + 1;
                    const isSelected = multiRakSelected.has(item.id);
                    return (
                      <tr
                        key={item.id}
                        className={`transition-colors hover:bg-blue-50/40 ${isSelected ? 'bg-amber-50/60' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
                      >
                        <td className="px-3 py-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleSelectMultiItem(item.id)}
                            className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                          />
                        </td>
                        <td className="px-2 py-2.5 text-center font-bold text-gray-400">
                          {rowNumber}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="font-extrabold text-gray-800 text-xs">
                            {item.nama_produk}
                          </div>
                          <div className="text-[10px] text-amber-700 font-bold mt-0.5 flex items-center gap-1">
                            <span className="px-1.5 py-0.5 rounded bg-amber-100/70 border border-amber-200">
                              Ada di {item.totalRacksForSku} Rak: {item.allRacksList.join(', ')}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="px-2.5 py-1 rounded-lg font-black text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 inline-flex items-center gap-1">
                            <Warehouse className="w-3 h-3 text-indigo-500" />
                            {item.rak}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {item.is_excluded ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center gap-1">
                              <XCircle className="w-3 h-3 text-rose-500" /> Nonaktif (Dikecualikan)
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Aktif (Auto-Select)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Tombol Dedup Single: Hanya Rak Ini */}
                            <button
                              type="button"
                              onClick={() => handleSingleDedupPrioritize(item)}
                              disabled={saving}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-black transition-all shadow-2xs active:scale-95 disabled:opacity-50 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 hover:border-indigo-600 flex items-center gap-1 cursor-pointer"
                              title={`Jadikan rak ${item.rak} sebagai satu-satunya lokasi aktif untuk SKU ini, dan otomatis nonaktifkan lokasi rak lainnya`}
                            >
                              <Sparkles className="w-3 h-3 text-amber-500" />
                              <span>Hanya Rak Ini</span>
                            </button>

                            {/* Toggle Aktif / Nonaktif */}
                            <button
                              type="button"
                              onClick={() => handleSingleToggle(item)}
                              disabled={saving}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition-all shadow-2xs active:scale-95 disabled:opacity-50 cursor-pointer ${
                                item.is_excluded
                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                  : 'bg-rose-600 hover:bg-rose-700 text-white'
                              }`}
                              title={item.is_excluded ? 'Aktifkan rak ini' : 'Nonaktifkan rak ini'}
                            >
                              {item.is_excluded ? 'Aktifkan' : 'Nonaktifkan'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Modal Pagination Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs">
            <span className="font-bold text-gray-500">
              Menampilkan {filteredMultiRakData.length === 0 ? 0 : (validMultiRakCurrentPage - 1) * multiRakPageSize + 1} - {Math.min(validMultiRakCurrentPage * multiRakPageSize, filteredMultiRakData.length)} dari {filteredMultiRakData.length} baris
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMultiRakCurrentPage(1)}
                disabled={validMultiRakCurrentPage <= 1}
                className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40"
                title="Halaman Pertama"
              >
                <ChevronsLeft className="w-4 h-4 text-gray-600" />
              </button>
              <button
                type="button"
                onClick={() => setMultiRakCurrentPage(p => Math.max(1, p - 1))}
                disabled={validMultiRakCurrentPage <= 1}
                className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40"
                title="Halaman Sebelumnya"
              >
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              </button>
              <span className="px-3 py-1 font-bold text-gray-700 bg-gray-50 border border-gray-200 rounded-lg">
                Hal {validMultiRakCurrentPage} / {multiRakTotalPages}
              </span>
              <button
                type="button"
                onClick={() => setMultiRakCurrentPage(p => Math.min(multiRakTotalPages, p + 1))}
                disabled={validMultiRakCurrentPage >= multiRakTotalPages}
                className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40"
                title="Halaman Selanjutnya"
              >
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </button>
              <button
                type="button"
                onClick={() => setMultiRakCurrentPage(multiRakTotalPages)}
                disabled={validMultiRakCurrentPage >= multiRakTotalPages}
                className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40"
                title="Halaman Terakhir"
              >
                <ChevronsRight className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
