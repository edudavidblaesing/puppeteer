'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowPathIcon,
  CalendarIcon,
  UserGroupIcon,
  BuildingOfficeIcon,
  MapPinIcon,
  ArrowTrendingUpIcon,
  ClockIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import AdminLayout from '@/components/AdminLayout';
import { fetchDashboard, fetchStats, fetchEvents } from '@/lib/api';
import { Event } from '@/types';

export default function DashboardHome() {
  const [stats, setStats] = useState<any>(null);
  const [recentEvents, setRecentEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [statsData, eventsData] = await Promise.all([
        fetchStats(),
        fetchEvents({ limit: 10 }),
      ]);
      setStats(statsData);
      setRecentEvents(eventsData.data || []);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
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
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-500">Welcome to the Events Admin Dashboard</p>
          </div>
          <button
            onClick={loadData}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <ArrowPathIcon className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Link href="/events" className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Events</p>
                <p className="text-3xl font-bold text-gray-900">
                  {parseInt(stats?.total_events || '0').toLocaleString()}
                </p>
              </div>
              <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                <CalendarIcon className="w-6 h-6 text-indigo-600" />
              </div>
            </div>
          </Link>

          <Link href="/artists" className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Artists</p>
                <p className="text-3xl font-bold text-gray-900">—</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <UserGroupIcon className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </Link>

          <Link href="/venues" className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Venues</p>
                <p className="text-3xl font-bold text-gray-900">
                  {parseInt(stats?.venues || '0').toLocaleString()}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <BuildingOfficeIcon className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </Link>

          <Link href="/cities" className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Cities</p>
                <p className="text-3xl font-bold text-gray-900">
                  {parseInt(stats?.cities || '0').toLocaleString()}
                </p>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <MapPinIcon className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </Link>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Quick Actions</h3>
            <div className="space-y-3">
              <Link
                href="/events"
                className="block px-4 py-3 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors"
              >
                Manage Events
              </Link>
              <Link
                href="/artists"
                className="block px-4 py-3 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors"
              >
                Manage Artists
              </Link>
              <Link
                href="/venues"
                className="block px-4 py-3 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors"
              >
                Manage Venues
              </Link>
              <Link
                href="/cities"
                className="block px-4 py-3 bg-orange-50 text-orange-700 rounded-lg hover:bg-orange-100 transition-colors"
              >
                Manage Cities
              </Link>
            </div>
          </div>

          <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Events by City</h3>
            <div className="space-y-3">
              {stats?.events_by_city?.slice(0, 5).map((city: any, index: number) => {
                const count = parseInt(city.count);
                const maxCount = parseInt(stats.events_by_city[0]?.count || '1');
                const percentage = (count / maxCount) * 100;

                return (
                  <div key={city.venue_city || index}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{city.venue_city || 'Unknown'}</span>
                      <span className="text-gray-500">{count.toLocaleString()}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-indigo-500 h-2 rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Recent Events */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Recent Events</h3>
            <Link href="/events" className="text-sm text-indigo-600 hover:text-indigo-800">
              View all →
            </Link>
          </div>
          <div className="divide-y">
            {recentEvents.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500">
                No events found
              </div>
            ) : (
              recentEvents.map((event) => (
                <div key={event.id} className="px-6 py-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {event.flyer_front && (
                        <img
                          src={event.flyer_front}
                          alt=""
                          className="w-12 h-12 rounded object-cover"
                        />
                      )}
                      <div>
                        <p className="font-medium text-gray-900">{event.title}</p>
                        <p className="text-sm text-gray-500">
                          {event.venue_name} • {event.venue_city}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">
                          {format(new Date(event.date), 'MMM d, yyyy')}
                        </p>
                        {event.start_time && (
                          <p className="text-xs text-gray-500">{event.start_time}</p>
                        )}
                      </div>
                      <span
                        className={`px-2 py-1 text-xs rounded ${
                          event.is_published
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {event.is_published ? 'Published' : 'Draft'}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
