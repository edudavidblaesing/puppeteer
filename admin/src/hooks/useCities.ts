import { useState, useCallback, useEffect, useMemo } from 'react';
import { City } from '@/types';
import { fetchAdminCities, createCity, updateCity, deleteCity } from '@/lib/api';

export function useCities() {
  const [cities, setCities] = useState<City[]>([]);
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

  const loadCities = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchAdminCities({
        search: debouncedSearch,
        limit,
        offset: (page - 1) * limit,
        source: sourceFilter
      });
      setCities(response.data || []);
      setTotalItems(response.total || 0); // Assuming API returns total
    } catch (err: any) {
      setError(err.message || 'Failed to load cities');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, debouncedSearch, sourceFilter]);

  // Auto-load
  useEffect(() => {
    loadCities();
  }, [loadCities]);

  const addCity = useCallback(async (data: any) => {
    try {
      const newCity = await createCity(data);
      loadCities();
      return newCity;
    } catch (err: any) {
      throw new Error(err.message || 'Failed to create city');
    }
  }, [loadCities]);

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
      loadCities();
    } catch (err: any) {
      throw new Error(err.message || 'Failed to delete city');
    }
  }, [loadCities]);

  return {
    cities,
    filteredCities: cities, // Main list is filtered
    isLoading,
    error,
    loadCities,
    addCity,
    editCity,
    removeCity,
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
