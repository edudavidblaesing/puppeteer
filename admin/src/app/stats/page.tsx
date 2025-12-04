'use client';

import { useState, useEffect } from 'react';
import {
  ArrowPathIcon,
  CalendarIcon,
  UserGroupIcon,
  BuildingOfficeIcon,
  MapPinIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import AdminLayout from '@/components/AdminLayout';
import { fetchStats, fetchEnrichStats } from '@/lib/api';

export default function StatsPage() {
  const [stats, setStats] = useState<any>(null);
  const [enrichStats, setEnrichStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadStats = async () => {
    setIsLoading(true);
    try {
      const [s, e] = await Promise.all([
        fetchStats(),
        fetchEnrichStats().catch(() => null),
      ]);
      setStats(s);
      setEnrichStats(e);
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="p-6 flex items-center justify-center h-96">
          <ArrowPathIcon className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Statistics</h1>
            <p className="text-gray-500">Database overview and metrics</p>
          </div>
          <button
            onClick={loadStats}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <ArrowPathIcon className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Events</p>
                <p className="text-3xl font-bold text-gray-900">
                  {parseInt(stats?.total_events || '0').toLocaleString()}
                </p>
              </div>
              <CalendarIcon className="w-12 h-12 text-indigo-500 opacity-20" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Venues</p>
                <p className="text-3xl font-bold text-gray-900">
                  {parseInt(stats?.venues || '0').toLocaleString()}
                </p>
              </div>
              <BuildingOfficeIcon className="w-12 h-12 text-purple-500 opacity-20" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Cities</p>
                <p className="text-3xl font-bold text-gray-900">
                  {parseInt(stats?.cities || '0').toLocaleString()}
                </p>
              </div>
              <MapPinIcon className="w-12 h-12 text-green-500 opacity-20" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Date Range</p>
                <p className="text-sm font-medium text-gray-900">
                  {stats?.earliest_event ? new Date(stats.earliest_event).toLocaleDateString() : '—'}
                  <br />to {stats?.latest_event ? new Date(stats.latest_event).toLocaleDateString() : '—'}
                </p>
              </div>
              <ChartBarIcon className="w-12 h-12 text-orange-500 opacity-20" />
            </div>
          </div>
        </div>

        {/* Events by City */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold">Events by City</h2>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {stats?.events_by_city?.slice(0, 20).map((city: any, index: number) => {
                const count = parseInt(city.count);
                const maxCount = parseInt(stats.events_by_city[0]?.count || '1');
                const percentage = (count / maxCount) * 100;
                
                return (
                  <div key={city.venue_city || index}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{city.venue_city || 'Unknown'}</span>
                      <span className="text-gray-500">{count.toLocaleString()} events</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-indigo-500 h-2 rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Enrichment Stats */}
        {enrichStats && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">Enrichment Status</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <p className="text-sm text-gray-500">Total Venues</p>
                  <p className="text-2xl font-bold">{enrichStats.venues?.total || 0}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Venues with Coordinates</p>
                  <p className="text-2xl font-bold text-green-600">
                    {enrichStats.venues?.with_coordinates || 0}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total Artists</p>
                  <p className="text-2xl font-bold">{enrichStats.artists?.total || 0}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Artists with Images</p>
                  <p className="text-2xl font-bold text-green-600">
                    {enrichStats.artists?.with_images || 0}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
