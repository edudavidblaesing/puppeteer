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
  Shield
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ActivityChart } from '@/components/dashboard/ActivityChart';
import { RecentActivityList } from '@/components/dashboard/RecentActivityList';
import { MapWidget } from '@/components/dashboard/MapWidget';
import { ScrapeWidget } from '@/components/dashboard/ScrapeWidget';
import { AnalyticsSummary } from '@/components/dashboard/AnalyticsSummary';
import { UserManagementModal } from '@/components/features/UserManagementModal';
import { EventForm } from '@/components/features/EventForm';
import { VenueForm } from '@/components/features/VenueForm';
import { ArtistForm } from '@/components/features/ArtistForm';
import { CityForm } from '@/components/features/CityForm';
import { OrganizerForm } from '@/components/features/OrganizerForm';
import { GuestUserForm } from '@/components/features/GuestUserForm';
import { ReportDetail } from '@/components/features/ReportDetail';
import { DashboardSearch } from '@/components/DashboardSearch';

import {
  fetchEvents, fetchStats, fetchCities, fetchScrapeHistory, setPublishStatus,
  fetchEvent, fetchVenue, fetchArtist, fetchOrganizer, fetchAdminCities,
  fetchArtists, fetchAdminVenues, fetchOrganizers,
  createEvent, updateEvent, deleteEvent,
  createVenue, updateVenue, deleteVenue,
  createArtist, updateArtist, deleteArtist,
  createOrganizer, updateOrganizer, deleteOrganizer,
  createCity, updateCity, deleteCity,
  searchArtists, checkHealth, fetchCountries,
  fetchGuestUsers, fetchGuestUser, updateGuestUser, createGuestUser, deleteGuestUser,
  fetchReports
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
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // --- Overview State ---
  const [stats, setStats] = useState<Stats | null>(null);
  const [pendingEvents, setPendingEvents] = useState<Event[]>([]);
  const [pipelineEvents, setPipelineEvents] = useState<Event[]>([]);
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'needs_details' | 'ready' | 'published' | 'cancelled' | 'rejected'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // const [showPastEvents, setShowPastEvents] = useState(false); // Replaced by timeFilter
  const [timeFilter, setTimeFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming');

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
                activeTab === 'organizers' ? organizers : adminCities;
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
      const [statsData, citiesData, historyData, pendingData, pipelineData, mapData] = await Promise.all([
        fetchStats(),
        fetchCities(),
        fetchScrapeHistory({ days: 30, groupBy: 'day' }),
        fetchEvents({ limit: 5, status: 'pending' }),
        fetchEvents({ limit: 5, status: 'approved', published: false }),
        fetchEvents({ limit: 2000, showPast: false })
      ]);

      setStats(statsData);
      setCities(citiesData);
      setPendingEvents(pendingData.data);
      setPipelineEvents(pipelineData.data);
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
  const loadListData = useCallback(async () => {
    if (activeTab === 'overview') return;
    try {
      setIsLoading(true);
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
          const event = await fetchEvent(editId).catch(() => null);
          if (event) {
            setActiveTab('events');
            pushView('event', event.id, event, event.title);
          }
        } catch (e) { console.error(e); }
      };
      loadItem();
    }
  }, [editId, pushView, navigationStack.length]);


  // Helper: Delete Item
  const handleDelete = async (item: any) => {
    if (!confirm(`Delete "${item.title || item.name}"?`)) return;
    try {
      if (activeTab === 'events') await deleteEvent(item.id);
      else if (activeTab === 'venues') await deleteVenue(item.id);
      else if (activeTab === 'artists') await deleteArtist(item.id);
      else if (activeTab === 'organizers') await deleteOrganizer(item.id);
      else if (activeTab === 'cities') await deleteCity(item.id);

      await loadListData();
      if (currentView?.id === item.id) popView();
    } catch (e: any) {
      alert('Delete failed: ' + e.message);
    }
  };


  // --- Render Helpers ---

  // Component: Shortcuts Footer
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

  const renderListItem = (item: any, index: number) => {
    const isSelected = currentView?.id === item.id || index === selectedIndex;
    const isChecked = selectedIds.has(item.id);

    const title = typeof item.title === 'string' ? item.title : (typeof item.name === 'string' ? item.name : 'Untitled');

    // Fix: Handle item.city possibly being an object (React Error #31)
    let subtitle = '';
    if (typeof item.venue_name === 'string') subtitle = item.venue_name;

    // Check city
    if (item.city) {
      if (typeof item.city === 'object' && (item.city as any).name) {
        subtitle = String((item.city as any).name);
      } else if (typeof item.city === 'string') {
        subtitle = item.city;
      }
    }

    const dateFormatted = item.date ? format(new Date(item.date), 'MMM d') : null; // No year as requested
    const imageUrl = item.image_url || (item.images && item.images[0]?.url);

    const toggleSelection = (e: React.MouseEvent) => {
      e.stopPropagation();
      const newSet = new Set(selectedIds);
      if (newSet.has(item.id)) newSet.delete(item.id);
      else newSet.add(item.id);
      setSelectedIds(newSet);
    };

    if (activeTab === 'events') {
      const eventItem = item as Event;
      return (
        <div key={item.id}
          ref={el => { itemRefs.current[index] = el; }}
          onClick={() => switchToView('event', item.id, item, title)}
          className={clsx(
            "px-4 py-3 border-b border-gray-100 dark:border-gray-800 cursor-pointer transition-colors flex gap-3 group relative",
            // Intelligent hover/active state
            isSelected ? "bg-primary-50 dark:bg-primary-900/10 border-l-4 border-l-primary-500" : "hover:bg-gray-50 dark:hover:bg-gray-800 border-l-4 border-l-transparent"
          )}
        >
          {/* Image Thumbnail with Overlay Checkbox */}
          <div className="relative w-12 h-12 flex-shrink-0 cursor-pointer" onClick={toggleSelection}>
            <div className={clsx(
              "absolute inset-0 z-20 flex items-center justify-center transition-opacity duration-200",
              // Changed: Use standard group-hover from the parent row, simplify logic
              isChecked ? "opacity-100 bg-black/20" : "opacity-0 group-hover:opacity-100 group-hover:bg-black/20"
            )}>
              <input
                type="checkbox"
                checked={isChecked}
                readOnly // handled by parent div click
                className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 bg-white shadow-sm cursor-pointer"
              />
            </div>

            <div className={clsx(
              "w-full h-full rounded-md overflow-hidden bg-gray-200 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 bg-cover bg-center flex items-center justify-center text-gray-400 transition-opacity",
              !imageUrl && "bg-gray-100 dark:bg-gray-800",
              isChecked && "opacity-60"
            )}
              style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
            >
              {!imageUrl && <Music className="w-6 h-6 opacity-50" />}
            </div>


          </div>

          <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
            <div className="flex justify-between items-start">
              {/* Left: Title & Subtitle */}
              <div className="min-w-0 pr-2">
                <h4 className="font-medium text-gray-900 dark:text-gray-100 truncate text-sm leading-tight">{typeof title === 'string' ? title : ''}</h4>
                {subtitle && typeof subtitle === 'string' && (
                  <div className="flex items-center text-xs text-gray-400 truncate mt-0.5">
                    {subtitle}
                  </div>
                )}
              </div>

              {/* Right: Metadata Stack (Date top, Sources bottom) */}
              <div className="flex flex-col items-end gap-1 shrink-0">
                {/* Status Badge */}
                {(() => {
                  const s = eventItem.status || 'MANUAL_DRAFT';
                  const isPublished = s === 'PUBLISHED';
                  // Check Live Status
                  const now = new Date();
                  const start = eventItem.start_time ? new Date(`${item.date?.split('T')[0]}T${eventItem.start_time}`) : null;
                  const end = eventItem.end_time ? new Date(`${item.date?.split('T')[0]}T${eventItem.end_time}`) : null;

                  let badge = { text: s.replace(/_/g, ' '), color: 'bg-gray-100 text-gray-600 border-gray-200' };

                  if (s === 'SCRAPED_DRAFT' || s === 'MANUAL_DRAFT') {
                    badge = { text: 'DRAFT', color: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700' };
                  } else if (s === 'APPROVED_PENDING_DETAILS') {
                    badge = { text: 'NEEDS REVIEW', color: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800' };
                  } else if (s === 'READY_TO_PUBLISH') {
                    badge = { text: 'READY', color: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800' };
                  } else if (s === 'PUBLISHED') {
                    badge = { text: 'PUBLISHED', color: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800' };
                    // Live Check enhancement
                    if (start && end) {
                      if (now >= start && now <= end) {
                        badge = { text: 'LIVE', color: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 animate-pulse' };
                      }
                    }
                  } else if (s === 'CANCELED' || s === 'REJECTED') {
                    badge = { text: s, color: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800' };
                  }

                  return (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide ${badge.color}`}>
                      {badge.text}
                    </span>
                  );
                })()}

                {/* Date Badge */}
                <span className={clsx(
                  "text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide text-xs",
                  dateFormatted ? "bg-white dark:bg-gray-800 text-gray-500 border-transparent" : "text-red-500"
                )}>
                  {dateFormatted}
                </span>

                {/* Source Icons */}
                <div className="flex justify-end">
                  {renderSourceIcons(eventItem)}
                </div>
              </div>
            </div>
          </div>

          {/* Hover Actions Overlay */}
          <div className="absolute right-4 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1 animate-in fade-in zoom-in-95 duration-150 bg-white dark:bg-gray-950 p-1 rounded-lg border border-gray-100 dark:border-gray-800 shadow-sm z-30">
            <button className="h-7 w-7 rounded-full border border-green-200 bg-white text-green-600 hover:bg-green-50 dark:bg-gray-800 dark:border-green-900 dark:text-green-400 dark:hover:bg-green-900/30 flex items-center justify-center transition-colors" title="Approve"
              onClick={(e) => { e.stopPropagation(); setPublishStatus([item.id], 'APPROVED_PENDING_DETAILS').then(() => loadListData()); }}
            >
              <Check className="w-4 h-4" />
            </button>
            <button className="h-7 w-7 rounded-full border border-red-200 bg-white text-red-600 hover:bg-red-50 dark:bg-gray-800 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-900/30 flex items-center justify-center transition-colors" title="Reject"
              onClick={(e) => { e.stopPropagation(); setPublishStatus([item.id], 'REJECTED').then(() => loadListData()); }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      );
    }

    // Generic render for others (Artists, Venues, etc.)
    // --- GENERIC LIST ITEM (Venues, Artists, etc.) ---
    // Standardized with check-on-hover via CSS and no quick actions

    const viewType = activeTab === 'cities' ? 'city' : activeTab === 'users' ? 'user' : activeTab.slice(0, -1);

    // Defensive handling to prevent "Objects are not valid as React child" crashes
    // Also specific handling for Guest Users
    let titleVal = typeof item.title === 'string' ? item.title : (typeof item.name === 'string' ? item.name : 'Untitled');
    let subtitleVal = '';

    // Fix: Handle item.city possibly being an object (React Error #31)
    // Check if item.city is present and safe
    if (item.city) {
      if (typeof item.city === 'object' && (item.city as any).name) {
        subtitleVal = String((item.city as any).name);
      } else if (typeof item.city === 'string') {
        subtitleVal = item.city;
      }
    }
    // Fallback if no city
    if (!subtitleVal) {
      subtitleVal = item.address || item.type || '';
    }

    let countryVal = typeof item.country === 'string' ? item.country : '';

    if (activeTab === 'users') {
      titleVal = item.username || item.email || 'Guest User';
      subtitleVal = item.full_name || (item.username ? item.email : '') || '';
      countryVal = ''; // Users don't have country
    }

    if (activeTab === 'moderation') {
      titleVal = `Report #${String(item.id).substring(0, 8)}`;
      subtitleVal = `${item.reason} - ${item.status}`;
      countryVal = '';
    }

    return (
      <div
        key={item.id || index}
        ref={el => { itemRefs.current[index] = el; }}
        className={clsx(
          "group flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer border-b border-gray-100 dark:border-gray-800 transition-colors",
          isSelected ? "bg-primary-50 dark:bg-primary-900/20" : "",
          index === selectedIndex ? "ring-2 ring-inset ring-primary-500 z-10" : ""
        )}
        onClick={() => switchToView(viewType as any, String(item.id), item, titleVal)}
      >
        {/* Standardized Image with Overlay Checkbox (w-12 h-12 to match Events) */}
        <div className="relative w-12 h-12 flex-shrink-0 group/image cursor-pointer" onClick={toggleSelection}>
          <div className={clsx(
            "absolute inset-0 z-20 flex items-center justify-center transition-opacity duration-200",
            isChecked ? "opacity-100 bg-black/20" : "opacity-0 group-hover:opacity-100 group-hover:bg-black/20"
          )}>
            <input
              type="checkbox"
              checked={isChecked}
              readOnly
              className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 bg-white shadow-sm cursor-pointer"
            />
          </div>

          <div className={clsx(
            "w-full h-full flex items-center justify-center overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-400 transition-opacity",
            activeTab === 'artists' ? "rounded-full" : "rounded-md",
            isChecked && "opacity-60"
          )}>
            {imageUrl ? (
              <img src={imageUrl} alt={titleVal} className="w-full h-full object-cover" />
            ) : (
              activeTab === 'artists' ? <Users className="w-5 h-5" /> :
                activeTab === 'venues' ? <Building2 className="w-5 h-5" /> :
                  activeTab === 'cities' ? <MapPin className="w-5 h-5" /> :
                    activeTab === 'users' ? <Users className="w-5 h-5" /> :
                      activeTab === 'moderation' ? <Shield className="w-5 h-5" /> :
                        <Briefcase className="w-5 h-5" /> // Organizers
            )}
          </div>
        </div>

        {/* Content Area (Matched to Events Layout) */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
          <div className="flex justify-between items-start">
            {/* Left: Title & Subtitle */}
            <div className="min-w-0 pr-2">
              <h4 className="font-medium text-gray-900 dark:text-gray-100 truncate text-sm leading-tight">{titleVal}</h4>
              <div className="flex items-center text-xs text-gray-400 truncate mt-0.5">
                {countryVal && <span className="uppercase font-medium text-gray-400">{countryVal}</span>}
                {countryVal && subtitleVal && <span className="text-gray-300 mx-1">•</span>}
                {subtitleVal && <span className="truncate">{subtitleVal}</span>}
              </div>
            </div>

            {/* Right: Metadata Stack (Source Bottom Right) */}
            <div className="flex flex-col items-end gap-1 shrink-0">
              {/* Placeholder for Date if we ever add it, needed for spacing if matching exactly? No, but useful structure */}
              <div className="h-4"></div> {/* Spacer to push source down if needed, or just flex-end */}
              <div className="flex justify-end">
                {renderSourceIcons(item)}
              </div>
            </div>
          </div>
        </div>
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

            {/* Map & Pending */}
            <div className="grid grid-cols-12 gap-6 min-h-[500px]">
              <div className="col-span-12 lg:col-span-8 h-full relative rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800 shadow-sm">
                <MapWidget events={mapEvents} cities={cities} />
              </div>
              <div className="col-span-12 lg:col-span-4 h-full">
                <RecentActivityList
                  events={pendingEvents}
                  pipelineEvents={pipelineEvents}
                  onApprove={async (id) => { await setPublishStatus([id], 'approved'); loadOverviewData(); }}
                  onReject={async (id) => { await setPublishStatus([id], 'rejected'); loadOverviewData(); }}
                />
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
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value as any)}
                    className="text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded px-2 py-1 max-w-[120px]"
                  >
                    <option value="all">Status: All</option>
                    <option value="draft">Draft</option>
                    <option value="needs_details">Needs Details</option>
                    <option value="ready">Ready to Publish</option>
                    <option value="published">Published</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="rejected">Rejected</option>
                  </select>

                  <select
                    value={timeFilter}
                    onChange={e => setTimeFilter(e.target.value as any)}
                    className="text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded px-2 py-1 max-w-[100px]"
                  >
                    <option value="upcoming">Upcoming</option>
                    <option value="past">Past</option>
                    <option value="all">Time: All</option>
                  </select>

                  {/* City Filter */}
                  <select
                    value={cityFilter}
                    onChange={e => setCityFilter(e.target.value)}
                    className="text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded px-2 py-1 max-w-[100px]"
                  >
                    <option value="">City: All</option>
                    {cities.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>

                  <select
                    value={sourceFilter}
                    onChange={e => setSourceFilter(e.target.value)}
                    className="text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded px-2 py-1 max-w-[100px]"
                  >
                    <option value="">Source: All</option>
                    {sources.map(s => (
                      <option key={s} value={s}>{SOURCE_FILTER_MAP[s] || s}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Venue Filters */}
              {activeTab === 'venues' && (
                <div className="px-2 py-2 border-b dark:border-gray-800 flex gap-2 overflow-x-auto">
                  {/* City Filter for Venues */}
                  <select
                    value={cityFilter}
                    onChange={e => setCityFilter(e.target.value)}
                    className="text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded px-2 py-1 max-w-[100px]"
                  >
                    <option value="">City: All</option>
                    {cities.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>

                  <select
                    value={venueTypeFilter}
                    onChange={e => setVenueTypeFilter(e.target.value)}
                    className="text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded px-2 py-1 max-w-[100px]"
                  >
                    <option value="">Type: All</option>
                    <option value="club">Club</option>
                    <option value="bar">Bar</option>
                    <option value="concert_hall">Concert Hall</option>
                    <option value="festival">Festival</option>
                    <option value="other">Other</option>
                  </select>

                  <select
                    value={sourceFilter}
                    onChange={e => setSourceFilter(e.target.value)}
                    className="text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded px-2 py-1 max-w-[100px]"
                  >
                    <option value="">Source: All</option>
                    {sources.map(s => (
                      <option key={s} value={s}>{SOURCE_FILTER_MAP[s] || s}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Other Filters (Artists/Cities) - Exclude Events AND Venues */}
              {activeTab !== 'events' && activeTab !== 'venues' && (
                <div className="px-2 py-2 border-b dark:border-gray-800 flex gap-2 overflow-x-auto">
                  {(activeTab === 'artists' || activeTab === 'cities') && (
                    <select
                      value={countryFilter}
                      onChange={e => setCountryFilter(e.target.value)}
                      className="text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded px-2 py-1 max-w-[100px]"
                    >
                      <option value="">Country: All</option>
                      {countries.map(c => <option key={c.code} value={c.name}>{c.name}</option>)}
                    </select>
                  )}
                  {activeTab === 'cities' && (
                    <select
                      value={activeFilter}
                      onChange={e => setActiveFilter(e.target.value as any)}
                      className="text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded px-2 py-1 max-w-[100px]"
                    >
                      <option value="all">Active: All</option>
                      <option value="active">Active Only</option>
                      <option value="inactive">Inactive Only</option>
                    </select>
                  )}

                  {activeTab !== 'cities' && (
                    <select
                      value={sourceFilter}
                      onChange={e => setSourceFilter(e.target.value)}
                      className="text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded px-2 py-1 max-w-[100px]"
                    >
                      <option value="">Source: All</option>
                      {sources.map(s => (
                        <option key={s} value={s}>{SOURCE_FILTER_MAP[s] || s}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}



              {/* Scrollable List */}
              <div className="flex-1 overflow-y-auto">
                {isLoading ? (
                  <div className="p-8 text-center text-gray-500">Loading...</div>
                ) : (
                  (activeTab === 'events' ? events :
                    activeTab === 'venues' ? venues :
                      activeTab === 'artists' ? artists :
                        activeTab === 'organizers' ? organizers :
                          activeTab === 'moderation' ? reports :
                            activeTab === 'users' ? guestUsers : adminCities
                  ).map((item, index) => renderListItem(item, index))
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
                          loadListData(); // refresh list
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
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                  <LayoutDashboard className="w-16 h-16 mb-4 opacity-20" />
                  <p>Select an item to view details</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <UserManagementModal
        isOpen={false}
        onClose={() => { }}
      />
      {unsavedModal}
    </div>
  );
}

export function NewDashboard(props: NewDashboardProps) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>}>
      <DashboardContent {...props} />
    </Suspense>
  );
}
