import { useState, useCallback } from 'react';
import { Organizer } from '@/types';
import { fetchOrganizers, createOrganizer, updateOrganizer, deleteOrganizer } from '@/lib/api';

export function useOrganizers() {
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOrganizers = useCallback(async (params?: { search?: string; limit?: number; offset?: number }) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchOrganizers(params);
      setOrganizers(data.data || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to load organizers');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addOrganizer = useCallback(async (data: Partial<Organizer>) => {
    try {
      const newOrganizer = await createOrganizer(data);
      setOrganizers(prev => [newOrganizer, ...prev]);
      return newOrganizer;
    } catch (err: any) {
      throw new Error(err.message || 'Failed to create organizer');
    }
  }, []);

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
      setOrganizers(prev => prev.filter(o => o.id !== id));
    } catch (err: any) {
      throw new Error(err.message || 'Failed to delete organizer');
    }
  }, []);

  const [searchQuery, setSearchQuery] = useState('');

  const filteredOrganizers = organizers.filter(org =>
    org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (org.description || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return {
    organizers,
    filteredOrganizers, // Export filtered list
    searchQuery,
    setSearchQuery,
    total,
    isLoading,
    error,
    loadOrganizers,
    addOrganizer,
    editOrganizer,
    removeOrganizer,
  };
}
