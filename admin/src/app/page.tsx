'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  Calendar,
  MapPin,
  RefreshCw,
  Eye,
  EyeOff,
  Trash2,
  Download,
  ChevronLeft,
  ChevronRight,
  Search,
  Database,
  Users,
  Building2,
  X,
  Plus,
  Check,
  ExternalLink,
  Music,
  Globe,
  Zap,
  Link2,
  CloudDownload,
  Layers,
} from 'lucide-react';
import { format } from 'date-fns';
import clsx from 'clsx';
import { Event, Stats, City, Venue, Artist } from '@/types';
import {
  fetchEvents,
  fetchStats,
  deleteEvent,
  updateEvent,
  publishEvents,
  syncEvents,
  fetchEnrichStats,
  enrichVenues,
  enrichArtists,
  fetchCities,
  fetchArtists,
  createArtist,
  updateArtist,
  deleteArtist,
  fetchAdminCities,
  createCity,
  updateCity,
  deleteCity,
  fetchAdminVenues,
  createVenue,
  updateVenue,
  deleteVenue,
  scrapeEvents,
  runMatching,
  fetchScrapeStats,
  fetchScrapedEvents,
  fetchUnifiedEvents,
  fetchUnifiedEvent,
  updateUnifiedEvent,
  fetchScrapedVenues,
  fetchUnifiedVenues,
  fetchUnifiedVenue,
  updateUnifiedVenue,
  fetchScrapedArtists,
  fetchUnifiedArtists,
  fetchUnifiedArtist,
  updateUnifiedArtist,
  deduplicateEvents,
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

type ActiveTab = 'events' | 'artists' | 'venues' | 'cities' | 'scrape';
type ViewMode = 'split' | 'list' | 'map';
type DataSource = 'original' | 'unified' | 'scraped';

export default function AdminDashboard() {
  // Main state
  const [activeTab, setActiveTab] = useState<ActiveTab>('events');
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [dataSource, setDataSource] = useState<DataSource>('original');

  // Events state
  const [events, setEvents] = useState<Event[]>([]);
  const [unifiedEvents, setUnifiedEvents] = useState<any[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [enrichStats, setEnrichStats] = useState<any>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSyncing, setIsSyncing] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);

  // Artists state
  const [artists, setArtists] = useState<Artist[]>([]);
  const [artistsTotal, setArtistsTotal] = useState(0);
  const [unifiedArtists, setUnifiedArtists] = useState<any[]>([]);
  const [unifiedArtistsTotal, setUnifiedArtistsTotal] = useState(0);
  const [scrapedArtists, setScrapedArtists] = useState<any[]>([]);
  const [scrapedArtistsTotal, setScrapedArtistsTotal] = useState(0);

  // Venues state
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venuesTotal, setVenuesTotal] = useState(0);
  const [unifiedVenues, setUnifiedVenues] = useState<any[]>([]);
  const [unifiedVenuesTotal, setUnifiedVenuesTotal] = useState(0);
  const [scrapedVenues, setScrapedVenues] = useState<any[]>([]);
  const [scrapedVenuesTotal, setScrapedVenuesTotal] = useState(0);

  // Cities state
  const [adminCities, setAdminCities] = useState<City[]>([]);
  const [citiesTotal, setCitiesTotal] = useState(0);

  // Scrape state
  const [scrapeStats, setScrapeStats] = useState<any>(null);
  const [scrapedEvents, setScrapedEvents] = useState<any[]>([]);
  const [scrapeCity, setScrapeCity] = useState('berlin');
  const [scrapeSources, setScrapeSources] = useState<string[]>(['ra', 'ticketmaster']);
  const [isScraping, setIsScraping] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<any>(null);

  // Filters
  const [cityFilter, setCityFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [total, setTotal] = useState(0);

  // Edit panel state
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [sourceReferences, setSourceReferences] = useState<any[]>([]);
  const [selectedSourceFields, setSelectedSourceFields] = useState<Record<string, string>>({});

  // Load events data
  const loadEvents = useCallback(async () => {
    try {
      const [eventsData, unifiedData, statsData, enrichData, citiesData] = await Promise.all([
        fetchEvents({
          city: cityFilter || undefined,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
        fetchUnifiedEvents({
          city: cityFilter || undefined,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }).catch(() => ({ data: [], total: 0 })),
        fetchStats(),
        fetchEnrichStats().catch(() => null),
        fetchCities().catch(() => []),
      ]);

      setEvents(eventsData.data);
      setTotal(eventsData.total);
      setUnifiedEvents(unifiedData.data || []);
      setStats(statsData);
      setEnrichStats(enrichData);
      setCities(citiesData);
    } catch (error) {
      console.error('Failed to load events:', error);
    }
  }, [cityFilter, page, pageSize]);

  // Load artists
  const loadArtists = useCallback(async () => {
    try {
      const [data, unifiedData, scrapedData] = await Promise.all([
        fetchArtists({
          search: searchQuery || undefined,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
        fetchUnifiedArtists({
          search: searchQuery || undefined,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }).catch(() => ({ data: [], total: 0 })),
        fetchScrapedArtists({
          search: searchQuery || undefined,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }).catch(() => ({ data: [], total: 0 })),
      ]);
      setArtists(data.data || []);
      setArtistsTotal(data.total || 0);
      setUnifiedArtists(unifiedData.data || []);
      setUnifiedArtistsTotal(unifiedData.total || 0);
      setScrapedArtists(scrapedData.data || []);
      setScrapedArtistsTotal(scrapedData.total || 0);
    } catch (error) {
      console.error('Failed to load artists:', error);
    }
  }, [searchQuery, page, pageSize]);

  // Load venues
  const loadVenues = useCallback(async () => {
    try {
      const [data, unifiedData, scrapedData] = await Promise.all([
        fetchAdminVenues({
          search: searchQuery || undefined,
          city: cityFilter || undefined,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
        fetchUnifiedVenues({
          search: searchQuery || undefined,
          city: cityFilter || undefined,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }).catch(() => ({ data: [], total: 0 })),
        fetchScrapedVenues({
          search: searchQuery || undefined,
          city: cityFilter || undefined,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }).catch(() => ({ data: [], total: 0 })),
      ]);
      setVenues(data.data || []);
      setVenuesTotal(data.total || 0);
      setUnifiedVenues(unifiedData.data || []);
      setUnifiedVenuesTotal(unifiedData.total || 0);
      setScrapedVenues(scrapedData.data || []);
      setScrapedVenuesTotal(scrapedData.total || 0);
    } catch (error) {
      console.error('Failed to load venues:', error);
    }
  }, [searchQuery, cityFilter, page, pageSize]);

  // Load cities
  const loadCities = useCallback(async () => {
    try {
      const data = await fetchAdminCities({
        search: searchQuery || undefined,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      setAdminCities(data.data || []);
      setCitiesTotal(data.total || 0);
    } catch (error) {
      console.error('Failed to load cities:', error);
    }
  }, [searchQuery, page, pageSize]);

  // Load scrape data
  const loadScrapeData = useCallback(async () => {
    try {
      const [statsData, eventsData] = await Promise.all([
        fetchScrapeStats().catch(() => null),
        fetchScrapedEvents({ limit: 50, linked: false }).catch(() => ({ data: [] })),
      ]);
      setScrapeStats(statsData);
      setScrapedEvents(eventsData.data || []);
    } catch (error) {
      console.error('Failed to load scrape data:', error);
    }
  }, []);

  // Main data loader
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'events') await loadEvents();
      else if (activeTab === 'artists') await loadArtists();
      else if (activeTab === 'venues') await loadVenues();
      else if (activeTab === 'cities') await loadCities();
      else if (activeTab === 'scrape') await loadScrapeData();
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, loadEvents, loadArtists, loadVenues, loadCities, loadScrapeData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reset page when changing tabs or filters
  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
    setShowEditPanel(false);
    setEditingItem(null);
  }, [activeTab, cityFilter, searchQuery, statusFilter, dataSource]);

  // Filter events locally
  const filteredEvents = useMemo(() => {
    const sourceEvents = dataSource === 'unified' ? unifiedEvents : events;
    return sourceEvents.filter((event) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matches =
          event.title?.toLowerCase().includes(query) ||
          event.venue_name?.toLowerCase().includes(query) ||
          event.artists?.toLowerCase().includes(query);
        if (!matches) return false;
      }
      if (statusFilter === 'published' && !event.is_published) return false;
      if (statusFilter === 'draft' && event.is_published) return false;
      return true;
    });
  }, [events, unifiedEvents, dataSource, searchQuery, statusFilter]);

  // Get current total based on tab and data source
  const currentTotal = useMemo(() => {
    if (activeTab === 'events') {
      return dataSource === 'unified' ? unifiedEvents.length : total;
    }
    if (activeTab === 'artists') {
      if (dataSource === 'unified') return unifiedArtistsTotal;
      if (dataSource === 'scraped') return scrapedArtistsTotal;
      return artistsTotal;
    }
    if (activeTab === 'venues') {
      if (dataSource === 'unified') return unifiedVenuesTotal;
      if (dataSource === 'scraped') return scrapedVenuesTotal;
      return venuesTotal;
    }
    if (activeTab === 'cities') return citiesTotal;
    return 0;
  }, [activeTab, dataSource, total, artistsTotal, venuesTotal, citiesTotal, unifiedEvents, unifiedArtistsTotal, unifiedVenuesTotal, scrapedArtistsTotal, scrapedVenuesTotal]);

  const totalPages = Math.ceil(currentTotal / pageSize);

  // Selection handlers
  const handleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
  };

  const handleSelectAll = () => {
    if (activeTab === 'events') {
      if (selectedIds.size === filteredEvents.length) setSelectedIds(new Set());
      else setSelectedIds(new Set(filteredEvents.map((e) => e.id)));
    }
  };

  // Edit handlers
  const handleEdit = (item: any) => {
    setEditingItem(item);
    setSourceReferences([]);
    setSelectedSourceFields({});
    
    // Format date and time fields for events
    if (activeTab === 'events') {
      const formData = { ...item };
      // Format date for input type="date" (YYYY-MM-DD)
      if (formData.date) {
        const d = new Date(formData.date);
        if (!isNaN(d.getTime())) {
          formData.date = d.toISOString().split('T')[0];
        }
      }
      // Format start_time for input type="time" (HH:MM)
      if (formData.start_time && typeof formData.start_time === 'string') {
        // Handle formats like "23:00:00" or "23:00"
        formData.start_time = formData.start_time.substring(0, 5);
      }
      setEditForm(formData);
      
      // Fetch source references for unified events
      if (dataSource === 'unified' && item.id) {
        fetchUnifiedEvent(item.id).then(data => {
          setSourceReferences(data.source_references || []);
        }).catch(console.error);
      }
    } else if (activeTab === 'artists' && dataSource === 'unified' && item.id) {
      setEditForm({ ...item });
      fetchUnifiedArtist(item.id).then(data => {
        setSourceReferences(data.source_references || []);
      }).catch(console.error);
    } else if (activeTab === 'venues' && dataSource === 'unified' && item.id) {
      setEditForm({ ...item });
      fetchUnifiedVenue(item.id).then(data => {
        setSourceReferences(data.source_references || []);
      }).catch(console.error);
    } else {
      setEditForm({ ...item });
    }
    setShowEditPanel(true);
  };

  const handleCreate = () => {
    setEditingItem(null);
    setSourceReferences([]);
    setSelectedSourceFields({});
    if (activeTab === 'events') {
      setEditForm({ title: '', date: '', venue_name: '', venue_city: '', artists: '', is_published: false });
    } else if (activeTab === 'artists') {
      setEditForm({ name: '', country: '', content_url: '', image_url: '' });
    } else if (activeTab === 'venues') {
      setEditForm({ name: '', address: '', city: '', country: '', latitude: '', longitude: '', content_url: '' });
    } else if (activeTab === 'cities') {
      setEditForm({ name: '', country: '', latitude: '', longitude: '', timezone: '', is_active: true });
    }
    setShowEditPanel(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (activeTab === 'events') {
        if (editingItem) {
          // Use unified API if in unified mode
          if (dataSource === 'unified') {
            await updateUnifiedEvent(editingItem.id, editForm);
            loadEvents();
          } else {
            await updateEvent(editingItem.id, editForm);
            setEvents(events.map(e => e.id === editingItem.id ? { ...e, ...editForm } : e));
          }
        }
      } else if (activeTab === 'artists') {
        if (editingItem) {
          if (dataSource === 'unified') {
            await updateUnifiedArtist(editingItem.id, editForm);
          } else {
            await updateArtist(editingItem.id, editForm);
          }
        } else {
          await createArtist(editForm);
        }
        await loadArtists();
      } else if (activeTab === 'venues') {
        const payload = {
          ...editForm,
          latitude: editForm.latitude ? parseFloat(editForm.latitude) : undefined,
          longitude: editForm.longitude ? parseFloat(editForm.longitude) : undefined,
        };
        if (editingItem) {
          if (dataSource === 'unified') {
            await updateUnifiedVenue(editingItem.id, payload);
          } else {
            await updateVenue(editingItem.id, payload);
          }
        } else {
          await createVenue(payload);
        }
        await loadVenues();
      } else if (activeTab === 'cities') {
        const payload = {
          ...editForm,
          latitude: editForm.latitude ? parseFloat(editForm.latitude) : undefined,
          longitude: editForm.longitude ? parseFloat(editForm.longitude) : undefined,
        };
        if (editingItem?.id) {
          await updateCity(editingItem.id.toString(), payload);
        } else {
          await createCity(payload);
        }
        await loadCities();
      }
      setShowEditPanel(false);
      setEditingItem(null);
    } catch (error: any) {
      console.error('Save failed:', error);
      alert(error.message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (item: any) => {
    if (!confirm(`Delete "${item.title || item.name}"?`)) return;
    try {
      if (activeTab === 'events') {
        await deleteEvent(item.id);
        await loadEvents();
      } else if (activeTab === 'artists') {
        await deleteArtist(item.id);
        await loadArtists();
      } else if (activeTab === 'venues') {
        await deleteVenue(item.id);
        await loadVenues();
      } else if (activeTab === 'cities') {
        await deleteCity(item.id.toString());
        await loadCities();
      }
      if (editingItem?.id === item.id) {
        setShowEditPanel(false);
        setEditingItem(null);
      }
    } catch (error: any) {
      alert(error.message || 'Failed to delete');
    }
  };

  // Bulk actions for events
  const handleBulkPublish = async (publish: boolean) => {
    try {
      const ids = Array.from(selectedIds);
      await publishEvents(ids, publish);
      setEvents(events.map(e => selectedIds.has(e.id) ? { ...e, is_published: publish } : e));
      setSelectedIds(new Set());
    } catch (error) {
      console.error('Failed to update publish status:', error);
      alert('Failed to update publish status');
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} items?`)) return;
    for (const id of selectedIds) {
      try {
        await deleteEvent(id);
      } catch (error) {
        console.error(`Failed to delete ${id}:`, error);
      }
    }
    setSelectedIds(new Set());
    loadData();
  };

  // Sync events
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

  // Multi-source scraping
  const handleScrape = async () => {
    setIsScraping(true);
    setScrapeResult(null);
    try {
      const result = await scrapeEvents({
        city: scrapeCity,
        sources: scrapeSources,
        limit: 100,
        match: true,
      });
      setScrapeResult(result);
      await loadScrapeData();
    } catch (error: any) {
      console.error('Scrape failed:', error);
      setScrapeResult({ error: error.message });
    } finally {
      setIsScraping(false);
    }
  };

  // Run matching algorithm
  const handleRunMatching = async () => {
    setIsMatching(true);
    try {
      const result = await runMatching({ dryRun: false, minConfidence: 0.5 });
      alert(`Matched ${result.events.matched} events, created ${result.events.created} new, merged ${result.events.merged || 0} duplicates`);
      await loadScrapeData();
    } catch (error) {
      console.error('Matching failed:', error);
      alert('Failed to run matching');
    } finally {
      setIsMatching(false);
    }
  };

  // Deduplicate unified events
  const [isDeduplicating, setIsDeduplicating] = useState(false);
  const handleDeduplicate = async () => {
    setIsDeduplicating(true);
    try {
      const result = await deduplicateEvents();
      alert(`Merged ${result.merged} duplicate events`);
      await loadScrapeData();
      await loadEvents();
    } catch (error: any) {
      console.error('Deduplication failed:', error);
      alert(error.message || 'Failed to deduplicate');
    } finally {
      setIsDeduplicating(false);
    }
  };

  // Toggle source selection
  const toggleSource = (source: string) => {
    if (scrapeSources.includes(source)) {
      setScrapeSources(scrapeSources.filter(s => s !== source));
    } else {
      setScrapeSources([...scrapeSources, source]);
    }
  };

  // Enrich data
  const handleEnrich = async (type: 'venues' | 'artists') => {
    setIsEnriching(true);
    try {
      const result = type === 'venues' ? await enrichVenues(100) : await enrichArtists(200);
      alert(`Enriched ${result.saved} ${type}`);
      loadData();
    } catch (error) {
      console.error('Enrich failed:', error);
      alert(`Failed to enrich ${type}`);
    } finally {
      setIsEnriching(false);
    }
  };

  // Toggle publish for single event
  const handleTogglePublish = async (event: Event) => {
    try {
      await publishEvents([event.id], !event.is_published);
      setEvents(events.map(e => e.id === event.id ? { ...e, is_published: !e.is_published } : e));
    } catch (error) {
      console.error('Failed to toggle publish:', error);
    }
  };

  // Render list items based on active tab
  const renderListItem = (item: any) => {
    if (activeTab === 'events') {
      const isUnified = dataSource === 'unified';
      return (
        <div
          key={item.id}
          onClick={() => handleEdit(item)}
          className={clsx(
            'px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 border-b transition-colors',
            editingItem?.id === item.id && 'bg-indigo-50 border-l-2 border-l-indigo-500'
          )}
        >
          <input
            type="checkbox"
            checked={selectedIds.has(item.id)}
            onChange={(e) => { e.stopPropagation(); handleSelect(item.id); }}
            className="rounded text-indigo-600"
          />
          <div className="w-10 h-10 rounded bg-gray-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {item.flyer_front ? (
              <img src={item.flyer_front} alt="" className="w-full h-full object-cover" />
            ) : (
              <Calendar className="w-5 h-5 text-gray-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm truncate">{item.title}</p>
              {isUnified && item.source_references?.length > 0 && (
                <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded flex-shrink-0">
                  {item.source_references.map((s: any) => s.source_code?.toUpperCase()).join(' + ')}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 truncate">{item.venue_name} • {item.venue_city}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs font-medium">{item.date ? format(new Date(item.date), 'MMM d') : '—'}</p>
            <button
              onClick={(e) => { e.stopPropagation(); handleTogglePublish(item); }}
              className={clsx(
                'text-xs px-2 py-0.5 rounded mt-1',
                item.is_published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
              )}
            >
              {item.is_published ? 'Live' : 'Draft'}
            </button>
          </div>
        </div>
      );
    }

    if (activeTab === 'artists') {
      const isUnified = dataSource === 'unified';
      const isScraped = dataSource === 'scraped';
      return (
        <div
          key={item.id}
          onClick={() => handleEdit(item)}
          className={clsx(
            'px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 border-b transition-colors',
            editingItem?.id === item.id && 'bg-indigo-50 border-l-2 border-l-indigo-500'
          )}
        >
          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {item.image_url ? (
              <img src={item.image_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <Music className="w-5 h-5 text-gray-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{item.name}</p>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>{item.country || item.genres || '—'}</span>
              {isUnified && item.source_references?.length > 0 && (
                <span className="bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded">
                  {item.source_references.length} sources
                </span>
              )}
              {isScraped && item.source_code && (
                <span className={clsx(
                  'px-1.5 py-0.5 rounded',
                  item.source_code === 'ra' ? 'bg-blue-100 text-blue-700' : 'bg-cyan-100 text-cyan-700'
                )}>
                  {item.source_code.toUpperCase()}
                </span>
              )}
              {isScraped && item.is_linked && (
                <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                  <Link2 className="w-3 h-3" /> linked
                </span>
              )}
              {isUnified && item.event_count > 0 && (
                <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                  {item.event_count} events
                </span>
              )}
            </div>
          </div>
          {item.content_url && (
            <a href={item.content_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-gray-400 hover:text-indigo-600">
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>
      );
    }

    if (activeTab === 'venues') {
      const isUnified = dataSource === 'unified';
      const isScraped = dataSource === 'scraped';
      return (
        <div
          key={item.id}
          onClick={() => handleEdit(item)}
          className={clsx(
            'px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 border-b transition-colors',
            editingItem?.id === item.id && 'bg-indigo-50 border-l-2 border-l-indigo-500'
          )}
        >
          <div className="w-10 h-10 rounded bg-gray-200 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5 text-gray-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{item.name}</p>
            <p className="text-xs text-gray-500 truncate">{item.city || '—'}{item.country && `, ${item.country}`}</p>
          </div>
          <div className="flex items-center gap-2">
            {isScraped && item.source_code && (
              <span className={clsx(
                'text-xs px-2 py-0.5 rounded',
                item.source_code === 'ra' ? 'bg-blue-100 text-blue-700' : 'bg-cyan-100 text-cyan-700'
              )}>
                {item.source_code.toUpperCase()}
              </span>
            )}
            {isScraped && item.is_linked && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded flex items-center gap-0.5">
                <Link2 className="w-3 h-3" />
              </span>
            )}
            {isUnified && item.source_references?.length > 0 && (
              <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded">
                {item.source_references.length} src
              </span>
            )}
            {isUnified && item.event_count > 0 && (
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                {item.event_count}
              </span>
            )}
            {item.latitude && item.longitude ? (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">📍</span>
            ) : (
              <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">No coords</span>
            )}
          </div>
        </div>
      );
    }

    if (activeTab === 'cities') {
      return (
        <div
          key={item.id}
          onClick={() => handleEdit(item)}
          className={clsx(
            'px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 border-b transition-colors',
            editingItem?.id === item.id && 'bg-indigo-50 border-l-2 border-l-indigo-500'
          )}
        >
          <div className="w-10 h-10 rounded bg-gray-200 flex items-center justify-center flex-shrink-0">
            <Globe className="w-5 h-5 text-gray-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{item.name}</p>
            <p className="text-xs text-gray-500">{item.country || '—'}</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{item.event_count || 0} events</span>
            <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded">{item.venue_count || 0} venues</span>
          </div>
        </div>
      );
    }

    return null;
  };

  // Get items for current tab based on data source
  const currentItems = useMemo(() => {
    if (activeTab === 'events') return filteredEvents;
    if (activeTab === 'artists') {
      if (dataSource === 'unified') return unifiedArtists;
      if (dataSource === 'scraped') return scrapedArtists;
      return artists;
    }
    if (activeTab === 'venues') {
      if (dataSource === 'unified') return unifiedVenues;
      if (dataSource === 'scraped') return scrapedVenues;
      return venues;
    }
    if (activeTab === 'cities') return adminCities;
    return [];
  }, [activeTab, dataSource, filteredEvents, artists, venues, adminCities, unifiedArtists, unifiedVenues, scrapedArtists, scrapedVenues]);

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Top Bar */}
      <header className="bg-white border-b flex-shrink-0 z-50">
        <div className="flex items-center h-14 px-4">
          {/* Logo & Stats */}
          <div className="flex items-center gap-6">
            <h1 className="text-lg font-bold text-gray-900">Events Admin</h1>
            {stats && (
              <div className="hidden lg:flex items-center gap-4 text-sm text-gray-500">
                <span><Calendar className="w-4 h-4 inline mr-1" />{stats.total_events}</span>
                <span><Building2 className="w-4 h-4 inline mr-1" />{stats.venues}</span>
                <span><MapPin className="w-4 h-4 inline mr-1" />{stats.cities}</span>
              </div>
            )}
          </div>

          {/* Tab Navigation */}
          <div className="flex-1 flex justify-center">
            <div className="flex bg-gray-100 rounded-lg p-1">
              {(['events', 'artists', 'venues', 'cities', 'scrape'] as ActiveTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={clsx(
                    'px-4 py-1.5 text-sm font-medium rounded-md transition-all capitalize flex items-center gap-1',
                    activeTab === tab ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
                  )}
                >
                  {tab === 'scrape' && <CloudDownload className="w-4 h-4" />}
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              {(['split', 'list', 'map'] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={clsx(
                    'px-3 py-1 text-xs font-medium rounded transition-all capitalize',
                    viewMode === mode ? 'bg-white shadow text-gray-900' : 'text-gray-500'
                  )}
                >
                  {mode}
                </button>
              ))}
            </div>
            <button onClick={loadData} className="p-2 hover:bg-gray-100 rounded-lg" title="Refresh">
              <RefreshCw className={clsx('w-4 h-4', isLoading && 'animate-spin')} />
            </button>
          </div>
        </div>

        {/* Secondary toolbar */}
        <div className="flex items-center px-4 py-2 gap-3 border-t bg-gray-50">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={`Search ${activeTab}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* City filter (for events & venues) */}
          {(activeTab === 'events' || activeTab === 'venues') && (
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="px-3 py-1.5 text-sm border rounded-lg"
            >
              <option value="">All Cities</option>
              {cities.map((city) => (
                <option key={city.id || city.name} value={city.name}>
                  {city.name} ({city.event_count || 0})
                </option>
              ))}
            </select>
          )}

          {/* Status filter (for events) */}
          {activeTab === 'events' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-1.5 text-sm border rounded-lg"
            >
              <option value="all">All Status</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
          )}

          {/* Data source toggle (for events, artists, venues) */}
          {(activeTab === 'events' || activeTab === 'artists' || activeTab === 'venues') && (
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setDataSource('original')}
                className={clsx(
                  'px-2 py-1 text-xs font-medium rounded transition-all flex items-center gap-1',
                  dataSource === 'original' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
                )}
                title="Original database (events table)"
              >
                <Database className="w-3 h-3" />
                Original
              </button>
              <button
                onClick={() => setDataSource('unified')}
                className={clsx(
                  'px-2 py-1 text-xs font-medium rounded transition-all flex items-center gap-1',
                  dataSource === 'unified' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'
                )}
                title="Unified scraped data (deduplicated)"
              >
                <Link2 className="w-3 h-3" />
                Unified
                {activeTab === 'events' && unifiedEvents.length > 0 && (
                  <span className="ml-1 bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded text-[10px]">{unifiedEvents.length}</span>
                )}
                {activeTab === 'artists' && unifiedArtistsTotal > 0 && (
                  <span className="ml-1 bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded text-[10px]">{unifiedArtistsTotal}</span>
                )}
                {activeTab === 'venues' && unifiedVenuesTotal > 0 && (
                  <span className="ml-1 bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded text-[10px]">{unifiedVenuesTotal}</span>
                )}
              </button>
              {(activeTab === 'artists' || activeTab === 'venues') && (
                <button
                  onClick={() => setDataSource('scraped')}
                  className={clsx(
                    'px-2 py-1 text-xs font-medium rounded transition-all flex items-center gap-1',
                    dataSource === 'scraped' ? 'bg-white shadow text-amber-600' : 'text-gray-500 hover:text-gray-700'
                  )}
                  title="Raw scraped data (before deduplication)"
                >
                  <Layers className="w-3 h-3" />
                  Scraped
                  {activeTab === 'artists' && scrapedArtistsTotal > 0 && (
                    <span className="ml-1 bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[10px]">{scrapedArtistsTotal}</span>
                  )}
                  {activeTab === 'venues' && scrapedVenuesTotal > 0 && (
                    <span className="ml-1 bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[10px]">{scrapedVenuesTotal}</span>
                  )}
                </button>
              )}
            </div>
          )}

          <div className="flex-1" />

          {/* Bulk actions */}
          {selectedIds.size > 0 && activeTab === 'events' && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">{selectedIds.size} selected</span>
              <button onClick={() => handleBulkPublish(true)} className="px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded-lg hover:bg-green-200 flex items-center gap-1">
                <Eye className="w-3 h-3" /> Publish
              </button>
              <button onClick={() => handleBulkPublish(false)} className="px-3 py-1.5 text-xs bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 flex items-center gap-1">
                <EyeOff className="w-3 h-3" /> Unpublish
              </button>
              <button onClick={handleBulkDelete} className="px-3 py-1.5 text-xs bg-red-100 text-red-700 rounded-lg hover:bg-red-200 flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            </div>
          )}

          {/* Add button */}
          {activeTab !== 'events' && (
            <button
              onClick={handleCreate}
              className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> Add {activeTab.slice(0, -1)}
            </button>
          )}

          {/* Sync button (events only) */}
          {activeTab === 'events' && (
            <div className="relative group">
              <button
                disabled={isSyncing}
                className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-1 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {isSyncing ? 'Syncing...' : 'Sync'}
              </button>
              <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                {(cities.length > 0 ? cities.slice(0, 6).map(c => c.name) : ['Berlin', 'Hamburg', 'London', 'Paris']).map((city) => (
                  <button
                    key={city}
                    onClick={() => handleSync(city)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    {city}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Enrich button (events only) */}
          {activeTab === 'events' && (
            <div className="relative group">
              <button
                disabled={isEnriching}
                className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 flex items-center gap-1 disabled:opacity-50"
              >
                <Database className="w-4 h-4" />
                {isEnriching ? '...' : 'Enrich'}
              </button>
              <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <button onClick={() => handleEnrich('venues')} className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2">
                  <Building2 className="w-4 h-4" /> Venues
                </button>
                <button onClick={() => handleEnrich('artists')} className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2">
                  <Users className="w-4 h-4" /> Artists
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Scrape Tab Content */}
        {activeTab === 'scrape' ? (
          <div className="flex-1 overflow-auto p-6">
            <div className="max-w-6xl mx-auto space-y-6">
              {/* Scrape Stats */}
              {scrapeStats && (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <p className="text-2xl font-bold text-indigo-600">{scrapeStats.total_scraped_events || 0}</p>
                    <p className="text-xs text-gray-500">Scraped Events</p>
                  </div>
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <p className="text-2xl font-bold text-blue-600">{scrapeStats.ra_events || 0}</p>
                    <p className="text-xs text-gray-500">From RA</p>
                  </div>
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <p className="text-2xl font-bold text-cyan-600">{scrapeStats.ticketmaster_events || 0}</p>
                    <p className="text-xs text-gray-500">From Ticketmaster</p>
                  </div>
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <p className="text-2xl font-bold text-green-600">{scrapeStats.total_unified_events || 0}</p>
                    <p className="text-xs text-gray-500">Unified Events</p>
                  </div>
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <p className="text-2xl font-bold text-amber-600">{scrapeStats.unlinked_scraped_events || 0}</p>
                    <p className="text-xs text-gray-500">Unlinked Events</p>
                  </div>
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <p className="text-2xl font-bold text-purple-600">{scrapeStats.published_events || 0}</p>
                    <p className="text-xs text-gray-500">Published</p>
                  </div>
                </div>
              )}

              {/* Scrape Controls */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                  <CloudDownload className="w-5 h-5 text-indigo-600" />
                  Scrape Events
                </h3>
                
                <div className="grid md:grid-cols-3 gap-6">
                  {/* City Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                    <select
                      value={scrapeCity}
                      onChange={(e) => setScrapeCity(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg bg-white"
                    >
                      <optgroup label="🇩🇪 Germany">
                        <option value="berlin">Berlin</option>
                        <option value="hamburg">Hamburg</option>
                        <option value="munich">Munich</option>
                        <option value="cologne">Cologne</option>
                        <option value="frankfurt">Frankfurt</option>
                        <option value="dusseldorf">Düsseldorf</option>
                        <option value="stuttgart">Stuttgart</option>
                        <option value="leipzig">Leipzig</option>
                        <option value="dresden">Dresden</option>
                        <option value="hannover">Hannover</option>
                        <option value="nuremberg">Nuremberg</option>
                        <option value="dortmund">Dortmund</option>
                        <option value="essen">Essen</option>
                        <option value="bremen">Bremen</option>
                        <option value="mannheim">Mannheim</option>
                        <option value="freiburg">Freiburg</option>
                        <option value="munster">Münster</option>
                        <option value="aachen">Aachen</option>
                        <option value="karlsruhe">Karlsruhe</option>
                        <option value="rostock">Rostock</option>
                        <option value="kiel">Kiel</option>
                        <option value="mainz">Mainz</option>
                        <option value="bonn">Bonn</option>
                        <option value="augsburg">Augsburg</option>
                        <option value="wiesbaden">Wiesbaden</option>
                      </optgroup>
                      <optgroup label="🇬🇧 UK">
                        <option value="london">London</option>
                        <option value="manchester">Manchester</option>
                        <option value="birmingham">Birmingham</option>
                        <option value="glasgow">Glasgow</option>
                        <option value="leeds">Leeds</option>
                        <option value="liverpool">Liverpool</option>
                        <option value="bristol">Bristol</option>
                        <option value="edinburgh">Edinburgh</option>
                      </optgroup>
                      <optgroup label="🇪🇺 Europe">
                        <option value="amsterdam">Amsterdam</option>
                        <option value="paris">Paris</option>
                        <option value="barcelona">Barcelona</option>
                        <option value="madrid">Madrid</option>
                        <option value="vienna">Vienna</option>
                        <option value="zurich">Zurich</option>
                        <option value="brussels">Brussels</option>
                        <option value="prague">Prague</option>
                        <option value="copenhagen">Copenhagen</option>
                        <option value="stockholm">Stockholm</option>
                        <option value="oslo">Oslo</option>
                        <option value="milan">Milan</option>
                        <option value="rome">Rome</option>
                        <option value="ibiza">Ibiza</option>
                      </optgroup>
                      <optgroup label="🇺🇸 USA">
                        <option value="new york">New York</option>
                        <option value="los angeles">Los Angeles</option>
                        <option value="chicago">Chicago</option>
                        <option value="miami">Miami</option>
                        <option value="san francisco">San Francisco</option>
                        <option value="detroit">Detroit</option>
                        <option value="seattle">Seattle</option>
                        <option value="boston">Boston</option>
                        <option value="austin">Austin</option>
                        <option value="denver">Denver</option>
                        <option value="atlanta">Atlanta</option>
                      </optgroup>
                    </select>
                  </div>

                  {/* Source Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Sources</label>
                    <div className="flex gap-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={scrapeSources.includes('ra')}
                          onChange={() => toggleSource('ra')}
                          className="rounded text-indigo-600"
                        />
                        <span className="text-sm">Resident Advisor</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={scrapeSources.includes('ticketmaster')}
                          onChange={() => toggleSource('ticketmaster')}
                          className="rounded text-indigo-600"
                        />
                        <span className="text-sm">Ticketmaster</span>
                      </label>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-end gap-3">
                    <button
                      onClick={handleScrape}
                      disabled={isScraping || scrapeSources.length === 0}
                      className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isScraping ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <CloudDownload className="w-4 h-4" />
                      )}
                      {isScraping ? 'Scraping...' : 'Scrape'}
                    </button>
                    <button
                      onClick={handleRunMatching}
                      disabled={isMatching}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      {isMatching ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Link2 className="w-4 h-4" />
                      )}
                      Match
                    </button>
                    <button
                      onClick={handleDeduplicate}
                      disabled={isDeduplicating}
                      className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      {isDeduplicating ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Layers className="w-4 h-4" />
                      )}
                      Dedupe
                    </button>
                  </div>
                </div>

                {/* Scrape Result */}
                {scrapeResult && (
                  <div className={clsx(
                    'mt-4 p-4 rounded-lg',
                    scrapeResult.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
                  )}>
                    {scrapeResult.error ? (
                      <p>Error: {scrapeResult.error}</p>
                    ) : (
                      <div className="space-y-2">
                        <p className="font-medium">Scrape completed for {scrapeResult.city}</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          {Object.entries(scrapeResult.sources || {}).map(([source, data]: [string, any]) => (
                            <div key={source} className="bg-white/50 rounded p-2">
                              <p className="font-medium capitalize">{source}</p>
                              {data.error ? (
                                <p className="text-red-600 text-xs">{data.error}</p>
                              ) : (
                                <p className="text-xs">
                                  {data.fetched} fetched, {data.inserted} new, {data.updated} updated
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                        {scrapeResult.matching && (
                          <p className="text-sm mt-2">
                            Matching: {scrapeResult.matching.matched} matched, {scrapeResult.matching.created} created
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Unlinked Scraped Events */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-500" />
                  Unlinked Scraped Events ({scrapedEvents.length})
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b">
                        <th className="pb-2 font-medium">Source</th>
                        <th className="pb-2 font-medium">Title</th>
                        <th className="pb-2 font-medium">Date</th>
                        <th className="pb-2 font-medium">Venue</th>
                        <th className="pb-2 font-medium">City</th>
                        <th className="pb-2 font-medium">Link</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scrapedEvents.slice(0, 20).map((event) => (
                        <tr key={event.id} className="border-b hover:bg-gray-50">
                          <td className="py-2">
                            <span className={clsx(
                              'px-2 py-0.5 rounded text-xs font-medium',
                              event.source_code === 'ra' ? 'bg-blue-100 text-blue-700' : 'bg-cyan-100 text-cyan-700'
                            )}>
                              {event.source_code?.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-2 max-w-xs truncate">{event.title}</td>
                          <td className="py-2">{event.date ? format(new Date(event.date), 'MMM d, yyyy') : '—'}</td>
                          <td className="py-2 max-w-[150px] truncate">{event.venue_name || '—'}</td>
                          <td className="py-2">{event.venue_city || '—'}</td>
                          <td className="py-2">
                            {event.content_url && (
                              <a href={event.content_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800">
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {scrapedEvents.length === 0 && (
                    <p className="text-center py-8 text-gray-500">No unlinked events. All scraped data is matched!</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
        {/* List Panel */}
        {(viewMode === 'split' || viewMode === 'list') && (
          <div className={clsx(
            'bg-white border-r flex flex-col',
            viewMode === 'split' ? 'w-96' : 'flex-1'
          )}>
            {/* List header */}
            <div className="px-4 py-2 bg-gray-50 border-b flex items-center justify-between">
              <span className="text-sm text-gray-600">
                {currentTotal.toLocaleString()} {activeTab}
              </span>
              {activeTab === 'events' && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filteredEvents.length && filteredEvents.length > 0}
                    onChange={handleSelectAll}
                    className="rounded text-indigo-600"
                  />
                  Select all
                </label>
              )}
            </div>

            {/* List content */}
            <div className="flex-1 overflow-auto">
              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : currentItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-gray-500">
                  <p>No {activeTab} found</p>
                </div>
              ) : (
                currentItems.map(renderListItem)
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-2 border-t bg-gray-50 flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  Page {page}/{totalPages}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1 rounded hover:bg-gray-200 disabled:opacity-50"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="p-1 rounded hover:bg-gray-200 disabled:opacity-50"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Map / Edit Panel */}
        <div className="flex-1 flex">
          {/* Map */}
          {(viewMode === 'split' || viewMode === 'map') && !showEditPanel && (
            <div className="flex-1 relative">
              <EventMap
                events={activeTab === 'events' ? filteredEvents : []}
                cities={cities}
                selectedCity={cityFilter}
                onCityChange={(city) => setCityFilter(city)}
                onEventClick={(event) => handleEdit(event)}
              />
            </div>
          )}

          {/* Edit Panel */}
          {showEditPanel && (
            <div className="flex-1 bg-white border-l overflow-auto">
              <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between z-10">
                <h2 className="font-semibold">
                  {editingItem ? `Edit ${activeTab.slice(0, -1)}` : `New ${activeTab.slice(0, -1)}`}
                </h2>
                <div className="flex items-center gap-2">
                  {editingItem && (
                    <button
                      onClick={() => handleDelete(editingItem)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => { setShowEditPanel(false); setEditingItem(null); }}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-4 space-y-4">
                {/* Source References Section */}
                {dataSource === 'unified' && sourceReferences.length > 0 && editingItem && (
                  <div className="bg-gray-50 rounded-lg p-3 border">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <Layers className="w-4 h-4" />
                      Data Sources ({sourceReferences.length})
                    </h3>
                    <div className="space-y-2 max-h-32 overflow-auto">
                      {sourceReferences.map((source: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between text-xs bg-white rounded px-2 py-1.5 border">
                          <span className="flex items-center gap-2">
                            <span className={clsx(
                              'px-1.5 py-0.5 rounded font-medium uppercase',
                              source.source_code === 'original' ? 'bg-green-100 text-green-700' :
                              source.source_code === 'ra' ? 'bg-purple-100 text-purple-700' :
                              source.source_code === 'ticketmaster' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-700'
                            )}>
                              {source.source_code}
                            </span>
                            <span className="text-gray-600 truncate max-w-[150px]">{source.title || source.name}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              // Apply source data to form
                              const sourceData = { ...source };
                              delete sourceData.id;
                              delete sourceData.source_code;
                              delete sourceData.source_event_id;
                              delete sourceData.source_venue_id;
                              delete sourceData.source_artist_id;
                              delete sourceData.is_primary;
                              delete sourceData.confidence;
                              // Only copy non-empty values
                              const updates: Record<string, any> = {};
                              Object.entries(sourceData).forEach(([key, value]) => {
                                if (value !== null && value !== undefined && value !== '') {
                                  updates[key] = value;
                                }
                              });
                              setEditForm({ ...editForm, ...updates });
                            }}
                            className="text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            Use
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Click "Use" to apply source data. Changes will be saved as "original" source.
                    </p>
                  </div>
                )}

                {/* Event form */}
                {activeTab === 'events' && (
                  <>
                    {editForm.flyer_front && (
                      <img src={editForm.flyer_front} alt="" className="w-full h-48 object-cover rounded-lg" />
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                      <input
                        type="text"
                        value={editForm.title || ''}
                        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                        <input
                          type="date"
                          value={editForm.date || ''}
                          onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                        <input
                          type="time"
                          value={editForm.start_time || ''}
                          onChange={(e) => setEditForm({ ...editForm, start_time: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Venue</label>
                      <input
                        type="text"
                        value={editForm.venue_name || ''}
                        onChange={(e) => setEditForm({ ...editForm, venue_name: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                        <input
                          type="text"
                          value={editForm.venue_city || ''}
                          onChange={(e) => setEditForm({ ...editForm, venue_city: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                        <input
                          type="text"
                          value={editForm.venue_country || ''}
                          onChange={(e) => setEditForm({ ...editForm, venue_country: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                      <input
                        type="text"
                        value={editForm.venue_address || ''}
                        onChange={(e) => setEditForm({ ...editForm, venue_address: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Artists</label>
                      <input
                        type="text"
                        value={editForm.artists || ''}
                        onChange={(e) => setEditForm({ ...editForm, artists: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="Comma-separated"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                      <textarea
                        value={editForm.description || ''}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        rows={3}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Event URL</label>
                      <input
                        type="url"
                        value={editForm.content_url || ''}
                        onChange={(e) => setEditForm({ ...editForm, content_url: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Flyer URL</label>
                      <input
                        type="url"
                        value={editForm.flyer_front || ''}
                        onChange={(e) => setEditForm({ ...editForm, flyer_front: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="is_published"
                        checked={editForm.is_published || false}
                        onChange={(e) => setEditForm({ ...editForm, is_published: e.target.checked })}
                        className="rounded text-indigo-600"
                      />
                      <label htmlFor="is_published" className="text-sm">Published</label>
                    </div>
                  </>
                )}

                {/* Artist form */}
                {activeTab === 'artists' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                      <input
                        type="text"
                        value={editForm.name || ''}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                      <input
                        type="text"
                        value={editForm.country || ''}
                        onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Profile URL</label>
                      <input
                        type="url"
                        value={editForm.content_url || ''}
                        onChange={(e) => setEditForm({ ...editForm, content_url: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
                      <input
                        type="url"
                        value={editForm.image_url || ''}
                        onChange={(e) => setEditForm({ ...editForm, image_url: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                  </>
                )}

                {/* Venue form */}
                {activeTab === 'venues' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                      <input
                        type="text"
                        value={editForm.name || ''}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                      <input
                        type="text"
                        value={editForm.address || ''}
                        onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                        <input
                          type="text"
                          value={editForm.city || ''}
                          onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                        <input
                          type="text"
                          value={editForm.country || ''}
                          onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
                        <input
                          type="number"
                          step="any"
                          value={editForm.latitude || ''}
                          onChange={(e) => setEditForm({ ...editForm, latitude: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
                        <input
                          type="number"
                          step="any"
                          value={editForm.longitude || ''}
                          onChange={(e) => setEditForm({ ...editForm, longitude: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Website URL</label>
                      <input
                        type="url"
                        value={editForm.content_url || ''}
                        onChange={(e) => setEditForm({ ...editForm, content_url: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                  </>
                )}

                {/* City form */}
                {activeTab === 'cities' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                      <input
                        type="text"
                        value={editForm.name || ''}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                      <input
                        type="text"
                        value={editForm.country || ''}
                        onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
                        <input
                          type="number"
                          step="any"
                          value={editForm.latitude || ''}
                          onChange={(e) => setEditForm({ ...editForm, latitude: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
                        <input
                          type="number"
                          step="any"
                          value={editForm.longitude || ''}
                          onChange={(e) => setEditForm({ ...editForm, longitude: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
                      <input
                        type="text"
                        value={editForm.timezone || ''}
                        onChange={(e) => setEditForm({ ...editForm, timezone: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="Europe/Berlin"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="is_active"
                        checked={editForm.is_active !== false}
                        onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                        className="rounded text-indigo-600"
                      />
                      <label htmlFor="is_active" className="text-sm">Active</label>
                    </div>
                  </>
                )}
              </div>

              {/* Save button */}
              <div className="sticky bottom-0 bg-white border-t px-4 py-3">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
          </>
        )}
      </main>
    </div>
  );
}
