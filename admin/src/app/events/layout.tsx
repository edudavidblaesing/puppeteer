'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { EventList } from '@/components/features/EventList';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EventsProvider, useEventsContext } from '@/contexts/EventsContext';
import clsx from 'clsx';
import { useToast } from '@/contexts/ToastContext';

function EventsLayoutContent({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    // Determine if we are on a detail page
    const isDetailPage = pathname !== '/events' && pathname !== '/events/';

    const {
        filteredEvents,
        isLoading,
        loadEvents,
        setSearchQuery,
        setStatusFilter,
        setShowPastEvents,
        searchQuery,
        cityFilter,
        statusFilter,
        showPastEvents,
        setCityFilter
    } = useEventsContext();

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [dateFilter, setDateFilter] = useState('');
    const [timeStatusFilter, setTimeStatusFilter] = useState('all');
    const [updateStatusFilter, setUpdateStatusFilter] = useState<'all' | 'new' | 'updated'>('all');
    const [isMobile, setIsMobile] = useState(false);

    // Check for mobile view
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 1024);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Initial load
    useEffect(() => {
        loadEvents();
    }, [loadEvents]);

    // Sync Past Events
    useEffect(() => {
        if (timeStatusFilter === 'upcoming' || timeStatusFilter === 'live') {
            setShowPastEvents(timeStatusFilter !== 'upcoming');
        } else {
            setShowPastEvents(true);
        }
    }, [timeStatusFilter, setShowPastEvents]);

    // Filter Logic (Client-side)
    const displayEvents = filteredEvents.filter(e => {
        let matches = true;

        // Date Filter
        if (dateFilter) {
            if (e.date) {
                if (!e.date.includes(dateFilter)) matches = false;
            } else {
                matches = false;
            }
        }

        // Time Status
        if (matches && timeStatusFilter !== 'all') {
            const now = new Date();
            let start: Date;
            if (e.start_time && e.start_time.includes('T')) {
                start = new Date(e.start_time);
            } else {
                start = new Date(e.date + ' ' + (e.start_time || '00:00'));
            }
            // Simple approximation for end time if missing
            let end: Date;
            if (e.end_time && e.end_time.includes('T')) {
                end = new Date(e.end_time);
            } else {
                end = e.end_time
                    ? new Date(e.date + ' ' + e.end_time)
                    : new Date(start.getTime() + 4 * 60 * 60 * 1000);
            }

            if (timeStatusFilter === 'live') {
                if (!(now >= start && now <= end)) matches = false;
            } else if (timeStatusFilter === 'upcoming') {
                if (!(start > now)) matches = false;
            } else if (timeStatusFilter === 'past') {
                if (!(end < now)) matches = false;
            }
        }

        // Update Status
        if (matches && updateStatusFilter !== 'all') {
            if (updateStatusFilter === 'new') {
                const created = new Date(e.created_at).getTime();
                const limit = Date.now() - 24 * 60 * 60 * 1000;
                if (created < limit) matches = false;
            } else if (updateStatusFilter === 'updated') {
                if (!e.updated_at) {
                    matches = false;
                } else {
                    const updated = new Date(e.updated_at).getTime();
                    const created = new Date(e.created_at).getTime();
                    const limit = Date.now() - 24 * 60 * 60 * 1000;
                    if (updated <= limit || Math.abs(updated - created) < 60000) matches = false;
                }
            }
        }
        return matches;
    });

    const handleCreate = () => {
        router.push('/events/new');
    };

    const handleEdit = (event: any) => {
        router.push(`/events/${event.id}`);
    };

    const handleSelect = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) newSelected.delete(id);
        else newSelected.add(id);
        setSelectedIds(newSelected);
    };

    const handleSelectAll = () => {
        if (selectedIds.size === filteredEvents.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(filteredEvents.map(e => e.id)));
    };

    return (
        <Layout>
            <div className="flex h-full">
                {/* Left Panel - List */}
                {/* On Mobile: Hide this panel if we are on a Detail Page */}
                <div className={clsx(
                    "flex-1 flex flex-col min-w-0 bg-gray-50 dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 transition-all duration-300",
                    (!isMobile || !isDetailPage) ? "block" : "hidden",
                    // On Desktop: "w-1/2 max-w-3xl" if detail is open? 
                    // If child is present (detail page), we want split view on desktop.
                    isDetailPage && !isMobile ? "w-1/2 max-w-3xl" : "w-full"
                )}>
                    {/* Toolbar */}
                    <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 space-y-4">
                        <div className="flex items-center justify-between gap-4">
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Events</h1>
                            <Button onClick={handleCreate} leftIcon={<Plus className="w-4 h-4" />}>
                                Add Event
                            </Button>
                        </div>

                        {/* Filters Row */}
                        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
                            <div className="min-w-[180px] flex-shrink-0">
                                <Input
                                    placeholder="Search events..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    leftIcon={<Search className="w-4 h-4" />}
                                />
                            </div>

                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value as any)}
                                className="h-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                            >
                                <option value="all">All Status</option>
                                <option value="pending">Pending</option>
                                <option value="approved">Approved</option>
                                <option value="rejected">Rejected</option>
                            </select>

                            <div className="shrink-0">
                                <input
                                    type="date"
                                    value={dateFilter}
                                    onChange={(e) => setDateFilter(e.target.value)}
                                    className="h-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white w-auto"
                                />
                            </div>

                            <select
                                value={timeStatusFilter}
                                onChange={(e) => setTimeStatusFilter(e.target.value)}
                                className="h-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                            >
                                <option value="all">Any Time</option>
                                <option value="upcoming">Upcoming</option>
                                <option value="live">Live Now</option>
                                <option value="past">Past</option>
                            </select>

                            <select
                                value={updateStatusFilter}
                                onChange={(e) => setUpdateStatusFilter(e.target.value as any)}
                                className="h-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                            >
                                <option value="all">Show All</option>
                                <option value="new">New Events</option>
                                <option value="updated">With Updates</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4">
                        <EventList
                            events={displayEvents}
                            isLoading={isLoading}
                            selectedIds={selectedIds}
                            onSelect={handleSelect}
                            onSelectAll={handleSelectAll}
                            onEdit={handleEdit}
                            onVenueClick={(id) => router.push(`/venues?venueId=${id}`)}
                            onArtistClick={(name) => router.push(`/artists?search=${encodeURIComponent(name)}`)}
                        />
                    </div>
                </div>

                {/* Right Panel - Children (Form) */}
                {/* On Mobile: Show Only if Detail Page */}
                {/* On Desktop: Show if Detail Page */}
                <div className={clsx(
                    "bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-xl z-10 transition-all",
                    isDetailPage ? (isMobile ? "fixed inset-0 z-50 overflow-auto" : "flex-1 min-w-0") : "hidden"
                )}>
                    {children}
                </div>

            </div>
        </Layout>
    );
}

export default function EventsLayout({ children }: { children: React.ReactNode }) {
    return (
        <EventsProvider>
            <EventsLayoutContent>{children}</EventsLayoutContent>
        </EventsProvider>
    );
}
