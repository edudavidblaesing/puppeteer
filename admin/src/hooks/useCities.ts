import { useState, useCallback, useEffect, useMemo } from 'react';
import { City } from '@/types';
import { fetchAdminCities, createCity, updateCity, deleteCity } from '@/lib/api';

export function useCities() {
  const [cities, setCities] = useState<City[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');

  const loadCities = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchAdminCities({ limit: 1000 });
      setCities(response.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load cities');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addCity = useCallback(async (data: any) => {
    try {
      const newCity = await createCity(data);
      setCities(prev => [...prev, newCity]);
      return newCity;
    } catch (err: any) {
      throw new Error(err.message || 'Failed to create city');
    }
  }, []);

  const editCity = useCallback(async (id: string | number, data: any) => {
    try {
      const idStr = id.toString();
      const updatedCity = await updateCity(idStr, data);
      setCities(prev => prev.map(c => c.id?.toString() === idStr ? { ...c, ...updatedCity } : c));
      return updatedCity;
    } catch (err: any) {
      throw new Error(err.message || 'Failed to update city');
    }
  }, []);

  const removeCity = useCallback(async (id: string | number) => {
    try {
      const idStr = id.toString();
      await deleteCity(idStr);
      setCities(prev => prev.filter(c => c.id?.toString() !== idStr));
    } catch (err: any) {
      throw new Error(err.message || 'Failed to delete city');
    }
  }, []);

  // Derived state
  const filteredCities = useMemo(() => {
    return cities.filter(city => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return city.name.toLowerCase().includes(query);
      }
      return true;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [cities, searchQuery]);

  return {
    cities,
    filteredCities,
    isLoading,
    error,
    loadCities,
    addCity,
    editCity,
    removeCity,
    searchQuery,
    setSearchQuery
  };
}
