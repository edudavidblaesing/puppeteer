import { useState, useCallback, useEffect } from 'react';
import { Organizer } from '@/types';
import { fetchOrganizers, createOrganizer, updateOrganizer, deleteOrganizer } from '@/lib/api';

export function useOrganizers() {
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const loadOrganizers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchOrganizers({
        search: debouncedSearch,
        limit,
        offset: (page - 1) * limit,
        source: sourceFilter
      });
      setOrganizers(data.data || []);
      setTotalItems(data.total || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to load organizers');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, debouncedSearch, sourceFilter]);

  // Auto-load
  useEffect(() => {
    loadOrganizers();
  }, [loadOrganizers]);

  const addOrganizer = useCallback(async (data: Partial<Organizer>) => {
    try {
      const newOrganizer = await createOrganizer(data);
      loadOrganizers();
      return newOrganizer;
    } catch (err: any) {
      throw new Error(err.message || 'Failed to create organizer');
    }
  }, [loadOrganizers]);

  const editOrganizer = useCallback(async (id: string, data: Partial<Organizer>) => {
    try {
      const updatedOrganizer = await updateOrganizer(id, data);
      setOrganizers(prev => prev.map(o => o.id === id ? { ...o, ...updatedOrganizer } : o));
      return updatedOrganizer;
    } catch (err: any) {
      throw new Error(err.message || 'Failed to update organizer');
    }
  }, []);

  const removeOrganizer = useCallback(async (id: string) => {
    try {
      await deleteOrganizer(id);
      loadOrganizers();
    } catch (err: any) {
      throw new Error(err.message || 'Failed to delete organizer');
    }
  }, [loadOrganizers]);

  return {
    organizers,
    filteredOrganizers: organizers, // Main list is filtered
    searchQuery,
    setSearchQuery,
    sourceFilter,
    setSourceFilter,
    total: totalItems,
    isLoading,
    error,
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
