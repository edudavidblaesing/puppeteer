'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  Calendar,
  MapPin,
  RefreshCw,
  Eye,
  EyeOff,
  Trash2,
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
  Link2,
  CloudDownload,
  Layers,
} from 'lucide-react';

// Dynamic import for EventMap (Leaflet requires client-side only)
const EventMap = dynamic(() => import('@/components/EventMap'), { ssr: false });
import { format } from 'date-fns';
import clsx from 'clsx';
import { Event, Stats, City, Venue, Artist, getEventTiming, sortEventsSmart } from '@/types';
import {
  fetchEvents,
  fetchEvent,
  fetchStats,
  deleteEvent,
  updateEvent,
  createEvent,
  setPublishStatus,
  fetchCities,
  fetchArtists,
  fetchArtist,
  createArtist,
  updateArtist,
  deleteArtist,
  fetchAdminCities,
  createCity,
  updateCity,
  deleteCity,
  fetchAdminVenues,
  fetchVenue,
  createVenue,
  updateVenue,
  deleteVenue,
  scrapeEvents,
  runMatching,
  fetchScrapeStats,
  fetchScrapedEvents,
  fetchScrapedVenues,
  fetchScrapedArtists,
  deduplicateData,
  syncEventsPipeline,
  fetchScrapeHistory,
  fetchRecentScrapes,
} from '@/lib/api';
import { MiniBarChart, MiniAreaChart, StatCard, RecentActivity } from '@/components/ScrapeCharts';

export type ActiveTab = 'events' | 'artists' | 'venues' | 'cities' | 'scrape';

export interface AdminDashboardProps {
  initialTab?: ActiveTab;
}

export function AdminDashboard({ initialTab }: AdminDashboardProps) {
  const router = useRouter();
  const pathname = usePathname();
  
  // Determine active tab from pathname or initialTab prop
  const getTabFromPathname = (path: string): ActiveTab => {
    if (path === '/events') return 'events';
    if (path === '/artists') return 'artists';
    if (path === '/venues') return 'venues';
    if (path === '/cities') return 'cities';
    if (path === '/scrape') return 'scrape';
    return 'events'; // default for root path
  };
  
  // Redirect root path to /events
  useEffect(() => {
    if (pathname === '/') {
      router.replace('/events');
    }
  }, [pathname, router]);
  
  // Main state
  const [activeTab, setActiveTabState] = useState<ActiveTab>(initialTab || getTabFromPathname(pathname));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Handle tab changes with URL navigation
  const setActiveTab = useCallback((tab: ActiveTab) => {
    setActiveTabState(tab);
    router.push(`/${tab}`);
  }, [router]);

  // Events state
  const [events, setEvents] = useState<Event[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Artists state
  const [artists, setArtists] = useState<Artist[]>([]);
  const [artistsTotal, setArtistsTotal] = useState(0);
  const [scrapedArtists, setScrapedArtists] = useState<any[]>([]);
  const [scrapedArtistsTotal, setScrapedArtistsTotal] = useState(0);

  // Venues state
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venuesTotal, setVenuesTotal] = useState(0);
  const [scrapedVenues, setScrapedVenues] = useState<any[]>([]);
  const [scrapedVenuesTotal, setScrapedVenuesTotal] = useState(0);

  // Cities state
  const [adminCities, setAdminCities] = useState<City[]>([]);
  const [citiesTotal, setCitiesTotal] = useState(0);

  // Scraped events state (for main/scraped toggle in events tab)
  const [scrapedEventsData, setScrapedEventsData] = useState<any[]>([]);
  const [scrapedEventsTotal, setScrapedEventsTotal] = useState(0);

  // Scrape state
  const [scrapeStats, setScrapeStats] = useState<any>(null);
  const [scrapedEvents, setScrapedEvents] = useState<any[]>([]);
  const [scrapeCity, setScrapeCity] = useState('all'); // 'all' for all cities from DB
  const [scrapeSources, setScrapeSources] = useState<string[]>(['ra', 'ticketmaster']);
  const [isScraping, setIsScraping] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<any>(null);
  
  // Sync pipeline state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [syncProgress, setSyncProgress] = useState<string>('');
  
  // Scrape history for charts
  const [scrapeHistory, setScrapeHistory] = useState<any[]>([]);
  const [recentScrapes, setRecentScrapes] = useState<any[]>([]);
  const [historyTotals, setHistoryTotals] = useState<any>(null);

  // Filters
  const [cityFilter, setCityFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [total, setTotal] = useState(0);

  // Edit panel state
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [sourceReferences, setSourceReferences] = useState<any[]>([]);
  const [selectedSourceFields, setSelectedSourceFields] = useState<Record<string, string>>({});

  // Autocomplete state for event form
  const [artistSearch, setArtistSearch] = useState('');
  const [venueSearch, setVenueSearch] = useState('');
  const [artistSuggestions, setArtistSuggestions] = useState<any[]>([]);
  const [venueSuggestions, setVenueSuggestions] = useState<any[]>([]);
  const [showArtistDropdown, setShowArtistDropdown] = useState(false);
  const [showVenueDropdown, setShowVenueDropdown] = useState(false);

  // Load events data
  const loadEvents = useCallback(async () => {
    try {
      const [eventsData, statsData, citiesData, scrapedData] = await Promise.all([
        fetchEvents({
          city: cityFilter || undefined,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
        fetchStats().catch(() => ({ total_events: 0, venues: 0, cities: 0 })),
        fetchCities().catch(() => []),
        fetchScrapedEvents({
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }).catch(() => ({ data: [], total: 0 })),
      ]);

      setEvents(eventsData.data || []);
      setTotal(eventsData.total || 0);
      setStats(statsData);
      setCities(citiesData || []);
      setScrapedEventsData(scrapedData.data || []);
      setScrapedEventsTotal(scrapedData.total || 0);
    } catch (error) {
      console.error('Failed to load events:', error);
    }
  }, [cityFilter, page, pageSize]);

  // Load artists
  const loadArtists = useCallback(async () => {
    try {
      const [data, scrapedData] = await Promise.all([
        fetchArtists({
          search: searchQuery || undefined,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
        fetchScrapedArtists({
          search: searchQuery || undefined,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }).catch(() => ({ data: [], total: 0 })),
      ]);
      setArtists(data.data || []);
      setArtistsTotal(data.total || 0);
      setScrapedArtists(scrapedData.data || []);
      setScrapedArtistsTotal(scrapedData.total || 0);
    } catch (error) {
      console.error('Failed to load artists:', error);
    }
  }, [searchQuery, page, pageSize]);

  // Load venues
  const loadVenues = useCallback(async () => {
    try {
      const [data, scrapedData] = await Promise.all([
        fetchAdminVenues({
          search: searchQuery || undefined,
          city: cityFilter || undefined,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
        fetchScrapedVenues({
          search: searchQuery || undefined,
          city: cityFilter || undefined,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }).catch(() => ({ data: [], total: 0 })),
      ]);
      setVenues(data.data || []);
      setVenuesTotal(data.total || 0);
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
        limit: 500,
        offset: 0,
      });
      setAdminCities(data.data || []);
      setCitiesTotal(data.total || 0);
    } catch (error) {
      console.error('Failed to load cities:', error);
    }
  }, [searchQuery]);

  // Load scrape data
  const loadScrapeData = useCallback(async () => {
    try {
      const [statsData, eventsData, historyData, recentData] = await Promise.all([
        fetchScrapeStats().catch(() => null),
        fetchScrapedEvents({ limit: 50, linked: false }).catch(() => ({ data: [] })),
        fetchScrapeHistory({ days: 30 }).catch(() => ({ history: [], totals: null })),
        fetchRecentScrapes(15).catch(() => []),
      ]);
      setScrapeStats(statsData);
      setScrapedEvents(eventsData.data || []);
      setScrapeHistory(historyData.history || []);
      setHistoryTotals(historyData.totals || null);
      setRecentScrapes(recentData || []);
    } catch (error) {
      console.error('Failed to load scrape data:', error);
    }
  }, []);

  // Main data loader
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'events') {
        // Also load artists and venues for autocomplete
        await Promise.all([
          loadEvents(),
          loadArtists(),
          loadVenues()
        ]);
      }
      else if (activeTab === 'artists') await loadArtists();
      else if (activeTab === 'venues') await loadVenues();
      else if (activeTab === 'cities') await loadCities();
      else if (activeTab === 'scrape') {
        // Load both scrape data AND events for pending list
        await Promise.all([
          loadScrapeData(),
          loadEvents()
        ]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, loadEvents, loadArtists, loadVenues, loadCities, loadScrapeData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Autocomplete search for artists
  useEffect(() => {
    if (artistSearch.length >= 2) {
      const filtered = artists.filter(a => 
        a.name?.toLowerCase().includes(artistSearch.toLowerCase())
      ).slice(0, 8);
      setArtistSuggestions(filtered);
      setShowArtistDropdown(filtered.length > 0);
    } else {
      setArtistSuggestions([]);
      setShowArtistDropdown(false);
    }
  }, [artistSearch, artists]);

  // Autocomplete search for venues
  useEffect(() => {
    if (venueSearch.length >= 2) {
      const filtered = venues.filter(v => 
        v.name?.toLowerCase().includes(venueSearch.toLowerCase())
      ).slice(0, 8);
      setVenueSuggestions(filtered);
      setShowVenueDropdown(filtered.length > 0);
    } else {
      setVenueSuggestions([]);
      setShowVenueDropdown(false);
    }
  }, [venueSearch, venues]);

  // Reset page when changing tabs or filters
  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
    setShowEditPanel(false);
    setEditingItem(null);
  }, [activeTab, cityFilter, searchQuery, statusFilter]);

  // Filter events locally
  const filteredEvents = useMemo(() => {
    const sourceEvents = events; // Main events table is THE source
    const filtered = sourceEvents.filter((event) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matches =
          event.title?.toLowerCase().includes(query) ||
          event.venue_name?.toLowerCase().includes(query) ||
          event.artists?.toLowerCase().includes(query);
        if (!matches) return false;
      }
      if (statusFilter !== 'all' && event.publish_status !== statusFilter) return false;
      return true;
    });
    // Apply smart sorting: pending first for review, then by timing
    return sortEventsSmart(filtered);
  }, [events, searchQuery, statusFilter]);

  // Get current total based on tab
  const currentTotal = useMemo(() => {
    if (activeTab === 'events') return total;
    if (activeTab === 'artists') return artistsTotal;
    if (activeTab === 'venues') return venuesTotal;
    if (activeTab === 'cities') return citiesTotal;
    return 0;
  }, [activeTab, total, artistsTotal, venuesTotal, citiesTotal]);

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
      
      // Fetch source references for events (from linked scraped sources)
      if (item.id) {
        fetchEvent(item.id).then(data => {
          setSourceReferences(data.source_references || []);
        }).catch(console.error);
      }
    } else if (activeTab === 'artists' && item.id) {
      setEditForm({ ...item });
      fetchArtist(item.id).then(data => {
        setSourceReferences(data.source_references || []);
      }).catch(console.error);
    } else if (activeTab === 'venues' && item.id) {
      setEditForm({ ...item });
      fetchVenue(item.id).then(data => {
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
      setEditForm({ title: '', date: '', venue_name: '', venue_city: '', artists: '', publish_status: 'pending' });
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
          await updateEvent(editingItem.id, editForm);
          setEvents(events.map(e => e.id === editingItem.id ? { ...e, ...editForm } : e));
        } else {
          await createEvent(editForm);
          await loadEvents();
        }
      } else if (activeTab === 'artists') {
        if (editingItem) {
          await updateArtist(editingItem.id, editForm);
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
          await updateVenue(editingItem.id, payload);
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
  const handleBulkSetStatus = async (status: 'pending' | 'approved' | 'rejected') => {
    try {
      const ids = Array.from(selectedIds);
      await setPublishStatus(ids, status);
      setEvents(events.map(e => selectedIds.has(e.id) ? { ...e, publish_status: status } : e));
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

  // Sync Pipeline - scrape → match → enrich → dedupe
  const handleSyncWorkflow = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    setSyncProgress('Starting sync pipeline...');
    try {
      // Get cities to sync
      let citiesToSync: string[] = [];
      if (scrapeCity === 'all') {
        // Get all active cities from database
        setSyncProgress('Fetching cities from database...');
        const citiesData = await fetchCities();
        citiesToSync = citiesData.map((c: any) => c.name.toLowerCase());
        if (citiesToSync.length === 0) {
          // Fallback to common cities
          citiesToSync = ['berlin', 'hamburg', 'munich', 'cologne', 'frankfurt'];
        }
      } else {
        citiesToSync = [scrapeCity];
      }
      
      setSyncProgress(`Syncing ${citiesToSync.length} cities: ${citiesToSync.slice(0, 3).join(', ')}${citiesToSync.length > 3 ? '...' : ''}`);
      
      const result = await syncEventsPipeline({
        cities: citiesToSync,
        sources: scrapeSources,
        enrichAfter: true,
        dedupeAfter: true,
      });
      
      setSyncResult(result);
      setSyncProgress('Reloading data...');
      
      // Reload all data after sync completes
      await Promise.all([
        loadScrapeData(),
        loadEvents(),
        loadArtists(),
        loadVenues(),
      ]);
      setSyncProgress('');
    } catch (error: any) {
      console.error('Sync pipeline failed:', error);
      setSyncResult({ error: error.message });
      setSyncProgress('');
    } finally {
      setIsSyncing(false);
    }
  };

  // Legacy: Multi-source scraping (keeping for backwards compatibility)
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

  // Deduplicate data (events, venues, artists)
  const [isDeduplicating, setIsDeduplicating] = useState(false);
  const handleDeduplicate = async (type: 'all' | 'events' | 'venues' | 'artists' = 'all') => {
    setIsDeduplicating(true);
    try {
      const result = await deduplicateData(type);
      alert(result.message);
      // Refresh data based on what was deduplicated
      if (type === 'all' || type === 'events') {
        await loadScrapeData();
        await loadEvents();
      }
      if (type === 'all' || type === 'venues') {
        await loadVenues();
      }
      if (type === 'all' || type === 'artists') {
        await loadArtists();
      }
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
  // Cycle publish status for single event
  const handleCycleStatus = async (event: Event) => {
    const statusCycle: Record<string, 'pending' | 'approved' | 'rejected'> = {
      'pending': 'approved',
      'approved': 'rejected',
      'rejected': 'pending'
    };
    const newStatus = statusCycle[event.publish_status || 'pending'];
    try {
      await setPublishStatus([event.id], newStatus);
      setEvents(events.map(e => e.id === event.id ? { ...e, publish_status: newStatus } : e));
    } catch (error) {
      console.error('Failed to update publish status:', error);
    }
  };

  // Get timing badge styling
  const getTimingBadge = (event: Event) => {
    const timing = getEventTiming(event);
    const styles = {
      upcoming: { bg: 'bg-blue-100', text: 'text-blue-700', label: '↗ Upcoming' },
      ongoing: { bg: 'bg-green-100', text: 'text-green-700', label: '● Live Now' },
      recent: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: '↙ Recent' },
      expired: { bg: 'bg-gray-100', text: 'text-gray-500', label: '✓ Past' }
    };
    return styles[timing];
  };

  // Render list items based on active tab
  const renderListItem = (item: any) => {
    if (activeTab === 'events') {
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
              {item.source_references?.length > 0 && (
                <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded flex-shrink-0">
                  {item.source_references.map((s: any) => s.source_code?.toUpperCase()).join(' + ')}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 truncate">{item.venue_name} • {item.venue_city}</p>
          </div>
          <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
            <div className="flex items-center gap-1">
              <p className="text-xs font-medium">{item.date ? format(new Date(item.date), 'MMM d') : '—'}</p>
              {(() => {
                const badge = getTimingBadge(item);
                return (
                  <span className={clsx('text-[10px] px-1.5 py-0.5 rounded', badge.bg, badge.text)}>
                    {badge.label}
                  </span>
                );
              })()}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); handleCycleStatus(item); }}
              className={clsx(
                'text-xs px-2 py-0.5 rounded',
                item.publish_status === 'approved' ? 'bg-green-100 text-green-700' : 
                item.publish_status === 'rejected' ? 'bg-red-100 text-red-700' : 
                'bg-yellow-100 text-yellow-700'
              )}
            >
              {item.publish_status === 'approved' ? '✓ Live' : 
               item.publish_status === 'rejected' ? '✗ Hidden' : 
               '? Pending'}
            </button>
          </div>
        </div>
      );
    }

    if (activeTab === 'artists') {
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
              {item.source_references?.length > 0 && (
                <span className="bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded">
                  {item.source_references.length} sources
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
          {item.source_references?.length > 0 && (
            <span className="bg-indigo-100 text-indigo-600 text-xs px-2 py-0.5 rounded">
              {item.source_references.length} sources
            </span>
          )}
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

  // Get items for current tab
  const currentItems = useMemo(() => {
    if (activeTab === 'events') return filteredEvents;
    if (activeTab === 'artists') return artists;
    if (activeTab === 'venues') return venues;
    if (activeTab === 'cities') return adminCities;
    return [];
  }, [activeTab, filteredEvents, artists, venues, adminCities]);

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Secondary toolbar */}
      <header className="bg-white border-b flex-shrink-0 z-50">
        <div className="flex items-center px-4 py-2 gap-3 bg-gray-50">
          {/* Refresh button */}
          <button onClick={loadData} className="p-2 hover:bg-gray-200 rounded-lg" title="Refresh">
            <RefreshCw className={clsx('w-4 h-4', isLoading && 'animate-spin')} />
          </button>
          
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
              <option value="pending">⏳ Pending</option>
              <option value="approved">✓ Approved</option>
              <option value="rejected">✗ Rejected</option>
            </select>
          )}



          {/* Dedupe button for venues only */}
          {activeTab === 'venues' && (
            <button
              onClick={() => handleDeduplicate('venues')}
              disabled={isDeduplicating}
              className="px-3 py-1.5 text-xs bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 disabled:opacity-50 flex items-center gap-1"
              title="Merge duplicate venues"
            >
              {isDeduplicating ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <Layers className="w-3 h-3" />
              )}
              Dedupe
            </button>
          )}

          <div className="flex-1" />

          {/* Bulk actions */}
          {selectedIds.size > 0 && activeTab === 'events' && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">{selectedIds.size} selected</span>
              <button onClick={() => handleBulkSetStatus('approved')} className="px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded-lg hover:bg-green-200 flex items-center gap-1">
                <Eye className="w-3 h-3" /> Approve
              </button>
              <button onClick={() => handleBulkSetStatus('rejected')} className="px-3 py-1.5 text-xs bg-red-100 text-red-700 rounded-lg hover:bg-red-200 flex items-center gap-1">
                <EyeOff className="w-3 h-3" /> Reject
              </button>
              <button onClick={() => handleBulkSetStatus('pending')} className="px-3 py-1.5 text-xs bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 flex items-center gap-1">
                Reset
              </button>
              <button onClick={handleBulkDelete} className="px-3 py-1.5 text-xs bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            </div>
          )}

          {/* Add button */}
          {activeTab !== 'scrape' && (
            <button
              onClick={handleCreate}
              className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> Add {activeTab === 'cities' ? 'city' : activeTab.slice(0, -1)}
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Scrape Tab Content - Split View */}
        {activeTab === 'scrape' ? (
          <div className="flex-1 flex">
            {/* LEFT SIDE - Pending Events TODO List */}
            <div className="bg-white border-r flex flex-col w-[420px]">
              {/* List header */}
              <div className="px-4 py-3 bg-gradient-to-r from-amber-50 to-orange-50 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CloudDownload className="w-4 h-4 text-amber-600" />
                  <span className="font-medium text-gray-700">Pending Events</span>
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">
                    {events.filter(e => e.publish_status === 'pending').length} to review
                  </span>
                </div>
                <button
                  onClick={loadData}
                  className="p-1.5 hover:bg-amber-100 rounded"
                  title="Refresh"
                >
                  <RefreshCw className={clsx('w-4 h-4 text-amber-600', isLoading && 'animate-spin')} />
                </button>
              </div>

              {/* Pending events list */}
              <div className="flex-1 overflow-auto">
                {isLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : events.filter(e => e.publish_status === 'pending').length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-gray-500 p-4">
                    <Check className="w-12 h-12 text-green-400 mb-3" />
                    <p className="font-medium">All caught up!</p>
                    <p className="text-sm text-gray-400 text-center mt-1">No pending events to review.</p>
                  </div>
                ) : (
                  sortEventsSmart(events.filter(e => e.publish_status === 'pending')).map((event) => (
                    <div
                      key={event.id}
                      onClick={() => { setActiveTabState('events'); handleEdit(event); }}
                      className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-amber-50 border-b transition-colors"
                    >
                      <div className="w-10 h-10 rounded bg-gray-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {event.flyer_front ? (
                          <img src={event.flyer_front} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Calendar className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{event.title}</p>
                        <p className="text-xs text-gray-500 truncate">{event.venue_name} • {event.venue_city}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-medium">{event.date ? format(new Date(event.date), 'MMM d') : '—'}</p>
                        {(() => {
                          const badge = getTimingBadge(event);
                          return (
                            <span className={clsx('text-[10px] px-1.5 py-0.5 rounded', badge.bg, badge.text)}>
                              {badge.label}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              {/* Unlinked Scraped Events */}
              {scrapedEvents.length > 0 && (
                <div className="border-t">
                  <div className="px-4 py-2 bg-gray-50 border-b flex items-center gap-2">
                    <Layers className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-600">Unlinked Scraped ({scrapedEvents.length})</span>
                  </div>
                  <div className="max-h-48 overflow-auto">
                    {scrapedEvents.slice(0, 10).map((event) => (
                      <div key={event.id} className="px-4 py-2 border-b hover:bg-gray-50 flex items-center gap-3">
                        <span className={clsx(
                          'px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0',
                          event.source_code === 'ra' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                        )}>
                          {event.source_code?.toUpperCase()}
                        </span>
                        <span className="text-xs truncate flex-1">{event.title}</span>
                        <span className="text-[10px] text-gray-400">{event.date ? format(new Date(event.date), 'MMM d') : ''}</span>
                        {event.content_url && (
                          <a href={event.content_url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-indigo-600" onClick={e => e.stopPropagation()}>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT SIDE - Stats & Controls */}
            <div className="flex-1 overflow-auto p-6 bg-gray-50">
              <div className="max-w-3xl mx-auto space-y-6">
                {/* Last Scraped Info */}
                {scrapeStats?.last_scraped_at && (
                  <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-4 border border-indigo-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-sm text-gray-600">
                          Last synced: <span className="font-medium text-gray-900">
                            {new Date(scrapeStats.last_scraped_at).toLocaleString('en-US', { 
                              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                            })}
                          </span>
                          {scrapeStats.last_scraped_city && (
                            <span className="text-gray-500"> • {scrapeStats.last_scraped_city}</span>
                          )}
                          {scrapeStats.last_scraped_source && (
                            <span className={`ml-2 px-1.5 py-0.5 rounded text-xs font-medium ${
                              scrapeStats.last_scraped_source === 'ra' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                            }`}>
                              {scrapeStats.last_scraped_source.toUpperCase()}
                            </span>
                          )}
                        </span>
                      </div>
                      {historyTotals && (
                        <span className="text-xs text-gray-500">
                          {historyTotals.total_scrape_runs} total runs
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Sync Controls Card */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                    <CloudDownload className="w-5 h-5 text-indigo-600" />
                    Fetch New Events
                  </h3>
                  
                  <div className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      {/* City Selection */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                        <select
                          value={scrapeCity}
                          onChange={(e) => setScrapeCity(e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg bg-white"
                        >
                          <option value="all">🌍 All Cities (from database)</option>
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
                          </optgroup>
                          <optgroup label="🇬🇧 UK">
                            <option value="london">London</option>
                            <option value="manchester">Manchester</option>
                            <option value="birmingham">Birmingham</option>
                            <option value="glasgow">Glasgow</option>
                            <option value="bristol">Bristol</option>
                          </optgroup>
                          <optgroup label="🇪🇺 Europe">
                            <option value="amsterdam">Amsterdam</option>
                            <option value="paris">Paris</option>
                            <option value="barcelona">Barcelona</option>
                            <option value="vienna">Vienna</option>
                            <option value="prague">Prague</option>
                            <option value="ibiza">Ibiza</option>
                          </optgroup>
                          <optgroup label="🇺🇸 USA">
                            <option value="new york">New York</option>
                            <option value="los angeles">Los Angeles</option>
                            <option value="miami">Miami</option>
                            <option value="detroit">Detroit</option>
                          </optgroup>
                        </select>
                      </div>

                      {/* Source Selection */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Sources</label>
                        <div className="flex gap-4 mt-3">
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
                    </div>

                    {/* Sync Button */}
                    <button
                      onClick={handleSyncWorkflow}
                      disabled={isSyncing || scrapeSources.length === 0}
                      className="w-full px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium shadow-md"
                    >
                      {isSyncing ? (
                        <>
                          <RefreshCw className="w-5 h-5 animate-spin" />
                          {syncProgress || 'Running Pipeline...'}
                        </>
                      ) : (
                        <>
                          <CloudDownload className="w-5 h-5" />
                          Sync {scrapeCity === 'all' ? 'All Cities' : scrapeCity.charAt(0).toUpperCase() + scrapeCity.slice(1)}
                        </>
                      )}
                    </button>

                    {/* Pipeline Info */}
                    <div className="px-4 py-3 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-600">
                      <span className="font-medium">Pipeline:</span> Scrape → Match & Link → Enrich → Deduplicate
                      {scrapeCity === 'all' && (
                        <p className="text-amber-600 mt-1">⚠️ Syncing all cities may take several minutes.</p>
                      )}
                    </div>

                    {/* Sync Result */}
                    {syncResult && (
                      <div className={clsx(
                        'p-4 rounded-lg',
                        syncResult.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
                      )}>
                        {syncResult.error ? (
                          <p>Error: {syncResult.error}</p>
                        ) : (
                          <div className="space-y-1 text-sm">
                            <p className="font-medium">✓ Sync completed</p>
                            {syncResult.scrape && (
                              <p className="text-xs">{syncResult.scrape.fetched || 0} fetched, {syncResult.scrape.inserted || 0} new</p>
                            )}
                            {syncResult.dedupe && (
                              <p className="text-xs">{syncResult.dedupe.events_merged || 0} events merged</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Stats Overview */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h3 className="font-semibold text-lg mb-4">Database Overview</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <StatCard
                      title="Total Events"
                      value={scrapeStats?.total_main_events || 0}
                      subValue={`${scrapeStats?.published_events || 0} approved`}
                      color="#22c55e"
                    />
                    <StatCard
                      title="Pending Review"
                      value={events.filter(e => e.publish_status === 'pending').length}
                      color="#f59e0b"
                    />
                    <StatCard
                      title="Venues"
                      value={scrapeStats?.total_main_venues || 0}
                      color="#6366f1"
                    />
                    <StatCard
                      title="Artists"
                      value={scrapeStats?.total_main_artists || 0}
                      color="#ec4899"
                    />
                    <StatCard
                      title="From RA"
                      value={scrapeStats?.ra_events || 0}
                      color="#8b5cf6"
                    />
                    <StatCard
                      title="From Ticketmaster"
                      value={scrapeStats?.ticketmaster_events || 0}
                      color="#06b6d4"
                    />
                  </div>
                </div>

                {/* Activity Chart */}
                {scrapeHistory.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm p-6">
                    <h3 className="font-semibold text-lg mb-4">Scraping Activity (Last 30 Days)</h3>
                    <MiniAreaChart
                      data={scrapeHistory}
                      lines={[
                        { dataKey: 'events_fetched', color: '#6366f1', label: 'Events Fetched' },
                        { dataKey: 'events_inserted', color: '#22c55e', label: 'New Events' },
                        { dataKey: 'venues_created', color: '#f59e0b', label: 'New Venues' },
                      ]}
                      height={100}
                    />
                  </div>
                )}

                {/* Recent Activity */}
                {recentScrapes.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm p-6">
                    <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                      <RefreshCw className="w-5 h-5 text-gray-400" />
                      Recent Activity
                    </h3>
                    <RecentActivity activities={recentScrapes} />
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex">
            {/* List Panel */}
            <div className="bg-white border-r flex flex-col w-96">
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

            {/* Edit Panel */}
            {showEditPanel ? (
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
                {/* Source References Section - show linked scraped sources */}
                {sourceReferences.length > 0 && editingItem && (
                  <div className="bg-gray-50 rounded-lg p-3 border">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <Layers className="w-4 h-4" />
                      Linked Sources ({sourceReferences.length})
                    </h3>
                    <div className="space-y-2 max-h-32 overflow-auto">
                      {sourceReferences.map((source: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between text-xs bg-white rounded px-2 py-1.5 border">
                          <span className="flex items-center gap-2">
                            <span className={clsx(
                              'px-1.5 py-0.5 rounded font-medium uppercase',
                              source.source_code === 'manual' ? 'bg-green-100 text-green-700' :
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
                      Click "Use" to apply source data. Changes will be saved to your main record.
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
                    <div className="relative">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Venue</label>
                      <input
                        type="text"
                        value={editForm.venue_name || ''}
                        onChange={(e) => {
                          setEditForm({ ...editForm, venue_name: e.target.value });
                          setVenueSearch(e.target.value);
                        }}
                        onFocus={() => venueSearch.length >= 2 && setShowVenueDropdown(true)}
                        onBlur={() => setTimeout(() => setShowVenueDropdown(false), 200)}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                        placeholder="Type to search venues..."
                      />
                      {showVenueDropdown && venueSuggestions.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-auto">
                          {venueSuggestions.map((venue: any) => (
                            <button
                              key={venue.id}
                              type="button"
                              onClick={() => {
                                setEditForm({
                                  ...editForm,
                                  venue_name: venue.name,
                                  venue_city: venue.city || editForm.venue_city,
                                  venue_country: venue.country || editForm.venue_country,
                                  venue_address: venue.address || editForm.venue_address,
                                  venue_id: venue.id
                                });
                                setShowVenueDropdown(false);
                                setVenueSearch('');
                              }}
                              className="w-full px-3 py-2 text-left hover:bg-indigo-50 flex items-center gap-2 border-b last:border-0"
                            >
                              <Building2 className="w-4 h-4 text-gray-400" />
                              <div>
                                <p className="text-sm font-medium">{venue.name}</p>
                                <p className="text-xs text-gray-500">{venue.city}, {venue.country}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
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
                    <div className="relative">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Artists</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={artistSearch}
                          onChange={(e) => setArtistSearch(e.target.value)}
                          onFocus={() => artistSearch.length >= 2 && setShowArtistDropdown(true)}
                          onBlur={() => setTimeout(() => setShowArtistDropdown(false), 200)}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                          placeholder="Type to search artists..."
                        />
                        {showArtistDropdown && artistSuggestions.length > 0 && (
                          <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-auto">
                            {artistSuggestions.map((artist: any) => (
                              <button
                                key={artist.id}
                                type="button"
                                onClick={() => {
                                  const currentArtists = editForm.artists ? editForm.artists.split(',').map((a: string) => a.trim()).filter(Boolean) : [];
                                  if (!currentArtists.includes(artist.name)) {
                                    currentArtists.push(artist.name);
                                    setEditForm({ ...editForm, artists: currentArtists.join(', ') });
                                  }
                                  setArtistSearch('');
                                  setShowArtistDropdown(false);
                                }}
                                className="w-full px-3 py-2 text-left hover:bg-indigo-50 flex items-center gap-2 border-b last:border-0"
                              >
                                {artist.image_url ? (
                                  <img src={artist.image_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                                ) : (
                                  <Music className="w-4 h-4 text-gray-400" />
                                )}
                                <span className="text-sm font-medium">{artist.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Selected artists display */}
                      {editForm.artists && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {editForm.artists.split(',').map((artist: string, idx: number) => artist.trim() && (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs"
                            >
                              {artist.trim()}
                              <button
                                type="button"
                                onClick={() => {
                                  const currentArtists = editForm.artists.split(',').map((a: string) => a.trim()).filter(Boolean);
                                  currentArtists.splice(idx, 1);
                                  setEditForm({ ...editForm, artists: currentArtists.join(', ') });
                                }}
                                className="hover:text-indigo-900"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
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
          ) : activeTab === 'events' ? (
            <div className="flex-1 bg-white border-l overflow-hidden">
              <EventMap
                events={filteredEvents}
                cities={cities}
                onEventClick={(event) => handleEdit(event)}
                onCityChange={(city) => setCityFilter(city)}
                selectedCity={cityFilter}
              />
            </div>
          ) : (
            <div className="flex-1 bg-gray-50 flex items-center justify-center">
              <div className="text-center text-gray-500">
                <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Select an item to view details</p>
                <p className="text-sm mt-1">or click "Add" to create new</p>
              </div>
            </div>
          )}
          </div>
        )}
      </main>
    </div>
  );
}
