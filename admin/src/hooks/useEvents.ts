import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Event, EventStatus } from '@/types';
import { fetchEvents, createEvent, updateEvent, deleteEvent, setPublishStatus } from '@/lib/api';

export function useEvents() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Helper to update URL params
  const updateUrlParams = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchParams, router, pathname]);

  // Read state from URL with defaults
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');
  const searchQuery = searchParams.get('search') || '';
  const cityFilter = searchParams.get('city') || '';
  const statusFilter = (searchParams.get('status') as EventStatus | 'all' | 'drafts' | 'needs_details') || 'all';
  const updatesFilter = (searchParams.get('updates') as 'all' | 'new' | 'updated') || 'all';
  const timeFilter = (searchParams.get('time') as 'upcoming' | 'past' | 'all') || 'upcoming';
  const sourceFilter = searchParams.get('source') || '';

  // Local state for debounced search only (since it's an input)
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);

  // Sync available URL search to local search on mount/change
  useEffect(() => {
    setLocalSearch(searchQuery);
    setDebouncedSearch(searchQuery);
  }, [searchQuery]);

  // Debounce local search changes
  useEffect(() => {
    const handler = setTimeout(() => {
      if (localSearch !== debouncedSearch) {
        setDebouncedSearch(localSearch);
        updateUrlParams({ search: localSearch, page: '1' });
      }
    }, 500);
    return () => clearTimeout(handler);
  }, [localSearch, debouncedSearch, updateUrlParams]);

  // Setters (wrappers around URL updates)
  const setPage = (p: number) => updateUrlParams({ page: p.toString() });
  const setCityFilter = (city: string) => updateUrlParams({ city, page: '1' });
  const setStatusFilter = (status: string) => updateUrlParams({ status, page: '1' });
  const setUpdatesFilter = (updates: string) => updateUrlParams({ updates, page: '1' });
  const setTimeFilter = (time: string) => updateUrlParams({ time, page: '1' });
  const setSourceFilter = (source: string) => updateUrlParams({ source, page: '1' });
  const setSearchQuery = (q: string) => setLocalSearch(q);

  // Query Key Construction
  const queryKey = ['events', {
    page, limit, search: debouncedSearch, city: cityFilter, status: statusFilter,
    updates: updatesFilter, time: timeFilter, source: sourceFilter
  }];

  // FETCH Events using React Query
  const {
    data,
    isLoading,
    isError,
    error,
    refetch
  } = useQuery({
    queryKey,
    queryFn: async () => {
      const OneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      return fetchEvents({
        limit,
        offset: (page - 1) * limit,
        search: debouncedSearch,
        city: cityFilter || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        timeFilter,
        source: sourceFilter || undefined,
        createdAfter: updatesFilter === 'new' ? OneDayAgo : undefined,
        updatedAfter: updatesFilter === 'updated' ? OneDayAgo : undefined
      });
    },
    placeholderData: keepPreviousData, // Smooth pagination
  });

  const events = data?.data || [];
  const totalItems = data?.total || 0;

  // Mutations
  const createMutation = useMutation({
    mutationFn: createEvent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Event> }) => updateEvent(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteEvent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    }
  });

  const statusMutation = useMutation({
    mutationFn: ({ ids, status }: { ids: string[], status: any }) => setPublishStatus(ids, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    }
  });

  // Action Wrappers (Maintain Interface)
  const addEvent = async (data: Partial<Event>) => await createMutation.mutateAsync(data);
  const editEvent = async (id: string, data: Partial<Event>) => await updateMutation.mutateAsync({ id, data });
  const removeEvent = async (id: string) => await deleteMutation.mutateAsync(id);
  const updateStatus = async (ids: string[], status: 'pending' | 'approved' | 'rejected' | EventStatus) =>
    await statusMutation.mutateAsync({ ids, status });

  // Load Events wrapper (refetch) - Memoized
  const loadEvents = useCallback(async () => { await refetch(); }, [refetch]);

  return {
    events,
    filteredEvents: events,
    isLoading,
    error: isError ? (error as Error).message : null,
    loadEvents,
    addEvent,
    editEvent,
    removeEvent,
    updateStatus,
    searchQuery: localSearch,
    setSearchQuery,
    cityFilter,
    setCityFilter,
    statusFilter,
    setStatusFilter,
    updatesFilter,
    setUpdatesFilter,
    timeFilter,
    setTimeFilter,
    sourceFilter,
    setSourceFilter,
    showPastEvents: timeFilter === 'past' || timeFilter === 'all',
    setShowPastEvents: (show: boolean) => setTimeFilter(show ? 'all' : 'upcoming'),
    page,
    setPage,
    totalPages: Math.ceil(totalItems / limit),
    totalItems,
    itemsPerPage: limit
  };
}
