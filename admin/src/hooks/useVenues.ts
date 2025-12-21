import { useState, useCallback, useEffect } from 'react';
import { Venue } from '@/types';
import { fetchAdminVenues, createVenue, updateVenue, deleteVenue } from '@/lib/api';

export function useVenues() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const loadVenues = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAdminVenues({
        search: debouncedSearch,
        limit,
        offset: (page - 1) * limit,
        source: sourceFilter
      });
      setVenues(data.data || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to load venues');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, debouncedSearch, sourceFilter]);

  // Auto-load
  useEffect(() => {
    loadVenues();
  }, [loadVenues]);

  const addVenue = useCallback(async (data: Partial<Venue>) => {
    try {
      if (!data.name) throw new Error('Name is required');
      const newVenue = await createVenue(data as any);
      loadVenues();
      return newVenue;
    } catch (err: any) {
      throw new Error(err.message || 'Failed to create venue');
    }
  }, [loadVenues]);

  const editVenue = useCallback(async (id: string, data: Partial<Venue>) => {
    try {
      const updatedVenue = await updateVenue(id, data);
      setVenues(prev => prev.map(v => v.id === id ? { ...v, ...updatedVenue } : v));
      return updatedVenue;
    } catch (err: any) {
      throw new Error(err.message || 'Failed to update venue');
    }
  }, []);

  const removeVenue = useCallback(async (id: string) => {
    try {
      await deleteVenue(id);
      loadVenues();
    } catch (err: any) {
      throw new Error(err.message || 'Failed to delete venue');
    }
  }, [loadVenues]);

  return {
    venues,
    total,
    isLoading,
    error,
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
