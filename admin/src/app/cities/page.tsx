'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  MagnifyingGlassIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MapPinIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import AdminLayout from '@/components/AdminLayout';
import { City } from '@/types';
import { fetchAdminCities, createCity, updateCity, deleteCity } from '@/lib/api';

export default function CitiesPage() {
  const [cities, setCities] = useState<City[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize] = useState(50);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCity, setEditingCity] = useState<City | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    country: '',
    latitude: '',
    longitude: '',
    timezone: '',
    is_active: true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // Load cities
  const loadCities = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchAdminCities({
        search: search || undefined,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      setCities(data.data || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Failed to load cities:', err);
    } finally {
      setIsLoading(false);
    }
  }, [search, page, pageSize]);

  useEffect(() => {
    loadCities();
  }, [loadCities]);

  // Open modal for new city
  const handleAdd = () => {
    setEditingCity(null);
    setFormData({ name: '', country: '', latitude: '', longitude: '', timezone: '', is_active: true });
    setError('');
    setIsModalOpen(true);
  };

  // Open modal for editing
  const handleEdit = (city: City) => {
    setEditingCity(city);
    setFormData({
      name: city.name,
      country: city.country || '',
      latitude: city.latitude?.toString() || '',
      longitude: city.longitude?.toString() || '',
      timezone: city.timezone || '',
      is_active: city.is_active !== false,
    });
    setError('');
    setIsModalOpen(true);
  };

  // Save city
  const handleSave = async () => {
    if (!formData.name.trim()) {
      setError('Name is required');
      return;
    }

    setIsSaving(true);
    setError('');

    const payload = {
      name: formData.name,
      country: formData.country || undefined,
      latitude: formData.latitude ? parseFloat(formData.latitude) : undefined,
      longitude: formData.longitude ? parseFloat(formData.longitude) : undefined,
      timezone: formData.timezone || undefined,
      is_active: formData.is_active,
    };

    try {
      if (editingCity && editingCity.id) {
        await updateCity(editingCity.id.toString(), payload);
      } else {
        await createCity(payload);
      }
      setIsModalOpen(false);
      loadCities();
    } catch (err: any) {
      setError(err.message || 'Failed to save city');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete city
  const handleDelete = async (city: City) => {
    if (!confirm(`Delete city "${city.name}"? This cannot be undone.`)) return;

    try {
      if (city.id) {
        await deleteCity(city.id.toString());
        loadCities();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete city');
    }
  };

  // Toggle active status
  const handleToggleActive = async (city: City) => {
    try {
      if (city.id) {
        await updateCity(city.id.toString(), { is_active: !city.is_active });
        loadCities();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to update city');
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <AdminLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Cities</h1>
            <p className="text-gray-500">{total.toLocaleString()} cities in database</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadCities}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2"
            >
              <ArrowPathIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={handleAdd}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
            >
              <PlusIcon className="w-4 h-4" />
              Add City
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="relative">
            <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search cities..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2 border rounded-lg"
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">City</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Country</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Coordinates</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Timezone</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Events</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Venues</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    <ArrowPathIcon className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading...
                  </td>
                </tr>
              ) : cities.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    No cities found
                  </td>
                </tr>
              ) : (
                cities.map((city) => (
                  <tr key={city.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{city.name}</td>
                    <td className="px-4 py-3 text-gray-600">{city.country || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 text-sm">
                      {city.latitude && city.longitude ? (
                        <span className="flex items-center gap-1">
                          <MapPinIcon className="w-4 h-4" />
                          {city.latitude.toFixed(4)}, {city.longitude.toFixed(4)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-sm">{city.timezone || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-sm">
                        {city.event_count || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded text-sm">
                        {city.venue_count || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggleActive(city)}
                        className={`px-2 py-1 rounded text-sm ${
                          city.is_active !== false
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {city.is_active !== false ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleEdit(city)}
                        className="p-1 text-gray-500 hover:text-indigo-600 mr-2"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(city)}
                        className="p-1 text-gray-500 hover:text-red-600"
                        disabled={city.event_count > 0 || city.venue_count > 0}
                        title={city.event_count > 0 || city.venue_count > 0 ? 'Cannot delete: has events or venues' : ''}
                      >
                        <TrashIcon className={`w-4 h-4 ${city.event_count > 0 || city.venue_count > 0 ? 'opacity-30' : ''}`} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t flex items-center justify-between bg-gray-50">
              <p className="text-sm text-gray-600">
                Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1 rounded hover:bg-gray-200 disabled:opacity-50"
                >
                  <ChevronLeftIcon className="w-5 h-5" />
                </button>
                <span className="text-sm">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1 rounded hover:bg-gray-200 disabled:opacity-50"
                >
                  <ChevronRightIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">
                {editingCity ? 'Edit City' : 'Add City'}
              </h2>
              <button onClick={() => setIsModalOpen(false)}>
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 text-red-600 px-4 py-2 rounded">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg"
                  placeholder="City name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Country
                </label>
                <input
                  type="text"
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg"
                  placeholder="e.g., Germany"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Latitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={formData.latitude}
                    onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg"
                    placeholder="52.52"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Longitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={formData.longitude}
                    onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg"
                    placeholder="13.405"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Timezone
                </label>
                <input
                  type="text"
                  value={formData.timezone}
                  onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg"
                  placeholder="e.g., Europe/Berlin"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded"
                />
                <label htmlFor="is_active" className="text-sm text-gray-700">
                  Active (show in city list)
                </label>
              </div>
            </div>

            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-2">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
