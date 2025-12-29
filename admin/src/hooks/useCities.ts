import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { City } from '@/types';
import { fetchAdminCities, createCity, updateCity, deleteCity } from '@/lib/api';

export function useCities() {
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
  const queryKey = ['cities', { page, limit, search: debouncedSearch, source: sourceFilter }];

  // Fetch Cities
  const {
    data,
    isLoading,
    isError,
    error,
    refetch
  } = useQuery({
    queryKey,
    queryFn: async () => {
      return fetchAdminCities({
        search: debouncedSearch,
        limit,
        offset: (page - 1) * limit,
        source: sourceFilter
      });
    },
    placeholderData: keepPreviousData,
  });

  const cities = data?.data || [];
  const totalItems = data?.total || 0;

  // Mutations
  const createMutation = useMutation({
    mutationFn: createCity,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cities'] });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateCity(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cities'] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCity(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cities'] });
    }
  });

  // Action Wrappers
  const addCity = useCallback(async (data: any) => {
    return createMutation.mutateAsync(data);
  }, [createMutation]);

  const editCity = useCallback(async (id: string | number, data: any) => {
    return updateMutation.mutateAsync({ id: id.toString(), data });
  }, [updateMutation]);

  const removeCity = useCallback(async (id: string | number) => {
    return deleteMutation.mutateAsync(id.toString());
  }, [deleteMutation]);

  const loadCities = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    cities,
    filteredCities: cities,
    isLoading: isLoading || createMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
    error: isError ? (error as Error).message : null,
    loadCities,
    addCity,
    editCity,
    removeCity,
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
