import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Event, EventStatus } from '@/types';
import { fetchEvents, createEvent, updateEvent, deleteEvent, setPublishStatus } from '@/lib/api';

export function useEvents() {
  const queryClient = useQueryClient();

  // Pagination State
  const [page, setPage] = useState(1);
  const [limit] = useState(50);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'drafts' | 'pending' | 'approved' | 'rejected' | EventStatus>('all');
  const [updatesFilter, setUpdatesFilter] = useState<'all' | 'new' | 'updated'>('all');
  const [timeFilter, setTimeFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [sourceFilter, setSourceFilter] = useState('');

  // Debounced Search state
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Reset page when other filters change
  useEffect(() => {
    setPage(1);
  }, [cityFilter, statusFilter, updatesFilter, timeFilter, sourceFilter]);

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

  // Load Events wrapper (refetch)
  const loadEvents = async () => { await refetch(); };

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
    searchQuery,
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
