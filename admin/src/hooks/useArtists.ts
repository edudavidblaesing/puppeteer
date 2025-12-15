import { useState, useCallback, useEffect, useMemo } from 'react';
import { Artist } from '@/types';
import { fetchArtists, createArtist, updateArtist, deleteArtist } from '@/lib/api';

export function useArtists() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');

  const loadArtists = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchArtists({ limit: 1000 });
      setArtists(response.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load artists');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addArtist = useCallback(async (data: any) => {
    try {
      const newArtist = await createArtist(data);
      setArtists(prev => [...prev, newArtist]);
      return newArtist;
    } catch (err: any) {
      throw new Error(err.message || 'Failed to create artist');
    }
  }, []);

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
      setArtists(prev => prev.filter(a => a.id !== id));
    } catch (err: any) {
      throw new Error(err.message || 'Failed to delete artist');
    }
  }, []);

  // Derived state
  const filteredArtists = useMemo(() => {
    return artists.filter(artist => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return artist.name.toLowerCase().includes(query);
      }
      return true;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [artists, searchQuery]);

  return {
    artists,
    filteredArtists,
    isLoading,
    error,
    loadArtists,
    addArtist,
    editArtist,
    removeArtist,
    searchQuery,
    setSearchQuery
  };
}
