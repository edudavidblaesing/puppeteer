import { useState, useCallback } from 'react';
import { Venue } from '@/types';
import { fetchAdminVenues, createVenue, updateVenue, deleteVenue } from '@/lib/api';

export function useVenues() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadVenues = useCallback(async (params?: { search?: string; limit?: number; offset?: number }) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAdminVenues(params);
      setVenues(data.data || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to load venues');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addVenue = useCallback(async (data: Partial<Venue>) => {
    try {
      if (!data.name) throw new Error('Name is required');
      const newVenue = await createVenue(data as any);
      setVenues(prev => [newVenue, ...prev]);
      return newVenue;
    } catch (err: any) {
      throw new Error(err.message || 'Failed to create venue');
    }
  }, []);

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
      setVenues(prev => prev.filter(v => v.id !== id));
    } catch (err: any) {
      throw new Error(err.message || 'Failed to delete venue');
    }
  }, []);

  return {
    venues,
    total,
    isLoading,
    error,
    loadVenues,
    addVenue,
    editVenue,
    removeVenue,
  };
}
