'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { EventList } from '@/components/features/EventList';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EventsProvider, useEventsContext } from '@/contexts/EventsContext';
import { PaginationControls } from '@/components/ui/PaginationControls';
import clsx from 'clsx';
import { useToast } from '@/contexts/ToastContext';

import { Suspense } from 'react';

function EventsLayoutDetails({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    // Determine if we are on a detail page
    const isDetailPage = pathname !== '/events' && pathname !== '/events/';

    const {
        filteredEvents,
        isLoading,
        loadEvents,
        setSearchQuery,
        setStatusFilter,
        searchQuery,
        statusFilter,
        updatesFilter,
        setUpdatesFilter,
        timeFilter,
        setTimeFilter,
        sourceFilter,
        setSourceFilter,
        page,
        setPage,
        totalPages,
        totalItems,
        itemsPerPage
    } = useEventsContext();

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isMobile, setIsMobile] = useState(false);
    const [sources, setSources] = useState<any[]>([]);

    // Check for mobile view
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 1024);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Sync URL params
    useEffect(() => {
        if (searchParams.get('hasUpdates') === 'true') {
            setUpdatesFilter('updated');
        }
    }, [searchParams, setUpdatesFilter]);

    // Initial load and fetch sources
    useEffect(() => {
        loadEvents();

        // Fetch sources for dropdown
        fetch('/api/sources').then(res => {
            if (res.ok) return res.json();
            // Fallback if proxy not set or direct call needed
            // Actually we usually import fetchSources from api
            return import('@/lib/api').then(mod => mod.fetchSources());
        }).then(data => {
            // Handle both array or object with data property
            const list = Array.isArray(data) ? data : (data.data || []);
            setSources(list);
        }).catch(err => console.error('Failed to fetch sources', err));

    }, [loadEvents]);

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
                <div className={clsx(
                    "flex-1 flex flex-col min-w-0 bg-gray-50 dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 transition-all duration-300",
                    (!isMobile || !isDetailPage) ? "block" : "hidden",
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
                                value={timeFilter}
                                onChange={(e) => setTimeFilter(e.target.value as any)}
                                className="h-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                            >
                                <option value="upcoming">Next / Upcoming</option>
                                <option value="past">Past Events</option>
                                <option value="all">Anytime (All)</option>
                            </select>

                            <select
                                value={sourceFilter}
                                onChange={(e) => setSourceFilter(e.target.value)}
                                className="h-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white max-w-[150px]"
                            >
                                <option value="">All Sources</option>
                                <option value="manual">Manual</option>
                                {sources.filter(s => s.code !== 'manual' && s.code !== 'original').map(s => (
                                    <option key={s.id} value={s.code}>{s.name || s.code}</option>
                                ))}
                            </select>

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

                            <select
                                value={updatesFilter}
                                onChange={(e) => setUpdatesFilter(e.target.value as any)}
                                className="h-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                            >
                                <option value="all">Show All</option>
                                <option value="new">New Events</option>
                                <option value="updated">With Updates</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col overflow-hidden">
                        <div className="flex-1 overflow-y-auto p-4">
                            <EventList
                                events={filteredEvents}
                                isLoading={isLoading}
                                selectedIds={selectedIds}
                                onSelect={handleSelect}
                                onSelectAll={handleSelectAll}
                                onEdit={handleEdit}
                                onVenueClick={(id) => router.push(`/venues/${id}`)}
                                onArtistClick={(name) => router.push(`/artists?search=${encodeURIComponent(name)}`)}
                            />
                        </div>

                        {/* Pagination Controls */}
                        {!isLoading && (
                            <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 z-10 flex-shrink-0">
                                <PaginationControls
                                    currentPage={page}
                                    totalPages={totalPages}
                                    onPageChange={setPage}
                                    totalItems={totalItems}
                                    itemsPerPage={itemsPerPage}
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel - Children (Form) */}
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

function EventsLayoutContent({ children }: { children: React.ReactNode }) {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <EventsLayoutDetails>{children}</EventsLayoutDetails>
        </Suspense>
    );
}

export default function EventsLayout({ children }: { children: React.ReactNode }) {
    return (
        <EventsProvider>
            <EventsLayoutContent>{children}</EventsLayoutContent>
        </EventsProvider>
    );
}
