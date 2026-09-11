import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface UsePaginatedDataOptions {
  table: string;
  pageSize: number;
  orderBy?: { column: string; ascending?: boolean };
  filters?: Record<string, any>;
}

interface UsePaginatedDataResult<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
  currentPage: number;
  totalPages: number;
  totalCount: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  goToPage: (page: number) => Promise<void>;
  nextPage: () => Promise<void>;
  prevPage: () => Promise<void>;
  refetch: () => Promise<void>;
}

export function usePaginatedData<T>(
  options: UsePaginatedDataOptions
): UsePaginatedDataResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const totalPages = Math.ceil(totalCount / options.pageSize);
  const hasNextPage = currentPage < totalPages;
  const hasPrevPage = currentPage > 1;

  const fetchPage = useCallback(
    async (page: number) => {
      setLoading(true);
      setError(null);

      try {
        const from = (page - 1) * options.pageSize;
        const to = from + options.pageSize - 1;

        const hasFilters = options.filters && Object.values(options.filters).some(v => v !== null && v !== undefined && v !== '');
        let query = supabase
          .from(options.table)
          .select('*', { count: hasFilters ? 'exact' : 'estimated' })
          .range(from, to);

        if (options.orderBy) {
          query = query.order(options.orderBy.column, {
            ascending: options.orderBy.ascending ?? false,
          });
        }

        if (options.filters) {
          Object.entries(options.filters).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
              query = query.eq(key, value);
            }
          });
        }

        const { data: pageData, count, error: queryError } = await query;

        if (queryError) throw queryError;

        setData(pageData || []);
        setTotalCount(count || 0);
        setCurrentPage(page);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setLoading(false);
      }
    },
    [options.table, options.pageSize, options.orderBy, options.filters]
  );

  useEffect(() => {
    fetchPage(1);
  }, [options.filters]);

  const goToPage = useCallback(
    async (page: number) => {
      if (page >= 1 && page <= totalPages) {
        await fetchPage(page);
      }
    },
    [totalPages, fetchPage]
  );

  const nextPage = useCallback(async () => {
    if (hasNextPage) {
      await fetchPage(currentPage + 1);
    }
  }, [currentPage, hasNextPage, fetchPage]);

  const prevPage = useCallback(async () => {
    if (hasPrevPage) {
      await fetchPage(currentPage - 1);
    }
  }, [currentPage, hasPrevPage, fetchPage]);

  const refetch = useCallback(async () => {
    await fetchPage(currentPage);
  }, [currentPage, fetchPage]);

  return {
    data,
    loading,
    error,
    currentPage,
    totalPages,
    totalCount,
    hasNextPage,
    hasPrevPage,
    goToPage,
    nextPage,
    prevPage,
    refetch,
  };
}
