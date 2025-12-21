import { useState, useCallback, useEffect, useMemo } from 'react';
import { Event, EventType } from '@/types';
import { fetchEvents, createEvent, updateEvent, deleteEvent, setPublishStatus } from '@/lib/api';

export function useEvents() {
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pagination State
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [totalItems, setTotalItems] = useState(0);

  // Filters
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [updatesFilter, setUpdatesFilter] = useState<'all' | 'new' | 'updated'>('all');
  const [timeFilter, setTimeFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [sourceFilter, setSourceFilter] = useState('');

  // Debounced Search state
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1); // Reset to page 1 on search change
    }, 500);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Reset page when other filters change
  useEffect(() => {
    setPage(1);
  }, [cityFilter, statusFilter, updatesFilter, timeFilter, sourceFilter]);

  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const OneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const response = await fetchEvents({
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

      setEvents(response.data || []);
      setTotalItems(response.total || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to load events');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, debouncedSearch, cityFilter, statusFilter, updatesFilter, timeFilter, sourceFilter]);

  // Auto-load on dependency changes
  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const addEvent = useCallback(async (data: Partial<Event>) => {
    try {
      const newEvent = await createEvent(data);
      loadEvents(); // Reload to respect sort order/pagination
      return newEvent;
    } catch (err: any) {
      throw new Error(err.message || 'Failed to create event');
    }
  }, [loadEvents]);

  const editEvent = useCallback(async (id: string, data: Partial<Event>) => {
    try {
      const updatedEvent = await updateEvent(id, data);
      // Optimistic update
      setEvents(prev => prev.map(e => e.id === id ? { ...e, ...updatedEvent } : e));
      return updatedEvent;
    } catch (err: any) {
      throw new Error(err.message || 'Failed to update event');
    }
  }, []);

  const removeEvent = useCallback(async (id: string) => {
    try {
      await deleteEvent(id);
      loadEvents(); // Reload to refresh list
    } catch (err: any) {
      throw new Error(err.message || 'Failed to delete event');
    }
  }, [loadEvents]);

  const updateStatus = useCallback(async (ids: string[], status: 'pending' | 'approved' | 'rejected') => {
    try {
      await setPublishStatus(ids, status);
      // Optimistic update
      setEvents(prev => prev.map(e => ids.includes(e.id) ? { ...e, publish_status: status } : e));
    } catch (err: any) {
      throw new Error(err.message || 'Failed to update status');
    }
  }, []);

  return {
    events,
    filteredEvents: events, // Backwards compatibility: "filtered" is just current page events now
    isLoading,
    error,
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
    // Legacy support mapping
    showPastEvents: timeFilter === 'past' || timeFilter === 'all',
    setShowPastEvents: (show: boolean) => setTimeFilter(show ? 'all' : 'upcoming'),
    page,
    setPage,
    totalPages: Math.ceil(totalItems / limit),
    totalItems,
    itemsPerPage: limit
  };
}
