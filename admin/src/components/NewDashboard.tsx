
'use client';

import React, { useState, useEffect } from 'react';
import {
  Search,
  Clock,
  TrendingUp,
  Globe,
  MoreHorizontal,
  Filter,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ActivityChart } from '@/components/dashboard/ActivityChart';
import { RecentActivityList } from '@/components/dashboard/RecentActivityList';
import { MapWidget } from '@/components/dashboard/MapWidget';
import { ScrapeWidget } from '@/components/dashboard/ScrapeWidget';
import { StatusProgressWidget } from '@/components/dashboard/StatusProgressWidget';
import { ActiveEventsWidget } from '@/components/dashboard/ActiveEventsWidget';
import { UpdatedEventsWidget } from '@/components/dashboard/UpdatedEventsWidget';
import { UserManagementModal } from '@/components/features/UserManagementModal';
import { fetchEvents, fetchStats, fetchCities, fetchScrapeHistory, setPublishStatus } from '@/lib/api';
import { Event, Stats, City } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

export function NewDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Dashboard Filters
  const [selectedSource, setSelectedSource] = useState<string>('all');

  // Modals
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);

  // Initial Data Load (Stats, Cities, History) - Run once
  useEffect(() => {
    async function loadStaticData() {
      try {
        const [statsData, citiesData, historyData] = await Promise.all([
          fetchStats(),
          fetchCities(),
          fetchScrapeHistory({ days: 30, groupBy: 'day' })
        ]);
        setStats(statsData);
        setCities(citiesData);

        // Transform history data for chart
        if (historyData?.data) {
          const chartData = historyData.data.map((day: any) => ({
            date: new Date(day.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            fetched: parseInt(day.events_fetched || 0),
            new: parseInt(day.events_inserted || 0),
            updated: parseInt(day.events_updated || 0),
          })).reverse();
          setHistory(chartData);
        }
      } catch (error) {
        console.error('Failed to load static dashboard data:', error);
      }
    }
    loadStaticData();
  }, []);

  // Events Fetching with Debounced Search
  useEffect(() => {
    const fetchDashboardEvents = async () => {
      try {
        // If searching, we might want to cast a wider net or rely on backend search
        const response = await fetchEvents({
          limit: 1000,
          showPast: true,
          search: searchQuery
        });
        setEvents(response.data);
      } catch (error) {
        console.error('Failed to fetch events:', error);
      }
    };

    const debounceTimer = setTimeout(fetchDashboardEvents, 500);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery]);

  // Client-side filtering for Source
  const filteredEvents = events.filter(event => {
    // Source filter
    if (selectedSource === 'all') return true;

    // Check source references
    // Check source references
    const sources = event.source_references?.map(r => r.source_code) || [];
    if (selectedSource === 'ra' && sources.includes('ra')) return true;
    if (selectedSource === 'ticketmaster' && sources.includes('ticketmaster')) return true;
    if (selectedSource === 'dice' && sources.includes('dice')) return true;

    // Manual events have IDs starting with 'manual_'
    if (selectedSource === 'manual') {
      return event.id.startsWith('manual_');
    }

    return false;
  });

  const handleApprove = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await setPublishStatus([id], 'approved');
      setEvents(prev => prev.map(ev => ev.id === id ? { ...ev, publish_status: 'approved' } : ev));
    } catch (error) {
      console.error('Failed to approve event:', error);
    }
  };

  const handleReject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await setPublishStatus([id], 'rejected');
      setEvents(prev => prev.map(ev => ev.id === id ? { ...ev, publish_status: 'rejected' } : ev));
    } catch (error) {
      console.error('Failed to reject event:', error);
    }
  };

  // Calculate status counts from filtered events
  const statusCounts = {
    approved: filteredEvents.filter(e => e.publish_status === 'approved').length,
    pending: filteredEvents.filter(e => e.publish_status === 'pending').length,
    rejected: filteredEvents.filter(e => e.publish_status === 'rejected').length,
    total: filteredEvents.length
  };

  const activeEventsCount = filteredEvents.filter(e => {
    // Corrected Active Logic: Event is happening NOW AND is Approved
    if (e.publish_status !== 'approved') return false;

    const now = new Date();
    const start = new Date(e.date + ' ' + (e.start_time || '00:00'));
    // If we have end date/time use it, otherwise assume 4 hours duration
    const end = e.end_time
      ? new Date(e.date + ' ' + e.end_time)
      : new Date(start.getTime() + 4 * 60 * 60 * 1000); // Default 4h duration

    return now >= start && now <= end;
  }).length;

  const updatedEventsCount = filteredEvents.filter(e => {
    // Corrected Updated Logic: Updated recently (>24h ago) AND created BEFORE that (not brand new)
    const updated = new Date(e.updated_at || e.created_at);
    const created = new Date(e.created_at);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0); // Start of yesterday? Or 24h rolling? Rolling 24h
    const rolling24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Event is "updated" if updated_at is recent AND it wasn't just created (created > 24h ago)
    // Or if created != updated (meaning a change happened after creation)
    return updated > rolling24h && created < rolling24h;
  }).length;

  // Calculate upcoming counts for chart (Next 7 days, excluding today)
  const upcomingCounts = Array(7).fill(0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  filteredEvents.forEach(e => {
    // Only count APPROVED events for upcoming
    if (e.publish_status !== 'approved') return;

    const eventDate = new Date(e.date);
    eventDate.setHours(0, 0, 0, 0);
    const diffTime = eventDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // diffDays = 0 is Today. We generally want Upcoming to mean "Future dates"
    // But if simple "Next 7 days" usually includes today. 
    // Visualization usually shows +1d, +2d etc. Let's include 0->6 or 1->7?
    // Since ActiveEventsWidget shows "Today" at index 0, we keep it including Today.
    // BUT user said "155 live" vs "41 upcoming". 
    // "Live" is specific time today. "Upcoming" implies later.
    // We will stick to 0-6 index mapping.
    if (diffDays >= 0 && diffDays < 7) {
      upcomingCounts[diffDays]++;
    }
  });

  // Count active upcoming (e.g. within 7 days, excluding Today for totals if desired? 
  // or "This Week" usually means next 7 days total. Let's keep total of next 7 days).
  const totalUpcoming = upcomingCounts.reduce((a, b) => a + b, 0);

  // Prepare chart data for analytics history
  const historyChartData = history.map((h: any) => ({
    name: h.date,
    newEvents: h.new,
    updates: h.updated
  }));

  return (
    <div className="min-h-screen bg-[#FAFAFA] dark:bg-[#09090B] font-sans text-gray-900 dark:text-gray-100 transition-colors duration-300">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-[72px] bg-white/80 dark:bg-[#09090B]/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-800/50 z-50 px-6 flex items-center justify-between transition-all">
        <div className="flex items-center gap-12 w-full max-w-screen-2xl mx-auto">
          {/* Logo */}
          <div className="flex items-center gap-2.5 group cursor-pointer">
            <div className="w-9 h-9 bg-black dark:bg-white rounded-xl flex items-center justify-center shadow-lg shadow-gray-200/50 dark:shadow-none transition-transform group-hover:scale-105">
              <span className="text-white dark:text-black font-bold text-lg tracking-tighter">E.</span>
            </div>
            <span className="font-bold text-lg tracking-tight text-gray-900 dark:text-white group-hover:opacity-80 transition-opacity">
              Events<span className="text-gray-400 font-normal">Admin</span>
            </span>
          </div>

          {/* Search Bar - Global Search */}
          <div className="relative w-full max-w-2xl hidden md:block group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
            <input
              type="text"
              placeholder="Search everything..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-11 pl-12 pr-4 bg-gray-100/50 dark:bg-gray-800/50 border-none rounded-2xl text-sm font-medium text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-indigo-500/20 focus:bg-white dark:focus:bg-gray-800 transition-all placeholder:transition-opacity focus:placeholder:opacity-0"
            />

            {/* Command Hint */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
              <kbd className="hidden sm:inline-flex h-6 items-center gap-1 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-2 font-mono text-[10px] font-medium text-gray-500 dark:text-gray-400 opacity-100">
                <span className="text-xs">⌘</span>K
              </kbd>
            </div>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-4 pl-6">
          {/* Project Filter */}
          <div className="relative">
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="appearance-none bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-full py-2 pl-4 pr-10 focus:outline-none focus:ring-2 focus:ring-gray-100 dark:focus:ring-gray-800 cursor-pointer shadow-sm hover:bg-gray-50 transition-colors"
              style={{ backgroundImage: 'none' }}
            >
              <option value="all">All Sources</option>
              <option value="ra">Resident Advisor</option>
              <option value="ticketmaster">Ticketmaster</option>
              <option value="dice">Dice</option>
              <option value="manual">Manual</option>
            </select>
            <Filter className="w-4 h-4 text-gray-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <Button variant="ghost" size="icon" className="rounded-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-400">
            <MoreHorizontal className="w-4 h-4" />
          </Button>

          <div className="h-6 w-px bg-gray-200 dark:bg-gray-800 mx-1" />

          {/* User Profile */}
          <div
            className="flex items-center gap-3 pl-1 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => setIsUserModalOpen(true)}
          >
            <div className="text-right hidden xl:block">
              <p className="text-sm font-bold text-gray-900 dark:text-white leading-none">{user?.username || 'Admin'}</p>
              <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mt-1">{user?.role || 'Superadmin'}</p>
            </div>
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 p-0.5">
                <div className="w-full h-full rounded-full bg-white dark:bg-black p-0.5">
                  <img src={`https://ui-avatars.com/api/?name=${user?.username || 'Admin'}&background=random`} alt="User" className="w-full h-full rounded-full object-cover" />
                </div>
              </div>
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white dark:border-black rounded-full shadow-sm"></div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-[100px] px-6 pb-12 overflow-x-hidden max-w-screen-2xl mx-auto space-y-8">

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <StatusProgressWidget
            approvedCount={statusCounts.approved}
            pendingCount={statusCounts.pending}
            totalCount={statusCounts.total}
            icon={Clock}
          />
          <ActiveEventsWidget
            activeCount={activeEventsCount}
            upcomingCounts={upcomingCounts}
            totalUpcoming={totalUpcoming}
            icon={TrendingUp}
          />
          <UpdatedEventsWidget
            updatedCount={updatedEventsCount}
            totalEvents={statusCounts.total}
            icon={RefreshCw}
            onReview={() => router.push('/events?hasUpdates=true')}
          />
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-12 gap-6 h-[400px]">
          {/* Main Chart */}
          <div className="col-span-12 lg:col-span-8 h-full">
            <ActivityChart data={history} />
          </div>

          {/* Side Panel: Scrape Widget */}
          <div className="col-span-12 lg:col-span-4 h-full">
            <ScrapeWidget />
          </div>
        </div>

        {/* Map & Recent Activity Section */}
        <div className="mt-8 grid grid-cols-12 gap-6 h-[500px]">
          {/* Recent Activity List */}
          <div className="col-span-12 lg:col-span-4 h-full">
            <div className="h-[400px] lg:h-full">
              <RecentActivityList
                events={filteredEvents
                  .filter(e => e.publish_status === 'pending')
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())}
                onApprove={async (id, e) => {
                  e.stopPropagation();
                  await setPublishStatus([id], 'approved');
                  // Refresh events? Or let optimistic UI handle it?
                  // Ideally useEvents hook would expose updateStatus but NewDashboard fetches manually.
                  // We should update local state.
                  setEvents(prev => prev.map(ev => ev.id === id ? { ...ev, publish_status: 'approved' } : ev));
                }}
                onReject={async (id, e) => {
                  e.stopPropagation();
                  await setPublishStatus([id], 'rejected');
                  setEvents(prev => prev.map(ev => ev.id === id ? { ...ev, publish_status: 'rejected' } : ev));
                }}
              />
            </div>
          </div>

          {/* Map */}
          <div className="col-span-12 lg:col-span-8 h-full">
            <MapWidget events={filteredEvents} cities={cities} />
          </div>
        </div>

      </main>

      {/* User Management Modal */}
      <UserManagementModal
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
      />
    </div>
  );
}
