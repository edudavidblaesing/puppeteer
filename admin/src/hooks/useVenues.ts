import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Venue } from '@/types';
import { fetchAdminVenues, createVenue, updateVenue, deleteVenue } from '@/lib/api';

export function useVenues() {
  const queryClient = useQueryClient();

  // Pagination State
  const [page, setPage] = useState(1);
  const [limit] = useState(50);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Query Key
  const queryKey = ['venues', { page, limit, search: debouncedSearch, source: sourceFilter }];

  // Fetch Venues with React Query
  const {
    data,
    isLoading,
    isError,
    error,
    refetch
  } = useQuery({
    queryKey,
    queryFn: async () => {
      return fetchAdminVenues({
        search: debouncedSearch,
        limit,
        offset: (page - 1) * limit,
        source: sourceFilter
      });
    },
    placeholderData: keepPreviousData,
  });

  const venues = data?.data || [];
  const total = data?.total || 0;

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: Partial<Venue>) => {
      if (!data.name) throw new Error('Name is required');
      return createVenue(data as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venues'] });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Venue> }) => updateVenue(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venues'] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteVenue,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venues'] });
    }
  });

  // Action Wrappers (Maintain Interface)
  const addVenue = useCallback(async (data: Partial<Venue>) => {
    return createMutation.mutateAsync(data);
  }, [createMutation]);

  const editVenue = useCallback(async (id: string, data: Partial<Venue>) => {
    return updateMutation.mutateAsync({ id, data });
  }, [updateMutation]);

  const removeVenue = useCallback(async (id: string) => {
    return deleteMutation.mutateAsync(id);
  }, [deleteMutation]);

  const loadVenues = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    venues,
    total,
    isLoading: isLoading || createMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
    error: isError ? (error as Error).message : null,
    loadVenues,
    addVenue,
    editVenue,
    removeVenue,
    searchQuery,
    setSearchQuery,
    sourceFilter,
    setSourceFilter,
    page,
    setPage,
    totalPages: Math.ceil(total / limit),
    totalItems: total,
    itemsPerPage: limit
  };
}
