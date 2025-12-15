import { useState, useCallback, useEffect, useMemo } from 'react';
import { Event, EventType } from '@/types';
import { fetchEvents, createEvent, updateEvent, deleteEvent, setPublishStatus } from '@/lib/api';

export function useEvents() {
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [showPastEvents, setShowPastEvents] = useState(false);

  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchEvents({ showPast: showPastEvents });
      setEvents(response.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load events');
    } finally {
      setIsLoading(false);
    }
  }, [showPastEvents]);

  const addEvent = useCallback(async (data: Partial<Event>) => {
    try {
      const newEvent = await createEvent(data);
      setEvents(prev => [...prev, newEvent]);
      return newEvent;
    } catch (err: any) {
      throw new Error(err.message || 'Failed to create event');
    }
  }, []);

  const editEvent = useCallback(async (id: string, data: Partial<Event>) => {
    try {
      const updatedEvent = await updateEvent(id, data);
      setEvents(prev => prev.map(e => e.id === id ? { ...e, ...updatedEvent } : e));
      return updatedEvent;
    } catch (err: any) {
      throw new Error(err.message || 'Failed to update event');
    }
  }, []);

  const removeEvent = useCallback(async (id: string) => {
    try {
      await deleteEvent(id);
      setEvents(prev => prev.filter(e => e.id !== id));
    } catch (err: any) {
      throw new Error(err.message || 'Failed to delete event');
    }
  }, []);

  const updateStatus = useCallback(async (ids: string[], status: 'pending' | 'approved' | 'rejected') => {
    try {
      await setPublishStatus(ids, status);
      setEvents(prev => prev.map(e => ids.includes(e.id) ? { ...e, publish_status: status } : e));
    } catch (err: any) {
      throw new Error(err.message || 'Failed to update status');
    }
  }, []);

  // Derived state
  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          event.title?.toLowerCase().includes(query) ||
          event.venue_name?.toLowerCase().includes(query) ||
          event.description?.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      // City filter
      if (cityFilter && event.venue_city !== cityFilter) return false;

      // Status filter
      if (statusFilter !== 'all' && event.publish_status !== statusFilter) return false;

      // Past events filter
      if (!showPastEvents && event.date) {
        const eventDate = new Date(event.date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (eventDate < today) return false;
      }

      return true;
    });
  }, [events, searchQuery, cityFilter, statusFilter, showPastEvents]);

  return {
    events,
    filteredEvents,
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
    showPastEvents,
    setShowPastEvents
  };
}
