'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  RotateCcw,
  AlertTriangle,
  Ticket,
  Link,
  Loader,
  Image as ImageIcon,
  Save,
  Briefcase,
} from 'lucide-react';

// Dynamic import for EventMap (Leaflet requires client-side only)
const EventMap = dynamic(() => import('@/components/EventMap'), { ssr: false });
import { format } from 'date-fns';
import clsx from 'clsx';
import { Event, Stats, City, Venue, Artist, Organizer, getEventTiming, sortEventsSmart, EventType, EVENT_TYPES } from '@/types';
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
  fetchOrganizers,
  fetchOrganizer,
  createOrganizer,
  updateOrganizer,
  deleteOrganizer,
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
  fetchRecentlyUpdatedEvents,
  fetchMapEvents,
} from '@/lib/api';
import { MiniBarChart, MiniAreaChart, StatCard, RecentActivity, ActivityTimeline, EntityStats, Sparkline } from '@/components/ScrapeCharts';

export type ActiveTab = 'events' | 'artists' | 'venues' | 'cities' | 'organizers' | 'scrape';

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
    if (path === '/organizers') return 'organizers';
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

  // Organizers state
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [organizersTotal, setOrganizersTotal] = useState(0);
  const [scrapedVenues, setScrapedVenues] = useState<any[]>([]);
  const [scrapedVenuesTotal, setScrapedVenuesTotal] = useState(0);

  // Cities state
  const [adminCities, setAdminCities] = useState<City[]>([]);
  const [citiesTotal, setCitiesTotal] = useState(0);

  // Dropdown data for city/country
  const [countriesDropdown, setCountriesDropdown] = useState<{ name: string; code?: string }[]>([]);
  const [citiesDropdown, setCitiesDropdown] = useState<{ name: string; country: string }[]>([]);

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

  // Recently updated events (for scrape page)
  const [recentlyUpdatedEvents, setRecentlyUpdatedEvents] = useState<Event[]>([]);

  // Map events (all events, not paginated)
  const [mapEvents, setMapEvents] = useState<Event[]>([]);

  // Sync pipeline state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [syncProgress, setSyncProgress] = useState<string>('');
  const [syncJobStatus, setSyncJobStatus] = useState<any>(null);

  // Artist/Venue matching state
  const [isMatchingArtists, setIsMatchingArtists] = useState(false);
  const [isMatchingVenues, setIsMatchingVenues] = useState(false);

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
  const [showPastEvents, setShowPastEvents] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [total, setTotal] = useState(0);

  // Edit panel state
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [sourceReferences, setSourceReferences] = useState<any[]>([]);
  const [selectedSourceFields, setSelectedSourceFields] = useState<Record<string, string>>({});

  // Artist Overlay State
  const [editingArtist, setEditingArtist] = useState<any>(null);
  const [showArtistOverlay, setShowArtistOverlay] = useState(false);
  const [loadingArtist, setLoadingArtist] = useState(false);

  // Related entities state
  const [relatedEvents, setRelatedEvents] = useState<any[]>([]);
  const [loadingRelatedEvents, setLoadingRelatedEvents] = useState(false);

  // Geocoding state for event edit
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string>('');
  const [mapEditMode, setMapEditMode] = useState(false);
  const staticMapRef = useRef<HTMLDivElement>(null);
  const staticMapInstance = useRef<any>(null);

  // Autocomplete state for event form
  const [artistSearch, setArtistSearch] = useState('');
  const [venueSearch, setVenueSearch] = useState('');
  const [artistSuggestions, setArtistSuggestions] = useState<any[]>([]);
  const [venueSuggestions, setVenueSuggestions] = useState<any[]>([]);
  const [showArtistDropdown, setShowArtistDropdown] = useState(false);
  const [showVenueDropdown, setShowVenueDropdown] = useState(false);

  // Refs for dropdown positioning
  const venueInputRef = useRef<HTMLInputElement>(null);
  const artistInputRef = useRef<HTMLInputElement>(null);
  const [venueDropdownPos, setVenueDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const [artistDropdownPos, setArtistDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  // Update dropdown positions when showing
  useEffect(() => {
    const updateVenuePos = () => {
      if (showVenueDropdown && venueInputRef.current) {
        const rect = venueInputRef.current.getBoundingClientRect();
        setVenueDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
      }
    };

    updateVenuePos();
    window.addEventListener('scroll', updateVenuePos, true);
    window.addEventListener('resize', updateVenuePos);

    return () => {
      window.removeEventListener('scroll', updateVenuePos, true);
      window.removeEventListener('resize', updateVenuePos);
    };
  }, [showVenueDropdown]);

  useEffect(() => {
    const updateArtistPos = () => {
      if (showArtistDropdown && artistInputRef.current) {
        const rect = artistInputRef.current.getBoundingClientRect();
        setArtistDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
      }
    };

    updateArtistPos();
    window.addEventListener('scroll', updateArtistPos, true);
    window.addEventListener('resize', updateArtistPos);

    return () => {
      window.removeEventListener('scroll', updateArtistPos, true);
      window.removeEventListener('resize', updateArtistPos);
    };
  }, [showArtistDropdown, artistSuggestions.length]);

  // Load events data
  const loadEvents = useCallback(async (options?: { noLimit?: boolean }) => {
    try {
      const eventLimit = options?.noLimit ? 10000 : pageSize;
      const [eventsData, statsData, citiesData, scrapedData] = await Promise.all([
        fetchEvents({
          city: cityFilter || undefined,
          search: searchQuery || undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          limit: eventLimit,
          offset: (page - 1) * pageSize,
          showPast: showPastEvents,
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
  }, [cityFilter, searchQuery, statusFilter, page, pageSize, showPastEvents]);

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

  // Load organizers
  const loadOrganizers = useCallback(async () => {
    try {
      const data = await fetchOrganizers({
        search: searchQuery || undefined,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      setOrganizers(data.data || []);
      setOrganizersTotal(data.total || 0);
    } catch (error) {
      console.error('Failed to load organizers:', error);
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
      const [statsData, eventsData, historyData, recentData, updatedData] = await Promise.all([
        fetchScrapeStats().catch(() => null),
        fetchScrapedEvents({ limit: 50, linked: false }).catch(() => ({ data: [] })),
        fetchScrapeHistory({ days: 30 }).catch(() => ({ history: [], totals: null })),
        fetchRecentScrapes(15).catch(() => []),
        fetchRecentlyUpdatedEvents(30).catch(() => ({ data: [] })),
      ]);
      setScrapeStats(statsData);
      setScrapedEvents(eventsData.data || []);
      setScrapeHistory(historyData.history || []);
      setHistoryTotals(historyData.totals || null);
      setRecentScrapes(recentData || []);
      setRecentlyUpdatedEvents(updatedData.data || []);
    } catch (error) {
      console.error('Failed to load scrape data:', error);
    }
  }, []);

  // Load all events for map (no pagination limit)
  const loadMapEvents = useCallback(async () => {
    try {
      const data = await fetchMapEvents({
        // Don't pass cityFilter - map should show all cities
        status: statusFilter !== 'all' ? statusFilter : undefined,
        showPast: showPastEvents,
      });
      setMapEvents(data.data || []);
    } catch (error) {
      console.error('Failed to load map events:', error);
    }
  }, [statusFilter, showPastEvents]);

  // Main data loader
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'events') {
        // Also load artists and venues for autocomplete, and map events
        await Promise.all([
          loadEvents(),
          loadArtists(),
          loadVenues(),
          loadMapEvents()
        ]);
      }
      else if (activeTab === 'artists') await loadArtists();
      else if (activeTab === 'venues') await loadVenues();
      else if (activeTab === 'cities') await loadCities();
      else if (activeTab === 'organizers') await loadOrganizers();
      else if (activeTab === 'scrape') {
        // Load both scrape data AND all events for pending list (no pagination limit)
        await Promise.all([
          loadScrapeData(),
          loadEvents({ noLimit: true })
        ]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, loadEvents, loadArtists, loadVenues, loadCities, loadScrapeData, loadMapEvents]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reload map events when filters change (separate from main loadData)
  useEffect(() => {
    if (activeTab === 'events') {
      loadMapEvents();
    }
  }, [activeTab, statusFilter, showPastEvents, loadMapEvents]);

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
        } catch (error) {
          console.error('Artist search API failed:', error);
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
    // Apply smart sorting: timing first (Live > Upcoming > Past), then status
    const sorted = sortEventsSmart(events);
    console.log('Sorted events:', sorted.slice(0, 5).map(e => ({ 
      title: e.title, 
      date: e.date, 
      timing: getEventTiming(e),
      status: e.publish_status 
    })));
    return sorted;
  }, [events]);

  // Get pending events count for scrape tab pagination
  const pendingEventsCount = useMemo(() => {
    return events.filter(e => e.publish_status === 'pending').length;
  }, [events]);

  // Get current total based on tab
  const currentTotal = useMemo(() => {
    if (activeTab === 'events') return total;
    if (activeTab === 'scrape') return pendingEventsCount; // Use filtered pending count
    if (activeTab === 'artists') return artistsTotal;
    if (activeTab === 'venues') return venuesTotal;
    if (activeTab === 'cities') return citiesTotal;
    return 0;
  }, [activeTab, total, pendingEventsCount, artistsTotal, venuesTotal, citiesTotal]);

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
  // Geocode address to coordinates
  const geocodeAddress = async () => {
    // Get address/city based on active tab
    const addressField = activeTab === 'venues' ? editForm.address : editForm.venue_address;
    const cityField = activeTab === 'venues' ? editForm.city : editForm.venue_city;
    const countryField = activeTab === 'venues' ? editForm.country : editForm.venue_country;
    
    if (!addressField || !cityField) {
      setGeocodeError('Please provide at least address and city');
      return;
    }
    
    setIsGeocoding(true);
    setGeocodeError('');
    
    try {
      // Clean and normalize address components
      const cleanAddress = (str: string) => {
        return str
          .trim()
          .replace(/\s+/g, ' ') // Normalize whitespace
          .replace(/,+/g, ',') // Remove duplicate commas
          .replace(/^,|,$/g, ''); // Remove leading/trailing commas
      };

      let address = cleanAddress(addressField);
      const city = cleanAddress(cityField);
      const country = countryField ? cleanAddress(countryField) : '';

      // Remove city and country from address if they appear there
      const cityLower = city.toLowerCase();
      const countryLower = country.toLowerCase();
      const addressLower = address.toLowerCase();

      // Check if address already contains city or country
      if (cityLower && addressLower.includes(cityLower)) {
        // Remove city from address
        address = address.replace(new RegExp(city, 'gi'), '').replace(/\s+/g, ' ').trim();
      }
      if (countryLower && addressLower.includes(countryLower)) {
        // Remove country from address
        address = address.replace(new RegExp(country, 'gi'), '').replace(/\s+/g, ' ').trim();
      }

      // Clean up any remaining commas
      address = address.replace(/^,\s*|,\s*$/g, '').replace(/,\s*,/g, ',').trim();

      // Try multiple search strategies
      const searchStrategies = [
        // Strategy 1: Full address with all components
        [address, city, country].filter(Boolean).join(', '),
        // Strategy 2: Address + City only (sometimes country confuses the geocoder)
        [address, city].filter(Boolean).join(', '),
        // Strategy 3: Just city + country (useful if address is invalid)
        [city, country].filter(Boolean).join(', '),
      ];

      let result = null;
      let attemptedStrategy = '';

      for (const searchAddress of searchStrategies) {
        if (!searchAddress) continue;

        attemptedStrategy = searchAddress;
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchAddress)}&limit=1`,
          { headers: { 'User-Agent': 'SocialEventsAdmin/1.0' } }
        );
        
        const data = await response.json();
        
        if (data && data.length > 0) {
          result = data[0];
          break;
        }

        // Small delay between requests to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      if (result) {
        setEditForm({
          ...editForm,
          latitude: parseFloat(result.lat),
          longitude: parseFloat(result.lon)
        });
        setGeocodeError('');
      } else {
        setGeocodeError('Address not found. Try being more specific or check for typos.');
      }
    } catch (error) {
      console.error('Geocoding error:', error);
      setGeocodeError('Failed to geocode address');
    } finally {
      setIsGeocoding(false);
    }
  };

  // Reverse geocode coordinates to address
  const reverseGeocode = async (lat: number, lon: number) => {
    setIsGeocoding(true);
    setGeocodeError('');
    
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
        { headers: { 'User-Agent': 'SocialEventsAdmin/1.0' } }
      );
      
      const data = await response.json();
      
      if (data && data.address) {
        const addr = data.address;
        // Build full address: house_number + road/street
        let fullAddress = '';
        if (addr.house_number && (addr.road || addr.pedestrian || addr.path)) {
          const street = addr.road || addr.pedestrian || addr.path;
          fullAddress = `${street} ${addr.house_number}`;
        } else if (addr.road || addr.pedestrian || addr.path) {
          fullAddress = addr.road || addr.pedestrian || addr.path;
        }
        
        // Use correct field names based on active tab
        if (activeTab === 'venues') {
          setEditForm({
            ...editForm,
            latitude: lat,
            longitude: lon,
            address: fullAddress || editForm.address,
            city: addr.city || addr.town || addr.village || editForm.city,
            country: addr.country || editForm.country
          });
        } else {
          setEditForm({
            ...editForm,
            latitude: lat,
            longitude: lon,
            venue_address: fullAddress || editForm.venue_address,
            venue_city: addr.city || addr.town || addr.village || editForm.venue_city,
            venue_country: addr.country || editForm.venue_country
          });
        }
      }
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      setGeocodeError('Failed to get address from coordinates');
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleEdit = (item: any) => {
    setEditingItem(item);
    setSourceReferences([]);
    setSelectedSourceFields({});
    setGeocodeError('');
    setMapEditMode(false);

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
        // Load related events for this artist
        if (data.events) {
          setRelatedEvents(data.events);
        }
      }).catch(console.error);
    } else if (activeTab === 'venues' && item.id) {
      setEditForm({ ...item });
      fetchVenue(item.id).then(data => {
        setSourceReferences(data.source_references || []);
        // Load related events for this venue
        if (data.events) {
          setRelatedEvents(data.events);
        }
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
      } else if (activeTab === 'organizers') {
        if (editingItem) {
          await updateOrganizer(editingItem.id, editForm);
        } else {
          await createOrganizer(editForm);
        }
        await loadOrganizers();
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

  const handleArtistClick = async (artistName: string) => {
    setLoadingArtist(true);
    try {
      // First try to find in current list
      let artist = artists.find(a => a.name === artistName);

      if (!artist) {
        // Search via API
        const results = await searchArtists(artistName);
        if (results && results.length > 0) {
          // Try to find exact match
          artist = results.find((a: any) => a.name === artistName) || results[0];
        }
      }

      if (artist) {
        // Fetch full details
        const details = await fetchArtist(artist.id);
        setEditingArtist(details);
        setShowArtistOverlay(true);
      } else {
        // If not found, pre-fill a new artist form in overlay
        setEditingArtist({ name: artistName });
        setShowArtistOverlay(true);
      }
    } catch (e) {
      console.error(e);
      setEditingArtist({ name: artistName });
      setShowArtistOverlay(true);
    } finally {
      setLoadingArtist(false);
    }
  };

  const handleArtistDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const sourceIndex = parseInt(e.dataTransfer.getData('text/plain'));
    if (isNaN(sourceIndex)) return;

    const newArtists = [...(editForm.artistsList || [])];
    const [removed] = newArtists.splice(sourceIndex, 1);
    newArtists.splice(targetIndex, 0, removed);
    setEditForm({ ...editForm, artistsList: newArtists });
  };

  const handleSaveArtistOverlay = async () => {
    if (!editingArtist) return;
    try {
      if (editingArtist.id) {
        await updateArtist(editingArtist.id, editingArtist);
      } else {
        await createArtist(editingArtist);
      }
      setShowArtistOverlay(false);
      setEditingArtist(null);
    } catch (e: any) {
      console.error(e);
      alert(e.message || 'Failed to save artist');
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
      } else if (activeTab === 'organizers') {
        await deleteOrganizer(item.id);
        await loadOrganizers();
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

  // Create static map for event edit
  useEffect(() => {
    if (!staticMapRef.current || !editForm.latitude || !editForm.longitude) return;

    // Clean up existing map
    if (staticMapInstance.current) {
      staticMapInstance.current.remove();
      staticMapInstance.current = null;
    }

    const L = require('leaflet');
    const isDarkMode = document.documentElement.classList.contains('dark');
    const tileUrl = isDarkMode 
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    
    const map = L.map(staticMapRef.current, {
      center: [editForm.latitude, editForm.longitude],
      zoom: 15,
      zoomControl: false,
      dragging: false,
      touchZoom: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      tap: false
    });
    
    L.tileLayer(tileUrl, {
      attribution: '© OSM © CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);
    
    // Add simple marker
    const markerIcon = L.divIcon({
      className: 'simple-marker',
      html: '<div style="background: #6366f1; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
    
    L.marker([editForm.latitude, editForm.longitude], { 
      icon: markerIcon,
      interactive: false 
    }).addTo(map);
    
    staticMapInstance.current = map;

    return () => {
      if (staticMapInstance.current) {
        staticMapInstance.current.remove();
        staticMapInstance.current = null;
      }
    };
  }, [editForm.latitude, editForm.longitude]);

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

  // Artist matching happens automatically in n8n workflow

  // Venue matching happens automatically in n8n workflow

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

  // Get timing styling for date - LIVE for ongoing, gray for past (no strikethrough)
  const getTimingStyle = (event: Event) => {
    const timing = getEventTiming(event);
    const styles = {
      upcoming: { dateClass: 'text-gray-900 dark:text-gray-100', isLive: false, isPast: false },
      ongoing: { dateClass: 'text-emerald-600 dark:text-emerald-400 font-semibold', isLive: true, isPast: false },
      recent: { dateClass: 'text-gray-400 dark:text-gray-500', isLive: false, isPast: true },
      expired: { dateClass: 'text-gray-400 dark:text-gray-500', isLive: false, isPast: true }
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
      const isPast = timing.isPast;
      const isLive = timing.isLive;

      return (
        <div
          key={item.id}
          onClick={() => handleEdit(item)}
          className={clsx(
            'px-4 py-2.5 flex items-center gap-3 cursor-pointer border-b transition-colors relative',
            editingItem?.id === item.id && 'border-l-2 border-l-indigo-500 dark:border-l-gray-400',
            isRejected && 'bg-gray-50 dark:bg-gray-900/50',
            isPending && 'pending-stripes',
            !isRejected && !isPending && 'bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800',
            isPast && !isRejected && 'opacity-60'
          )}
        >
          <input
            type="checkbox"
            checked={selectedIds.has(item.id)}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => { e.stopPropagation(); handleSelect(item.id); }}
            className="w-4 h-4 sm:w-auto sm:h-auto rounded text-indigo-600 dark:text-indigo-500 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 touch-manipulation"
          />
          <div className="w-10 h-10 rounded bg-gray-200 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {item.flyer_front ? (
              <img src={item.flyer_front} alt="" className="w-full h-full object-cover" />
            ) : (
              <Calendar className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              <p className={clsx(
                'font-medium text-sm truncate flex-1',
                isRejected ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-900 dark:text-gray-100'
              )}>{item.title}</p>
              {item.event_type && item.event_type !== 'event' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 font-medium flex-shrink-0 leading-tight">
                  {EVENT_TYPES.find(t => t.value === item.event_type)?.icon} {EVENT_TYPES.find(t => t.value === item.event_type)?.label}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {item.venue_name && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (item.venue_id) {
                      setActiveTabState('venues');
                      try {
                        const venueData = await fetchVenue(item.venue_id);
                        setEditingItem(venueData);
                        setEditForm(venueData);
                        setShowEditPanel(true);
                      } catch (error) {
                        console.error('Failed to load venue:', error);
                      }
                    }
                  }}
                  className={clsx(
                    'text-xs truncate hover:underline',
                    isRejected ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400',
                    !item.venue_id && 'cursor-default hover:no-underline'
                  )}
                  disabled={!item.venue_id}
                >
                  {item.venue_name}
                </button>
              )}
              {item.venue_city && (
                <>
                  <span className="text-gray-400 dark:text-gray-600">•</span>
                  <p className={clsx(
                    'text-xs truncate',
                    isRejected ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-500 dark:text-gray-400'
                  )}>{item.venue_city}</p>
                </>
              )}
              {/* Artist chips */}
              {item.artistsList && item.artistsList.length > 0 && (
                <>
                  <span className="text-gray-400 dark:text-gray-600">•</span>
                  <div className="flex items-center gap-1 flex-wrap">
                    {item.artistsList.slice(0, 2).map((artistName: string, idx: number) => (
                      <button
                        key={idx}
                        onClick={async (e) => {
                          e.stopPropagation();
                          setLoadingArtist(true);
                          try {
                            const results = await searchArtists(artistName);
                            const artist = results?.find((a: any) => a.name === artistName) || results?.[0];
                            if (artist) {
                              const details = await fetchArtist(artist.id);
                              setEditingArtist(details);
                              setShowArtistOverlay(true);
                            }
                          } catch (e) {
                            console.error(e);
                          } finally {
                            setLoadingArtist(false);
                          }
                        }}
                        className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors"
                      >
                        {artistName}
                      </button>
                    ))}
                    {item.artistsList.length > 2 && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">+{item.artistsList.length - 2}</span>
                    )}
                  </div>
                </>
              )}
            </div>
            {/* Source badges below venue/city */}
            {sources.length > 0 && (
              <div className="flex items-center gap-1 mt-1">
                {sources.map((source: string) => {
                  if (source === 'ra') {
                    return (
                      <img key={source} src="/ra-logo.jpg" alt="RA" className="h-4 w-auto rounded-sm" title="Resident Advisor" />
                    );
                  }
                  if (source === 'ticketmaster') {
                    return (
                      <img key={source} src="/ticketmaster-logo.png" alt="TM" className="h-4 w-auto rounded-sm" title="Ticketmaster" />
                    );
                  }
                  return (
                    <span
                      key={source}
                      className={clsx(
                        'text-[10px] px-1.5 py-0.5 rounded font-medium',
                        source === 'original' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                          'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                      )}
                    >
                      {source.toUpperCase()}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          <div className="text-right flex-shrink-0 self-start pt-0.5 flex flex-col items-end gap-1">
            {/* Date */}
            {isLive ? (
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">LIVE</span>
              </div>
            ) : (
              <p className={clsx(
                'text-sm font-medium',
                timing.dateClass,
                isRejected && 'line-through'
              )}>
                {item.date ? format(new Date(item.date), 'MMM d') : '—'}
              </p>
            )}
            {/* Status indicators below date */}
            {!isRejected && (
              <div className="flex items-center gap-1">
                <div title={item.latitude && item.longitude ? "Has coordinates" : "Missing coordinates"} className="w-4 h-4 flex items-center justify-center">
                  <MapPin className={clsx("w-3 h-3", (item.latitude && item.longitude) ? "text-gray-400 dark:text-gray-500" : "text-red-500 dark:text-red-400")} />
                </div>
                <div title={item.venue_name ? "Has venue" : "Missing venue"} className="w-4 h-4 flex items-center justify-center">
                  <Building2 className={clsx("w-3 h-3", item.venue_name ? "text-gray-400 dark:text-gray-500" : "text-red-500 dark:text-red-400")} />
                </div>
                <div title={item.artistsList && item.artistsList.length > 0 ? "Has artists" : "Missing artists"} className="w-4 h-4 flex items-center justify-center">
                  <Music className={clsx("w-3 h-3", (item.artistsList && item.artistsList.length > 0) ? "text-gray-400 dark:text-gray-500" : "text-red-500 dark:text-red-400")} />
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (activeTab === 'artists') {
      // Get unique sources from source_references
      const sources = item.source_references?.reduce((acc: string[], ref: any) => {
        if (ref.source_code && !acc.includes(ref.source_code)) acc.push(ref.source_code);
        return acc;
      }, [] as string[]) || [];

      // Handle genres - could be array, string, or JSON string
      let genresDisplay = '—';
      if (item.genres) {
        try {
          const genres = typeof item.genres === 'string' ? JSON.parse(item.genres) : item.genres;
          genresDisplay = Array.isArray(genres) ? genres.join(', ') : String(genres);
        } catch {
          genresDisplay = String(item.genres);
        }
      }

      return (
        <div
          key={item.id}
          onClick={() => handleEdit(item)}
          className={clsx(
            'px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-200 dark:border-gray-800 transition-colors bg-white dark:bg-gray-900',
            editingItem?.id === item.id && 'bg-indigo-50 dark:bg-gray-800 border-l-2 border-l-indigo-500 dark:border-l-gray-400'
          )}
        >
          <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {item.image_url ? (
              <img src={item.image_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <Music className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate text-gray-900 dark:text-gray-100">{item.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{item.country || genresDisplay}</p>
            {/* Source badges below country */}
            {sources.length > 0 && (
              <div className="flex items-center gap-1 mt-1">
                {sources.map((source: string) => {
                  if (source === 'ra') {
                    return (
                      <img key={source} src="/ra-logo.jpg" alt="RA" className="h-4 w-auto rounded-sm" title="Resident Advisor" />
                    );
                  }
                  if (source === 'ticketmaster') {
                    return (
                      <img key={source} src="/ticketmaster-logo.png" alt="TM" className="h-4 w-auto rounded-sm" title="Ticketmaster" />
                    );
                  }
                  return (
                    <span key={source} className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                      {source.toUpperCase()}
                    </span>
                  );
                })}
              </div>
            )}
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
      // Get unique sources from source_references
      const sources = item.source_references?.reduce((acc: string[], ref: any) => {
        if (ref.source_code && !acc.includes(ref.source_code)) acc.push(ref.source_code);
        return acc;
      }, [] as string[]) || [];

      return (
        <div
          key={item.id}
          onClick={() => handleEdit(item)}
          className={clsx(
            'px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-200 dark:border-gray-800 transition-colors bg-white dark:bg-gray-900',
            editingItem?.id === item.id && 'bg-indigo-50 dark:bg-gray-800 border-l-2 border-l-indigo-500 dark:border-l-gray-400'
          )}
        >
          <div className="w-10 h-10 rounded bg-gray-200 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5 text-gray-400 dark:text-gray-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate text-gray-900 dark:text-gray-100">{item.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{item.city || '—'}{item.country && `, ${item.country}`}</p>
            {/* Source badges below location */}
            {sources.length > 0 && (
              <div className="flex items-center gap-1 mt-1">
                {sources.map((source: string) => {
                  if (source === 'ra') {
                    return (
                      <img key={source} src="/ra-logo.jpg" alt="RA" className="h-4 w-auto rounded-sm" title="Resident Advisor" />
                    );
                  }
                  if (source === 'ticketmaster') {
                    return (
                      <img key={source} src="/ticketmaster-logo.png" alt="TM" className="h-4 w-auto rounded-sm" title="Ticketmaster" />
                    );
                  }
                  return (
                    <span key={source} className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                      {source.toUpperCase()}
                    </span>
                  );
                })}
              </div>
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
            'px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-200 dark:border-gray-800 transition-colors bg-white dark:bg-gray-900',
            editingItem?.id === item.id && 'bg-indigo-50 dark:bg-gray-800 border-l-2 border-l-indigo-500 dark:border-l-gray-400'
          )}
        >
          <div className="w-10 h-10 rounded bg-gray-200 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
            <Globe className="w-5 h-5 text-gray-400 dark:text-gray-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate text-gray-900 dark:text-gray-100">{item.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{item.country || '—'}</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{item.event_count || 0} events</span>
            <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded">{item.venue_count || 0} venues</span>
          </div>
        </div>
      );
    }

    if (activeTab === 'organizers') {
      return (
        <div
          key={item.id}
          onClick={() => handleEdit(item)}
          className={clsx(
            'px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-200 dark:border-gray-800 transition-colors bg-white dark:bg-gray-900',
            editingItem?.id === item.id && 'bg-indigo-50 dark:bg-gray-800 border-l-2 border-l-indigo-500 dark:border-l-gray-400'
          )}
        >
          <div className="w-10 h-10 rounded bg-gray-200 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
            <Briefcase className="w-5 h-5 text-gray-400 dark:text-gray-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate text-gray-900 dark:text-gray-100">{item.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{item.provider || '—'}</p>
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
    if (activeTab === 'organizers') return organizers;
    return [];
  }, [activeTab, filteredEvents, artists, venues, adminCities, organizers]);

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

      {/* Secondary toolbar - Hidden on mobile when edit panel is open */}
      <header className={clsx(
        "bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex-shrink-0 z-50",
        showEditPanel && "hidden sm:block"
      )}>
        <div className="flex flex-wrap items-center px-2 sm:px-4 py-2 gap-2 sm:gap-3 bg-gray-50 dark:bg-gray-800">
          {/* Refresh button */}
          <button onClick={loadData} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-300" title="Refresh">
            <RefreshCw className={clsx('w-4 h-4', isLoading && 'animate-spin')} />
          </button>

          {/* Search */}
          <div className="relative flex-1 max-w-xs sm:max-w-md flex items-center gap-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder={`Search...`}
              value={typeof searchQuery === 'string' ? searchQuery : ''}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-gray-500 dark:focus:ring-gray-400 focus:border-gray-500 dark:focus:border-gray-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-400 flex-shrink-0"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* City filter (for events & venues) */}
          {(activeTab === 'events' || activeTab === 'venues') && (
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="hidden sm:block px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
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
            <>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>

              <label className="flex items-center gap-2 text-xs sm:text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none border-l border-gray-300 dark:border-gray-700 pl-2 sm:pl-3">
                <input
                  type="checkbox"
                  checked={showPastEvents}
                  onChange={(e) => setShowPastEvents(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 dark:text-indigo-500 focus:ring-indigo-500 dark:focus:ring-indigo-400 bg-white dark:bg-gray-900"
                />
                <span className="hidden sm:inline">Show Old Past</span>
                <span className="sm:hidden">Past</span>
              </label>
            </>
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
            <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
              <span className="text-xs sm:text-sm text-gray-600">{selectedIds.size}</span>
              <button onClick={() => handleBulkSetStatus('approved')} className="px-2 sm:px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded-lg hover:bg-green-200 flex items-center gap-1">
                <Eye className="w-3 h-3" /> <span className="hidden sm:inline">Approve</span>
              </button>
              <button onClick={() => handleBulkSetStatus('rejected')} className="px-2 sm:px-3 py-1.5 text-xs bg-red-100 text-red-700 rounded-lg hover:bg-red-200 flex items-center gap-1">
                <EyeOff className="w-3 h-3" /> <span className="hidden sm:inline">Reject</span>
              </button>
              <button onClick={() => handleBulkSetStatus('pending')} className="px-2 sm:px-3 py-1.5 text-xs bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 flex items-center gap-1">
                <Clock className="w-3 h-3 sm:hidden" /><span className="hidden sm:inline">Reset</span>
              </button>
              <button onClick={handleBulkDelete} className="px-2 sm:px-3 py-1.5 text-xs bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> <span className="hidden sm:inline">Delete</span>
              </button>
            </div>
          )}

          {/* Add button */}
          {activeTab !== 'scrape' && (
            <button
              onClick={handleCreate}
              className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Add</span> <span className="hidden sm:inline">{activeTab === 'cities' ? 'city' : activeTab.slice(0, -1)}</span><span className="sm:hidden">+</span>
            </button>
          )}
        </div>
      </header >

      {/* Main Content */}
      < main className="flex-1 flex overflow-hidden" >
        {/* Scrape Tab Content - Split View */}
        {
          activeTab === 'scrape' ? (
            <div className="flex-1 flex">
              {/* LEFT SIDE - Pending Events TODO List */}
              <div className="bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col w-full sm:w-[420px] sm:max-w-md">
                {/* List header */}
                <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 flex items-center justify-between flex-shrink-0 flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {events.filter(e => e.publish_status === 'pending').length} pending events
                    </span>
                    <button
                      onClick={async () => {
                        const pastPendingEvents = events.filter(e => {
                          if (e.publish_status !== 'pending' || !e.date) return false;
                          const eventDate = new Date(e.date);
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          return eventDate < today;
                        });
                        if (pastPendingEvents.length === 0) return;
                        if (!confirm(`Reject ${pastPendingEvents.length} past pending events?`)) return;
                        try {
                          await setPublishStatus(pastPendingEvents.map(e => e.id), 'rejected');
                          setEvents(events.map(ev => 
                            pastPendingEvents.find(pe => pe.id === ev.id) 
                              ? { ...ev, publish_status: 'rejected' } 
                              : ev
                          ));
                        } catch (err) { console.error(err); }
                      }}
                      disabled={events.filter(e => {
                        if (e.publish_status !== 'pending' || !e.date) return false;
                        const eventDate = new Date(e.date);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        return eventDate < today;
                      }).length === 0}
                      className="px-2 py-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed border border-red-200 dark:border-red-700"
                      title="Reject all past pending events"
                    >
                      Reject Past
                    </button>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={selectedIds.size > 0 && events.filter(e => e.publish_status === 'pending').every(e => selectedIds.has(e.id))}
                      onChange={(e) => {
                        const pendingEvents = events.filter(e => e.publish_status === 'pending');
                        if (e.target.checked) {
                          setSelectedIds(new Set([...selectedIds, ...pendingEvents.map(e => e.id)]));
                        } else {
                          const newSelected = new Set(selectedIds);
                          pendingEvents.forEach(e => newSelected.delete(e.id));
                          setSelectedIds(newSelected);
                        }
                      }}
                      className="rounded text-indigo-600"
                    />
                    Select all
                  </label>
                </div>

                {/* Bulk actions for selected pending events */}
                {selectedIds.size > 0 && (
                  <div className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-200 dark:border-indigo-700 flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-indigo-700 dark:text-indigo-300 font-medium">{selectedIds.size} selected</span>
                    <button onClick={() => handleBulkSetStatus('approved')} className="px-2.5 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 flex items-center gap-1 flex-shrink-0">
                      <Eye className="w-3 h-3" /> Approve
                    </button>
                    <button onClick={() => handleBulkSetStatus('rejected')} className="px-2.5 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 flex items-center gap-1 flex-shrink-0">
                      <EyeOff className="w-3 h-3" /> Reject
                    </button>
                    <button onClick={() => handleBulkSetStatus('pending')} className="px-2.5 py-1 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 flex-shrink-0">
                      Reset
                    </button>
                    <button onClick={handleBulkDelete} className="px-2.5 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 flex items-center gap-1 flex-shrink-0">
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </div>
                )}

                {/* Pending events list */}
                <div className="flex-1 overflow-auto min-h-0">
                  {isLoading ? (
                    <div className="flex items-center justify-center h-32">
                      <RefreshCw className="w-6 h-6 animate-spin text-gray-400 dark:text-gray-500" />
                    </div>
                  ) : events.filter(e => e.publish_status === 'pending').slice((page - 1) * pageSize, page * pageSize).length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-gray-500 dark:text-gray-400 p-4">
                      <Check className="w-12 h-12 text-green-500 dark:text-green-600 mb-3" />
                      <p className="font-medium">All caught up!</p>
                      <p className="text-sm text-gray-400 dark:text-gray-500 text-center mt-1">No pending events to review.</p>
                    </div>
                  ) : (
                    sortEventsSmart(events.filter(e => e.publish_status === 'pending')).slice((page - 1) * pageSize, page * pageSize).map((event) => {
                      const timing = getTimingStyle(event);
                      const isPast = timing.isPast;
                      const isLive = timing.isLive;
                      // Get unique sources from source_references
                      const sources = event.source_references?.reduce((acc: string[], ref: any) => {
                        if (ref.source_code && !acc.includes(ref.source_code)) acc.push(ref.source_code);
                        return acc;
                      }, [] as string[]) || [];
                      const hasCoords = event.latitude && event.longitude;
                      const hasVenue = event.venue_name;
                      const hasArtists = (event as any).artistsList && (event as any).artistsList.length > 0;
                      return (
                        <div
                          key={event.id}
                          onClick={() => { 
                            setShowEditPanel(true);
                            handleEdit(event); 
                          }}
                          className={clsx(
                            "px-4 py-2.5 flex items-center gap-3 cursor-pointer border-b transition-colors pending-stripes bg-white dark:bg-gray-900 hover:bg-amber-50 dark:hover:bg-gray-800",
                            selectedIds.has(event.id) && 'border-l-2 border-l-indigo-500 dark:border-l-gray-400',
                            editingItem?.id === event.id && 'border-l-2 border-l-indigo-500 dark:border-l-gray-400',
                            isPast && "opacity-60"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.has(event.id)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => { e.stopPropagation(); handleSelect(event.id); }}
                            className="w-4 h-4 sm:w-auto sm:h-auto rounded text-indigo-600"
                          />
                          <div className="w-10 h-10 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {event.flyer_front ? (
                              <img src={event.flyer_front} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Calendar className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-2">
                              <p className="font-medium text-sm truncate flex-1 text-gray-900 dark:text-gray-100">{event.title}</p>
                              {event.event_type && event.event_type !== 'event' && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 font-medium flex-shrink-0 leading-tight">
                                  {EVENT_TYPES.find(t => t.value === event.event_type)?.icon} {EVENT_TYPES.find(t => t.value === event.event_type)?.label}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              {event.venue_name && (
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (event.venue_id) {
                                      setActiveTabState('venues');
                                      try {
                                        const venueData = await fetchVenue(event.venue_id);
                                        setEditingItem(venueData);
                                        setEditForm(venueData);
                                        setShowEditPanel(true);
                                      } catch (error) {
                                        console.error('Failed to load venue:', error);
                                      }
                                    }
                                  }}
                                  className={clsx(
                                    'text-xs truncate hover:underline text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400',
                                    !event.venue_id && 'cursor-default hover:no-underline'
                                  )}
                                  disabled={!event.venue_id}
                                >
                                  {event.venue_name}
                                </button>
                              )}
                              {event.venue_city && (
                                <>
                                  <span className="text-gray-400 dark:text-gray-600">•</span>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{event.venue_city}</p>
                                </>
                              )}
                              {/* Artist chips */}
                              {(event as any).artistsList && (event as any).artistsList.length > 0 && (
                                <>
                                  <span className="text-gray-400 dark:text-gray-600">•</span>
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {(event as any).artistsList.slice(0, 2).map((artistName: string, idx: number) => (
                                      <button
                                        key={idx}
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          setLoadingArtist(true);
                                          try {
                                            const results = await searchArtists(artistName);
                                            const artist = results?.find((a: any) => a.name === artistName) || results?.[0];
                                            if (artist) {
                                              const details = await fetchArtist(artist.id);
                                              setEditingArtist(details);
                                              setShowArtistOverlay(true);
                                            }
                                          } catch (e) {
                                            console.error(e);
                                          } finally {
                                            setLoadingArtist(false);
                                          }
                                        }}
                                        className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors"
                                      >
                                        {artistName}
                                      </button>
                                    ))}
                                    {(event as any).artistsList.length > 2 && (
                                      <span className="text-[10px] text-gray-400 dark:text-gray-500">+{(event as any).artistsList.length - 2}</span>
                                    )}
                                  </div>
                                </>
                              )}
                              {/* Organizer chips */}
                              {event.organizers_list && event.organizers_list.length > 0 && (
                                <>
                                  <span className="text-gray-400 dark:text-gray-600">•</span>
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {event.organizers_list.slice(0, 2).map((org, idx) => (
                                      <span
                                        key={idx}
                                        className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                                        title="Organizer"
                                      >
                                        {org.name}
                                      </span>
                                    ))}
                                    {event.organizers_list.length > 2 && (
                                      <span className="text-[10px] text-gray-400 dark:text-gray-500">+{event.organizers_list.length - 2}</span>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                            {/* Source badges below venue/city */}
                            {sources.length > 0 && (
                              <div className="flex items-center gap-1 mt-1">
                                {sources.map((source: string) => {
                                  if (source === 'ra') {
                                    return (
                                      <img key={source} src="/ra-logo.jpg" alt="RA" className="h-4 w-auto rounded-sm" title="Resident Advisor" />
                                    );
                                  }
                                  if (source === 'ticketmaster') {
                                    return (
                                      <img key={source} src="/ticketmaster-logo.png" alt="TM" className="h-4 w-auto rounded-sm" title="Ticketmaster" />
                                    );
                                  }
                                  return (
                                    <span
                                      key={source}
                                      className={clsx(
                                        'text-[10px] px-1.5 py-0.5 rounded font-medium',
                                        source === 'original' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                                          'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                      )}
                                    >
                                      {source.toUpperCase()}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          <div className="flex-shrink-0 flex items-center gap-2">
                            <div className="text-right flex-shrink-0 self-start pt-0.5 flex flex-col items-end gap-1">
                              {/* Date */}
                              {isLive ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">LIVE</span>
                                </div>
                              ) : (
                                <p className={clsx('text-sm font-medium', timing.dateClass)}>
                                  {event.date ? format(new Date(event.date), 'MMM d') : '—'}
                                </p>
                              )}
                              {/* Status indicators below date */}
                              <div className="flex items-center gap-1">
                                <div title={hasCoords ? "Has coordinates" : "Missing coordinates"} className="w-4 h-4 flex items-center justify-center">
                                  <MapPin className={clsx("w-3 h-3", hasCoords ? "text-gray-400 dark:text-gray-500" : "text-red-500 dark:text-red-400")} />
                                </div>
                                <div title={hasVenue ? "Has venue" : "Missing venue"} className="w-4 h-4 flex items-center justify-center">
                                  <Building2 className={clsx("w-3 h-3", hasVenue ? "text-gray-400 dark:text-gray-500" : "text-red-500 dark:text-red-400")} />
                                </div>
                                <div title={hasArtists ? "Has artists" : "Missing artists"} className="w-4 h-4 flex items-center justify-center">
                                  <Music className={clsx("w-3 h-3", hasArtists ? "text-gray-400 dark:text-gray-500" : "text-red-500 dark:text-red-400")} />
                                </div>
                              </div>
                            </div>
                            {/* Approve/Decline buttons - always visible */}
                            {!isPast && (
                              <div className="flex gap-1">
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
                                  <Check className="w-4 h-4" />
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
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Pagination */}
                {Math.ceil(events.filter(e => e.publish_status === 'pending').length / pageSize) > 1 && (
                  <div className="px-4 py-2 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-between flex-shrink-0">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Page {page}/{Math.ceil(events.filter(e => e.publish_status === 'pending').length / pageSize)}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 text-gray-600 dark:text-gray-300"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setPage(p => Math.min(Math.ceil(events.filter(e => e.publish_status === 'pending').length / pageSize), p + 1))}
                        disabled={page >= Math.ceil(events.filter(e => e.publish_status === 'pending').length / pageSize)}
                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 text-gray-600 dark:text-gray-300"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

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
                        className="px-2 py-1 text-xs bg-indigo-100 dark:bg-gray-800 text-indigo-700 dark:text-gray-300 hover:bg-indigo-200 dark:hover:bg-gray-700 rounded font-medium disabled:opacity-50 flex items-center gap-1 border border-indigo-200 dark:border-gray-700"
                      >
                        {isMatching ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                        Link All
                      </button>
                    </div>
                    <div className="max-h-48 overflow-auto">
                      {scrapedEvents.slice(0, 10).map((event) => (
                        <div 
                          key={event.id} 
                          onClick={() => {
                            // Find if there's a matching main event linked to this scraped event
                            const mainEvent = events.find(e => 
                              e.source_references?.some((ref: any) => ref.scraped_event_id === event.id)
                            );
                            if (mainEvent) {
                              setActiveTabState('events');
                              setShowEditPanel(true);
                              handleEdit(mainEvent);
                            }
                          }}
                          className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-3 cursor-pointer"
                        >
                          {event.source_code === 'ra' ? (
                            <img src="/ra-logo.jpg" alt="RA" className="h-4 w-auto rounded-sm flex-shrink-0" title="Resident Advisor" />
                          ) : event.source_code === 'ticketmaster' ? (
                            <img src="/ticketmaster-logo.png" alt="TM" className="h-4 w-auto rounded-sm flex-shrink-0" title="Ticketmaster" />
                          ) : (
                            <span className={clsx(
                              'px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 border',
                              'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-700'
                            )}>
                              {event.source_code?.toUpperCase()}
                            </span>
                          )}
                          <span className="text-xs truncate flex-1 text-gray-900 dark:text-gray-100">{event.title}</span>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="text-[10px] text-gray-400 dark:text-gray-500">{event.date ? format(new Date(event.date), 'MMM d') : ''}</span>
                            {(!event.latitude || !event.longitude) && (
                              <span title="Missing coordinates">
                                <MapPin className="w-3 h-3 text-amber-500 dark:text-amber-400" />
                              </span>
                            )}
                          </div>
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

              {/* RIGHT SIDE - Stats & Controls (when no edit panel) */}
              {!showEditPanel && (
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
                              scrapeStats.last_scraped_source === 'ra' ? (
                                <img src="/ra-logo.jpg" alt="RA" className="ml-2 h-4 w-auto rounded-sm inline-block" title="Resident Advisor" />
                              ) : scrapeStats.last_scraped_source === 'ticketmaster' ? (
                                <img src="/ticketmaster-logo.png" alt="TM" className="ml-2 h-4 w-auto rounded-sm inline-block" title="Ticketmaster" />
                              ) : (
                                <span className={`ml-2 px-1.5 py-0.5 rounded text-xs font-medium border bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-700`}>
                                  {scrapeStats.last_scraped_source.toUpperCase()}
                                </span>
                              )
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

                  {/* Next Auto-Scrape Info */}
                  {scrapeStats?.next_scheduled_scrape && scrapeStats?.auto_scrape_enabled && (
                    <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 bg-indigo-500 dark:bg-indigo-400 rounded-full" />
                        <span className="text-sm text-gray-600 dark:text-gray-300">
                          Next auto-scrape: <span className="font-medium text-indigo-900 dark:text-indigo-100">
                            {new Date(scrapeStats.next_scheduled_scrape).toLocaleString('en-US', {
                              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                            })}
                          </span>
                          <span className="text-gray-500 dark:text-gray-400 ml-2">
                            (Daily at 2:00 AM • Berlin & Hamburg)
                          </span>
                        </span>
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
                            className="w-full px-3 py-2.5 sm:py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 transition-colors text-base sm:text-sm"
                          >
                            <option value="all">🌍 All Cities</option>
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
                          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-3">
                            <label className="flex items-center gap-2.5 cursor-pointer py-2 sm:py-0 touch-manipulation">
                              <input
                                type="checkbox"
                                checked={scrapeSources.includes('ra')}
                                onChange={() => toggleSource('ra')}
                                className="w-5 h-5 sm:w-4 sm:h-4 rounded text-indigo-600 dark:text-indigo-400 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500"
                              />
                              <span className="text-sm sm:text-base text-gray-900 dark:text-gray-100 font-medium">Resident Advisor</span>
                            </label>
                            <label className="flex items-center gap-2.5 cursor-pointer py-2 sm:py-0 touch-manipulation">
                              <input
                                type="checkbox"
                                checked={scrapeSources.includes('ticketmaster')}
                                onChange={() => toggleSource('ticketmaster')}
                                className="w-5 h-5 sm:w-4 sm:h-4 rounded text-indigo-600 dark:text-indigo-400 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500"
                              />
                              <span className="text-sm sm:text-base text-gray-900 dark:text-gray-100 font-medium">Ticketmaster</span>
                            </label>
                          </div>
                        </div>
                      </div>

                      {/* Sync Button */}
                      <button
                        onClick={handleSyncWorkflow}
                        disabled={isSyncing || scrapeSources.length === 0}
                        className="w-full px-6 py-3.5 sm:py-3 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg hover:bg-indigo-700 dark:hover:bg-indigo-600 active:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium shadow-lg hover:shadow-xl transition-all touch-manipulation text-base sm:text-sm"
                      >
                        {isSyncing ? (
                          <>
                            <RefreshCw className="w-5 h-5 sm:w-4 sm:h-4 animate-spin" />
                            <span className="font-normal">{syncProgress || 'Running Pipeline...'}</span>
                          </>
                        ) : (
                          <>
                            <CloudDownload className="w-5 h-5 sm:w-4 sm:h-4" />
                            <span>Sync {scrapeCity === 'all' ? 'All Cities' : scrapeCity.charAt(0).toUpperCase() + scrapeCity.slice(1)}</span>
                          </>
                        )}
                      </button>

                      {/* Pipeline Info */}
                      <div className="px-3 sm:px-4 py-2.5 sm:py-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-lg border border-indigo-200 dark:border-indigo-800 text-xs sm:text-sm">
                        <div className="flex items-start gap-2">
                          <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="font-medium text-indigo-900 dark:text-indigo-100">Automated Pipeline</p>
                            <p className="text-indigo-700 dark:text-indigo-300 mt-0.5">Scrape → Dedupe → Match → Enrich → Sync</p>
                            {scrapeCity === 'all' && (
                              <p className="text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                Syncing all cities may take several minutes
                              </p>
                            )}
                          </div>
                        </div>
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

                  {/* Stats Overview - Clean Minimal Design */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <StatCard 
                      label="Total Events" 
                      value={scrapeStats?.total_main_events || 0}
                      subtext={`${scrapeStats?.approved_events || 0} live • ${scrapeStats?.pending_events || 0} pending`}
                      sparkData={scrapeHistory.slice(-14).reverse().map(d => d.events_inserted || 0)}
                      sparkColor="#10b981"
                      icon={<Calendar className="w-4 h-4 sm:w-5 sm:h-5" />}
                    />
                    <StatCard 
                      label="Pending Review" 
                      value={scrapeStats?.pending_events || 0}
                      variant="warning"
                      icon={<AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" />}
                    />
                    <StatCard 
                      label="Venues" 
                      value={scrapeStats?.total_main_venues || 0}
                      subtext={scrapeStats?.total_scraped_venues ? `${scrapeStats.total_scraped_venues} from sources` : undefined}
                      sparkData={scrapeHistory.slice(-14).reverse().map(d => d.venues_created || 0)}
                      sparkColor="#6366f1"
                      icon={<Building2 className="w-4 h-4 sm:w-5 sm:h-5" />}
                    />
                    <StatCard 
                      label="Artists" 
                      value={scrapeStats?.total_main_artists || 0}
                      subtext={scrapeStats?.total_scraped_artists ? `${scrapeStats.total_scraped_artists} from sources` : undefined}
                      sparkData={scrapeHistory.slice(-14).reverse().map(d => d.artists_created || 0)}
                      sparkColor="#8b5cf6"
                      icon={<Music className="w-4 h-4 sm:w-5 sm:h-5" />}
                    />
                  </div>

                  {/* Source Stats */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-2 mb-3">
                        <img src="/ra-logo.jpg" alt="RA" className="h-5 sm:h-6 w-auto rounded shadow-sm" />
                        <span className="text-sm sm:text-base font-medium text-gray-600 dark:text-gray-300">Resident Advisor</span>
                      </div>
                      <div className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">{(scrapeStats?.ra_events || 0).toLocaleString()}</div>
                      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">events scraped</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-2 mb-3">
                        <img src="/ticketmaster-logo.png" alt="TM" className="h-5 sm:h-6 w-auto rounded shadow-sm" />
                        <span className="text-sm sm:text-base font-medium text-gray-600 dark:text-gray-300">Ticketmaster</span>
                      </div>
                      <div className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">{(scrapeStats?.ticketmaster_events || 0).toLocaleString()}</div>
                      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">events scraped</p>
                    </div>
                  </div>

                  {/* Activity Timeline Chart */}
                  {scrapeHistory.length > 0 && (
                    <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 rounded-lg p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                          <Layers className="w-4 h-4 text-gray-400" />
                          Activity Timeline
                        </h3>
                        <span className="text-xs text-gray-400 dark:text-gray-500">Last 30 days</span>
                      </div>
                      <ActivityTimeline data={scrapeHistory} height={140} />
                    </div>
                  )}

                  {/* Recently Updated Events Section */}
                  {recentlyUpdatedEvents.length > 0 && (
                    <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 rounded-lg p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                          <RotateCcw className="w-4 h-4 text-amber-500" />
                          Recently Updated Events
                          <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs rounded font-medium">
                            {recentlyUpdatedEvents.length}
                          </span>
                        </h3>
                      </div>
                      <div className="space-y-2 max-h-64 overflow-auto">
                        {recentlyUpdatedEvents.slice(0, 10).map((event) => {
                          const sources = event.source_references?.reduce((acc: string[], ref: any) => {
                            if (ref.source_code && !acc.includes(ref.source_code)) acc.push(ref.source_code);
                            return acc;
                          }, [] as string[]) || [];
                          return (
                            <div 
                              key={event.id}
                              onClick={() => { 
                                setActiveTabState('events'); 
                                setShowEditPanel(true);
                                handleEdit(event); 
                              }}
                              className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                            >
                              <div className="w-8 h-8 rounded bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                                <RotateCcw className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{event.title}</p>
                                  {(!event.latitude || !event.longitude) && (
                                    <span title="Missing coordinates" className="flex-shrink-0">
                                      <MapPin className="w-3 h-3 text-amber-500 dark:text-amber-400" />
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{event.venue_name} • {event.venue_city}</p>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {sources.map((source: string) => (
                                  source === 'ra' ? (
                                    <img key={source} src="/ra-logo.jpg" alt="RA" className="h-4 w-auto rounded-sm" />
                                  ) : source === 'ticketmaster' ? (
                                    <img key={source} src="/ticketmaster-logo.png" alt="TM" className="h-4 w-auto rounded-sm" />
                                  ) : null
                                ))}
                                <span className="text-xs text-gray-400 dark:text-gray-500">
                                  {event.updated_at ? format(new Date(event.updated_at), 'MMM d HH:mm') : ''}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Recent Activity */}
                  {recentScrapes.length > 0 && (
                    <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 rounded-lg p-5">
                      <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 text-gray-400" />
                        Recent Scrapes
                      </h3>
                      <RecentActivity activities={recentScrapes} />
                    </div>
                  )}
                </div>
              </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex overflow-hidden">
              {/* List Panel */}
              <div className="bg-white dark:bg-gray-900 border-r dark:border-gray-800 flex flex-col w-full sm:w-96 sm:max-w-md h-full max-h-full">
                {/* List header */}
                <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {currentTotal.toLocaleString()} {activeTab}
                  </span>
                  {activeTab === 'events' && (
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
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
                  <div className="px-4 py-2 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-between flex-shrink-0">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Page {page}/{totalPages}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 text-gray-600 dark:text-gray-300"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 text-gray-600 dark:text-gray-300"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Edit Panel - Full screen overlay on mobile, side panel on desktop */}
              {showEditPanel ? (
                <div className="absolute sm:relative inset-0 sm:flex-1 bg-white dark:bg-gray-900 border-l dark:border-gray-800 flex flex-col h-full max-h-full z-40 sm:z-auto">
                  <div className="bg-white dark:bg-gray-900 border-b dark:border-gray-800 px-4 py-3 flex items-center justify-between flex-shrink-0">
                    <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-base sm:text-lg">
                      {editingItem ? `Edit ${activeTab.slice(0, -1)}` : `New ${activeTab.slice(0, -1)}`}
                    </h2>
                    <div className="flex items-center gap-2">
                      {editingItem && (
                        <button
                          onClick={() => handleDelete(editingItem)}
                          className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg touch-manipulation"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => { setShowEditPanel(false); setEditingItem(null); }}
                        className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg touch-manipulation"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Source References Section - show linked scraped sources */}


                    {/* Event form - only for events tab (scrape tab has its own edit panel above) */}
                    {activeTab === 'events' && (
                      <>
                        {/* Publish Status Section */}
                        {editingItem && (
                          <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                              <CheckCircle className="w-4 h-4" />
                              Publish Status
                            </h3>
                            <div className="grid grid-cols-3 gap-2 sm:gap-3">
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
                                  'px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all touch-manipulation text-sm sm:text-base',
                                  editForm.publish_status === 'approved'
                                    ? 'bg-green-500 text-white shadow-lg ring-2 ring-green-200 dark:ring-green-900'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-green-50 dark:hover:bg-green-900/30 hover:text-green-700 dark:hover:text-green-400'
                                )}
                              >
                                <Check className="w-4 h-4 sm:w-5 sm:h-5" />
                                <span className="hidden sm:inline">Approve</span>
                                <span className="sm:hidden">✓</span>
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
                                  'px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all touch-manipulation text-sm sm:text-base',
                                  editForm.publish_status === 'pending'
                                    ? 'bg-amber-500 text-white shadow-lg ring-2 ring-amber-200 dark:ring-amber-900'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-amber-50 dark:hover:bg-amber-900/30 hover:text-amber-700 dark:hover:text-amber-400'
                                )}
                              >
                                <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
                                <span className="hidden sm:inline">Pending</span>
                                <span className="sm:hidden">⏱</span>
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
                                  'px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all touch-manipulation text-sm sm:text-base',
                                  editForm.publish_status === 'rejected'
                                    ? 'bg-red-500 text-white shadow-lg ring-2 ring-red-200 dark:ring-red-900'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-700 dark:hover:text-red-400'
                                )}
                              >
                                <X className="w-4 h-4 sm:w-5 sm:h-5" />
                                <span className="hidden sm:inline">Reject</span>
                                <span className="sm:hidden">✕</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {editForm.flyer_front && (
                          <img src={editForm.flyer_front} alt="" className="w-full h-48 object-cover rounded-lg" />
                        )}

                        {/* Event Details Section */}
                        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
                          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            Event Details
                          </h3>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Title</label>
                          <input
                            type="text"
                            value={editForm.title || ''}
                            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                            className="w-full px-3 py-2.5 sm:py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400 transition-colors"
                            placeholder="Enter event title"
                          />
                          {/* Inline source suggestions for Title */}
                          {sourceReferences.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-2">
                              {sourceReferences
                                .filter((s: any) => s.title && s.title !== editForm.title)
                                .map((source: any, idx: number) => (
                                  <button
                                    key={`title-${idx}`}
                                    type="button"
                                    onClick={() => setEditForm({ ...editForm, title: source.title })}
                                    className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-gray-200 dark:border-gray-700 rounded text-xs text-left transition-colors group max-w-full"
                                    title={`Use title from ${source.source_code?.toUpperCase()}`}
                                  >
                                    {source.source_code === 'ra' ? (
                                      <img src="/ra-logo.jpg" alt="RA" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                    ) : source.source_code === 'ticketmaster' ? (
                                      <img src="/ticketmaster-logo.png" alt="TM" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                    ) : (
                                      <span className="text-[10px] font-bold text-gray-500 uppercase">{source.source_code?.substring(0, 2)}</span>
                                    )}
                                    <span className="truncate max-w-[200px] text-gray-600 dark:text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                      {source.title}
                                    </span>
                                  </button>
                                ))}
                              {/* Reset to original if changed */}
                              {editingItem && editingItem.title !== editForm.title && (
                                <button
                                  type="button"
                                  onClick={() => setEditForm({ ...editForm, title: editingItem.title })}
                                  className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded text-xs text-gray-500 transition-colors"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  Reset
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Date</label>
                            <input
                              type="date"
                              value={editForm.date || ''}
                              onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                              className="w-full px-3 py-2.5 sm:py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400 transition-colors"
                            />
                            {/* Inline source suggestions for Date */}
                            {sourceReferences.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-2">
                                {sourceReferences
                                  .filter((s: any) => s.date && s.date !== editForm.date)
                                  .map((source: any, idx: number) => {
                                    // Format source date to YYYY-MM-DD
                                    let dateStr = '';
                                    try {
                                      if (source.date) dateStr = new Date(source.date).toISOString().split('T')[0];
                                    } catch (e) { return null; }

                                    if (!dateStr || dateStr === editForm.date) return null;

                                    return (
                                      <button
                                        key={`date-${idx}`}
                                        type="button"
                                        onClick={() => setEditForm({ ...editForm, date: dateStr })}
                                        className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-gray-200 dark:border-gray-700 rounded text-xs text-left transition-colors group"
                                      >
                                        {source.source_code === 'ra' ? (
                                          <img src="/ra-logo.jpg" alt="RA" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                        ) : source.source_code === 'ticketmaster' ? (
                                          <img src="/ticketmaster-logo.png" alt="TM" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                        ) : (
                                          <span className="text-[10px] font-bold text-gray-500 uppercase">{source.source_code?.substring(0, 2)}</span>
                                        )}
                                        <span className="text-gray-600 dark:text-gray-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                          {dateStr}
                                        </span>
                                      </button>
                                    );
                                  })}

                              </div>
                            )}
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Start Time</label>
                            <input
                              type="time"
                              value={editForm.start_time || ''}  
                              onChange={(e) => setEditForm({ ...editForm, start_time: e.target.value })}
                              className="w-full px-3 py-2.5 sm:py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400 transition-colors"
                            />
                            {/* Inline source suggestions for Time */}
                            {sourceReferences.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-2">
                                {sourceReferences
                                  .filter((s: any) => {
                                    if (!s.start_time) return false;
                                    // Normalize time format
                                    let timeStr = s.start_time;
                                    if (timeStr.includes('T')) timeStr = timeStr.split('T')[1];
                                    timeStr = timeStr.substring(0, 5);
                                    return timeStr !== editForm.start_time;
                                  })
                                  .map((source: any, idx: number) => {
                                    let timeStr = source.start_time;
                                    if (timeStr.includes('T')) timeStr = timeStr.split('T')[1];
                                    timeStr = timeStr.substring(0, 5);

                                    return (
                                      <button
                                        key={`time-${idx}`}
                                        type="button"
                                        onClick={() => setEditForm({ ...editForm, start_time: timeStr })}
                                        className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-gray-200 dark:border-gray-700 rounded text-xs text-left transition-colors group"
                                      >
                                        {source.source_code === 'ra' ? (
                                          <img src="/ra-logo.jpg" alt="RA" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                        ) : source.source_code === 'ticketmaster' ? (
                                          <img src="/ticketmaster-logo.png" alt="TM" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                        ) : (
                                          <span className="text-[10px] font-bold text-gray-500 uppercase">{source.source_code?.substring(0, 2)}</span>
                                        )}
                                        <span className="text-gray-600 dark:text-gray-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                          {timeStr}
                                        </span>
                                      </button>
                                    );
                                  })}

                              </div>
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Event Type</label>
                          <select
                            value={editForm.event_type || 'event'}
                            onChange={(e) => setEditForm({ ...editForm, event_type: e.target.value as EventType })}
                            className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
                          >
                            {EVENT_TYPES.map((type) => (
                              <option key={type.value} value={type.value}>
                                {type.icon} {type.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        </div> {/* End Event Details Section */}

                        {/* Venue Information Section */}
                        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                              <Building2 className="w-4 h-4" />
                              Venue Information
                            </h3>
                            {editForm.venue_id && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab('venues');
                                  setEditingItem(null);
                                  // After a brief delay to ensure tab switch, open the venue
                                  setTimeout(async () => {
                                    try {
                                      const venueData = await fetch(`http://localhost:3001/db/venues/${editForm.venue_id}`).then(r => r.json());
                                      setEditingItem(venueData);
                                      setEditForm(venueData);
                                    } catch (error) {
                                      console.error('Failed to load venue:', error);
                                    }
                                  }, 100);
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded-lg transition-colors"
                              >
                                <ExternalLink className="w-4 h-4" />
                                Edit Venue
                              </button>
                            )}
                          </div>

                        {editForm.venue_id ? (
                          // Read-only display when venue is linked
                          <div className="space-y-3">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Venue</label>
                              <div className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
                                {editForm.venue_name || 'No venue'}
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">City</label>
                                <div className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
                                  {editForm.venue_city || '-'}
                                </div>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Country</label>
                                <div className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
                                  {editForm.venue_country || '-'}
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          // Editable fields when no venue is linked
                          <>
                            <div className="relative">
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Venue</label>
                              <input
                                ref={venueInputRef}
                                type="text"
                                value={editForm.venue_name || ''}
                                onChange={(e) => {
                                  setEditForm({ ...editForm, venue_name: e.target.value });
                                  setVenueSearch(e.target.value);
                                }}
                                onFocus={() => venueSearch.length >= 2 && setShowVenueDropdown(true)}
                                onBlur={() => setTimeout(() => setShowVenueDropdown(false), 200)}
                                className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-gray-500 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
                                placeholder="Type to search venues..."
                              />
                              {showVenueDropdown && venueSuggestions.length > 0 && venueDropdownPos.width > 0 && (
                                <div 
                                  className="fixed z-[9999] bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-auto"
                                  style={{ top: `${venueDropdownPos.top}px`, left: `${venueDropdownPos.left}px`, width: `${venueDropdownPos.width}px` }}
                                >
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
                                      className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 border-b dark:border-gray-700 last:border-0"
                                    >
                                      <Building2 className="w-4 h-4 text-gray-400" />
                                      <div>
                                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{venue.name}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{venue.city}, {venue.country}</p>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              )}
                              {/* Inline source suggestions for Venue Name */}
                              {sourceReferences.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-2">
                                  {sourceReferences
                                    .filter((s: any) => s.venue_name && s.venue_name !== editForm.venue_name)
                                    .map((source: any, idx: number) => (
                                      <button
                                        key={`venue-${idx}`}
                                        type="button"
                                        onClick={() => setEditForm({ ...editForm, venue_name: source.venue_name })}
                                        className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-gray-200 dark:border-gray-700 rounded text-xs text-left transition-colors group max-w-full"
                                      >
                                        {source.source_code === 'ra' ? (
                                          <img src="/ra-logo.jpg" alt="RA" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                        ) : source.source_code === 'ticketmaster' ? (
                                          <img src="/ticketmaster-logo.png" alt="TM" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                        ) : (
                                          <span className="text-[10px] font-bold text-gray-500 uppercase">{source.source_code?.substring(0, 2)}</span>
                                        )}
                                        <span className="truncate max-w-[200px] text-gray-600 dark:text-gray-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                          {source.venue_name}
                                        </span>
                                      </button>
                                    ))}
                                  {editingItem && editingItem.venue_name !== editForm.venue_name && (
                                    <button
                                      type="button"
                                      onClick={() => setEditForm({ ...editForm, venue_name: editingItem.venue_name })}
                                      className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded text-xs text-gray-500 transition-colors"
                                    >
                                      <RotateCcw className="w-3 h-3" />
                                      Reset
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">City</label>
                                <select
                                  value={editForm.venue_city || ''}
                                  onChange={(e) => setEditForm({ ...editForm, venue_city: e.target.value })}
                                  className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
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
                                {sourceReferences.length > 0 && (
                                  <div className="mt-1 flex flex-wrap gap-2">
                                    {sourceReferences
                                      .filter((s: any) => s.venue_city && s.venue_city !== editForm.venue_city)
                                      .map((source: any, idx: number) => (
                                        <button
                                          key={`vcity-${idx}`}
                                          type="button"
                                          onClick={() => setEditForm({ ...editForm, venue_city: source.venue_city })}
                                          className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-gray-200 dark:border-gray-700 rounded text-xs text-left transition-colors group max-w-full"
                                        >
                                          <span className="text-[10px] font-bold text-gray-500 uppercase">{source.source_code?.substring(0, 2)}</span>
                                          <span className="truncate max-w-[200px] text-gray-600 dark:text-gray-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                            {source.venue_city}
                                          </span>
                                        </button>
                                      ))}
                                    {editingItem && editingItem.venue_city !== editForm.venue_city && (
                                      <button
                                        type="button"
                                        onClick={() => setEditForm({ ...editForm, venue_city: editingItem.venue_city })}
                                        className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded text-xs text-gray-500 transition-colors"
                                      >
                                        <RotateCcw className="w-3 h-3" />
                                        Reset
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Country</label>
                                <select
                                  value={editForm.venue_country || ''}
                                  onChange={(e) => setEditForm({ ...editForm, venue_country: e.target.value })}
                                  className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
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
                                {sourceReferences.length > 0 && (
                                  <div className="mt-1 flex flex-wrap gap-2">
                                    {sourceReferences
                                      .filter((s: any) => s.venue_country && s.venue_country !== editForm.venue_country)
                                      .map((source: any, idx: number) => (
                                        <button
                                          key={`vcountry-${idx}`}
                                          type="button"
                                          onClick={() => setEditForm({ ...editForm, venue_country: source.venue_country })}
                                          className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-gray-200 dark:border-gray-700 rounded text-xs text-left transition-colors group max-w-full"
                                        >
                                          <span className="text-[10px] font-bold text-gray-500 uppercase">{source.source_code?.substring(0, 2)}</span>
                                          <span className="truncate max-w-[200px] text-gray-600 dark:text-gray-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                            {source.venue_country}
                                          </span>
                                        </button>
                                      ))}
                                    {editingItem && editingItem.venue_country !== editForm.venue_country && (
                                      <button
                                        type="button"
                                        onClick={() => setEditForm({ ...editForm, venue_country: editingItem.venue_country })}
                                        className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded text-xs text-gray-500 transition-colors"
                                      >
                                        <RotateCcw className="w-3 h-3" />
                                        Reset
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </>
                        )}

                        {/* Location Info - Read-only from Venue */}
                        {editForm.venue_id && (
                          <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4">
                            <div className="flex items-start gap-2 mb-2">
                              <MapPin className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mt-0.5 flex-shrink-0" />
                              <div className="flex-1">
                                <p className="text-sm font-medium text-indigo-900 dark:text-indigo-100">Location from Venue</p>
                                <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-1">
                                  Event location is managed by the venue. Click "Edit Venue" above to update coordinates.
                                </p>
                              </div>
                            </div>
                            {editForm.latitude && editForm.longitude && (
                              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                <div className="bg-white/50 dark:bg-gray-800/50 rounded px-2 py-1">
                                  <span className="text-gray-600 dark:text-gray-400">Lat:</span>
                                  <span className="ml-1 font-mono text-gray-900 dark:text-gray-100">{editForm.latitude}</span>
                                </div>
                                <div className="bg-white/50 dark:bg-gray-800/50 rounded px-2 py-1">
                                  <span className="text-gray-600 dark:text-gray-400">Lon:</span>
                                  <span className="ml-1 font-mono text-gray-900 dark:text-gray-100">{editForm.longitude}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}                        </div> {/* End Venue Information Section */}

                        {/* Artists Section */}
                        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
                          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                            <Music className="w-4 h-4" />
                            Artists
                          </h3>

                        <div className="relative">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Add Artists</label>
                          <div className="relative">
                            <input
                              ref={artistInputRef}
                              type="text"
                              value={artistSearch}
                              onChange={(e) => setArtistSearch(e.target.value)}
                              onFocus={() => artistSearch.length >= 2 && setShowArtistDropdown(true)}
                              onBlur={() => setTimeout(() => setShowArtistDropdown(false), 200)}
                              className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-gray-500 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
                              placeholder="Type to search artists..."
                            />
                            {showArtistDropdown && artistDropdownPos.width > 0 && (artistSuggestions.length > 0 || artistSearch.length >= 2) && (
                              <div 
                                className="fixed z-[9999] bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-auto"
                                style={{ top: `${artistDropdownPos.top}px`, left: `${artistDropdownPos.left}px`, width: `${artistDropdownPos.width}px` }}
                              >
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
                                    className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 border-b dark:border-gray-700 last:border-0"
                                  >
                                    {artist.image_url ? (
                                      <img src={artist.image_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                                    ) : (
                                      <Music className="w-4 h-4 text-gray-400" />
                                    )}
                                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{artist.name}</span>
                                  </button>
                                ))}
                                {/* Add "Create new artist" option */}
                                {artistSearch.length >= 2 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const currentArtists = editForm.artistsList || [];
                                      const trimmedSearch = artistSearch.trim();
                                      if (trimmedSearch && !currentArtists.includes(trimmedSearch)) {
                                        const newArtists = [...currentArtists, trimmedSearch];
                                        setEditForm({ ...editForm, artistsList: newArtists });
                                      }
                                      setArtistSearch('');
                                      setShowArtistDropdown(false);
                                    }}
                                    className="w-full px-3 py-2 text-left hover:bg-indigo-50 dark:hover:bg-indigo-900/30 flex items-center gap-2 border-t-2 border-indigo-200 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-900/10"
                                  >
                                    <Plus className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                    <span className="text-sm font-medium text-indigo-700 dark:text-indigo-400">
                                      Create "{artistSearch}"
                                    </span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          {/* Inline source suggestions for Artists */}
                          {sourceReferences.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {sourceReferences
                                .filter((s: any) => {
                                  if (!s.artists) return false;
                                  const currentArtistsStr = (editForm.artistsList || []).join(', ').toLowerCase();
                                  return s.artists.toLowerCase() !== currentArtistsStr;
                                })
                                .map((source: any, idx: number) => (
                                  <button
                                    key={`artists-${idx}`}
                                    type="button"
                                    onClick={() => {
                                      const artistsArray = source.artists.split(',').map((a: string) => a.trim()).filter((a: string) => a);
                                      setEditForm({ ...editForm, artistsList: artistsArray });
                                    }}
                                    className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-gray-200 dark:border-gray-700 rounded text-xs text-left transition-colors group max-w-full"
                                    title={`Use artists from ${source.source_code?.toUpperCase()}`}
                                  >
                                    {source.source_code === 'ra' ? (
                                      <img src="/ra-logo.jpg" alt="RA" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                    ) : source.source_code === 'ticketmaster' ? (
                                      <img src="/ticketmaster-logo.png" alt="TM" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                    ) : (
                                      <span className="text-[10px] font-bold text-gray-500 uppercase">{source.source_code?.substring(0, 2)}</span>
                                    )}
                                    <span className="truncate max-w-[200px] text-gray-600 dark:text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                      {source.artists}
                                    </span>
                                  </button>
                                ))}
                              {/* Reset to original if changed */}
                              {(() => {
                                if (!editingItem || !editingItem.artists) return null;
                                
                                // Parse original artists to array
                                let originalArtists: string[] = [];
                                try {
                                  if (typeof editingItem.artists === 'string') {
                                    // Try JSON parse first
                                    try {
                                      const parsed = JSON.parse(editingItem.artists);
                                      originalArtists = Array.isArray(parsed) 
                                        ? parsed.map((a: any) => a.name || a).filter(Boolean)
                                        : editingItem.artists.split(',').map((a: string) => a.trim()).filter(Boolean);
                                    } catch {
                                      // Not JSON, treat as comma-separated
                                      originalArtists = editingItem.artists.split(',').map((a: string) => a.trim()).filter(Boolean);
                                    }
                                  }
                                } catch {
                                  return null;
                                }
                                
                                // Compare with current
                                const currentArtists = editForm.artistsList || [];
                                const hasChanged = JSON.stringify(originalArtists.sort()) !== JSON.stringify(currentArtists.sort());
                                
                                if (!hasChanged) return null;
                                
                                return (
                                  <button
                                    type="button"
                                    onClick={() => setEditForm({ ...editForm, artistsList: originalArtists })}
                                    className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded text-xs text-gray-500 transition-colors"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    Reset
                                  </button>
                                );
                              })()}
                            </div>
                          )}
                          {/* Selected artists display */}
                          {editForm.artistsList && editForm.artistsList.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {editForm.artistsList.map((artistName: string, idx: number) => (
                                <span
                                  key={idx}
                                  draggable
                                  onDragStart={(e) => e.dataTransfer.setData('text/plain', idx.toString())}
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={(e) => handleArtistDrop(e, idx)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-100 dark:bg-gray-800 text-indigo-700 dark:text-gray-300 rounded-full text-sm border dark:border-gray-600 cursor-move"
                                >
                                  <span
                                    onClick={() => handleArtistClick(artistName)}
                                    className="cursor-pointer hover:underline"
                                  >
                                    {artistName}
                                  </span>
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
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                          <textarea
                            value={editForm.description || ''}
                            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                            rows={3}
                            className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
                          />
                          {/* Inline source suggestions for Description */}
                          {sourceReferences.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-2">
                              {sourceReferences
                                .filter((s: any) => s.description && s.description !== editForm.description)
                                .map((source: any, idx: number) => (
                                  <button
                                    key={`desc-${idx}`}
                                    type="button"
                                    onClick={() => setEditForm({ ...editForm, description: source.description })}
                                    className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-gray-200 dark:border-gray-700 rounded text-xs text-left transition-colors group max-w-full"
                                  >
                                    {source.source_code === 'ra' ? (
                                      <img src="/ra-logo.jpg" alt="RA" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                    ) : source.source_code === 'ticketmaster' ? (
                                      <img src="/ticketmaster-logo.png" alt="TM" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                    ) : (
                                      <span className="text-[10px] font-bold text-gray-500 uppercase">{source.source_code?.substring(0, 2)}</span>
                                    )}
                                    <span className="truncate max-w-[300px] text-gray-600 dark:text-gray-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                      {source.description?.substring(0, 50)}...
                                    </span>
                                  </button>
                                ))}
                              {editingItem && editingItem.description !== editForm.description && (
                                <button
                                  type="button"
                                  onClick={() => setEditForm({ ...editForm, description: editingItem.description })}
                                  className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded text-xs text-gray-500 transition-colors"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  Reset
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        </div> {/* End Artists Section */}

                        {/* Additional Information Section */}
                        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
                          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                            <Globe className="w-4 h-4" />
                            Additional Information
                          </h3>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Event URL</label>
                          <input
                            type="url"
                            value={editForm.content_url || ''}
                            onChange={(e) => setEditForm({ ...editForm, content_url: e.target.value })}
                            className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
                          />
                          {/* Inline source suggestions for URL */}
                          {sourceReferences.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-2">
                              {sourceReferences
                                .filter((s: any) => s.content_url && s.content_url !== editForm.content_url)
                                .map((source: any, idx: number) => (
                                  <button
                                    key={`url-${idx}`}
                                    type="button"
                                    onClick={() => setEditForm({ ...editForm, content_url: source.content_url })}
                                    className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-gray-200 dark:border-gray-700 rounded text-xs text-left transition-colors group max-w-full"
                                  >
                                    {source.source_code === 'ra' ? (
                                      <img src="/ra-logo.jpg" alt="RA" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                    ) : source.source_code === 'ticketmaster' ? (
                                      <img src="/ticketmaster-logo.png" alt="TM" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                    ) : (
                                      <span className="text-[10px] font-bold text-gray-500 uppercase">{source.source_code?.substring(0, 2)}</span>
                                    )}
                                    <span className="truncate max-w-[200px] text-gray-600 dark:text-gray-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                      Link
                                    </span>
                                  </button>
                                ))}
                              {editingItem && editingItem.content_url !== editForm.content_url && (
                                <button
                                  type="button"
                                  onClick={() => setEditForm({ ...editForm, content_url: editingItem.content_url })}
                                  className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded text-xs text-gray-500 transition-colors"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  Reset
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Flyer URL</label>
                          <input
                            type="url"
                            value={editForm.flyer_front || ''}
                            onChange={(e) => setEditForm({ ...editForm, flyer_front: e.target.value })}
                            className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
                          />
                          {/* Inline source suggestions for Flyer */}
                          {sourceReferences.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-2">
                              {sourceReferences
                                .filter((s: any) => s.flyer_front && s.flyer_front !== editForm.flyer_front)
                                .map((source: any, idx: number) => (
                                  <button
                                    key={`flyer-${idx}`}
                                    type="button"
                                    onClick={() => setEditForm({ ...editForm, flyer_front: source.flyer_front })}
                                    className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-gray-200 dark:border-gray-700 rounded text-xs text-left transition-colors group"
                                  >
                                    {source.source_code === 'ra' ? (
                                      <img src="/ra-logo.jpg" alt="RA" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                    ) : source.source_code === 'ticketmaster' ? (
                                      <img src="/ticketmaster-logo.png" alt="TM" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                    ) : (
                                      <span className="text-[10px] font-bold text-gray-500 uppercase">{source.source_code?.substring(0, 2)}</span>
                                    )}
                                    <span className="text-gray-600 dark:text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                      Use Image
                                    </span>
                                  </button>
                                ))}
                              {editingItem && editingItem.flyer_front !== editForm.flyer_front && (
                                <button
                                  type="button"
                                  onClick={() => setEditForm({ ...editForm, flyer_front: editingItem.flyer_front })}
                                  className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded text-xs text-gray-500 transition-colors"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  Reset
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        </div> {/* End Additional Information Section */}
                      </>
                    )}

                    {/* Artist form */}
                    {activeTab === 'artists' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
                          <input
                            type="text"
                            value={editForm.name || ''}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
                          />
                          {sourceReferences.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-2">
                              {sourceReferences
                                .filter((s: any) => s.name && s.name !== editForm.name)
                                .map((source: any, idx: number) => (
                                  <button
                                    key={`aname-${idx}`}
                                    type="button"
                                    onClick={() => setEditForm({ ...editForm, name: source.name })}
                                    className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-gray-200 dark:border-gray-700 rounded text-xs text-left transition-colors group max-w-full"
                                  >
                                    {source.source_code === 'ra' ? (
                                      <img src="/ra-logo.jpg" alt="RA" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                    ) : source.source_code === 'ticketmaster' ? (
                                      <img src="/ticketmaster-logo.png" alt="TM" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                    ) : (
                                      <span className="text-[10px] font-bold text-gray-500 uppercase">{source.source_code?.substring(0, 2)}</span>
                                    )}
                                    <span className="truncate max-w-[200px] text-gray-600 dark:text-gray-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                      {source.name}
                                    </span>
                                  </button>
                                ))}
                              {editingItem && editingItem.name !== editForm.name && (
                                <button
                                  type="button"
                                  onClick={() => setEditForm({ ...editForm, name: editingItem.name })}
                                  className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded text-xs text-gray-500 transition-colors"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  Reset
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Country</label>
                          <input
                            type="text"
                            value={editForm.country || ''}
                            onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
                            className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
                          />
                          {sourceReferences.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-2">
                              {sourceReferences
                                .filter((s: any) => s.country && s.country !== editForm.country)
                                .map((source: any, idx: number) => (
                                  <button
                                    key={`acountry-${idx}`}
                                    type="button"
                                    onClick={() => setEditForm({ ...editForm, country: source.country })}
                                    className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-gray-200 dark:border-gray-700 rounded text-xs text-left transition-colors group max-w-full"
                                  >
                                    {source.source_code === 'ra' ? (
                                      <img src="/ra-logo.jpg" alt="RA" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                    ) : source.source_code === 'ticketmaster' ? (
                                      <img src="/ticketmaster-logo.png" alt="TM" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                    ) : (
                                      <span className="text-[10px] font-bold text-gray-500 uppercase">{source.source_code?.substring(0, 2)}</span>
                                    )}
                                    <span className="truncate max-w-[200px] text-gray-600 dark:text-gray-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                      {source.country}
                                    </span>
                                  </button>
                                ))}
                              {editingItem && editingItem.country !== editForm.country && (
                                <button
                                  type="button"
                                  onClick={() => setEditForm({ ...editForm, country: editingItem.country })}
                                  className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded text-xs text-gray-500 transition-colors"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  Reset
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Profile URL</label>
                          <input
                            type="url"
                            value={editForm.content_url || ''}
                            onChange={(e) => setEditForm({ ...editForm, content_url: e.target.value })}
                            className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
                          />
                          {sourceReferences.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-2">
                              {sourceReferences
                                .filter((s: any) => s.content_url && s.content_url !== editForm.content_url)
                                .map((source: any, idx: number) => (
                                  <button
                                    key={`acontent-${idx}`}
                                    type="button"
                                    onClick={() => setEditForm({ ...editForm, content_url: source.content_url })}
                                    className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-gray-200 dark:border-gray-700 rounded text-xs text-left transition-colors group max-w-full"
                                  >
                                    {source.source_code === 'ra' ? (
                                      <img src="/ra-logo.jpg" alt="RA" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                    ) : source.source_code === 'ticketmaster' ? (
                                      <img src="/ticketmaster-logo.png" alt="TM" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                    ) : (
                                      <span className="text-[10px] font-bold text-gray-500 uppercase">{source.source_code?.substring(0, 2)}</span>
                                    )}
                                    <span className="truncate max-w-[200px] text-gray-600 dark:text-gray-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                      Link
                                    </span>
                                  </button>
                                ))}
                              {editingItem && editingItem.content_url !== editForm.content_url && (
                                <button
                                  type="button"
                                  onClick={() => setEditForm({ ...editForm, content_url: editingItem.content_url })}
                                  className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded text-xs text-gray-500 transition-colors"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  Reset
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Image URL</label>
                          <input
                            type="url"
                            value={editForm.image_url || ''}
                            onChange={(e) => setEditForm({ ...editForm, image_url: e.target.value })}
                            className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
                          />
                          {sourceReferences.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-2">
                              {sourceReferences
                                .filter((s: any) => s.image_url && s.image_url !== editForm.image_url)
                                .map((source: any, idx: number) => (
                                  <button
                                    key={`aimage-${idx}`}
                                    type="button"
                                    onClick={() => setEditForm({ ...editForm, image_url: source.image_url })}
                                    className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-gray-200 dark:border-gray-700 rounded text-xs text-left transition-colors group max-w-full"
                                  >
                                    {source.source_code === 'ra' ? (
                                      <img src="/ra-logo.jpg" alt="RA" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                    ) : source.source_code === 'ticketmaster' ? (
                                      <img src="/ticketmaster-logo.png" alt="TM" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                    ) : (
                                      <span className="text-[10px] font-bold text-gray-500 uppercase">{source.source_code?.substring(0, 2)}</span>
                                    )}
                                    <span className="text-gray-600 dark:text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                      Use Image
                                    </span>
                                  </button>
                                ))}
                              {editingItem && editingItem.image_url !== editForm.image_url && (
                                <button
                                  type="button"
                                  onClick={() => setEditForm({ ...editForm, image_url: editingItem.image_url })}
                                  className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded text-xs text-gray-500 transition-colors"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  Reset
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Related Events Section */}
                        {editingItem && relatedEvents.length > 0 && (
                          <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                              <Calendar className="w-4 h-4" />
                              Events with this Artist ({relatedEvents.length})
                            </h3>
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                              {relatedEvents.map((event: any) => (
                                <button
                                  key={event.id}
                                  type="button"
                                  onClick={() => {
                                    setActiveTabState('events');
                                    handleEdit(event);
                                  }}
                                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
                                >
                                  <div className="w-8 h-8 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                    {event.flyer_front ? (
                                      <img src={event.flyer_front} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                      <Calendar className="w-4 h-4 text-gray-400" />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{event.title}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                      {event.venue_name} • {event.date ? format(new Date(event.date), 'MMM d, yyyy') : '—'}
                                    </p>
                                  </div>
                                  <ExternalLink className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Venue form */}
                    {activeTab === 'venues' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
                          <input
                            type="text"
                            value={editForm.name || ''}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
                          />
                          {sourceReferences.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-2">
                              {sourceReferences
                                .filter((s: any) => s.name && s.name !== editForm.name)
                                .map((source: any, idx: number) => (
                                  <button
                                    key={`vname-${idx}`}
                                    type="button"
                                    onClick={() => setEditForm({ ...editForm, name: source.name })}
                                    className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-gray-200 dark:border-gray-700 rounded text-xs text-left transition-colors group max-w-full"
                                  >
                                    {source.source_code === 'ra' ? (
                                      <img src="/ra-logo.jpg" alt="RA" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                    ) : source.source_code === 'ticketmaster' ? (
                                      <img src="/ticketmaster-logo.png" alt="TM" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                    ) : (
                                      <span className="text-[10px] font-bold text-gray-500 uppercase">{source.source_code?.substring(0, 2)}</span>
                                    )}
                                    <span className="truncate max-w-[200px] text-gray-600 dark:text-gray-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                      {source.name}
                                    </span>
                                  </button>
                                ))}
                              {editingItem && editingItem.name !== editForm.name && (
                                <button
                                  type="button"
                                  onClick={() => setEditForm({ ...editForm, name: editingItem.name })}
                                  className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded text-xs text-gray-500 transition-colors"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  Reset
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
                          <input
                            type="text"
                            value={editForm.address || ''}
                            onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                            className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
                          />
                          {sourceReferences.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-2">
                              {sourceReferences
                                .filter((s: any) => s.address && s.address !== editForm.address)
                                .map((source: any, idx: number) => (
                                  <button
                                    key={`vaddress-${idx}`}
                                    type="button"
                                    onClick={() => setEditForm({ ...editForm, address: source.address })}
                                    className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-gray-200 dark:border-gray-700 rounded text-xs text-left transition-colors group max-w-full"
                                  >
                                    {source.source_code === 'ra' ? (
                                      <img src="/ra-logo.jpg" alt="RA" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                    ) : source.source_code === 'ticketmaster' ? (
                                      <img src="/ticketmaster-logo.png" alt="TM" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                    ) : (
                                      <span className="text-[10px] font-bold text-gray-500 uppercase">{source.source_code?.substring(0, 2)}</span>
                                    )}
                                    <span className="truncate max-w-[300px] text-gray-600 dark:text-gray-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                      {source.address}
                                    </span>
                                  </button>
                                ))}
                              {editingItem && editingItem.address !== editForm.address && (
                                <button
                                  type="button"
                                  onClick={() => setEditForm({ ...editForm, address: editingItem.address })}
                                  className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded text-xs text-gray-500 transition-colors"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  Reset
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">City</label>
                            <select
                              value={editForm.city || ''}
                              onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                              className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
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
                            {sourceReferences.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-2">
                                {sourceReferences
                                  .filter((s: any) => s.city && s.city !== editForm.city)
                                  .map((source: any, idx: number) => (
                                    <button
                                      key={`vcity-${idx}`}
                                      type="button"
                                      onClick={() => setEditForm({ ...editForm, city: source.city })}
                                      className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-gray-200 dark:border-gray-700 rounded text-xs text-left transition-colors group max-w-full"
                                    >
                                      {source.source_code === 'ra' ? (
                                        <img src="/ra-logo.jpg" alt="RA" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                      ) : source.source_code === 'ticketmaster' ? (
                                        <img src="/ticketmaster-logo.png" alt="TM" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                      ) : (
                                        <span className="text-[10px] font-bold text-gray-500 uppercase">{source.source_code?.substring(0, 2)}</span>
                                      )}
                                      <span className="truncate max-w-[200px] text-gray-600 dark:text-gray-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                        {source.city}
                                      </span>
                                    </button>
                                  ))}
                                {editingItem && editingItem.city !== editForm.city && (
                                  <button
                                    type="button"
                                    onClick={() => setEditForm({ ...editForm, city: editingItem.city })}
                                    className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded text-xs text-gray-500 transition-colors"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    Reset
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Country</label>
                            <select
                              value={editForm.country || ''}
                              onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
                              className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
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
                            {sourceReferences.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-2">
                                {sourceReferences
                                  .filter((s: any) => s.country && s.country !== editForm.country)
                                  .map((source: any, idx: number) => (
                                    <button
                                      key={`vcountry-${idx}`}
                                      type="button"
                                      onClick={() => setEditForm({ ...editForm, country: source.country })}
                                      className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-gray-200 dark:border-gray-700 rounded text-xs text-left transition-colors group max-w-full"
                                    >
                                      {source.source_code === 'ra' ? (
                                        <img src="/ra-logo.jpg" alt="RA" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                      ) : source.source_code === 'ticketmaster' ? (
                                        <img src="/ticketmaster-logo.png" alt="TM" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                      ) : (
                                        <span className="text-[10px] font-bold text-gray-500 uppercase">{source.source_code?.substring(0, 2)}</span>
                                      )}
                                      <span className="truncate max-w-[200px] text-gray-600 dark:text-gray-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                        {source.country}
                                      </span>
                                    </button>
                                  ))}
                                {editingItem && editingItem.country !== editForm.country && (
                                  <button
                                    type="button"
                                    onClick={() => setEditForm({ ...editForm, country: editingItem.country })}
                                    className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded text-xs text-gray-500 transition-colors"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    Reset
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Latitude</label>
                            <input
                              type="number"
                              step="any"
                              value={editForm.latitude || ''}
                              onChange={(e) => setEditForm({ ...editForm, latitude: e.target.value ? parseFloat(e.target.value) : undefined })}
                              placeholder="e.g. 52.5200"
                              className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Longitude</label>
                            <input
                              type="number"
                              step="any"
                              value={editForm.longitude || ''}
                              onChange={(e) => setEditForm({ ...editForm, longitude: e.target.value ? parseFloat(e.target.value) : undefined })}
                              placeholder="e.g. 13.4050"
                              className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
                            />
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2">
                          <button
                            type="button"
                            onClick={geocodeAddress}
                            disabled={isGeocoding || !editForm.address || !editForm.city}
                            className="flex-1 px-3 py-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            {isGeocoding ? <RefreshCw className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                            Address → Coordinates
                          </button>
                          <button
                            type="button"
                            onClick={() => editForm.latitude && editForm.longitude && reverseGeocode(editForm.latitude, editForm.longitude)}
                            disabled={isGeocoding || !editForm.latitude || !editForm.longitude}
                            className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            {isGeocoding ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                            Coordinates → Address
                          </button>
                        </div>

                        {geocodeError && (
                          <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
                            {geocodeError}
                          </div>
                        )}

                        {(editForm.latitude && editForm.longitude) ? (
                          <div className="relative">
                            <div 
                              ref={staticMapRef}
                              className="h-48 rounded-lg overflow-hidden border dark:border-gray-700 bg-gray-100 dark:bg-gray-800"
                            />
                          </div>
                        ) : (
                          <div className="h-32 border-2 border-dashed dark:border-gray-700 rounded-lg flex items-center justify-center text-gray-400 dark:text-gray-500">
                            <div className="text-center">
                              <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
                              <p className="text-sm">No coordinates set</p>
                              <p className="text-xs">Enter address and geocode</p>
                            </div>
                          </div>
                        )}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Website URL</label>
                          <input
                            type="url"
                            value={editForm.content_url || ''}
                            onChange={(e) => setEditForm({ ...editForm, content_url: e.target.value })}
                            className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
                          />
                          {sourceReferences.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-2">
                              {sourceReferences
                                .filter((s: any) => s.content_url && s.content_url !== editForm.content_url)
                                .map((source: any, idx: number) => (
                                  <button
                                    key={`vcontent-${idx}`}
                                    type="button"
                                    onClick={() => setEditForm({ ...editForm, content_url: source.content_url })}
                                    className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-gray-200 dark:border-gray-700 rounded text-xs text-left transition-colors group max-w-full"
                                  >
                                    {source.source_code === 'ra' ? (
                                      <img src="/ra-logo.jpg" alt="RA" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                    ) : source.source_code === 'ticketmaster' ? (
                                      <img src="/ticketmaster-logo.png" alt="TM" className="h-3 w-auto rounded-sm flex-shrink-0" />
                                    ) : (
                                      <span className="text-[10px] font-bold text-gray-500 uppercase">{source.source_code?.substring(0, 2)}</span>
                                    )}
                                    <span className="truncate max-w-[200px] text-gray-600 dark:text-gray-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                      Link
                                    </span>
                                  </button>
                                ))}
                              {editingItem && editingItem.content_url !== editForm.content_url && (
                                <button
                                  type="button"
                                  onClick={() => setEditForm({ ...editForm, content_url: editingItem.content_url })}
                                  className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded text-xs text-gray-500 transition-colors"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  Reset
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Related Events Section */}
                        {editingItem && relatedEvents.length > 0 && (
                          <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                              <Calendar className="w-4 h-4" />
                              Events at this Venue ({relatedEvents.length})
                            </h3>
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                              {relatedEvents.map((event: any) => (
                                <button
                                  key={event.id}
                                  type="button"
                                  onClick={() => {
                                    setActiveTabState('events');
                                    handleEdit(event);
                                  }}
                                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
                                >
                                  <div className="w-8 h-8 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                    {event.flyer_front ? (
                                      <img src={event.flyer_front} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                      <Calendar className="w-4 h-4 text-gray-400" />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{event.title}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                      {event.date ? format(new Date(event.date), 'MMM d, yyyy') : '—'}
                                    </p>
                                  </div>
                                  <ExternalLink className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* City form */}
                    {activeTab === 'cities' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
                          <input
                            type="text"
                            value={editForm.name || ''}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Country *</label>
                          <select
                            value={editForm.country || ''}
                            onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
                            className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
                          >
                            <option value="">Select country...</option>
                            <option value="Germany">Germany</option>
                            <option value="United Kingdom">United Kingdom</option>
                            <option value="France">France</option>
                            <option value="Netherlands">Netherlands</option>
                            <option value="Belgium">Belgium</option>
                            <option value="Spain">Spain</option>
                            <option value="Portugal">Portugal</option>
                            <option value="Italy">Italy</option>
                            <option value="Austria">Austria</option>
                            <option value="Switzerland">Switzerland</option>
                            <option value="Poland">Poland</option>
                            <option value="Czech Republic">Czech Republic</option>
                            <option value="Denmark">Denmark</option>
                            <option value="Sweden">Sweden</option>
                            <option value="Norway">Norway</option>
                            <option value="Finland">Finland</option>
                            <option value="Ireland">Ireland</option>
                            <option value="Greece">Greece</option>
                            <option value="Croatia">Croatia</option>
                            <option value="Romania">Romania</option>
                            <option value="Hungary">Hungary</option>
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Latitude *</label>
                            <input
                              type="number"
                              step="any"
                              value={editForm.latitude || ''}
                              onChange={(e) => setEditForm({ ...editForm, latitude: e.target.value })}
                              className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
                              placeholder="52.5200"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Longitude *</label>
                            <input
                              type="number"
                              step="any"
                              value={editForm.longitude || ''}
                              onChange={(e) => setEditForm({ ...editForm, longitude: e.target.value })}
                              className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
                              placeholder="13.4050"
                              required
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Timezone</label>
                          <input
                            type="text"
                            value={editForm.timezone || ''}
                            onChange={(e) => setEditForm({ ...editForm, timezone: e.target.value })}
                            className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
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

                    {/* Organizer form */}
                    {activeTab === 'organizers' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
                          <input
                            type="text"
                            value={editForm.name || ''}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Provider</label>
                          <input
                            type="text"
                            value={editForm.provider || ''}
                            onChange={(e) => setEditForm({ ...editForm, provider: e.target.value })}
                            className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
                          />
                        </div>
                      </>
                    )}
                  </div>

                  {/* Save button */}
                  <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t dark:border-gray-800 px-4 py-3 sm:py-4 shadow-lg">
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="w-full px-4 py-3 sm:py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium shadow-sm hover:shadow-md transition-all touch-manipulation text-base sm:text-sm"
                    >
                      {isSaving ? (
                        <>
                          <RefreshCw className="w-5 h-5 sm:w-4 sm:h-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Check className="w-5 h-5 sm:w-4 sm:h-4" />
                          Save Changes
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : activeTab === 'events' ? (
                <div className="flex-1 bg-white dark:bg-gray-900 border-l dark:border-gray-700 overflow-hidden">
                  <EventMap
                    events={mapEvents.length > 0 ? mapEvents : filteredEvents}
                    cities={cities}
                    onEventClick={(event) => handleEdit(event)}
                    onCityChange={(city) => setCityFilter(city)}
                    selectedCity={cityFilter}
                  />
                </div>
              ) : (
                <div className="flex-1 bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                  <div className="text-center text-gray-500">
                    <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Select an item to view details</p>
                    <p className="text-sm mt-1">or click "Add" to create new</p>
                  </div>
                </div>
              )}
            </div>
          )
        }
      </main >
      {/* Artist Edit Overlay */}
      {
        showArtistOverlay && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg p-6 m-4 border dark:border-gray-800">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {editingArtist?.id ? 'Edit Artist' : 'Create Artist'}
                </h3>
                <button
                  onClick={() => setShowArtistOverlay(false)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                  <input
                    type="text"
                    value={editingArtist?.name || ''}
                    onChange={(e) => setEditingArtist({ ...editingArtist, name: e.target.value })}
                    className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Country</label>
                  <input
                    type="text"
                    value={editingArtist?.country || ''}
                    onChange={(e) => setEditingArtist({ ...editingArtist, country: e.target.value })}
                    className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Image URL</label>
                  <input
                    type="url"
                    value={editingArtist?.image_url || ''}
                    onChange={(e) => setEditingArtist({ ...editingArtist, image_url: e.target.value })}
                    className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Profile URL</label>
                  <input
                    type="url"
                    value={editingArtist?.content_url || ''}
                    onChange={(e) => setEditingArtist({ ...editingArtist, content_url: e.target.value })}
                    className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowArtistOverlay(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveArtistOverlay}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
                >
                  Save Artist
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
}
