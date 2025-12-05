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
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Ticket,
} from 'lucide-react';

// Dynamic import for EventMap (Leaflet requires client-side only)
const EventMap = dynamic(() => import('@/components/EventMap'), { ssr: false });
import { format } from 'date-fns';
import clsx from 'clsx';
import { Event, Stats, City, Venue, Artist, getEventTiming, sortEventsSmart, EventType, EVENT_TYPES } from '@/types';
import {
  fetchEvents,
  fetchEvent,
  fetchStats,
  deleteEvent,
  updateEvent,
  createEvent,
  setPublishStatus,
  fetchCities,
  fetchCountries,
  fetchCitiesDropdown,
  searchVenues,
  searchArtists,
  fetchEventArtists,
  addEventArtist,
  removeEventArtist,
  checkHealth,
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
  getSyncStatus,
  fetchScrapeHistory,
  fetchRecentScrapes,
  executeSqlQuery,
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
  
  // Dropdown data for city/country
  const [countriesDropdown, setCountriesDropdown] = useState<{name: string; code?: string}[]>([]);
  const [citiesDropdown, setCitiesDropdown] = useState<{name: string; country: string}[]>([]);

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
  const [syncJobStatus, setSyncJobStatus] = useState<any>(null);
  
  // Scrape history for charts
  const [scrapeHistory, setScrapeHistory] = useState<any[]>([]);
  const [recentScrapes, setRecentScrapes] = useState<any[]>([]);
  const [historyTotals, setHistoryTotals] = useState<any>(null);
  
  // SQL Console state
  const [showSqlConsole, setShowSqlConsole] = useState(false);
  const [sqlQuery, setSqlQuery] = useState('SELECT COUNT(*) FROM events;');
  const [sqlResult, setSqlResult] = useState<any>(null);
  const [sqlError, setSqlError] = useState<string>('');
  const [isExecutingSql, setIsExecutingSql] = useState(false);
  
  // Connection status
  const [dbConnected, setDbConnected] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);

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
          search: searchQuery || undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
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
  }, [cityFilter, searchQuery, statusFilter, page, pageSize]);

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
  
  // Load dropdown data and check connection on mount
  useEffect(() => {
    const initDropdowns = async () => {
      try {
        // Check health first
        const health = await checkHealth();
        setDbConnected(health.connected);
        if (!health.connected) {
          setConnectionError(health.error || 'Database connection failed');
        } else {
          setConnectionError(null);
        }
        
        // Load countries and cities for dropdowns
        const [countriesData, citiesData] = await Promise.all([
          fetchCountries().catch(() => []),
          fetchCitiesDropdown().catch(() => []),
        ]);
        setCountriesDropdown(countriesData);
        setCitiesDropdown(citiesData);
      } catch (error) {
        console.error('Failed to initialize dropdowns:', error);
        setDbConnected(false);
        setConnectionError((error as Error).message);
      }
    };
    
    initDropdowns();
  }, []);

  // Autocomplete search for artists (using API)
  useEffect(() => {
    const doSearch = async () => {
      if (artistSearch.length >= 2) {
        try {
          const results = await searchArtists(artistSearch);
          setArtistSuggestions(results.slice(0, 10));
          setShowArtistDropdown(results.length > 0);
        } catch {
          // Fallback to local filter
          const filtered = artists.filter(a => 
            a.name?.toLowerCase().includes(artistSearch.toLowerCase())
          ).slice(0, 8);
          setArtistSuggestions(filtered);
          setShowArtistDropdown(filtered.length > 0);
        }
      } else {
        setArtistSuggestions([]);
        setShowArtistDropdown(false);
      }
    };
    
    const debounce = setTimeout(doSearch, 200);
    return () => clearTimeout(debounce);
  }, [artistSearch, artists]);

  // Autocomplete search for venues (using API)
  useEffect(() => {
    const doSearch = async () => {
      if (venueSearch.length >= 2) {
        try {
          const results = await searchVenues(venueSearch, editForm?.venue_city);
          setVenueSuggestions(results.slice(0, 10));
          setShowVenueDropdown(results.length > 0);
        } catch {
          // Fallback to local filter
          const filtered = venues.filter(v => 
            v.name?.toLowerCase().includes(venueSearch.toLowerCase())
          ).slice(0, 8);
          setVenueSuggestions(filtered);
          setShowVenueDropdown(filtered.length > 0);
        }
      } else {
        setVenueSuggestions([]);
        setShowVenueDropdown(false);
      }
    };
    
    const debounce = setTimeout(doSearch, 200);
    return () => clearTimeout(debounce);
  }, [venueSearch, venues, editForm?.venue_city]);

  // Reset page when changing tabs or filters
  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
    setShowEditPanel(false);
    setEditingItem(null);
  }, [activeTab, cityFilter, searchQuery, statusFilter]);

  // Events are already filtered by the backend, just apply smart sorting
  const filteredEvents = useMemo(() => {
    // Apply smart sorting: pending first for review, then by timing
    return sortEventsSmart(events);
  }, [events]);

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
        // Handle timestamp format like "2025-12-02T20:00:00.000Z" or time format "23:00:00"
        if (formData.start_time.includes('T')) {
          const timePart = formData.start_time.split('T')[1];
          formData.start_time = timePart ? timePart.substring(0, 5) : '';
        } else {
          formData.start_time = formData.start_time.substring(0, 5);
        }
      }
      // Parse artists from JSON string to array of names
      if (formData.artists && typeof formData.artists === 'string') {
        try {
          const artistsArray = JSON.parse(formData.artists);
          if (Array.isArray(artistsArray)) {
            formData.artistsList = artistsArray.map((a: any) => a.name || a).filter(Boolean);
          } else {
            formData.artistsList = [];
          }
        } catch {
          // If not JSON, treat as comma-separated
          formData.artistsList = formData.artists.split(',').map((a: string) => a.trim()).filter(Boolean);
        }
      } else {
        formData.artistsList = [];
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
      setEditForm({ title: '', date: '', venue_name: '', venue_city: '', artists: '', publish_status: 'pending', event_type: 'event' });
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
        // Convert artistsList back to artists JSON format for the API
        const saveData = { ...editForm };
        if (saveData.artistsList) {
          saveData.artists = JSON.stringify(saveData.artistsList.map((name: string) => ({ name })));
          delete saveData.artistsList;
        }
        
        if (editingItem) {
          await updateEvent(editingItem.id, saveData);
          setEvents(events.map(e => e.id === editingItem.id ? { ...e, ...saveData } : e));
        } else {
          await createEvent(saveData);
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
          setSyncProgress('No cities in database');
          setIsSyncing(false);
          return;
        }
      } else {
        citiesToSync = [scrapeCity];
      }
      
      setSyncProgress(`Starting sync for ${citiesToSync.length} cities...`);
      
      const result = await syncEventsPipeline({
        cities: citiesToSync,
        sources: scrapeSources,
        enrichAfter: true,
        dedupeAfter: true,
      });
      
      // Job started, will be polled in useEffect
      console.log('Sync job started:', result);
      
    } catch (error: any) {
      console.error('Sync pipeline failed:', error);
      setSyncResult({ error: error.message });
      setSyncProgress('');
      setIsSyncing(false);
    }
  };

  // Poll for sync status when syncing
  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;
    
    const pollSyncStatus = async () => {
      try {
        const status = await getSyncStatus();
        setSyncJobStatus(status);
        
        if (status.status === 'running') {
          setIsSyncing(true);
          const { currentCity, currentSource, phase, percentComplete } = status.progress || {};
          let progressText = `${phase || 'Processing'}...`;
          if (currentCity) progressText += ` ${currentCity}`;
          if (currentSource) progressText += ` (${currentSource})`;
          if (percentComplete !== undefined) progressText += ` ${percentComplete}%`;
          setSyncProgress(progressText);
        } else if (status.status === 'completed') {
          setIsSyncing(false);
          setSyncResult(status.results);
          setSyncProgress('Sync completed! Reloading data...');
          
          // Reload all data
          await Promise.all([
            loadScrapeData(),
            loadEvents(),
            loadArtists(),
            loadVenues(),
          ]);
          setSyncProgress('');
          setSyncJobStatus(null);
          
          if (pollInterval) clearInterval(pollInterval);
        } else if (status.status === 'failed') {
          setIsSyncing(false);
          setSyncResult({ error: status.error });
          setSyncProgress('');
          setSyncJobStatus(null);
          
          if (pollInterval) clearInterval(pollInterval);
        } else if (status.status === 'idle') {
          // No job running
          if (isSyncing) {
            setIsSyncing(false);
            setSyncProgress('');
          }
        }
      } catch (error) {
        console.error('Failed to fetch sync status:', error);
      }
    };
    
    // Check status on mount (in case we're returning to the page with a job running)
    pollSyncStatus();
    
    // Poll every 2 seconds if syncing
    if (isSyncing || syncJobStatus?.status === 'running') {
      pollInterval = setInterval(pollSyncStatus, 2000);
    }
    
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [isSyncing]);

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

  // Get timing styling for date (no label, just color/strikethrough)
  const getTimingStyle = (event: Event) => {
    const timing = getEventTiming(event);
    const styles = {
      upcoming: { dateClass: 'text-gray-900', strikethrough: false },
      ongoing: { dateClass: 'text-green-600 font-semibold', strikethrough: false },
      recent: { dateClass: 'text-gray-400', strikethrough: true },
      expired: { dateClass: 'text-gray-400', strikethrough: true }
    };
    return styles[timing];
  };

  // Render list items based on active tab
  const renderListItem = (item: any) => {
    if (activeTab === 'events') {
      // Get unique sources from source_references
      const sources = item.source_references?.reduce((acc: string[], ref: any) => {
        if (ref.source_code && !acc.includes(ref.source_code)) acc.push(ref.source_code);
        return acc;
      }, [] as string[]) || [];
      
      const timing = getTimingStyle(item);
      const isRejected = item.publish_status === 'rejected';
      const isPending = item.publish_status === 'pending';
      
      return (
        <div
          key={item.id}
          onClick={() => handleEdit(item)}
          className={clsx(
            'px-4 py-2.5 flex items-center gap-3 cursor-pointer border-b transition-colors relative',
            editingItem?.id === item.id && 'bg-indigo-50 border-l-2 border-l-indigo-500',
            isRejected && 'bg-gray-100',
            isPending && !editingItem?.id && 'bg-yellow-50',
            !isRejected && !isPending && !editingItem?.id && 'bg-white hover:bg-gray-50'
          )}
          style={isRejected ? {
            backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 10px, rgba(0,0,0,0.03) 10px, rgba(0,0,0,0.03) 20px)'
          } : undefined}
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
              {item.event_type && item.event_type !== 'event' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium flex-shrink-0">
                  {EVENT_TYPES.find(t => t.value === item.event_type)?.icon} {EVENT_TYPES.find(t => t.value === item.event_type)?.label}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-gray-500 truncate">{item.venue_name} • {item.venue_city}</p>
            </div>
            {/* Source badges below venue/city */}
            {sources.length > 0 && (
              <div className="flex items-center gap-1 mt-1">
                {sources.map((source: string) => (
                  <span
                    key={source}
                    className={clsx(
                      'text-[10px] px-1.5 py-0.5 rounded font-medium',
                      source === 'ra' ? 'bg-red-100 text-red-700' :
                      source === 'ticketmaster' ? 'bg-blue-100 text-blue-700' :
                      source === 'original' ? 'bg-green-100 text-green-700' :
                      'bg-gray-100 text-gray-700'
                    )}
                  >
                    {source.toUpperCase()}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="text-right flex-shrink-0 self-start pt-0.5">
            <p className={clsx(
              'text-sm font-medium',
              timing.dateClass,
              timing.strikethrough && 'line-through'
            )}>
              {item.date ? format(new Date(item.date), 'MMM d') : '—'}
            </p>
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
    <div className="h-full flex flex-col bg-gray-100 dark:bg-gray-950">
      {/* Connection Error Banner */}
      {!dbConnected && (
        <div className="bg-red-500 dark:bg-red-600 text-white px-4 py-2 flex items-center gap-2 flex-shrink-0">
          <AlertTriangle className="w-5 h-5" />
          <span className="font-medium">Database connection error:</span>
          <span>{connectionError || 'Unable to connect to database'}</span>
          <button 
            onClick={async () => {
              const health = await checkHealth();
              setDbConnected(health.connected);
              setConnectionError(health.connected ? null : health.error || 'Connection failed');
            }}
            className="ml-auto px-3 py-1 bg-white/20 dark:bg-white/10 rounded hover:bg-white/30 dark:hover:bg-white/20 text-sm"
          >
            Retry
          </button>
        </div>
      )}
      
      {/* Secondary toolbar */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex-shrink-0 z-50">
        <div className="flex items-center px-4 py-2 gap-3 bg-gray-50 dark:bg-gray-800">
          {/* Refresh button */}
          <button onClick={loadData} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-300" title="Refresh">
            <RefreshCw className={clsx('w-4 h-4', isLoading && 'animate-spin')} />
          </button>
          
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder={`Search ${activeTab}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400"
            />
          </div>

          {/* City filter (for events & venues) */}
          {(activeTab === 'events' || activeTab === 'venues') && (
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
            >
              <option value="">All Cities</option>
              {(citiesDropdown.length > 0 ? citiesDropdown : cities).map((city: any) => (
                <option key={city.id || city.name} value={city.name}>
                  {city.name} {city.event_count ? `(${city.event_count})` : ''}
                </option>
              ))}
            </select>
          )}

          {/* Status filter (for events) */}
          {activeTab === 'events' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
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
            <div className="bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col w-[420px]">
              {/* List header */}
              <div className="px-4 py-3 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between sticky top-0 z-10">
                <div className="flex items-center gap-2">
                  <CloudDownload className="w-4 h-4 text-amber-600 dark:text-amber-500" />
                  <span className="font-medium text-gray-900 dark:text-gray-100">Pending Events</span>
                  <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs rounded font-medium border border-amber-200 dark:border-amber-700">
                    {scrapeStats?.pending_events || events.filter(e => e.publish_status === 'pending').length} to review
                  </span>
                </div>
                <button
                  onClick={loadData}
                  className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                  title="Refresh"
                >
                  <RefreshCw className={clsx('w-4 h-4 text-amber-600 dark:text-amber-500', isLoading && 'animate-spin')} />
                </button>
              </div>

              {/* Pending events list */}
              <div className="flex-1 overflow-auto">
                {isLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <RefreshCw className="w-6 h-6 animate-spin text-gray-400 dark:text-gray-500" />
                  </div>
                ) : events.filter(e => e.publish_status === 'pending').length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-gray-500 dark:text-gray-400 p-4">
                    <Check className="w-12 h-12 text-green-500 dark:text-green-600 mb-3" />
                    <p className="font-medium">All caught up!</p>
                    <p className="text-sm text-gray-400 dark:text-gray-500 text-center mt-1">No pending events to review.</p>
                  </div>
                ) : (
                  sortEventsSmart(events.filter(e => e.publish_status === 'pending')).map((event) => (
                    <div
                      key={event.id}
                      className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-200 dark:border-gray-700 transition-colors group"
                    >
                      <div 
                        onClick={() => { setActiveTabState('events'); handleEdit(event); }}
                        className="w-10 h-10 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden cursor-pointer"
                      >
                        {event.flyer_front ? (
                          <img src={event.flyer_front} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Calendar className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                        )}
                      </div>
                      <div 
                        onClick={() => { setActiveTabState('events'); handleEdit(event); }}
                        className="flex-1 min-w-0 cursor-pointer"
                      >
                        <p className="font-medium text-sm truncate text-gray-900 dark:text-gray-100">{event.title}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{event.venue_name} • {event.venue_city}</p>
                      </div>
                      <div className="text-right flex-shrink-0 flex items-center gap-2">
                        <div className="mr-2">
                          {(() => {
                            const timing = getTimingStyle(event);
                            return (
                              <p className={clsx(
                                'text-xs font-medium',
                                timing.dateClass,
                                timing.strikethrough && 'line-through'
                              )}>
                                {event.date ? format(new Date(event.date), 'MMM d') : '—'}
                              </p>
                            );
                          })()}
                        </div>
                        {/* Approve/Decline buttons */}
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                await setPublishStatus([event.id], 'approved');
                                setEvents(events.map(ev => ev.id === event.id ? { ...ev, publish_status: 'approved' } : ev));
                              } catch (err) { console.error(err); }
                            }}
                            className="p-1.5 bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50 text-green-700 dark:text-green-400 rounded border border-green-200 dark:border-green-700"
                            title="Approve"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                await setPublishStatus([event.id], 'rejected');
                                setEvents(events.map(ev => ev.id === event.id ? { ...ev, publish_status: 'rejected' } : ev));
                              } catch (err) { console.error(err); }
                            }}
                            className="p-1.5 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 rounded border border-red-200 dark:border-red-700"
                            title="Reject"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              {/* Unlinked Scraped Events */}
              {scrapedEvents.length > 0 && (
                <div className="border-t border-gray-200 dark:border-gray-700">
                  <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Unlinked Scraped ({scrapedEvents.length})</span>
                    </div>
                    <button
                      onClick={async () => {
                        setIsMatching(true);
                        try {
                          await runMatching();
                          await loadScrapeData();
                          await loadEvents();
                        } catch (err) { console.error(err); }
                        finally { setIsMatching(false); }
                      }}
                      disabled={isMatching}
                      className="px-2 py-1 text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 rounded font-medium disabled:opacity-50 flex items-center gap-1 border border-indigo-200 dark:border-indigo-700"
                    >
                      {isMatching ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                      Link All
                    </button>
                  </div>
                  <div className="max-h-48 overflow-auto">
                    {scrapedEvents.slice(0, 10).map((event) => (
                      <div key={event.id} className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-3">
                        <span className={clsx(
                          'px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 border',
                          event.source_code === 'ra' 
                            ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-700' 
                            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-700'
                        )}>
                          {event.source_code?.toUpperCase()}
                        </span>
                        <span className="text-xs truncate flex-1 text-gray-900 dark:text-gray-100">{event.title}</span>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">{event.date ? format(new Date(event.date), 'MMM d') : ''}</span>
                        {event.content_url && (
                          <a href={event.content_url} target="_blank" rel="noopener noreferrer" className="text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400" onClick={e => e.stopPropagation()}>
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
            <div className="flex-1 overflow-auto p-6 bg-gray-50 dark:bg-gray-900">
              <div className="max-w-3xl mx-auto space-y-6">
                {/* Sync Progress Banner - Shown when syncing */}
                {isSyncing && syncProgress && (
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <RefreshCw className="w-5 h-5 text-indigo-600 dark:text-indigo-400 animate-spin flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-indigo-900 dark:text-indigo-100 mb-1">Pipeline Running</p>
                        <div className="space-y-1 text-sm text-indigo-700 dark:text-indigo-300">
                          <p>{syncProgress}</p>
                          {scrapeStats?.last_scraped_city && (
                            <p className="text-xs">
                              <span className="text-indigo-600 dark:text-indigo-400 font-medium">City:</span> {scrapeStats.last_scraped_city}
                              {scrapeStats.last_scraped_source && (
                                <span className="ml-3">
                                  <span className="text-indigo-600 dark:text-indigo-400 font-medium">Source:</span> {scrapeStats.last_scraped_source.toUpperCase()}
                                </span>
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Last Scraped Info */}
                {scrapeStats?.last_scraped_at && !isSyncing && (
                  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 bg-green-500 dark:bg-green-600 rounded-full animate-pulse" />
                        <span className="text-sm text-gray-600 dark:text-gray-300">
                          Last synced: <span className="font-medium text-gray-900 dark:text-gray-100">
                            {new Date(scrapeStats.last_scraped_at).toLocaleString('en-US', { 
                              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                            })}
                          </span>
                          {scrapeStats.last_scraped_city && (
                            <span className="text-gray-500 dark:text-gray-400"> • {scrapeStats.last_scraped_city}</span>
                          )}
                          {scrapeStats.last_scraped_source && (
                            <span className={`ml-2 px-1.5 py-0.5 rounded text-xs font-medium border ${
                              scrapeStats.last_scraped_source === 'ra' 
                                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-700' 
                                : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-700'
                            }`}>
                              {scrapeStats.last_scraped_source.toUpperCase()}
                            </span>
                          )}
                        </span>
                      </div>
                      {historyTotals && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {historyTotals.total_scrape_runs} total runs
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Sync Controls Card */}
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                  <h3 className="font-semibold text-lg mb-4 flex items-center gap-2 text-gray-900 dark:text-gray-100">
                    <CloudDownload className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    Fetch New Events
                  </h3>
                  
                  <div className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      {/* City Selection */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">City</label>
                        <select
                          value={scrapeCity}
                          onChange={(e) => setScrapeCity(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
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
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sources</label>
                        <div className="flex gap-4 mt-3">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={scrapeSources.includes('ra')}
                              onChange={() => toggleSource('ra')}
                              className="rounded text-indigo-600 dark:text-indigo-400"
                            />
                            <span className="text-sm text-gray-900 dark:text-gray-100">Resident Advisor</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={scrapeSources.includes('ticketmaster')}
                              onChange={() => toggleSource('ticketmaster')}
                              className="rounded text-indigo-600 dark:text-indigo-400"
                            />
                            <span className="text-sm text-gray-900 dark:text-gray-100">Ticketmaster</span>
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Sync Button */}
                    <button
                      onClick={handleSyncWorkflow}
                      disabled={isSyncing || scrapeSources.length === 0}
                      className="w-full px-6 py-3 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg hover:bg-indigo-700 dark:hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium border border-indigo-700 dark:border-indigo-400"
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
                    <div className="px-4 py-3 bg-gray-100 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400">
                      <span className="font-medium text-gray-900 dark:text-gray-100">Pipeline:</span> Scrape → Match & Link → Enrich → Deduplicate
                      {scrapeCity === 'all' && (
                        <p className="text-amber-600 dark:text-amber-500 mt-1">⚠️ Syncing all cities may take several minutes.</p>
                      )}
                    </div>

                    {/* Sync Result */}
                    {syncResult && (
                      <div className={clsx(
                        'p-4 rounded-lg border',
                        syncResult.error 
                          ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700' 
                          : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700'
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

                {/* Stats Overview - Flat Border Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Events Card - Large Feature */}
                  <div className="col-span-2 lg:col-span-1 bg-emerald-500 dark:bg-emerald-600 border-2 border-emerald-600 dark:border-emerald-500 rounded-lg p-6 text-white">
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-12 h-12 bg-white/20 dark:bg-white/10 border border-white/30 rounded-lg flex items-center justify-center">
                        <Calendar className="w-6 h-6" />
                      </div>
                      <span className="text-emerald-100 dark:text-emerald-200 text-xs font-medium uppercase tracking-wide">Total Events</span>
                    </div>
                    <div className="text-4xl font-bold mb-1">{(scrapeStats?.total_main_events || 0).toLocaleString()}</div>
                    <div className="flex items-center gap-4 text-sm text-emerald-100 dark:text-emerald-200">
                      <span className="flex items-center gap-1">
                        <CheckCircle className="w-4 h-4" />
                        {scrapeStats?.approved_events || 0} live
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {scrapeStats?.pending_events || 0} pending
                      </span>
                    </div>
                  </div>
                  
                  {/* Pending - Highlight Card */}
                  <div className="bg-amber-400 dark:bg-amber-500 border-2 border-amber-500 dark:border-amber-400 rounded-lg p-5 text-white">
                    <div className="flex items-center gap-2 mb-3 text-amber-100 dark:text-amber-200 text-xs font-medium uppercase tracking-wide">
                      <AlertTriangle className="w-4 h-4" />
                      Needs Review
                    </div>
                    <div className="text-3xl font-bold">{scrapeStats?.pending_events || 0}</div>
                    <div className="text-amber-100 dark:text-amber-200 text-sm mt-1">events waiting</div>
                  </div>
                  
                  {/* Venues Card */}
                  <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-lg p-5">
                    <div className="flex items-center gap-2 mb-3 text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide">
                      <Building2 className="w-4 h-4" />
                      Venues
                    </div>
                    <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">{scrapeStats?.total_main_venues || 0}</div>
                    <div className="text-gray-500 dark:text-gray-400 text-sm mt-1">unique locations</div>
                  </div>
                  
                  {/* Artists Card */}
                  <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-lg p-5">
                    <div className="flex items-center gap-2 mb-3 text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide">
                      <Music className="w-4 h-4" />
                      Artists
                    </div>
                    <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">{scrapeStats?.total_main_artists || 0}</div>
                    <div className="text-gray-500 dark:text-gray-400 text-sm mt-1">performers</div>
                  </div>
                  
                  {/* RA Source Card */}
                  <div className="bg-red-500 dark:bg-red-600 border-2 border-red-600 dark:border-red-500 rounded-lg p-5 text-white">
                    <div className="flex items-center gap-2 mb-3 text-red-100 dark:text-red-200 text-xs font-medium uppercase tracking-wide">
                      <Globe className="w-4 h-4" />
                      Resident Advisor
                    </div>
                    <div className="text-3xl font-bold">{scrapeStats?.ra_events || 0}</div>
                    <div className="text-red-100 dark:text-red-200 text-sm mt-1">events scraped</div>
                  </div>
                  
                  {/* Ticketmaster Source Card */}
                  <div className="bg-blue-500 dark:bg-blue-600 border-2 border-blue-600 dark:border-blue-500 rounded-lg p-5 text-white">
                    <div className="flex items-center gap-2 mb-3 text-blue-100 dark:text-blue-200 text-xs font-medium uppercase tracking-wide">
                      <Ticket className="w-4 h-4" />
                      Ticketmaster
                    </div>
                    <div className="text-3xl font-bold">{scrapeStats?.ticketmaster_events || 0}</div>
                    <div className="text-blue-100 dark:text-blue-200 text-sm mt-1">events scraped</div>
                  </div>
                </div>

                {/* Activity Chart */}
                {scrapeHistory.length > 0 && (
                  <div className="bg-gray-900 dark:bg-gray-950 border-2 border-gray-800 dark:border-gray-700 rounded-lg p-6 text-white">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-lg flex items-center gap-2">
                        <Layers className="w-5 h-5 text-indigo-400 dark:text-indigo-300" />
                        Activity Timeline
                      </h3>
                      <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">Last 30 Days</span>
                    </div>
                    <MiniAreaChart
                      data={scrapeHistory}
                      lines={[
                        { dataKey: 'events_fetched', color: '#818cf8', label: 'Fetched' },
                        { dataKey: 'events_inserted', color: '#34d399', label: 'New' },
                        { dataKey: 'venues_created', color: '#fbbf24', label: 'Venues' },
                      ]}
                      height={120}
                    />
                  </div>
                )}

                {/* Recent Activity */}
                {recentScrapes.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                    <h3 className="font-semibold text-lg mb-4 flex items-center gap-2 text-gray-900 dark:text-gray-100">
                      <RefreshCw className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                      Recent Activity
                    </h3>
                    <RecentActivity activities={recentScrapes} />
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            {/* List Panel */}
            <div className="bg-white border-r flex flex-col w-96 h-full max-h-full">
              {/* List header */}
              <div className="px-4 py-2 bg-gray-50 border-b flex items-center justify-between flex-shrink-0">
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
              <div className="flex-1 overflow-y-auto min-h-0">
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

              {/* Pagination - always visible at bottom */}
              {totalPages > 1 && (
                <div className="px-4 py-2 border-t bg-gray-50 flex items-center justify-between flex-shrink-0">
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
              <div className="flex-1 bg-white border-l flex flex-col h-full max-h-full overflow-hidden">
                <div className="bg-white border-b px-4 py-3 flex items-center justify-between flex-shrink-0">
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

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Source References Section - show linked scraped sources */}
                {editingItem && activeTab === 'events' && (
                  <div className="bg-indigo-50 dark:bg-indigo-950 rounded-lg p-4 border-2 border-indigo-200 dark:border-indigo-800">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      Linked Sources ({sourceReferences.length})
                    </h3>
                    {sourceReferences.length === 0 ? (
                      <p className="text-sm text-gray-500 italic">No linked scraped sources found for this event.</p>
                    ) : (
                      <>
                        {/* Sources with badge + Use all button inline */}
                        {(() => {
                          // Group by source_code, keeping unique content_urls
                          const groupedSources = sourceReferences.reduce((acc: Record<string, any[]>, source: any) => {
                            const key = source.source_code || 'unknown';
                            if (!acc[key]) acc[key] = [];
                            // Only add if content_url is unique within this source
                            const isDuplicate = acc[key].some((s: any) => s.content_url === source.content_url);
                            if (!isDuplicate) acc[key].push(source);
                            return acc;
                          }, {} as Record<string, any[]>);
                          
                          return (
                            <div className="space-y-2">
                              {Object.entries(groupedSources).map(([sourceCode, sources]) => (
                                <div key={sourceCode} className="flex items-center gap-2 flex-wrap">
                                  {/* Source links */}
                                  {sources.map((source: any, idx: number) => (
                                    <a
                                      key={`${sourceCode}-${idx}`}
                                      href={source.content_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={clsx(
                                        'px-2 py-1 rounded text-xs font-medium inline-flex items-center gap-1 hover:opacity-80 transition-opacity',
                                        sourceCode === 'ra' ? 'bg-red-100 text-red-700' :
                                        sourceCode === 'ticketmaster' ? 'bg-blue-100 text-blue-700' :
                                        sourceCode === 'original' ? 'bg-green-100 text-green-700' :
                                        'bg-gray-100 text-gray-700'
                                      )}
                                    >
                                      {sourceCode?.toUpperCase()}
                                      {source.title && <span className="opacity-70">: {source.title?.substring(0, 20)}{source.title?.length > 20 ? '...' : ''}</span>}
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  ))}
                                  {/* Use all button for this source */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const source = sources[0]; // Use first source of this type
                                      const sourceData = { ...source };
                                      delete sourceData.id;
                                      delete sourceData.source_code;
                                      delete sourceData.source_event_id;
                                      delete sourceData.confidence;
                                      delete sourceData.is_primary;
                                      delete sourceData.raw_data;
                                      delete sourceData.created_at;
                                      delete sourceData.updated_at;
                                      const updates: Record<string, any> = {};
                                      Object.entries(sourceData).forEach(([key, value]) => {
                                        if (value !== null && value !== undefined && value !== '') {
                                          // Format date to YYYY-MM-DD for form input
                                          if (key === 'date' && value) {
                                            const d = new Date(value as string | number | Date);
                                            if (!isNaN(d.getTime())) {
                                              updates[key] = d.toISOString().split('T')[0];
                                            }
                                          // Format start_time to HH:MM for form input
                                          } else if (key === 'start_time' && typeof value === 'string') {
                                            if (value.includes('T')) {
                                              const timePart = value.split('T')[1];
                                              updates[key] = timePart ? timePart.substring(0, 5) : '';
                                            } else {
                                              updates[key] = value.substring(0, 5);
                                            }
                                          } else {
                                            updates[key] = value;
                                          }
                                        }
                                      });
                                      setEditForm({ ...editForm, ...updates });
                                    }}
                                    className={clsx(
                                      'px-2 py-1 rounded text-xs font-medium border',
                                      sourceCode === 'ra' ? 'border-red-300 text-red-700 hover:bg-red-50' :
                                      sourceCode === 'ticketmaster' ? 'border-blue-300 text-blue-700 hover:bg-blue-50' :
                                      'border-gray-300 text-gray-700 hover:bg-gray-50'
                                    )}
                                  >
                                    Use all from {sourceCode?.toUpperCase()}
                                  </button>
                                </div>
                              ))}
                            </div>
                          );
                        })()}

                        {/* Field-level source options */}
                        <div className="space-y-2 max-h-48 overflow-auto mt-4">
                          {['title', 'description', 'venue_name', 'flyer_front', 'content_url'].map((field) => {
                            const sources = sourceReferences.filter((s: any) => s[field] && s[field] !== editForm[field]);
                            if (sources.length === 0) return null;
                            
                            return (
                              <div key={field} className="bg-white rounded p-2 border">
                                <div className="text-xs font-medium text-gray-500 mb-1.5 capitalize">{field.replace(/_/g, ' ')}</div>
                                <div className="space-y-1">
                                  {sources.map((source: any, sidx: number) => (
                                    <div key={sidx} className="flex items-start gap-2 text-xs">
                                      <span className={clsx(
                                        'px-1 py-0.5 rounded font-medium uppercase flex-shrink-0 mt-0.5',
                                        source.source_code === 'ra' ? 'bg-red-100 text-red-700' :
                                        source.source_code === 'ticketmaster' ? 'bg-blue-100 text-blue-700' :
                                        'bg-gray-100 text-gray-700'
                                      )}>
                                        {source.source_code?.substring(0, 2).toUpperCase()}
                                      </span>
                                      <span className="text-gray-700 flex-1 break-words line-clamp-2">
                                        {field === 'flyer_front' || field === 'content_url' 
                                          ? <a href={source[field]} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline truncate block">{source[field]?.substring(0, 40)}...</a>
                                          : source[field]?.substring(0, 80)}{source[field]?.length > 80 ? '...' : ''}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => setEditForm({ ...editForm, [field]: source[field] })}
                                        className="text-indigo-600 hover:text-indigo-800 font-medium flex-shrink-0"
                                      >
                                        Use
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Event form */}
                {activeTab === 'events' && (
                  <>
                    {/* Approve/Reject Switch */}
                    {editingItem && (
                      <div className="bg-white border rounded-lg p-4">
                        <label className="block text-sm font-medium text-gray-700 mb-3">Publish Status</label>
                        <div className="flex items-center gap-4">
                          <button
                            type="button"
                            onClick={async () => {
                              setEditForm({ ...editForm, publish_status: 'approved' });
                              try {
                                await setPublishStatus([editingItem.id], 'approved');
                                setEvents(events.map(ev => ev.id === editingItem.id ? { ...ev, publish_status: 'approved' } : ev));
                              } catch (e) { console.error(e); }
                            }}
                            className={clsx(
                              'flex-1 px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all',
                              editForm.publish_status === 'approved'
                                ? 'bg-green-500 text-white shadow-lg'
                                : 'bg-gray-100 text-gray-600 hover:bg-green-50 hover:text-green-700'
                            )}
                          >
                            <Check className="w-5 h-5" />
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              setEditForm({ ...editForm, publish_status: 'pending' });
                              try {
                                await setPublishStatus([editingItem.id], 'pending');
                                setEvents(events.map(ev => ev.id === editingItem.id ? { ...ev, publish_status: 'pending' } : ev));
                              } catch (e) { console.error(e); }
                            }}
                            className={clsx(
                              'flex-1 px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all',
                              editForm.publish_status === 'pending'
                                ? 'bg-amber-500 text-white shadow-lg'
                                : 'bg-gray-100 text-gray-600 hover:bg-amber-50 hover:text-amber-700'
                            )}
                          >
                            <Clock className="w-5 h-5" />
                            Pending
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              setEditForm({ ...editForm, publish_status: 'rejected' });
                              try {
                                await setPublishStatus([editingItem.id], 'rejected');
                                setEvents(events.map(ev => ev.id === editingItem.id ? { ...ev, publish_status: 'rejected' } : ev));
                              } catch (e) { console.error(e); }
                            }}
                            className={clsx(
                              'flex-1 px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all',
                              editForm.publish_status === 'rejected'
                                ? 'bg-red-500 text-white shadow-lg'
                                : 'bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-700'
                            )}
                          >
                            <X className="w-5 h-5" />
                            Reject
                          </button>
                        </div>
                      </div>
                    )}

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
                      <label className="block text-sm font-medium text-gray-700 mb-1">Event Type</label>
                      <select
                        value={editForm.event_type || 'event'}
                        onChange={(e) => setEditForm({ ...editForm, event_type: e.target.value as EventType })}
                        className="w-full px-3 py-2 border rounded-lg"
                      >
                        {EVENT_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.icon} {type.label}
                          </option>
                        ))}
                      </select>
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
                        <select
                          value={editForm.venue_city || ''}
                          onChange={(e) => setEditForm({ ...editForm, venue_city: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg"
                        >
                          <option value="">Select city...</option>
                          {citiesDropdown.map((city) => (
                            <option key={`${city.name}-${city.country}`} value={city.name}>
                              {city.name}
                            </option>
                          ))}
                          {/* Allow custom entry if not in list */}
                          {editForm.venue_city && !citiesDropdown.find(c => c.name === editForm.venue_city) && (
                            <option value={editForm.venue_city}>{editForm.venue_city} (custom)</option>
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                        <select
                          value={editForm.venue_country || ''}
                          onChange={(e) => setEditForm({ ...editForm, venue_country: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg"
                        >
                          <option value="">Select country...</option>
                          {countriesDropdown.map((country) => (
                            <option key={country.name} value={country.name}>
                              {country.name} {country.code ? `(${country.code})` : ''}
                            </option>
                          ))}
                          {/* Allow custom entry if not in list */}
                          {editForm.venue_country && !countriesDropdown.find(c => c.name === editForm.venue_country) && (
                            <option value={editForm.venue_country}>{editForm.venue_country} (custom)</option>
                          )}
                        </select>
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
                                  const currentArtists = editForm.artistsList || [];
                                  if (!currentArtists.includes(artist.name)) {
                                    const newArtists = [...currentArtists, artist.name];
                                    setEditForm({ ...editForm, artistsList: newArtists });
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
                      {editForm.artistsList && editForm.artistsList.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {editForm.artistsList.map((artistName: string, idx: number) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm"
                            >
                              {artistName}
                              <button
                                type="button"
                                onClick={() => {
                                  const newArtists = editForm.artistsList.filter((_: string, i: number) => i !== idx);
                                  setEditForm({ ...editForm, artistsList: newArtists });
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
                        <select
                          value={editForm.city || ''}
                          onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg"
                        >
                          <option value="">Select city...</option>
                          {citiesDropdown.map((city) => (
                            <option key={`${city.name}-${city.country}`} value={city.name}>
                              {city.name}
                            </option>
                          ))}
                          {editForm.city && !citiesDropdown.find(c => c.name === editForm.city) && (
                            <option value={editForm.city}>{editForm.city} (custom)</option>
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                        <select
                          value={editForm.country || ''}
                          onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg"
                        >
                          <option value="">Select country...</option>
                          {countriesDropdown.map((country) => (
                            <option key={country.name} value={country.name}>
                              {country.name} {country.code ? `(${country.code})` : ''}
                            </option>
                          ))}
                          {editForm.country && !countriesDropdown.find(c => c.name === editForm.country) && (
                            <option value={editForm.country}>{editForm.country} (custom)</option>
                          )}
                        </select>
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
