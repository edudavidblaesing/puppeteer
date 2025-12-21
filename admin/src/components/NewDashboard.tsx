
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
import { AnalyticsSummary } from '@/components/dashboard/AnalyticsSummary';
import { UserManagementModal } from '@/components/features/UserManagementModal';
import { fetchEvents, fetchStats, fetchCities, fetchScrapeHistory, setPublishStatus } from '@/lib/api';
import { Event, Stats, City } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { GlobalSearch } from '@/components/GlobalSearch';

export function NewDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [pendingEvents, setPendingEvents] = useState<Event[]>([]);
  const [mapEvents, setMapEvents] = useState<Event[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Dashboard Filters
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);

  // Initial Data Load
  useEffect(() => {
    async function loadDashboardData() {
      try {
        setIsLoading(true);
        const [statsData, citiesData, historyData, pendingData, mapData] = await Promise.all([
          fetchStats(),
          fetchCities(),
          fetchScrapeHistory({ days: 30, groupBy: 'day' }),
          fetchEvents({ limit: 5, status: 'pending' }), // Optimized fetch for widget
          fetchEvents({ limit: 2000, showPast: false }) // Map: hide past events
        ]);

        setStats(statsData);
        setCities(citiesData);
        setPendingEvents(pendingData.data);
        setMapEvents(mapData.data);

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
        console.error('Failed to load dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadDashboardData();
  }, []);

  // Helper to refill pending events
  const refillPendingEvents = async () => {
    try {
      // Fetch fresh pending events (limit 5)
      const freshData = await fetchEvents({ limit: 5, status: 'pending' });
      setPendingEvents(freshData.data);
    } catch (error) {
      console.error('Failed to refill pending events:', error);
    }
  };

  const handleApprove = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await setPublishStatus([id], 'approved');
      // Optimistic update
      setPendingEvents(prev => prev.filter(ev => ev.id !== id));
      // Refresh stats and refill list
      const newStats = await fetchStats();
      setStats(newStats);
      await refillPendingEvents();
    } catch (error) {
      console.error('Failed to approve event:', error);
    }
  };

  const handleReject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await setPublishStatus([id], 'rejected');
      setPendingEvents(prev => prev.filter(ev => ev.id !== id));
      const newStats = await fetchStats();
      setStats(newStats);
      await refillPendingEvents();
    } catch (error) {
      console.error('Failed to reject event:', error);
    }
  };

  if (isLoading || !stats) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#FAFAFA] dark:bg-[#09090B]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // Filter map events if source filter is active
  const filteredMapEvents = mapEvents.filter(event => {
    if (selectedSource === 'all') return true;
    const sources = event.source_references?.map(r => r.source_code) || [];
    if (selectedSource === 'manual') return event.id.startsWith('manual_');
    return sources.includes(selectedSource);
  });

  return (
    <div className="h-full overflow-y-auto bg-[#FAFAFA] dark:bg-[#09090B] font-sans text-gray-900 dark:text-gray-100 transition-colors duration-300">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-30">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard (v2)</h1>

        {/* Global Search */}
        <div className="w-full max-w-xl mx-4">
          <GlobalSearch />
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="appearance-none bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 text-sm font-medium rounded-lg py-2 pl-4 pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">All Sources</option>
              {stats.scraping.active_sources?.map(src => (
                <option key={src} value={src}>{src.toUpperCase()}</option>
              )) || (
                  <>
                    <option value="ra">Resident Advisor</option>
                    <option value="ticketmaster">Ticketmaster</option>
                  </>
                )}
              <option value="manual">Manual</option>
            </select>
            <Filter className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <Button variant="ghost" size="icon" onClick={() => setIsUserModalOpen(true)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-6 py-8 max-w-screen-2xl mx-auto space-y-8">

        {/* 1. Analytics Summary Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <AnalyticsSummary
            stats={stats.events}
            scrapeStats={stats.scraping}
            history={history}
          />
        </div>

        {/* 2. Charts & Scraper Row */}
        <div className="grid grid-cols-12 gap-6 min-h-[400px]">
          {/* Main Chart */}
          <div className="col-span-12 lg:col-span-8 h-full">
            <ActivityChart data={history} />
          </div>

          {/* Scrape Widget */}
          <div className="col-span-12 lg:col-span-4 h-full">
            <ScrapeWidget stats={stats.scraping} />
          </div>
        </div>

        {/* 3. Map & Pending Row */}
        <div className="grid grid-cols-12 gap-6 min-h-[500px]">
          {/* Map Widget (Left) */}
          <div className="col-span-12 lg:col-span-8 h-full relative rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800 shadow-sm">
            <MapWidget events={filteredMapEvents} cities={cities} />
          </div>

          {/* Pending Approvals (Right) */}
          <div className="col-span-12 lg:col-span-4 h-full">
            <RecentActivityList
              events={pendingEvents}
              onApprove={handleApprove}
              onReject={handleReject}
            />
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
