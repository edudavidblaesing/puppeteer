'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  LayoutDashboard,
  Calendar,
  MapPin,
  RefreshCw,
  Eye,
  EyeOff,
  Trash2,
  Download,
  Filter,
  ChevronLeft,
  ChevronRight,
  Search,
  Settings,
  Database,
  Users,
  Building2,
  BarChart3,
} from 'lucide-react';
import { format } from 'date-fns';
import clsx from 'clsx';
import EventTable from '@/components/EventTable';
import EventModal from '@/components/EventModal';
import { Event, Stats } from '@/types';
import {
  fetchEvents,
  fetchStats,
  deleteEvent,
  syncEvents,
  fetchEnrichStats,
  enrichVenues,
  enrichArtists,
} from '@/lib/api';

// Dynamic import for map (client-side only)
const EventMap = dynamic(() => import('@/components/EventMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-gray-100 rounded-lg">
      <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
    </div>
  ),
});

const CITIES = ['Berlin', 'Hamburg', 'London', 'Paris', 'Amsterdam', 'Barcelona'];

export default function AdminDashboard() {
  const [view, setView] = useState<'table' | 'map' | 'split'>('split');
  const [events, setEvents] = useState<Event[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [enrichStats, setEnrichStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);

  // Filters
  const [cityFilter, setCityFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [total, setTotal] = useState(0);

  // Load data
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [eventsData, statsData, enrichData] = await Promise.all([
        fetchEvents({
          city: cityFilter || undefined,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
        fetchStats(),
        fetchEnrichStats(),
      ]);

      setEvents(eventsData.data);
      setTotal(eventsData.total);
      setStats(statsData);
      setEnrichStats(enrichData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [cityFilter, page, pageSize]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter events locally for search and status
  const filteredEvents = events.filter((event) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        event.title.toLowerCase().includes(query) ||
        event.venue_name?.toLowerCase().includes(query) ||
        event.artists?.toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }

    if (statusFilter === 'published' && !event.is_published) return false;
    if (statusFilter === 'draft' && event.is_published) return false;

    return true;
  });

  // Selection handlers
  const handleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredEvents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredEvents.map((e) => e.id)));
    }
  };

  // Bulk actions
  const handleBulkPublish = async (publish: boolean) => {
    // In production, call API to update publish status
    const updatedEvents = events.map((e) =>
      selectedIds.has(e.id) ? { ...e, is_published: publish } : e
    );
    setEvents(updatedEvents);
    setSelectedIds(new Set());
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} events?`)) return;

    const idsToDelete = Array.from(selectedIds);
    for (const id of idsToDelete) {
      try {
        await deleteEvent(id);
      } catch (error) {
        console.error(`Failed to delete ${id}:`, error);
      }
    }
    setSelectedIds(new Set());
    loadData();
  };

  // Single event actions
  const handleEdit = (event: Event) => {
    setSelectedEvent(event);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this event?')) return;
    try {
      await deleteEvent(id);
      loadData();
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  const handlePublish = async (id: string, publish: boolean) => {
    // In production, call API
    const updatedEvents = events.map((e) =>
      e.id === id ? { ...e, is_published: publish } : e
    );
    setEvents(updatedEvents);
  };

  const handleSave = async (id: string, data: Partial<Event>) => {
    // In production, call API to update event
    const updatedEvents = events.map((e) => (e.id === id ? { ...e, ...data } : e));
    setEvents(updatedEvents);
  };

  // Sync from source
  const handleSync = async (city: string) => {
    setIsSyncing(true);
    try {
      const result = await syncEvents(city, 200);
      alert(`Synced ${result.fetched} events (${result.inserted} new, ${result.updated} updated)`);
      loadData();
    } catch (error) {
      console.error('Sync failed:', error);
      alert('Failed to sync events');
    } finally {
      setIsSyncing(false);
    }
  };

  // Enrich data
  const handleEnrich = async (type: 'venues' | 'artists') => {
    setIsEnriching(true);
    try {
      const result =
        type === 'venues' ? await enrichVenues(100) : await enrichArtists(200);
      alert(`Enriched ${result.saved} ${type}`);
      loadData();
    } catch (error) {
      console.error('Enrich failed:', error);
      alert(`Failed to enrich ${type}`);
    } finally {
      setIsEnriching(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              <LayoutDashboard className="w-8 h-8 text-primary-600" />
              <h1 className="ml-2 text-xl font-bold text-gray-900">Events Admin</h1>
            </div>

            {/* Stats badges */}
            {stats && (
              <div className="hidden md:flex items-center space-x-4 ml-8">
                <div className="flex items-center text-sm text-gray-600">
                  <Calendar className="w-4 h-4 mr-1" />
                  <span className="font-semibold">{stats.total_events}</span> events
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <Building2 className="w-4 h-4 mr-1" />
                  <span className="font-semibold">{stats.venues}</span> venues
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <MapPin className="w-4 h-4 mr-1" />
                  <span className="font-semibold">{stats.cities}</span> cities
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-3">
            {/* View Toggle */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setView('table')}
                className={clsx(
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                  view === 'table' ? 'bg-white shadow text-gray-900' : 'text-gray-600'
                )}
              >
                Table
              </button>
              <button
                onClick={() => setView('map')}
                className={clsx(
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                  view === 'map' ? 'bg-white shadow text-gray-900' : 'text-gray-600'
                )}
              >
                Map
              </button>
              <button
                onClick={() => setView('split')}
                className={clsx(
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                  view === 'split' ? 'bg-white shadow text-gray-900' : 'text-gray-600'
                )}
              >
                Split
              </button>
            </div>

            <button
              onClick={() => loadData()}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              title="Refresh"
            >
              <RefreshCw className={clsx('w-5 h-5', isLoading && 'animate-spin')} />
            </button>
          </div>
        </div>
      </header>

      {/* Toolbar */}
      <div className="bg-white border-b px-6 py-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Left: Filters */}
          <div className="flex items-center space-x-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 border rounded-lg text-sm w-64 focus:ring-2 focus:ring-primary-500"
              />
            </div>

            {/* City filter */}
            <select
              value={cityFilter}
              onChange={(e) => {
                setCityFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            >
              <option value="">All Cities</option>
              {CITIES.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>

            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Status</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center space-x-2">
            {/* Bulk actions */}
            {selectedIds.size > 0 && (
              <div className="flex items-center space-x-2 pr-4 border-r">
                <span className="text-sm text-gray-600">{selectedIds.size} selected</span>
                <button
                  onClick={() => handleBulkPublish(true)}
                  className="px-3 py-1.5 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 flex items-center"
                >
                  <Eye className="w-4 h-4 mr-1" />
                  Publish
                </button>
                <button
                  onClick={() => handleBulkPublish(false)}
                  className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center"
                >
                  <EyeOff className="w-4 h-4 mr-1" />
                  Unpublish
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 flex items-center"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete
                </button>
              </div>
            )}

            {/* Sync dropdown */}
            <div className="relative group">
              <button
                disabled={isSyncing}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 flex items-center disabled:opacity-50"
              >
                <Download className="w-4 h-4 mr-1" />
                {isSyncing ? 'Syncing...' : 'Sync Events'}
              </button>
              <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                {CITIES.slice(0, 4).map((city) => (
                  <button
                    key={city}
                    onClick={() => handleSync(city)}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
                  >
                    Sync {city}
                  </button>
                ))}
              </div>
            </div>

            {/* Enrich dropdown */}
            <div className="relative group">
              <button
                disabled={isEnriching}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 flex items-center disabled:opacity-50"
              >
                <Database className="w-4 h-4 mr-1" />
                {isEnriching ? 'Enriching...' : 'Enrich'}
              </button>
              <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <button
                  onClick={() => handleEnrich('venues')}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 rounded-t-lg flex items-center"
                >
                  <Building2 className="w-4 h-4 mr-2" />
                  Enrich Venues
                  {enrichStats && (
                    <span className="ml-auto text-xs text-gray-500">
                      {enrichStats.venues_missing} missing
                    </span>
                  )}
                </button>
                <button
                  onClick={() => handleEnrich('artists')}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 rounded-b-lg flex items-center"
                >
                  <Users className="w-4 h-4 mr-2" />
                  Enrich Artists
                  {enrichStats && (
                    <span className="ml-auto text-xs text-gray-500">
                      {enrichStats.artists_missing} missing
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="p-6">
        <div
          className={clsx(
            'grid gap-6',
            view === 'split' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
          )}
        >
          {/* Table View */}
          {(view === 'table' || view === 'split') && (
            <div className={clsx(view === 'split' && 'lg:order-1')}>
              <EventTable
                events={filteredEvents}
                selectedIds={selectedIds}
                onSelect={handleSelect}
                onSelectAll={handleSelectAll}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onPublish={handlePublish}
                isLoading={isLoading}
              />

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-gray-600">
                    Showing {(page - 1) * pageSize + 1} to{' '}
                    {Math.min(page * pageSize, total)} of {total} events
                  </p>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setPage(page - 1)}
                      disabled={page === 1}
                      className="p-2 rounded-lg border hover:bg-gray-50 disabled:opacity-50"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="text-sm text-gray-600">
                      Page {page} of {totalPages}
                    </span>
                    <button
                      onClick={() => setPage(page + 1)}
                      disabled={page === totalPages}
                      className="p-2 rounded-lg border hover:bg-gray-50 disabled:opacity-50"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Map View */}
          {(view === 'map' || view === 'split') && (
            <div
              className={clsx(
                'bg-white rounded-lg shadow overflow-hidden relative',
                view === 'map' ? 'h-[calc(100vh-220px)]' : 'h-[600px]',
                view === 'split' && 'lg:order-2'
              )}
              style={{ zIndex: 1 }}
            >
              <EventMap
                events={filteredEvents}
                selectedCity={cityFilter}
                onCityChange={(city) => {
                  setCityFilter(city);
                  setPage(1);
                }}
                onEventClick={(event) => {
                  setSelectedEvent(event);
                  setIsModalOpen(true);
                }}
              />
            </div>
          )}
        </div>
      </main>

      {/* Edit Modal */}
      <EventModal
        event={selectedEvent}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedEvent(null);
        }}
        onSave={handleSave}
      />
    </div>
  );
}
