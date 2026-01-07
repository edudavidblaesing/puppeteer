'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { format } from 'date-fns';
import clsx from 'clsx';
import {
  Search,
  Clock,
  TrendingUp,
  Globe,
  MoreHorizontal,
  Filter,
  RefreshCw,
  Calendar,
  MapPin,
  Eye,
  EyeOff,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Database,
  Users,
  Building2,
  X,
  Plus,
  Check,
  ExternalLink,
  Music,
  Briefcase,
  AlertTriangle,
  Layers,
  LayoutDashboard,
  PanelLeft,
  ChevronsUpDown,
  Shield,
  GitPullRequest
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { EventList } from '@/components/features/EventList';
import { VenueList } from '@/components/features/VenueList';
import { ArtistList } from '@/components/features/ArtistList';
import { OrganizerList } from '@/components/features/OrganizerList';
import { CityList } from '@/components/features/CityList';
import { ActivityChart } from '@/components/dashboard/ActivityChart';

import { MapWidget } from '@/components/dashboard/MapWidget';
import { ScrapeWidget } from '@/components/dashboard/ScrapeWidget';
import { AnalyticsSummary } from '@/components/dashboard/AnalyticsSummary';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { UserManagementModal } from '@/components/features/UserManagementModal';
import { EventForm } from '@/components/features/EventForm';
import { VenueForm } from '@/components/features/VenueForm';
import { ArtistForm } from '@/components/features/ArtistForm';
import { CityForm } from '@/components/features/CityForm';
import { OrganizerForm } from '@/components/features/OrganizerForm';
import { GuestUserForm } from '@/components/features/GuestUserForm';
import { GuestUserList } from '@/components/features/GuestUserList';
import { ReportList } from '@/components/features/ReportList';
import { ReportDetail } from '@/components/features/ReportDetail';
import { DashboardSearch } from '@/components/DashboardSearch';

import {
  fetchEvents, fetchStats, fetchCities, fetchScrapeHistory, setPublishStatus,
  fetchEvent, fetchVenue, fetchArtist, fetchOrganizer, fetchAdminCities, fetchCity,
  fetchArtists, fetchAdminVenues, fetchOrganizers,
  createEvent, updateEvent, deleteEvent,
  createVenue, updateVenue, deleteVenue,
  createArtist, updateArtist, deleteArtist,
  createOrganizer, updateOrganizer, deleteOrganizer,
  createCity, updateCity, deleteCity,
  searchArtists, checkHealth, fetchCountries,
  fetchGuestUsers, fetchGuestUser, updateGuestUser, createGuestUser, deleteGuestUser,
  fetchReports, getUsage
} from '@/lib/api';
import { Event, Stats, City, Venue, Artist, Organizer, GuestUser, getEventTiming } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { GlobalSearch } from '@/components/GlobalSearch';
import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation';
import { SourceIcon } from '@/components/ui/SourceIcon';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';

// Source Filter Map
const SOURCE_FILTER_MAP: Record<string, string> = {
  'tm': 'Ticketmaster',
  'ra': 'Resident Advisor',
  'fb': 'Facebook',
  'manual': 'Manual / Original',
  'dice': 'Dice',
  'eventbrite': 'Eventbrite',
  'musicbrainz': 'MusicBrainz'
};

// Dynamic import for Map
const EventMap = dynamic(() => import('@/components/EventMap'), { ssr: false });

export type ActiveTab = 'overview' | 'events' | 'artists' | 'venues' | 'cities' | 'organizers' | 'users' | 'moderation';
export type ViewType = 'event' | 'venue' | 'artist' | 'organizer' | 'city' | 'user' | 'report';

export interface HistoryItem {
  type: ViewType;
  id?: string;
  data?: any;
  label?: string;
}

interface NewDashboardProps {
  initialTab?: ActiveTab;
}

function DashboardContent({ initialTab }: NewDashboardProps) {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('editId');

  // --- Main State ---
  const [activeTab, setActiveTabState] = useState<ActiveTab>(initialTab || 'overview');

  const setActiveTab = (tab: ActiveTab) => {
    setActiveTabState(tab);
    if (tab === 'overview') router.push('/');
    else router.push(`/${tab}`);
  };
  const [isLoading, setIsLoading] = useState(true);
  const [isListLoading, setIsListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // --- Overview State ---
  const [stats, setStats] = useState<Stats | null>(null);

  const [mapEvents, setMapEvents] = useState<Event[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [history, setHistory] = useState<any[]>([]);

  // --- Data Management State ---
  const [events, setEvents] = useState<Event[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [adminCities, setAdminCities] = useState<City[]>([]);
  const [guestUsers, setGuestUsers] = useState<GuestUser[]>([]);
  const [reports, setReports] = useState<any[]>([]);

  // Pagination & Filters
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [sources, setSources] = useState<string[]>([]);
  const [cityFilter, setCityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'needs_details' | 'ready' | 'published' | 'cancelled' | 'rejected' | 'pending' | 'drafts' | 'live'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // const [showPastEvents, setShowPastEvents] = useState(false); // Replaced by timeFilter
  const [timeFilter, setTimeFilter] = useState<'upcoming' | 'past' | 'all' | 'today'>('upcoming');

  // New Filters
  const [venueTypeFilter, setVenueTypeFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [countries, setCountries] = useState<{ name: string, code: string }[]>([]); // For dropdown

  // --- Navigation Stack State ---
  const [navigationStack, setNavigationStack] = useState<HistoryItem[]>([]);
  const currentView = navigationStack.length > 0 ? navigationStack[navigationStack.length - 1] : null;

  // --- URL Sync Helper ---
  const updateUrl = useCallback((type?: ViewType, id?: string) => {
    const url = new URL(window.location.href);
    if (id) {
      url.searchParams.set('editId', id);
    } else {
      url.searchParams.delete('editId');
    }
    // Using simple replaceState to avoid full reload
    window.history.replaceState({}, '', url);
  }, []);

  // --- Navigation Handlers ---
  const pushView = useCallback((type: ViewType, id?: string, data?: any, label?: string) => {
    setNavigationStack(prev => {
      const top = prev[prev.length - 1];
      if (top && top.type === type && top.id === id) return prev;
      updateUrl(type, id);
      return [...prev, { type, id, data, label }];
    });
  }, [updateUrl]);

  // --- Dirty State ---
  const [isFormDirty, setIsFormDirty] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); // Added Sidebar State

  // Custom Unsaved Changes Hook
  // We don't verify save here because save logic is inside the form components.
  // We only handle "Discard" (navigate away) or "Cancel" (stay).
  // If user wants to save, they should click Save in the form.
  const { promptBeforeAction, modalElement: unsavedModal } = useUnsavedChanges({
    isLinkDirty: isFormDirty,
    onDiscard: () => setIsFormDirty(false) // Clear dirty state on discard so nav proceeds
  });

  const popView = useCallback((input?: boolean | React.MouseEvent) => {
    const force = typeof input === 'boolean' ? input : false;

    const doPop = () => {
      setIsFormDirty(false); // Reset on navigation
      setNavigationStack(prev => {
        const newStack = prev.slice(0, -1);
        const top = newStack[newStack.length - 1];
        updateUrl(top?.type, top?.id);
        return newStack;
      });
    };

    if (force) {
      doPop();
    } else {
      promptBeforeAction(doPop);
    }
  }, [promptBeforeAction, updateUrl]);

  const clearNavigation = useCallback(() => {
    promptBeforeAction(() => {
      setIsFormDirty(false);
      setNavigationStack([]);
    });
  }, [promptBeforeAction]);

  const switchToView = useCallback((type: ViewType, id?: string, data?: any, label?: string) => {
    promptBeforeAction(() => {
      setIsFormDirty(false);
      updateUrl(type, id);
      setNavigationStack([{ type, id, data, label }]);
    });
  }, [promptBeforeAction, updateUrl]);

  // --- Keyboard (Global & List) ---
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Reset index on tab change or search
  // Reset index on tab change or search
  useEffect(() => {
    setSelectedIndex(-1);
    itemRefs.current = []; // Clear refs
    setSelectedIds(new Set());
  }, [activeTab, searchQuery, cityFilter, statusFilter, timeFilter, venueTypeFilter, countryFilter]);

  // Scroll Sync Effect
  useEffect(() => {
    if (selectedIndex >= 0 && itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [selectedIndex]);



  useKeyboardNavigation({
    // ... existing props (keep them as is in the file, just inserting this above)
    onArrowUp: () => setSelectedIndex(i => Math.max(0, i - 1)),
    onArrowDown: () => {
      const list = activeTab === 'events' ? events :
        activeTab === 'venues' ? venues :
          activeTab === 'artists' ? artists :
            activeTab === 'organizers' ? organizers :
              activeTab === 'users' ? guestUsers : adminCities;
      setSelectedIndex(i => Math.min(list.length - 1, i + 1));
    },
    onEnter: () => {
      if (selectedIndex >= 0) {
        const list = activeTab === 'events' ? events :
          activeTab === 'venues' ? venues :
            activeTab === 'artists' ? artists :
              activeTab === 'moderation' ? reports :
                activeTab === 'organizers' ? organizers :
                  activeTab === 'users' ? guestUsers : adminCities;
        const item = list[selectedIndex];
        if (item) {
          // Use switchToView for single active item
          const label = String((item as any).title || (item as any).name || 'Item');
          const type: ViewType = activeTab === 'cities' ? 'city' : activeTab.slice(0, -1) as ViewType;
          setNavigationStack([{ type, id: String(item.id), data: item, label }]);
        }
      }
    },
    onEscape: () => {
      // Priority 1: Clear selection
      if (selectedIds.size > 0) {
        setSelectedIds(new Set());
        return;
      }
      // Priority 2: Close view
      if (navigationStack.length > 0) {
        popView();
      }
    },
    onSearch: () => {
      // Focus search input? 
      const el = document.querySelector('input[placeholder="Search list..."]') as HTMLInputElement;
      if (el) el.focus();
    },
    onSpace: () => {
      if (selectedIndex >= 0) {
        const list = activeTab === 'events' ? events :
          activeTab === 'venues' ? venues :
            activeTab === 'artists' ? artists :
              activeTab === 'organizers' ? organizers :
                activeTab === 'moderation' ? reports :
                  activeTab === 'users' ? guestUsers : adminCities;
        const item = list[selectedIndex];
        if (item && item.id) {
          const idStr = String(item.id);
          // Toggle selection logic
          const newSet = new Set(selectedIds);
          if (newSet.has(idStr)) newSet.delete(idStr);
          else newSet.add(idStr);
          setSelectedIds(newSet);
        }
      }
    },
    onDelete: (id) => {
      // Find item
      const list = activeTab === 'events' ? events :
        activeTab === 'venues' ? venues :
          activeTab === 'artists' ? artists :
            activeTab === 'organizers' ? organizers :
              activeTab === 'moderation' ? reports :
                activeTab === 'users' ? guestUsers : adminCities;
      const item = list.find(i => String(i.id) === id);
      if (item) handleDelete(item);
    },
    disabled: isLoading
  });

  // Redirect if not logged in
  useEffect(() => {
    if (!isLoading && !user) {
      if (!window.location.pathname.includes('/login')) {
        router.replace('/login');
      }
    }
  }, [user, isLoading]);

  // --- Data Loaders ---
  // Overview Data
  const loadOverviewData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [statsData, citiesData, historyData, mapData] = await Promise.all([
        fetchStats(),
        fetchCities(),
        fetchScrapeHistory({ days: 30, groupBy: 'day' }),
        fetchEvents({ limit: 2000, showPast: false })
      ]);

      setStats(statsData);
      setCities(citiesData);
      setMapEvents(mapData.data);

      if (historyData?.data) {
        const chartData = historyData.data.map((day: any) => ({
          date: new Date(day.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          fetched: parseInt(day.events_fetched || 0),
          new: parseInt(day.events_inserted || 0),
          updated: parseInt(day.events_updated || 0),
          venues_new: parseInt(day.venues_created || 0),
          artists_new: parseInt(day.artists_created || 0),
        })).reverse();
        setHistory(chartData);
      }
    } catch (e: any) {
      console.error('Overview load failed', e);
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // List Data
  const loadListData = useCallback(async (silent = false) => {
    if (activeTab === 'overview') return;
    try {
      if (!silent) setIsListLoading(true);
      const offset = (page - 1) * pageSize;

      // Always fetch countries if empty (could be optimized)
      if (countries.length === 0) {
        fetchCountries().then(setCountries).catch(console.error);
      }

      // Common filters
      const commonParams = {
        search: searchQuery || undefined,
        limit: pageSize,
        offset,
        source: sourceFilter || undefined,
      };

      if (activeTab === 'events') {
        const [eventsRes, citiesRes, sourcesRes] = await Promise.all([
          fetchEvents({
            ...commonParams,
            city: cityFilter || undefined,
            status: statusFilter !== 'all' ? statusFilter : undefined,
            timeFilter
          }),
          fetchCities().catch(() => []),
          // fetchCities removed from here - was causing sources to be City[]
          Promise.resolve(['tm', 'ra', 'fb', 'manual'])
        ]);
        setEvents(eventsRes.data || []);
        setTotal(eventsRes.total || 0);
        setCities(citiesRes);
        setSources(sourcesRes);
      }
      else if (activeTab === 'artists') {
        const res = await fetchArtists({
          ...commonParams,
          country: countryFilter || undefined
        });
        setArtists(res.data || []);
        setTotal(res.total || 0);
        setSources(['tm', 'ra', 'fb', 'manual']);
      }
      else if (activeTab === 'venues') {
        const res = await fetchAdminVenues({
          ...commonParams,
          city: cityFilter || undefined,
          type: venueTypeFilter || undefined
        });
        setVenues(res.data || []);
        setTotal(res.total || 0);
        setSources(['tm', 'ra', 'fb', 'manual']);
      }
      else if (activeTab === 'organizers') {
        const res = await fetchOrganizers({ ...commonParams });
        setOrganizers(res.data || []);
        setTotal(res.total || 0);
        setSources(['tm', 'ra', 'fb', 'manual']);
      }
      else if (activeTab === 'cities') {
        const res = await fetchAdminCities({ ...commonParams }); // City controller supports source
        setAdminCities(res.data || []);
        setTotal(res.total || 0);
        setSources([]); // No source filter for cities
      }
      else if (activeTab === 'users') {
        const res = await fetchGuestUsers({ ...commonParams });
        setGuestUsers(res.data || []);
        setTotal(res.total || 0);
        setSources([]); // No source filter for users
      }
      else if (activeTab === 'moderation') {
        const res = await fetchReports({
          limit: pageSize,
          offset
        });
        setReports(res.data || []);
        setTotal(res.total || 0);
        setSources([]);
      }
    } catch (e: any) {
      console.error('List load failed', e);
      setError(e.message);
    } finally {
      if (!silent) setIsListLoading(false);
      // Ensure global loading is off too if it was on
      setIsLoading(false);
    }
  }, [activeTab, page, pageSize, searchQuery, cityFilter, statusFilter, sourceFilter, timeFilter, venueTypeFilter, countryFilter, activeFilter, countries.length]);

  // Initial Load & Tab Change
  useEffect(() => {
    if (activeTab === 'overview') {
      loadOverviewData();
    } else {
      loadListData();
    }
  }, [activeTab, loadOverviewData, loadListData]);

  // Bulk Keyboard Actions (A/R)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Only trigger if we have items selected
      if (selectedIds.size === 0) return;

      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      if (e.key.toLowerCase() === 'a' && activeTab === 'events') {
        e.preventDefault();
        if (confirm(`Approve ${selectedIds.size} selected items?`)) {
          const ids = Array.from(selectedIds);
          setPublishStatus(ids, 'APPROVED_PENDING_DETAILS').then(() => { loadListData(true); setSelectedIds(new Set()); });
        }
      }

      if (e.key.toLowerCase() === 'r' && activeTab === 'events') {
        e.preventDefault();
        if (confirm(`Reject ${selectedIds.size} selected items?`)) {
          const ids = Array.from(selectedIds);
          setPublishStatus(ids, 'REJECTED').then(() => { loadListData(true); setSelectedIds(new Set()); });
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [selectedIds, activeTab, loadListData]);

  // Sync current view with list data (prevent stale state on quick actions)
  useEffect(() => {
    if (!currentView || !currentView.id) return;

    let list: any[] = [];
    if (activeTab === 'events' && currentView.type === 'event') list = events;
    else if (activeTab === 'venues' && currentView.type === 'venue') list = venues;
    else if (activeTab === 'artists' && currentView.type === 'artist') list = artists;
    else if (activeTab === 'organizers' && currentView.type === 'organizer') list = organizers;
    else if (activeTab === 'organizers' && currentView.type === 'organizer') list = organizers;
    else if (activeTab === 'cities' && currentView.type === 'city') list = adminCities;
    else if (activeTab === 'users' && currentView.type === 'user') list = guestUsers;
    else if (activeTab === 'moderation' && currentView.type === 'report') list = reports;
    else return;

    if (list.length > 0) {
      const updatedItem = list.find(item => String(item.id) === String(currentView.id));
      // Only update if data actually changed to avoid infinite loops
      if (updatedItem) {
        if (JSON.stringify(updatedItem) !== JSON.stringify(currentView.data)) {
          setNavigationStack(prev => {
            const newStack = [...prev];
            if (newStack.length > 0) {
              newStack[newStack.length - 1] = { ...newStack[newStack.length - 1], data: updatedItem };
            }
            return newStack;
          });
        }
      } else if (activeTab === 'events' && currentView.type === 'event') {
        // Item might have moved out of the filtered list (e.g. status change), so fetch it directly
        fetchEvent(currentView.id).then(latest => {
          if (latest && JSON.stringify(latest) !== JSON.stringify(currentView.data)) {
            setNavigationStack(prev => {
              const newStack = [...prev];
              if (newStack.length > 0 && newStack[newStack.length - 1].id === latest.id) {
                newStack[newStack.length - 1] = { ...newStack[newStack.length - 1], data: latest };
              }
              return newStack;
            });
          }
        }).catch(err => console.error('Failed to sync current view', err));
      }
    }
  }, [events, venues, artists, organizers, adminCities, activeTab, currentView]); // omitted currentView.data to avoid rapid cycles, relying on list updates


  // Deep linking logic
  useEffect(() => {
    if (editId && navigationStack.length === 0) {
      const loadItem = async () => {
        try {
          let item = null;
          let type: ViewType = 'event'; // Default
          let label = '';

          if (activeTab === 'events') {
            item = await fetchEvent(editId).catch(() => null);
            type = 'event';
            label = item?.title;
          } else if (activeTab === 'venues') {
            item = await fetchVenue(editId).catch(() => null);
            type = 'venue';
            label = item?.name;
          } else if (activeTab === 'artists') {
            item = await fetchArtist(editId).catch(() => null);
            type = 'artist';
            label = item?.name;
          } else if (activeTab === 'organizers') {
            item = await fetchOrganizer(editId).catch(() => null);
            type = 'organizer';
            label = item?.name;
          } else if (activeTab === 'cities') {
            item = await fetchCity(editId).catch(() => null);
            type = 'city';
            label = item?.name;
          } else if (activeTab === 'users') {
            item = await fetchGuestUser(editId).catch(() => null);
            type = 'user';
            label = item?.username || item?.email || 'User';
          }

          if (item) {
            pushView(type, String(item.id), item, label);
          }
        } catch (e) { console.error('Deep link failed', e); }
      };
      loadItem();
    }
  }, [editId, pushView, navigationStack.length, activeTab]);


  // Helper: Delete Item
  const handleDelete = async (item: any) => {
    // Determine entity type for usage check
    let entityType = '';
    if (activeTab === 'venues') entityType = 'venues';
    else if (activeTab === 'artists') entityType = 'artists';
    else if (activeTab === 'organizers') entityType = 'organizers';
    else if (activeTab === 'cities') entityType = 'cities';
    else if (activeTab === 'users') entityType = 'guest-users';

    // 1. Check Usage (if applicable)
    if (entityType) {
      try {
        const usageData = await getUsage(entityType, item.id);
        const count = usageData?.usage || 0;
        if (count > 0) {
          const msg = `Warning: "${item.title || item.name || 'Item'}" is linked to ${count} items (events, history, etc).\n\nDeleting it will remove these references or relationships.\n\nAre you sure you want to proceed?`;
          if (!confirm(msg)) return;
        } else {
          if (!confirm(`Delete "${item.title || item.name}"?`)) return;
        }
      } catch (e) {
        // Fallback if usage check fails
        console.warn('Usage check failed', e);
        if (!confirm(`Delete "${item.title || item.name}"?`)) return;
      }
    } else {
      // Events or other types without strict dependency check
      if (!confirm(`Delete "${item.title || item.name}"?`)) return;
    }

    // 2. Perform Delete
    try {
      if (activeTab === 'events') await deleteEvent(item.id);
      else if (activeTab === 'venues') await deleteVenue(item.id);
      else if (activeTab === 'artists') await deleteArtist(item.id);
      else if (activeTab === 'organizers') await deleteOrganizer(item.id);
      else if (activeTab === 'cities') await deleteCity(item.id);
      else if (activeTab === 'users') await deleteGuestUser(item.id);

      await loadListData();
      if (currentView?.id === item.id) popView();
    } catch (e: any) {
      alert('Delete failed: ' + e.message);
    }
  };



  if (isLoading) {
    return (
      <div className="p-6 max-w-[1600px] mx-auto space-y-6">
        <DashboardSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center">
        <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-full mb-4">
          <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Something went wrong</h3>
        <p className="text-gray-500 dark:text-gray-400 mb-6 text-center max-w-md">{error}</p>
        <Button onClick={() => window.location.reload()}>Reload Page</Button>
      </div>
    );
  }
  // Component: Shortcuts Footer (Single Line, No Wrap)
  const ShortcutsFooter = () => (
    <div className="flex items-center justify-center gap-2 px-4 bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 text-[10px] text-gray-500 font-medium select-none whitespace-nowrap overflow-hidden h-9">
      <div className="flex items-center gap-1">
        <span className="flex items-center gap-0.5"><span className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 min-w-[18px] text-center">↑</span><span className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 min-w-[18px] text-center">↓</span></span>
        <span>Navigate</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">Enter</span>
        <span>Open</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">Space</span>
        <span>Select</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">Esc</span>
        <span>Back / Clear</span>
      </div>
    </div>
  );

  // Helper: Source Icons
  const renderSourceIcons = (item: any) => {
    const refs = item.source_references || item.source_configs || [];
    if (refs.length > 0) {
      return (
        <div className="flex -space-x-1 shrink-0">
          {refs.map((s: any, i: number) => (
            <div key={i} className="relative z-10 hover:z-20 transition-all">
              <SourceIcon sourceCode={s.source_code} className="w-4 h-4 rounded-full border border-white dark:border-gray-900 bg-white" />
            </div>
          ))}
        </div>
      );
    }
    const code = item.provider || item.source || 'og';
    return (
      <div className="flex -space-x-1 shrink-0">
        <SourceIcon sourceCode={code} className="w-4 h-4" />
      </div>
    );
  };





  // --- Main Render ---

  return (
    <div className="h-full flex flex-col bg-[#FAFAFA] dark:bg-[#09090B] font-sans text-gray-900 dark:text-gray-100">

      {/* Header Tabs */}
      <header className="flex items-center justify-between px-6 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-30 flex-shrink-0">
        <div className="flex-1 max-w-2xl mr-4">
          <DashboardSearch
            activeTab={activeTab}
            localSearchTerm={searchQuery}
            onLocalSearch={setSearchQuery}
          />
        </div>
        {activeTab !== 'overview' && (
          <Button size="sm" onClick={() => {
            const type = activeTab === 'cities' ? 'city' : activeTab.slice(0, -1) as ViewType;
            switchToView(type, undefined);
          }} className="gap-2">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New {activeTab === 'cities' ? 'City' : activeTab.slice(0, -1)}</span>
          </Button>
        )}
      </header>

      {/* Content Area - REMOVED PADDING TO FIX INSET */}
      <main className="flex-1 overflow-hidden relative">
        {activeTab === 'overview' ? (
          // OVERVIEW LAYOUT
          <div className="h-full overflow-y-auto px-6 py-8 max-w-screen-2xl mx-auto space-y-8">
            {/* Stats Row */}
            {stats && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <AnalyticsSummary stats={stats.events} scrapeStats={stats.scraping} history={history} />
              </div>
            )}

            {/* Charts & Scraper */}
            <div className="grid grid-cols-12 gap-6 min-h-[400px]">
              <div className="col-span-12 lg:col-span-8 h-full">
                <ActivityChart data={history} />
              </div>
              <div className="col-span-12 lg:col-span-4 h-full">
                {stats && <ScrapeWidget stats={stats.scraping} onScrapeComplete={() => window.location.reload()} />}
              </div>
            </div>

            {/* Map Full Width */}
            <div className="grid grid-cols-12 gap-6 min-h-[600px]">
              <div className="col-span-12 h-full relative rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800 shadow-sm">
                <MapWidget events={mapEvents} cities={cities} />
              </div>
            </div>
          </div>
        ) : (
          // DATA MANAGEMENT LAYOUT (Split View)
          <div className="flex h-full">
            {/* List Panel */}
            <div className={clsx(
              "flex-shrink-0 flex flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 transition-all duration-300",
              // Mobile: hide if detail view active. Desktop: respect isSidebarOpen
              currentView ? "hidden md:flex" : "w-full md:flex",
              isSidebarOpen ? "w-80 lg:w-96" : "w-0 overflow-hidden border-none"
            )}>
              {/* Bulk Actions Bar - REMOVED, moved to footer */}

              {/* Status & Time Filter (Events only) */}
              {activeTab === 'events' && (
                <div className="px-2 py-2 border-b dark:border-gray-800 flex gap-2 overflow-x-auto">
                  <Select
                    fullWidth={false}
                    containerClassName="w-auto min-w-[100px]"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="text-xs py-1"
                  >
                    <option value="all">Status: All</option>
                    <option value="draft">Draft</option>
                    <option value="needs_details">Needs Details</option>
                    <option value="ready">Ready to Publish</option>
                    <option value="published">Published</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="rejected">Rejected</option>
                  </Select>

                  <Select
                    fullWidth={false}
                    containerClassName="w-auto min-w-[100px]"
                    value={timeFilter}
                    onChange={(e) => setTimeFilter(e.target.value as any)}
                    className="text-xs py-1"
                  >
                    <option value="upcoming">Upcoming</option>
                    <option value="past">Past</option>
                    <option value="all">Time: All</option>
                  </Select>

                  {/* City Filter */}
                  <Select
                    fullWidth={false}
                    containerClassName="w-auto min-w-[100px]"
                    value={cityFilter}
                    onChange={(e) => setCityFilter(e.target.value)}
                    className="text-xs py-1"
                  >
                    <option value="">City: All</option>
                    {cities.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </Select>

                  <Select
                    fullWidth={false}
                    containerClassName="w-auto min-w-[100px]"
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value)}
                    className="text-xs py-1"
                  >
                    <option value="">Source: All</option>
                    {sources.map(s => (
                      <option key={s} value={s}>{SOURCE_FILTER_MAP[s] || s}</option>
                    ))}
                  </Select>
                </div>
              )}

              {/* Venue Filters */}
              {activeTab === 'venues' && (
                <div className="px-2 py-2 border-b dark:border-gray-800 flex gap-2 overflow-x-auto">
                  <Select
                    fullWidth={false}
                    containerClassName="w-auto min-w-[100px]"
                    value={cityFilter}
                    onChange={(e) => setCityFilter(e.target.value)}
                    className="text-xs py-1"
                  >
                    <option value="">City: All</option>
                    {cities.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </Select>

                  <Select
                    fullWidth={false}
                    containerClassName="w-auto min-w-[100px]"
                    value={venueTypeFilter}
                    onChange={(e) => setVenueTypeFilter(e.target.value)}
                    className="text-xs py-1"
                  >
                    <option value="">Type: All</option>
                    <option value="club">Club</option>
                    <option value="bar">Bar</option>
                    <option value="concert_hall">Concert Hall</option>
                    <option value="festival">Festival</option>
                    <option value="other">Other</option>
                  </Select>

                  <Select
                    fullWidth={false}
                    containerClassName="w-auto min-w-[100px]"
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value)}
                    className="text-xs py-1"
                  >
                    <option value="">Source: All</option>
                    {sources.map(s => (
                      <option key={s} value={s}>{SOURCE_FILTER_MAP[s] || s}</option>
                    ))}
                  </Select>
                </div>
              )}

              {/* Other Filters (Artists/Cities) - Exclude Events AND Venues */}
              {activeTab !== 'events' && activeTab !== 'venues' && (
                <div className="px-2 py-2 border-b dark:border-gray-800 flex gap-2 overflow-x-auto">
                  {(activeTab === 'artists' || activeTab === 'cities') && (
                    <Select
                      fullWidth={false}
                      containerClassName="w-auto min-w-[100px]"
                      value={countryFilter}
                      onChange={(e) => setCountryFilter(e.target.value)}
                      className="text-xs py-1"
                    >
                      <option value="">Country: All</option>
                      {countries.map(c => <option key={c.code} value={c.name}>{c.name}</option>)}
                    </Select>
                  )}
                  {activeTab === 'cities' && (
                    <Select
                      fullWidth={false}
                      containerClassName="w-auto min-w-[100px]"
                      value={activeFilter}
                      onChange={(e) => setActiveFilter(e.target.value as any)}
                      className="text-xs py-1"
                    >
                      <option value="all">Active: All</option>
                      <option value="active">Active Only</option>
                      <option value="inactive">Inactive Only</option>
                    </Select>
                  )}

                  {activeTab !== 'cities' && (
                    <Select
                      fullWidth={false}
                      containerClassName="w-auto min-w-[100px]"
                      value={sourceFilter}
                      onChange={(e) => setSourceFilter(e.target.value)}
                      className="text-xs py-1"
                    >
                      <option value="">Source: All</option>
                      {sources.map(s => (
                        <option key={s} value={s}>{SOURCE_FILTER_MAP[s] || s}</option>
                      ))}
                    </Select>
                  )}
                </div>
              )}



              {/* Scrollable List */}
              <div className="flex-1 overflow-y-auto">
                {/* Dedicated List Components */}
                {activeTab === 'events' ? (
                  <EventList
                    events={events}
                    isLoading={isListLoading}
                    selectedIds={selectedIds}
                    onSelect={(id) => {
                      const newSet = new Set(selectedIds);
                      if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
                      setSelectedIds(newSet);
                    }}
                    onSelectAll={() => {
                      if (selectedIds.size === events.length) setSelectedIds(new Set());
                      else setSelectedIds(new Set(events.map(e => e.id)));
                    }}
                    onEdit={(e) => switchToView('event', e.id, e, e.title)}
                    onApprove={(id, e) => {
                      e?.stopPropagation();
                      setPublishStatus([id], 'APPROVED_PENDING_DETAILS').then(() => loadListData(true));
                    }}
                    onReject={(id, e) => {
                      e?.stopPropagation();
                      setPublishStatus([id], 'REJECTED').then(() => loadListData(true));
                    }}
                    focusedId={currentView?.type === 'event' && currentView.id ? currentView.id : ((activeTab === 'events' && selectedIndex >= 0 && events[selectedIndex]) ? events[selectedIndex].id : null)}
                  />
                ) : activeTab === 'venues' ? (
                  <VenueList
                    venues={venues}
                    isLoading={isListLoading}
                    selectedIds={selectedIds}
                    onSelect={(id) => {
                      const newSet = new Set(selectedIds);
                      if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
                      setSelectedIds(newSet);
                    }}
                    onSelectAll={() => {
                      if (selectedIds.size === venues.length) setSelectedIds(new Set());
                      else setSelectedIds(new Set(venues.map(v => v.id)));
                    }}
                    onEdit={(v) => switchToView('venue', v.id, v, v.name)}
                    focusedId={currentView?.type === 'venue' && currentView.id ? currentView.id : ((activeTab === 'venues' && selectedIndex >= 0 && venues[selectedIndex]) ? venues[selectedIndex].id : null)}
                  />
                ) : activeTab === 'artists' ? (
                  <ArtistList
                    artists={artists}
                    isLoading={isListLoading}
                    selectedIds={selectedIds}
                    onSelect={(id) => {
                      const newSet = new Set(selectedIds);
                      if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
                      setSelectedIds(newSet);
                    }}
                    onSelectAll={() => {
                      if (selectedIds.size === artists.length) setSelectedIds(new Set());
                      else setSelectedIds(new Set(artists.map(a => a.id)));
                    }}
                    onEdit={(a) => switchToView('artist', a.id, a, a.name)}
                    focusedId={currentView?.type === 'artist' && currentView.id ? currentView.id : ((activeTab === 'artists' && selectedIndex >= 0 && artists[selectedIndex]) ? artists[selectedIndex].id : null)}
                  />
                ) : activeTab === 'cities' ? (
                  <CityList
                    cities={adminCities}
                    isLoading={isListLoading}
                    selectedIds={selectedIds}
                    onSelect={(id) => {
                      const newSet = new Set(selectedIds);
                      if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
                      setSelectedIds(newSet);
                    }}
                    onSelectAll={() => {
                      if (selectedIds.size === adminCities.length) setSelectedIds(new Set());
                      else setSelectedIds(new Set(adminCities.map(c => String(c.id))));
                    }}
                    onEdit={(c) => switchToView('city', String(c.id), c, c.name)}
                    focusedId={currentView?.type === 'city' && currentView.id ? currentView.id : ((activeTab === 'cities' && selectedIndex >= 0 && adminCities[selectedIndex]) ? String(adminCities[selectedIndex].id) : null)}
                  />
                ) : activeTab === 'organizers' ? (
                  <OrganizerList
                    organizers={organizers}
                    isLoading={isListLoading}
                    selectedIds={selectedIds}
                    onSelect={(id) => {
                      const newSet = new Set(selectedIds);
                      if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
                      setSelectedIds(newSet);
                    }}
                    onSelectAll={() => {
                      if (selectedIds.size === organizers.length) setSelectedIds(new Set());
                      else setSelectedIds(new Set(organizers.map(o => o.id)));
                    }}
                    onEdit={(o) => switchToView('organizer', String(o.id), o, o.name)}
                    focusedId={currentView?.type === 'organizer' && currentView.id ? currentView.id : ((activeTab === 'organizers' && selectedIndex >= 0 && organizers[selectedIndex]) ? String(organizers[selectedIndex].id) : null)}
                  />
                ) : activeTab === 'users' ? (
                  <GuestUserList
                    users={guestUsers}
                    isLoading={isListLoading}
                    selectedIds={selectedIds}
                    onSelect={(id) => {
                      const newSet = new Set(selectedIds);
                      if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
                      setSelectedIds(newSet);
                    }}
                    onSelectAll={() => {
                      if (selectedIds.size === guestUsers.length) setSelectedIds(new Set());
                      else setSelectedIds(new Set(guestUsers.map(u => u.id)));
                    }}
                    onEdit={(u) => switchToView('user', u.id, u, u.username || u.email)}
                    focusedId={currentView?.type === 'user' && currentView.id ? currentView.id : ((activeTab === 'users' && selectedIndex >= 0 && guestUsers[selectedIndex]) ? guestUsers[selectedIndex].id : null)}
                  />
                ) : activeTab === 'moderation' ? (
                  <ReportList
                    reports={reports}
                    isLoading={isListLoading}
                    selectedIds={selectedIds}
                    onSelect={(id) => {
                      const newSet = new Set(selectedIds);
                      if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
                      setSelectedIds(newSet);
                    }}
                    onSelectAll={() => {
                      if (selectedIds.size === reports.length) setSelectedIds(new Set());
                      else setSelectedIds(new Set(reports.map(r => String(r.id))));
                    }}
                    onEdit={(r) => switchToView('report', String(r.id), r, `Report #${String(r.id).substring(0, 8)}`)}
                    focusedId={currentView?.type === 'report' && currentView.id ? currentView.id : ((activeTab === 'moderation' && selectedIndex >= 0 && reports[selectedIndex]) ? String(reports[selectedIndex].id) : null)}
                  />
                ) : (
                  // Fallback for empty state or unknown tabs
                  <EmptyState
                    icon={Search}
                    title="No results found"
                    description="Try adjusting your filters or search query."
                    actionLabel="Clear Filters"
                    onAction={() => {
                      setSearchQuery('');
                      setSourceFilter('');
                    }}
                  />
                )}
              </div>

              {/* Pagination Footer */}
              <div className="flex-shrink-0">
                <div className="p-2 border-t dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-900 text-xs">
                  <span>{total} items</span>
                  <div className="flex gap-1 items-center">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 hover:bg-gray-200 rounded"><ChevronLeft className="w-4 h-4" /></button>
                    <span>{page}</span>
                    <button onClick={() => setPage(p => p + 1)} disabled={page * pageSize >= total} className="p-1 hover:bg-gray-200 rounded"><ChevronRight className="w-4 h-4" /></button>
                  </div>
                </div>
                {/* Footer: Bulk Actions OVERLAY or Shortcuts */}
                {selectedIds.size > 0 ? (
                  <div className="animate-in slide-in-from-bottom-2 duration-200 flex items-center justify-between px-4 bg-primary-900 text-white shadow-lg z-20 h-9 box-border">
                    <span className="text-xs font-semibold">
                      {selectedIds.size} selected
                    </span>
                    <div className="flex items-center gap-3">
                      {/* Bulk Actions for Events */}
                      {activeTab === 'events' && (
                        <>
                          <button onClick={() => {
                            if (confirm(`Approve ${selectedIds.size} selected?`)) {
                              const ids = Array.from(selectedIds);
                              setPublishStatus(ids, 'APPROVED_PENDING_DETAILS').then(() => { loadListData(); setSelectedIds(new Set()); });
                            }
                          }} className="text-xs hover:text-green-300 font-medium flex items-center gap-1">
                            Approve <span className="opacity-50 text-[10px] ml-0.5 mb-0.5">[A]</span>
                          </button>
                          <button onClick={() => {
                            if (confirm(`Reject ${selectedIds.size} selected?`)) {
                              const ids = Array.from(selectedIds);
                              setPublishStatus(ids, 'REJECTED').then(() => { loadListData(); setSelectedIds(new Set()); });
                            }
                          }} className="text-xs hover:text-red-300 font-medium flex items-center gap-1">
                            Reject <span className="opacity-50 text-[10px] ml-0.5 mb-0.5">[R]</span>
                          </button>
                        </>
                      )}

                      {/* Generic Clear */}
                      <button onClick={() => setSelectedIds(new Set())} className="text-xs opacity-70 hover:opacity-100 flex items-center gap-1">
                        Cancel <span className="opacity-50 text-[10px] ml-0.5 mb-0.5">[Esc]</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <ShortcutsFooter />
                )}
              </div>
            </div>

            {/* Detail Panel / Stack */}
            <div className={clsx(
              "flex-1 overflow-hidden relative bg-gray-50 dark:bg-gray-950",
              // On mobile, detail panel is full width if active. On desktop it takes remaining space.
              currentView ? "flex" : "hidden md:flex"
            )}>
              {currentView ? (
                <div className="absolute inset-0 bg-white dark:bg-gray-900 flex flex-col animate-in slide-in-from-right-4 duration-200">
                  {/* Detail Header */}
                  <div className="h-14 border-b dark:border-gray-800 flex items-center justify-between px-4 bg-white dark:bg-gray-900 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      {navigationStack.length > 1 && (
                        <button onClick={popView} className="p-2 hover:bg-gray-100 rounded-full">
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                      )}
                      <h2 className="font-semibold text-lg max-w-sm truncate">
                        {currentView.label || (currentView.id ? `Edit ${currentView.type}` : `New ${currentView.type}`)}
                      </h2>
                    </div>
                    <div className="flex gap-2">
                      {currentView.id && (
                        <button onClick={() => handleDelete(currentView.data)} className="p-2 text-red-500 hover:bg-red-50 rounded">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => popView()} className="p-2 text-gray-400 hover:bg-gray-100 rounded">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Detail Content */}
                  <div className="flex-1 overflow-hidden">
                    {currentView.type === 'event' && (
                      <EventForm
                        key={currentView.id || 'new-event'}
                        initialData={currentView.data}
                        onSubmit={async (data) => {
                          if (currentView.id) await updateEvent(currentView.id, data);
                          else await createEvent(data);
                          loadListData(true); // refresh list silently
                          setIsFormDirty(false); // Clear dirty state before closing
                          if (!currentView.id) popView();
                        }}
                        onDelete={handleDelete}
                        onCancel={popView}
                        onNavigate={(type: any, id?: string, data?: any) => {
                          // Standardized navigation from form
                          const label = data?.name || data?.title || (id ? `Edit ${type}` : `New ${type}`);
                          pushView(type, id, data, label);
                        }}
                        isModal={false}
                        isPanel={true}
                        onDirtyChange={setIsFormDirty}
                      />
                    )}
                    {currentView.type === 'venue' && (
                      <VenueForm
                        key={currentView.id || 'new-venue'}
                        initialData={currentView.data}
                        onSubmit={async (data) => {
                          if (currentView.id) await updateVenue(currentView.id, data);
                          else await createVenue(data as any);
                          loadListData();
                          setIsFormDirty(false);
                          popView(true);
                        }}
                        onDelete={handleDelete}
                        onCancel={popView}
                        id={currentView.id}
                        isPanel={true}
                        onDirtyChange={setIsFormDirty}
                        isModal={false}
                      />
                    )}
                    {currentView.type === 'artist' && (
                      <ArtistForm
                        key={currentView.id || 'new-artist'}
                        initialData={currentView.data}
                        onSubmit={async (data) => {
                          if (currentView.id) await updateArtist(currentView.id, data as any);
                          else await createArtist(data as any);
                          loadListData();
                          setIsFormDirty(false);
                          popView(true);
                        }}
                        onDelete={handleDelete}
                        onCancel={popView}
                        id={currentView.id}
                        isPanel={true}
                        onDirtyChange={setIsFormDirty}
                        isModal={false}
                        onNavigate={(type: any, id?: string, data?: any) => {
                          const label = data?.name || data?.title || (id ? `Edit ${type}` : `New ${type}`);
                          pushView(type, id, data, label);
                        }}
                      />
                    )}
                    {currentView.type === 'city' && (
                      <CityForm
                        key={currentView.id || 'new-city'}
                        initialData={currentView.data}
                        onSubmit={async (data) => {
                          if (currentView.id) await updateCity(currentView.id, data as any);
                          else await createCity(data as any);
                          loadListData();
                          setIsFormDirty(false);
                          popView(true);
                        }}
                        onDelete={handleDelete}
                        onCancel={popView}
                        isModal={false}
                        isPanel={true}
                        onDirtyChange={setIsFormDirty}
                      />
                    )}
                    {currentView.type === 'organizer' && (
                      <OrganizerForm
                        key={currentView.id || 'new-organizer'}
                        initialData={currentView.data}
                        onSubmit={async (data) => {
                          if (currentView.id) await updateOrganizer(currentView.id, data as any);
                          else await createOrganizer(data as any);
                          loadListData();
                          setIsFormDirty(false);
                          popView(true);
                        }}
                        onDelete={handleDelete}
                        onCancel={popView}
                        isModal={false}
                        id={currentView.id}
                        isPanel={true}
                        onDirtyChange={setIsFormDirty}
                      />
                    )}
                    {currentView.type === 'user' && (
                      <GuestUserForm
                        key={currentView.id || 'new-user'}
                        initialData={currentView.data}
                        onSubmit={async (data) => {
                          if (currentView.id) await updateGuestUser(currentView.id, data as any);
                          else await createGuestUser(data);
                          loadListData();
                          setIsFormDirty(false);
                          popView(true);
                        }}
                        onDelete={handleDelete}
                        onCancel={popView}
                        isModal={false}
                        id={currentView.id}
                        isPanel={true}
                        onDirtyChange={setIsFormDirty}
                      />
                    )}
                    {currentView.type === 'report' && (
                      <ReportDetail
                        report={currentView.data}
                        onClose={() => popView()}
                        onUpdate={() => { loadListData(); }}
                        isPanel={true}
                      />
                    )}
                  </div>
                </div>
              ) : (
                <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
                  <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-8">
                    <div className="w-12 h-12 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Filter className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                      {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Filters
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                      Use these quick filters to organize your view.
                    </p>

                    <div className="grid gap-2.5">
                      {activeTab === 'events' && (
                        <>
                          {/* Row 1: Workflow */}
                          <div className="flex gap-2">
                            <button
                              onClick={() => { setStatusFilter('drafts'); setTimeFilter('upcoming'); }}
                              className="flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-primary-500 hover:ring-1 hover:ring-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/10 transition-all text-sm font-medium text-gray-700 dark:text-gray-200"
                            >
                              <Clock className="w-4 h-4 text-gray-500" />
                              <span className="text-xs">Drafts</span>
                            </button>
                            <button
                              onClick={() => { setStatusFilter('needs_details'); setTimeFilter('upcoming'); }}
                              className="flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-amber-500 hover:ring-1 hover:ring-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-all text-sm font-medium text-gray-700 dark:text-gray-200"
                            >
                              <GitPullRequest className="w-4 h-4 text-amber-500" />
                              <span className="text-xs">Review</span>
                            </button>
                            <button
                              onClick={() => { setStatusFilter('ready'); setTimeFilter('upcoming'); }}
                              className="flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-blue-500 hover:ring-1 hover:ring-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all text-sm font-medium text-gray-700 dark:text-gray-200"
                            >
                              <Check className="w-4 h-4 text-blue-500" />
                              <span className="text-xs">Ready</span>
                            </button>
                          </div>

                          {/* Row 2: Publishing */}
                          <div className="flex gap-2">
                            <button
                              onClick={() => { setStatusFilter('published'); setTimeFilter('today'); }}
                              className="flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-green-500 hover:ring-1 hover:ring-green-500 hover:bg-green-50 dark:hover:bg-green-900/10 transition-all text-sm font-medium text-gray-700 dark:text-gray-200"
                            >
                              <span className="w-2 h-2 rounded-full bg-green-500"></span>
                              <span className="text-xs">Today</span>
                            </button>
                            <button
                              onClick={() => { setStatusFilter('live'); setTimeFilter('all'); }}
                              className="flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-red-500 hover:ring-1 hover:ring-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-all text-sm font-medium text-gray-700 dark:text-gray-200"
                            >
                              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                              <span className="text-xs">Live Now</span>
                            </button>
                          </div>
                        </>
                      )}

                      {activeTab === 'venues' && (
                        <>
                          <button
                            onClick={() => { setCityFilter('Berlin'); }}
                            className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-primary-500 hover:ring-1 hover:ring-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/10 transition-all text-sm font-medium text-gray-700 dark:text-gray-200 group"
                          >
                            <span className="flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-purple-500" />
                              Berlin Venues
                            </span>
                            <span className="text-xs text-gray-400 group-hover:text-primary-600">Filter</span>
                          </button>
                          <button
                            onClick={() => { setVenueTypeFilter('club'); }}
                            className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-primary-500 hover:ring-1 hover:ring-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/10 transition-all text-sm font-medium text-gray-700 dark:text-gray-200 group"
                          >
                            <span className="flex items-center gap-2">
                              <Music className="w-4 h-4 text-pink-500" />
                              Clubs
                            </span>
                            <span className="text-xs text-gray-400 group-hover:text-primary-600">Filter</span>
                          </button>
                        </>
                      )}

                      {/* Fallback for others */}
                      {!['events', 'venues'].includes(activeTab) && (
                        <div className="text-center py-4 text-gray-400 text-sm italic">
                          Select an item from the list to view details
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
              }
            </div >
          </div >
        )}
      </main >

      <UserManagementModal
        isOpen={false}
        onClose={() => { }}
      />
      {unsavedModal}
    </div >
  );
}

export function NewDashboard(props: NewDashboardProps) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>}>
      <DashboardContent {...props} />
    </Suspense>
  );
}
