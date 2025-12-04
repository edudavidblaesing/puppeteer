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
  LinkIcon,
  BuildingOfficeIcon,
} from '@heroicons/react/24/outline';
import AdminLayout from '@/components/AdminLayout';
import { Venue, City } from '@/types';
import { fetchAdminVenues, createVenue, updateVenue, deleteVenue, fetchCities } from '@/lib/api';

export default function VenuesPage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize] = useState(50);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    city: '',
    country: '',
    latitude: '',
    longitude: '',
    content_url: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // Load venues
  const loadVenues = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchAdminVenues({
        search: search || undefined,
        city: cityFilter || undefined,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      setVenues(data.data || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Failed to load venues:', err);
    } finally {
      setIsLoading(false);
    }
  }, [search, cityFilter, page, pageSize]);

  // Load cities for filter dropdown
  useEffect(() => {
    fetchCities().then(setCities).catch(console.error);
  }, []);

  useEffect(() => {
    loadVenues();
  }, [loadVenues]);

  // Open modal for new venue
  const handleAdd = () => {
    setEditingVenue(null);
    setFormData({ name: '', address: '', city: '', country: '', latitude: '', longitude: '', content_url: '' });
    setError('');
    setIsModalOpen(true);
  };

  // Open modal for editing
  const handleEdit = (venue: Venue) => {
    setEditingVenue(venue);
    setFormData({
      name: venue.name,
      address: venue.address || '',
      city: venue.city || '',
      country: venue.country || '',
      latitude: venue.latitude?.toString() || '',
      longitude: venue.longitude?.toString() || '',
      content_url: venue.content_url || '',
    });
    setError('');
    setIsModalOpen(true);
  };

  // Save venue
  const handleSave = async () => {
    if (!formData.name.trim()) {
      setError('Name is required');
      return;
    }

    setIsSaving(true);
    setError('');

    const payload = {
      name: formData.name,
      address: formData.address || undefined,
      city: formData.city || undefined,
      country: formData.country || undefined,
      latitude: formData.latitude ? parseFloat(formData.latitude) : undefined,
      longitude: formData.longitude ? parseFloat(formData.longitude) : undefined,
      content_url: formData.content_url || undefined,
    };

    try {
      if (editingVenue) {
        await updateVenue(editingVenue.id, payload);
      } else {
        await createVenue(payload);
      }
      setIsModalOpen(false);
      loadVenues();
    } catch (err: any) {
      setError(err.message || 'Failed to save venue');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete venue
  const handleDelete = async (venue: Venue) => {
    if (!confirm(`Delete venue "${venue.name}"? This cannot be undone.`)) return;

    try {
      await deleteVenue(venue.id);
      loadVenues();
    } catch (err: any) {
      alert(err.message || 'Failed to delete venue');
    }
  };

  const totalPages = Math.ceil(total / pageSize);
  const uniqueCities = [...new Set(cities.map(c => c.name).filter(Boolean))].sort();

  return (
    <AdminLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Venues</h1>
            <p className="text-gray-500">{total.toLocaleString()} venues in database</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadVenues}
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
              Add Venue
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6 flex gap-4">
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search venues..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2 border rounded-lg"
            />
          </div>
          <div className="w-48">
            <select
              value={cityFilter}
              onChange={(e) => { setCityFilter(e.target.value); setPage(1); }}
              className="w-full px-4 py-2 border rounded-lg"
            >
              <option value="">All cities</option>
              {uniqueCities.map(city => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Venue</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Address</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">City</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Coordinates</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Links</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    <ArrowPathIcon className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading...
                  </td>
                </tr>
              ) : venues.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No venues found
                  </td>
                </tr>
              ) : (
                venues.map((venue) => (
                  <tr key={venue.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <BuildingOfficeIcon className="w-5 h-5 text-gray-400" />
                        <span className="font-medium">{venue.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-sm max-w-xs truncate">
                      {venue.address || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {venue.city || '—'}
                      {venue.country && <span className="text-gray-400 ml-1">({venue.country})</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-sm">
                      {venue.latitude && venue.longitude ? (
                        <span className="flex items-center gap-1">
                          <MapPinIcon className="w-4 h-4 text-green-500" />
                          {venue.latitude.toFixed(4)}, {venue.longitude.toFixed(4)}
                        </span>
                      ) : (
                        <span className="text-yellow-600 flex items-center gap-1">
                          <MapPinIcon className="w-4 h-4" />
                          Missing
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {venue.content_url && (
                        <a
                          href={venue.content_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:text-indigo-800"
                        >
                          <LinkIcon className="w-4 h-4" />
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleEdit(venue)}
                        className="p-1 text-gray-500 hover:text-indigo-600 mr-2"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(venue)}
                        className="p-1 text-gray-500 hover:text-red-600"
                      >
                        <TrashIcon className="w-4 h-4" />
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
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">
                {editingVenue ? 'Edit Venue' : 'Add Venue'}
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
                  placeholder="Venue name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Address
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg"
                  placeholder="Full address"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Coordinates will be auto-geocoded from address if not provided
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg"
                    placeholder="Berlin"
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
                    placeholder="Germany"
                  />
                </div>
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
                  Website URL
                </label>
                <input
                  type="url"
                  value={formData.content_url}
                  onChange={(e) => setFormData({ ...formData, content_url: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg"
                  placeholder="https://..."
                />
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
