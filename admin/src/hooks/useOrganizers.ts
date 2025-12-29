import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Organizer } from '@/types';
import { fetchOrganizers, createOrganizer, updateOrganizer, deleteOrganizer } from '@/lib/api';

export function useOrganizers() {
  const queryClient = useQueryClient();

  // Pagination State
  const [page, setPage] = useState(1);
  const [limit] = useState(50);

  // Filters
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
  const queryKey = ['organizers', { page, limit, search: debouncedSearch, source: sourceFilter }];

  // Fetch Organizers
  const {
    data,
    isLoading,
    isError,
    error,
    refetch
  } = useQuery({
    queryKey,
    queryFn: async () => {
      return fetchOrganizers({
        search: debouncedSearch,
        limit,
        offset: (page - 1) * limit,
        source: sourceFilter
      });
    },
    placeholderData: keepPreviousData,
  });

  const organizers = data?.data || [];
  const totalItems = data?.total || 0;

  // Mutations
  const createMutation = useMutation({
    mutationFn: createOrganizer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizers'] });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Organizer> }) => updateOrganizer(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizers'] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteOrganizer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizers'] });
    }
  });

  // Action Wrappers
  const addOrganizer = useCallback(async (data: Partial<Organizer>) => {
    return createMutation.mutateAsync(data);
  }, [createMutation]);

  const editOrganizer = useCallback(async (id: string, data: Partial<Organizer>) => {
    return updateMutation.mutateAsync({ id, data });
  }, [updateMutation]);

  const removeOrganizer = useCallback(async (id: string) => {
    return deleteMutation.mutateAsync(id);
  }, [deleteMutation]);

  const loadOrganizers = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    organizers,
    filteredOrganizers: organizers,
    searchQuery,
    setSearchQuery,
    sourceFilter,
    setSourceFilter,
    total: totalItems,
    isLoading: isLoading || createMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
    error: isError ? (error as Error).message : null,
    loadOrganizers,
    addOrganizer,
    editOrganizer,
    removeOrganizer,
    page,
    setPage,
    totalPages: Math.ceil(totalItems / limit),
    totalItems,
    itemsPerPage: limit
  };
}
