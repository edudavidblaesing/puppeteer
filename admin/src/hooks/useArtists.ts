import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Artist } from '@/types';
import { fetchArtists, createArtist, updateArtist, deleteArtist } from '@/lib/api';

export function useArtists() {
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
  const queryKey = ['artists', { page, limit, search: debouncedSearch, source: sourceFilter }];

  // Fetch Artists
  const {
    data,
    isLoading,
    isError,
    error,
    refetch
  } = useQuery({
    queryKey,
    queryFn: async () => {
      return fetchArtists({
        search: debouncedSearch,
        limit,
        offset: (page - 1) * limit,
        source: sourceFilter
      });
    },
    placeholderData: keepPreviousData,
  });

  const artists = data?.data || [];
  const totalItems = data?.total || 0;

  // Mutations
  const createMutation = useMutation({
    mutationFn: createArtist,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artists'] });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateArtist(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artists'] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteArtist,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artists'] });
    }
  });

  // Action Wrappers
  const addArtist = useCallback(async (data: any) => {
    return createMutation.mutateAsync(data);
  }, [createMutation]);

  const editArtist = useCallback(async (id: string, data: any) => {
    return updateMutation.mutateAsync({ id, data });
  }, [updateMutation]);

  const removeArtist = useCallback(async (id: string) => {
    return deleteMutation.mutateAsync(id);
  }, [deleteMutation]);

  const loadArtists = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    artists,
    filteredArtists: artists,
    isLoading: isLoading || createMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
    error: isError ? (error as Error).message : null,
    loadArtists,
    addArtist,
    editArtist,
    removeArtist,
    searchQuery,
    setSearchQuery,
    sourceFilter,
    setSourceFilter,
    page,
    setPage,
    totalPages: Math.ceil(totalItems / limit),
    totalItems,
    itemsPerPage: limit
  };
}
