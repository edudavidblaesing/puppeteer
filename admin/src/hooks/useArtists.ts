import { useState, useCallback, useEffect, useMemo } from 'react';
import { Artist } from '@/types';
import { fetchArtists, createArtist, updateArtist, deleteArtist } from '@/lib/api';

export function useArtists() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pagination State
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [totalItems, setTotalItems] = useState(0);

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

  const loadArtists = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchArtists({
        search: debouncedSearch,
        limit,
        offset: (page - 1) * limit,
        source: sourceFilter
      });
      setArtists(response.data || []);
      setTotalItems(response.total || 0); // Assuming API returns total
    } catch (err: any) {
      setError(err.message || 'Failed to load artists');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, debouncedSearch, sourceFilter]);

  // Auto-load
  useEffect(() => {
    loadArtists();
  }, [loadArtists]);

  const addArtist = useCallback(async (data: any) => {
    try {
      const newArtist = await createArtist(data);
      loadArtists();
      return newArtist;
    } catch (err: any) {
      throw new Error(err.message || 'Failed to create artist');
    }
  }, [loadArtists]);

  const editArtist = useCallback(async (id: string, data: any) => {
    try {
      const updatedArtist = await updateArtist(id, data);
      setArtists(prev => prev.map(a => a.id === id ? { ...a, ...updatedArtist } : a));
      return updatedArtist;
    } catch (err: any) {
      throw new Error(err.message || 'Failed to update artist');
    }
  }, []);

  const removeArtist = useCallback(async (id: string) => {
    try {
      await deleteArtist(id);
      loadArtists();
    } catch (err: any) {
      throw new Error(err.message || 'Failed to delete artist');
    }
  }, [loadArtists]);

  return {
    artists,
    filteredArtists: artists, // Main list is now filtered
    isLoading,
    error,
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
